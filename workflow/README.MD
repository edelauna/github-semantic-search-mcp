# Intro

Corresponding API for front end.

#### Helpful Notes

**Rotating RSA Private key**

```js
window.crypto.subtle
	.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			// Consider using a 512-bit key is cookies getting too large
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256',
		},
		true,
		['sign', 'verify']
	)
	.then((k) => window.crypto.subtle.exportKey('jwk', k.privateKey).then((out) => console.log(out)));
```

Can copy the following object removing attributes `ext`,`ops`

#### Vectorize

Main Index
`npx wrangler vectorize create github-semantic-search-index --dimensions=384 --metric=cosine`

Metadata Index
Keeping track of oid, branch, owner, repo, path

```sh
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=oid --type=string
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=branch --type=string
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=owner --type=string
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=repo --type=string
npx wrangler vectorize create-metadata-index github-semantic-search-index --property-name=path --type=string
```
