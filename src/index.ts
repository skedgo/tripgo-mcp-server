import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerAllTools } from "./tools";

type WorkerEnv = {
  TRIPGO_API_KEY?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, mcp-session-id, mcp-protocol-version, Last-Event-ID",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

function isEventStreamResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type");
  return contentType?.includes("text/event-stream") ?? false;
}

function withSseKeepAlive(response: Response): Response {
  if (!isEventStreamResponse(response) || !response.body) {
    return response;
  }

  const upstream = response.body.getReader();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Send an immediate SSE comment so runtimes/proxies don't treat this as a hung stream.
      controller.enqueue(encoder.encode(": connected\n\n"));

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15000);

      const pump = async () => {
        let hasErrored = false;
        try {
          while (true) {
            const { done, value } = await upstream.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (error) {
          hasErrored = true;
          controller.error(error);
          return;
        } finally {
          if (heartbeat) clearInterval(heartbeat);
          if (!hasErrored) {
            try {
              controller.close();
            } catch {
              // Stream is already closed/cancelled.
            }
          }
        }
      };

      void pump();
    },
    cancel(reason) {
      if (heartbeat) clearInterval(heartbeat);
      return upstream.cancel(reason);
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function withCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createServer(env: WorkerEnv): McpServer {
  const server = new McpServer({
    name: "TripGo MCP Toolkit",
    version: "1.0.0",
  });
  registerAllTools(server, env);
  return server;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return withCorsHeaders(
        new Response(
          "Legacy SSE endpoint has been removed. Use /mcp (Streamable HTTP).",
          { status: 410 },
        ),
      );
    }

    if (url.pathname === "/mcp") {
      const transport = new WebStandardStreamableHTTPServerTransport();
      const server = createServer(env);
      await server.connect(transport);

      const response = await transport.handleRequest(request);
      return withCorsHeaders(withSseKeepAlive(response));
    }

    return withCorsHeaders(new Response("Not found", { status: 404 }));
  },
};
