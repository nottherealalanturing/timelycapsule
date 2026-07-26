import { AES_IV_BYTES, AES_KEY_BYTES, RECOVERY_CODE_BYTES, SALT_BYTES } from './constants';

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generateAesKey(): Uint8Array {
  return randomBytes(AES_KEY_BYTES);
}

export function generateIv(): Uint8Array {
  return randomBytes(AES_IV_BYTES);
}

export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

export function generateRecoveryCodeBytes(): Uint8Array {
  return randomBytes(RECOVERY_CODE_BYTES);
}
