// One-off dev helper: prints an RSA keypair (base64-encoded PEM, one line
// each) to paste into apps/api/.env as JWT_PRIVATE_KEY_B64 / JWT_PUBLIC_KEY_B64.
// Run: node scripts/generate-jwt-keys.mjs
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

console.log('JWT_PRIVATE_KEY_B64=' + Buffer.from(privateKey).toString('base64'));
console.log('JWT_PUBLIC_KEY_B64=' + Buffer.from(publicKey).toString('base64'));
