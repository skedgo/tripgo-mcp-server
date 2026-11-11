import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { instrument } from "@posthog/mcp";
import { registerAllTools } from "./tools";
import { getPostHog, type PostHogEnv } from "./posthog";

type WorkerEnv = PostHogEnv & {
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

function withSseKeepAlive(response: Response, onFinished: () => void): Response {
  if (!isEventStreamResponse(response) || !response.body) {
    onFinished();
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
          onFinished();
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

function createServer(env: WorkerEnv): {
  server: McpServer;
  posthog: ReturnType<typeof getPostHog>;
} {
  const posthog = getPostHog(env);
  const server = new McpServer({
    name: "TripGo MCP Toolkit",
    version: "1.0.0",
  });

  if (posthog) {
    instrument(server, posthog);
  }

  registerAllTools(server, env);
  return { server, posthog };
}

// The transport returns SSE responses before tools have run, so flushing has to
// wait for the stream to end, and waitUntil keeps it off the response path.
function flushWhenFinished(
  ctx: ExecutionContext,
  posthog: ReturnType<typeof getPostHog>,
): () => void {
  if (!posthog) {
    return () => {};
  }

  let finish = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  ctx.waitUntil(finished.then(() => posthog.flush()).catch(() => {}));
  return finish;
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
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
      const { server, posthog } = createServer(env);
      const finish = flushWhenFinished(ctx, posthog);

      try {
        await server.connect(transport);
        const response = await transport.handleRequest(request);
        return withCorsHeaders(withSseKeepAlive(response, finish));
      } catch (error) {
        finish();
        throw error;
      }
    }

    return withCorsHeaders(new Response("Not found", { status: 404 }));
  },
};
