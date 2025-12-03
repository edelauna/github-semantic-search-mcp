<img src="workflow/docs/gss-ai-logo.jpg" alt="GitHub Semantic Search Logo" width="100">

# GitHub Semantic Search

This project provides semantic search capabilities for GitHub repositories using the Model Context Protocol (MCP). It enables retrieval-augmented generation (RAG) queries against indexed GitHub repositories, supporting both public and private repos.

## Components

- **[vscode-extension](vscode-extension/)**: VSCode extension for integration with Copilot Chat Window as MCP.
- **[workflow](workflow/)**: Backend MCP server that handles indexing and search queries using Cloudflare infrastructure.
- **[config-packs](config-packs/)**: Configuration and packaging utilities for deployment.

## Quick Start

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=github-semantic-search-server&config=eyJ1cmwiOiJodHRwczovL2dpdGh1Yi1zZWFyY2gubG9rZWVsLmNvbS9tY3AiLCJoZWFkZXJzIjp7IkdJVEhVQl9UT0tFTiI6IjxZT1VSX1RPS0VOPiJ9fQ%3D%3D)

MCP Configuration

```json
{
  "mcpServers": {
    "github-semantic-search-server": {
      "type": "streamable-http",
      "url": "https://github-search.lokeel.com/mcp",
      "headers": {
        "GITHUB_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}
```

[![GitHub Semantic Search Example](https://img.youtube.com/vi/jym2HQKCYCM/0.jpg)](https://www.youtube.com/watch?v=jym2HQKCYCM "GitHub Semantic Search Example")

1. Configure the MCP server in your IDE (see [workflow README](workflow/README.MD) for setup instructions).
2. Use the semantic search tool by providing `@owner` and `repository` parameters.
3. If a repository hasn't been indexed yet, check back later as initial indexing takes time.

## Features

- Semantic code search across GitHub repositories
- Support for private repositories
- Integration with VSCode and other MCP-compatible tools
- Cloudflare-powered backend for scalability

For detailed installation, deployment, and usage instructions, refer to the README files in each component directory.
