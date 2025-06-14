## Config-Pack for the Github Semantic Search MCP Server

**config-packs** is the development and distribution repo for Github Semantic Search `config-rocket` ecosystem config packs.

## Available config packs:

- [`Github Semantic Search Server MCP`](./src/assembly/roo-rocket/github-semantic-search-server/)
  - A Roo Code config-pack for a Github Semantic Search Server Model Context Protocol (MCP) server for code searching remote repositories.

## Deployment

```sh
npm install -g pnpm
pnpm install
```

### Bundle the config-pack

```bash
pnpm run bundle
```

### Generate Binary Hash

```bash
openssl dgst -sha256 -binary binary/github-semantic-search-server-mcp.zip | openssl base64 | tr '+/' '-_' | tr -d '='
```
