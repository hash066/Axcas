import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { ReelPlanSchema, type ReelPlanV1 } from "../../../packages/domain/src/growth";

const execFileAsync = promisify(execFile);

export const initialReelPlan = ReelPlanSchema.parse({
  schemaVersion: 1,
  reelId: "bakery-launch-reel",
  merchantId: "merchant-demo",
  angle: "Freshly baked for the moments worth celebrating",
  hook: "Your celebration deserves more than a generic cake.",
  scenes: [
    { assetId: "cake-1", overlay: "Small-batch celebration cakes", durationMs: 5000 },
    { assetId: "cake-2", overlay: "Made to order in Bengaluru", durationMs: 5000 },
    { assetId: "cake-3", overlay: "Order 48 hours ahead", durationMs: 5000 },
  ],
  voiceover: "Celebration cakes, baked in small batches and made for you. Order on WhatsApp.",
  caption: "Made to order in Bengaluru. Message us on WhatsApp.",
  cta: "Order on WhatsApp",
  claims: ["Made to order"],
  creativeDirection: {
    source: "axcas-brag-v1",
    tone: "polished",
    format: "vertical",
    structure: "hook-reveal-proof-cta",
    hookDeadlineMs: 2_000,
    posterSceneIndex: 1,
    motion: ["punch_in", "slow_push", "hold"],
    audioPolicy: "merchant_or_licensed_only",
  },
  status: "approved",
});

export function reelDurationSeconds(plan: ReelPlanV1): number {
  const parsed = ReelPlanSchema.parse(plan);
  return parsed.scenes.reduce((total, scene) => total + scene.durationMs, 0) / 1000;
}

export function validateRenderInputs(plan: ReelPlanV1, assetPaths: Record<string, string>, assetRoot: string): string[] {
  const parsed = ReelPlanSchema.parse(plan);
  if (parsed.status !== "approved" && parsed.status !== "rendering") throw new Error("reel plan must be approved before rendering");
  const root = path.resolve(assetRoot);
  return parsed.scenes.map((scene) => {
    const supplied = assetPaths[scene.assetId];
    if (!supplied) throw new Error(`missing approved asset ${scene.assetId}`);
    const resolved = path.resolve(supplied);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`asset ${scene.assetId} is outside the approved asset root`);
    return resolved;
  });
}

function ffmpegTextPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function buildReelFilterGraph(planInput: ReelPlanV1, textFiles: string[]): string {
  const plan = ReelPlanSchema.parse(planInput);
  if (textFiles.length !== plan.scenes.length) throw new Error("every reel scene needs one safe overlay file");
  const filters: string[] = [];
  for (let index = 0; index < plan.scenes.length; index += 1) {
    const scene = plan.scenes[index];
    const seconds = scene.durationMs / 1000;
    const motion = plan.creativeDirection?.motion[index] ?? "hold";
    const zoom = motion === "punch_in" ? "min(zoom+0.0035,1.12)" : motion === "slow_push" ? "min(zoom+0.0015,1.08)" : "1.0";
    filters.push(
      `[${index}:v]scale=1200:2134:force_original_aspect_ratio=increase,crop=1200:2134,` +
      `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,` +
      `setsar=1,drawbox=x=64:y=1440:w=952:h=360:color=black@0.48:t=fill,` +
      `drawtext=textfile='${ffmpegTextPath(textFiles[index])}':fontcolor=white:fontsize=62:line_spacing=14:x=(w-text_w)/2:y=1510,` +
      `fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, seconds - 0.25)}:d=0.25[v${index}]`,
    );
  }
  filters.push(`${plan.scenes.map((_, index) => `[v${index}]`).join("")}concat=n=${plan.scenes.length}:v=1:a=0[vout]`);
  return filters.join(";");
}

export async function renderReel(input: {
  plan: ReelPlanV1;
  assetPaths: Record<string, string>;
  assetRoot: string;
  outputPath: string;
  voiceoverPath?: string;
  ffmpegPath?: string;
}): Promise<{ outputPath: string; durationSeconds: number }> {
  const plan = ReelPlanSchema.parse(input.plan);
  const assets = validateRenderInputs(plan, input.assetPaths, input.assetRoot);
  const duration = reelDurationSeconds(plan);
  const working = await mkdtemp(path.join(tmpdir(), "proofgate-reel-"));
  try {
    const args: string[] = ["-y"];
    for (let index = 0; index < assets.length; index += 1) {
      args.push("-loop", "1", "-t", String(plan.scenes[index].durationMs / 1000), "-i", assets[index]);
    }
    const audioIndex = assets.length;
    if (input.voiceoverPath) args.push("-i", path.resolve(input.voiceoverPath));
    else args.push("-f", "lavfi", "-t", String(duration), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    const textFiles: string[] = [];
    for (let index = 0; index < plan.scenes.length; index += 1) {
      const scene = plan.scenes[index];
      const textFile = path.join(working, `scene-${index}.txt`);
      await writeFile(textFile, scene.overlay, "utf8");
      textFiles.push(textFile);
    }
    args.push("-filter_complex", buildReelFilterGraph(plan, textFiles), "-map", "[vout]", "-map", `${audioIndex}:a`, "-t", String(duration), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", path.resolve(input.outputPath));
    await execFileAsync(input.ffmpegPath ?? "ffmpeg", args, { windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
    return { outputPath: path.resolve(input.outputPath), durationSeconds: duration };
  } finally {
    await rm(working, { recursive: true, force: true });
  }
}

export async function inspectReel(outputPath: string, ffprobePath = "ffprobe"): Promise<{ width: number; height: number; videoCodec: string; audioCodec: string; durationSeconds: number }> {
  const { stdout } = await execFileAsync(ffprobePath, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", path.resolve(outputPath)], { windowsHide: true });
  const probe = JSON.parse(stdout) as { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>; format: { duration: string } };
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (!video || !audio) throw new Error("rendered reel must contain video and audio");
  return { width: video.width ?? 0, height: video.height ?? 0, videoCodec: video.codec_name, audioCodec: audio.codec_name, durationSeconds: Number(probe.format.duration) };
}
