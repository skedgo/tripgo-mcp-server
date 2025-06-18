# TripGo MCP Server

The is a remote MCP server that wraps the TripGo API and provides the following tools:

- `tripgo-locations`: Retrieve transport-related locations
- `tripgo-departures`: Departures from a specific public transport stop
- `tripgo-routing`: Mixed and multi-modal trip planning
- `tripgo-get-trip-url`: Get the URL of a trip previously calculated using the `tripgo-routing` tool

The MCP server is deployed on Cloudflare Workers.

## Connect directly to remove MCP

The MCP server is deployed on Cloudflare Workers. You can connect to it directly using the URL `https://tripgo-mcp-server.skedgo-account.workers.dev/sse`.

## Connect Claude Desktop to public MCP server

You can also connect to your remote MCP server from *local* MCP clients, by using the [mcp-remote proxy](https://www.npmjs.com/package/mcp-remote).

To connect to your MCP server from Claude Desktop, follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config.

Use with this configuration:

```json
{
  "mcpServers": {
    "TripGo": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://tripgo-mcp-server.skedgo-account.workers.dev/sse"
      ]
    }
  }
}
```

Restart Claude and you should see the tools become available.

## Development

- Create a copy of `.env.example` and rename it to `.env` and set an API key
- Install dependencies with `npm install`
- Start the server with `npm run dev:local`

The configure Claude:

```json
{
  "mcpServers": {
    "calculator": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"
      ]
    }
  }
}
```

Restart Claude and you should see the tools become available.
