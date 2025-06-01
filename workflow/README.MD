<img src="docs/gss-ai-logo.jpg" alt="GitHub Semantic Search Logo" width="100">

# Github Semantic Search MCP Server

I built this tool because I was getting frustrated by having to clone repos of libraries/APIs I'm using to be able to add them as context to the Cursor IDE (so that Cursor could use the most recent patterns). I would've preferred to just proxy GitHub search, but I (maybe also GitHub) couldn't figure out how to get reliable results based on a query. This repo hosts a remote MCP server to facilitate a RAG query against an indexed GitHub repo. Indexing is performed via Cloudflare workflows, you can access this MCP server with the following `~/.cursor/mcp.json` configuration:

```json
{
  "mcpServers": {
    "github-semantic-search": {
      "url": "https://github-search.lokeel.com/mcp",
      "env": {
        "GITHUB_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}
```

Once configured you'll need to direct your agent to use the tool and provide an `@owner` and `repository` name for effective tool use.

[![GitHub Semantic Search Example](https://img.youtube.com/vi/jym2HQKCYCM/0.jpg)](https://www.youtube.com/watch?v=jym2HQKCYCM "GitHub Semantic Search Example")

If the repository has not currently been indexed, then the tool will return an error, saying to check back later. Initial indexing takes some time, as a rough estimate it's about an hour per 1,000 files (sorry I'm throttling my AI usuage).

## Does this work for Private GitHub Repositories?

Yes... but you should probably fork this repo and deploy your own instance.

## Deploying

Fork this repo and add a secret for `CLOUDFLARE_API_TOKEN`. See [`@cloudflare/wrangler-action`](https://github.com/cloudflare/wrangler-action) for more info.

Set up the following Cloudflare resources and update `github-semantic-search/workflow/wrangler.toml` as needed:

1. D1 Database to track workflow executions and embeddings:
```sh
npx wrangler d1 create prod-d1-gh-sem-search
```

2. Key Value Store for workflow state:
```sh
npx wrangler kv namespace create WORKFLOW_STATE
```

3. R2 Bucket to host code split into manageable token sizes for embeddings via [Cloudflare Dashboard](https://developers.cloudflare.com/r2/get-started/#2-create-a-bucket).

4. Vectorize (database optimized for k-nearest-neighbor queries):

Main Index:
```sh
npx wrangler vectorize create github-semantic-search-index --dimensions=384 --metric=cosine
```

The following metadata indexes are also required since this is a single-tenanted instance for any repo:
```sh
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=oid --type=string
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=branch --type=string
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=owner --type=string
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=repo --type=string
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=path --type=string
```

5. AI - This should be auto-added, just ensure there's a payment method connected to the account.

6. Deploy to Cloudflare:
```sh
npx wrangler deploy
```

7. Add Secret Variable `RSA_PRIVATE_KEY` - this is used to encrypt sensitive data at rest.
You can generate a key from any JS console via this code (copy the output string into the variable input):
```js
crypto.subtle.generateKey(
    {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
)
.then((k) => crypto.subtle.exportKey('jwk', k.privateKey).then((out) => console.log(out)));
```

> [!NOTE]
> **To Do**
> * Better error handling for cleaning up storage + resources
> * Tune tokenization process to see if overlapping documents results in higher quality search results
> * Ability to roll private key to not break in-process workflows
> * Add ability to specify `branch` or GitHub `tag` to search via specific version of a repository

## Development

Running `npm run dev` will start a local instance of this repo that should do everything that's possible in Cloudflare prod.

> [!CAUTION]
> * `--experimental-vectorize-bind-to-prod` flag is set when running in dev mode so any vectors generated locally will be saved in the remote vectorize db
> * All `AI` API calls locally use [`neurons`](https://developers.cloudflare.com/workers-ai/platform/pricing/#what-are-neurons)

Where possible, tests try to make use of integration API calls to Cloudflare resources.

## Issues / Vulnerabilities

I feel like fundamentally the MCP server might rely a bit on a quasi prompt injection... so on that note if you encounter an issue or notice something, please add it to https://github.com/edelauna/github-semantic-search-mcp/issues

## Closing Notes

This was a pretty cool project to work through to better understand MCPs, and although Cloudflare instrumentation and observability are pretty rough when trying to debug workflows (or I'm just spoiled with temporal and jvms), I was curious to try CF Workflows out, which kept throwing me new error limits when deployed to prod :(

In regards to Cloudflare limits, doing some napkin math to deliver this kind of MCP server at scale, I'm pretty sure I found the reason why GitHub doesn't innately offer this type of search, but I can see the business case for each enterprise to host their own tenant.
