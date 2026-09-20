import { chmod, lstat, unlink } from "node:fs/promises";
import { createServer } from "node:http";

import { executeBridgeRequest } from "./bridge";

const socketPath = process.env.AXCAS_BRIDGE_SOCKET ?? "/run/axcas/tool-bridge.sock";
// A 16 MiB WhatsApp image expands to about 21.4 MiB as base64. Keep the
// socket private and bounded while allowing one authenticated immutable asset.
const maxBodyBytes = 24 * 1024 * 1024;

if (!socketPath.startsWith("/run/axcas/") || !socketPath.endsWith(".sock")) {
  throw new Error("AXCAS_BRIDGE_SOCKET must be an Axcas runtime socket");
}

try {
  const stale = await lstat(socketPath);
  if (!stale.isSocket()) throw new Error("refusing to replace a non-socket bridge path");
  await unlink(socketPath);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const server = createServer(async (incoming, outgoing) => {
  if (incoming.method !== "POST" || incoming.url !== "/v1/tool") {
    outgoing.writeHead(404, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ status: "not_found" }));
    return;
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of incoming) {
    const bytes = Buffer.from(chunk);
    received += bytes.byteLength;
    if (received > maxBodyBytes) {
      outgoing.writeHead(413, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ status: "too_large" }));
      return;
    }
    chunks.push(bytes);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    outgoing.writeHead(400, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ status: "invalid_request" }));
    return;
  }
  const result = await executeBridgeRequest(payload);
  outgoing.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  outgoing.end(JSON.stringify(result));
});

server.listen(socketPath, async () => {
  await chmod(socketPath, 0o660);
  process.stdout.write(`${JSON.stringify({ service: "axcas-tool-bridge", status: "listening" })}\n`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
