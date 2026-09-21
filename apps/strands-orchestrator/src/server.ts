import { createServer } from "node:http";

import { ProofGateBoundary } from "./boundary";
import { runDeterministicStrandsWorkflow } from "./deterministic-workflow";
import { runStrandsImprovementWorkflow } from "./strands-workflow";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.AXCAS_STRANDS_HOST ?? "127.0.0.1";
const maxBodyBytes = 1024 * 1024;

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/ping") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "Healthy", service: "axcas-strands-orchestrator" }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/invocations") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk);
      received += bytes.byteLength;
      if (received > maxBodyBytes) throw new Error("request_too_large");
      chunks.push(bytes);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { mode?: unknown; input?: unknown };
    const boundary = new ProofGateBoundary();
    const result = payload.mode === "improvement"
      ? await runStrandsImprovementWorkflow(payload.input, boundary)
      : payload.mode === "build"
        ? await runDeterministicStrandsWorkflow(payload.input as never, boundary)
        : (() => { throw new Error("invalid_mode"); })();
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const correlationId = crypto.randomUUID();
    process.stderr.write(`${JSON.stringify({ service: "axcas-strands-orchestrator", correlationId, outcome: "failed" })}\n`);
    response.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: "workflow_unavailable", correlationId }));
  }
});

server.listen(port, host, () => {
  process.stdout.write(`${JSON.stringify({ service: "axcas-strands-orchestrator", status: "listening", host, port })}\n`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
