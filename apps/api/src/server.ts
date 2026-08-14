import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const port = Number(process.env.PORT ?? 8787);
const apiKey = process.env.DEUTSCHLANDGPT_API_KEY;
const model = process.env.DEUTSCHLANDGPT_MODEL ?? "gemini-2.5-pro";
const deutschlandGptUrl =
  "https://apiv2.deutschlandgpt.de/platform-api/api/v2/chat/completions";

if (!apiKey) {
  throw new Error("Missing DEUTSCHLANDGPT_API_KEY. Add it to apps/api/.env.");
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": process.env.WEB_ORIGIN ?? "http://localhost:5173",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleChat(request: IncomingMessage, response: ServerResponse) {
  try {
    const body = (await readBody(request)) as { messages?: ChatMessage[]; model?: string };

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return sendJson(response, 400, { error: "messages must be a non-empty array" });
    }

    const upstream = await fetch(deutschlandGptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: body.model ?? model,
        messages: body.messages,
      }),
    });

    const result = await upstream.json();
    return sendJson(response, upstream.status, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return sendJson(response, 500, { error: message });
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return sendJson(response, 204, null);

  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "POST" && request.url === "/api/chat") {
    return handleChat(request, response);
  }

  return sendJson(response, 404, { error: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Professor-for-a-Day API listening on http://localhost:${port}`);
});
