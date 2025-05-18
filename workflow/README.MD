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
