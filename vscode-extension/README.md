# Github Semantic Search MCP Server

This MCP server provides semantic code search capabilities by indexing GitHub repositories and serving queries via a remote MCP interface. It is designed to integrate with VS Code's Copilot and facilitate retrieval-augmented generation (RAG) queries.

## Usage

Once configured, direct the agent to use the `github-semantic-search-server` MCP server and provide the `@owner` and `repository` name parameters for effective semantic search queries.

If the repository has not been indexed yet, the server will return an error indicating to check back later.

## Support for Private Repositories

This MCP server supports private GitHub repositories.

For highly sensitive repositories, it is recommended to fork (https://github.com/edelauna/github-semantic-search-mcp/workflow)[https://github.com/edelauna/github-semantic-search-mcp/workflow] and deploy your own instance.
