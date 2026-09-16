import { z } from "zod";
import { assertMerchantSafeText } from "./merchant-language";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const MetaSendResponseSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) });
const MetaMediaResponseSchema = z.object({ id: z.string().min(1) });

type MetaClientBase = {
  graphApiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  recipientWaId: string;
  fetcher?: Fetcher;
};

async function sendMetaMessage(input: MetaClientBase, payload: unknown): Promise<{ providerMessageId: string }> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`https://graph.facebook.com/${input.graphApiVersion}/${input.phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: input.recipientWaId, ...payload as object }),
  });
  if (!response.ok) throw new Error(`Meta message failed with HTTP ${response.status}`);
  const result = MetaSendResponseSchema.parse(await response.json());
  return { providerMessageId: result.messages[0].id };
}

export async function sendApprovalButtons(input: MetaClientBase & { approvalId: string; body: string }) {
  if (!/^[a-z0-9-]{3,64}$/.test(input.approvalId)) throw new Error("invalid approval ID");
  if (input.body.length < 1 || input.body.length > 1024) throw new Error("approval prompt is invalid");
  assertMerchantSafeText(input.body, "approval prompt");
  return sendMetaMessage(input, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: input.body },
      action: { buttons: [
        { type: "reply", reply: { id: `pg:${input.approvalId}:approve`, title: "Approve" } },
        { type: "reply", reply: { id: `pg:${input.approvalId}:deny`, title: "Deny" } },
      ] },
    },
  });
}

export async function sendTextMessage(input: MetaClientBase & { body: string }) {
  if (input.body.length < 1 || input.body.length > 4096) throw new Error("WhatsApp text message is invalid");
  assertMerchantSafeText(input.body, "WhatsApp text message");
  return sendMetaMessage(input, { type: "text", text: { preview_url: false, body: input.body } });
}

export async function sendActionRequiredTemplate(input: MetaClientBase & { templateName: string }) {
  if (!/^[a-z0-9_]{3,512}$/.test(input.templateName)) throw new Error("invalid WhatsApp template name");
  return sendMetaMessage(input, { type: "template", template: { name: input.templateName, language: { code: "en" } } });
}

export async function uploadMetaMedia(input: Omit<MetaClientBase, "recipientWaId"> & {
  bytes: Uint8Array;
  contentType: "video/mp4";
  filename: string;
}): Promise<{ mediaId: string }> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > 16 * 1024 * 1024) throw new Error("WhatsApp reel must be between 1 byte and 16MB");
  if (!/^[a-zA-Z0-9._-]{3,128}\.mp4$/.test(input.filename)) throw new Error("invalid reel filename");
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", input.contentType);
  form.set("file", new Blob([new Uint8Array(Array.from(input.bytes)).buffer], { type: input.contentType }), input.filename);
  const response = await (input.fetcher ?? fetch)(`https://graph.facebook.com/${input.graphApiVersion}/${input.phoneNumberId}/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Meta media upload failed with HTTP ${response.status}`);
  return { mediaId: MetaMediaResponseSchema.parse(await response.json()).id };
}

export async function sendVideoByMediaId(input: MetaClientBase & { mediaId: string; caption?: string }) {
  if (!/^[a-zA-Z0-9._-]{3,256}$/.test(input.mediaId)) throw new Error("invalid Meta media ID");
  if (input.caption && input.caption.length > 1024) throw new Error("reel caption is too long");
  if (input.caption) assertMerchantSafeText(input.caption, "reel caption");
  return sendMetaMessage(input, { type: "video", video: { id: input.mediaId, ...(input.caption ? { caption: input.caption } : {}) } });
}
