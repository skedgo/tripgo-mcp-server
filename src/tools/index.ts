import { registerTripGoTools } from "./tripgo";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerAllTools(server: McpServer, env: any) {
  registerTripGoTools(server, env);
}
