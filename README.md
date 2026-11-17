# TripGo MCP Server
[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/skedgo/tripgo-mcp-server)](https://archestra.ai/mcp-catalog/skedgo__tripgo-mcp-server)

The is a remote MCP server that wraps the TripGo API and provides the following tools:

- `tripgo-locations`: Retrieve transport-related locations
- `tripgo-departures`: Departures from a specific public transport stop
- `tripgo-routing`: Mixed and multi-modal trip planning
- `tripgo-get-trip-url`: Get the URL of a trip previously calculated using the `tripgo-routing` tool

## Connect directly to remote MCP

The MCP server live and you can connect to it directly using the URL `https://tripgo-mcp-server.skedgo-account.workers.dev/mcp`.

### Connect Claude Desktop to public MCP server

1. Settings
2. Connectors
3. Add Custom connector
4. Name: TripGo MCP Server
5. URL: https://tripgo-mcp-server.skedgo-account.workers.dev/mcp
6. Add

### Connect other MCP clients to public MCP server

You can also connect to the remote MCP server from apps that only work with *local* MCP clients, by using the [mcp-remote proxy](https://www.npmjs.com/package/mcp-remote).

Use with this configuration:

```json
{
  "mcpServers": {
    "TripGo": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://tripgo-mcp-server.skedgo-account.workers.dev/mcp"
      ]
    }
  }
}
```

## Development

- Create a copy of `.env.example` and rename it to `.env` and set an API key
- Install dependencies with `npm install`
- Start the server with `npm run dev:local`

The configure Claude:

```json
{
  "mcpServers": {
    "TripGo": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/mcp"
      ]
    }
  }
}
```

Restart Claude and you should see the tools become available.

## Deployment

This is deployed using GHA. To deploy locally, run:

```bash
npm install
npm run deploy
```
