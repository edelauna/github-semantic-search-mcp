import { env } from "cloudflare:workers";

const getPublicKey = () => {
  const { alg, e, kty, n } = JSON.parse(env.RSA_PRIVATE_KEY)
  return crypto.subtle.importKey(
    'jwk',
    { alg, e, kty, n },
    {
      name: 'RSA-OAEP',
      hash: { name: 'SHA-256' }
    },
    false,
    ['encrypt']
  )
}

export const encryptedString = async (message: string) => {
  const publicKey = await getPublicKey()
  const encrypted = await crypto.subtle.encrypt({
    name: 'RSA-OAEP',
  }, publicKey, new TextEncoder().encode(message))
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}

const getPrivateKey = () => crypto.subtle.importKey(
  'jwk',
  JSON.parse(env.RSA_PRIVATE_KEY),
  {
    name: 'RSA-OAEP',
    hash: { name: 'SHA-256' }
  },
  false,
  ['decrypt']
);

export const decryptedString = async (message: string) => {
  const privateKey = await getPrivateKey()
  const decrypted = await crypto.subtle.decrypt({
    name: 'RSA-OAEP',
  }, privateKey, Uint8Array.from(atob(message), c => c.charCodeAt(0)))
  return new TextDecoder().decode(decrypted)
}
