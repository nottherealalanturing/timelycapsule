// Zero-access encryption primitives — plan/06-FEATURE-ADDENDUM.md §A,
// plan/05-BUILD-PLAYBOOK.md T-07b. See README.md for threat notes.
export { encryptBytes, decryptBytes, encryptStream, decryptStream, type Encrypted } from './aes.js';
export { deriveKeyFromPassword, deriveKeyFromRecoveryCode } from './kdf.js';
export { generateAesKey, generateIv, generateSalt, generateRecoveryCodeBytes } from './random.js';
export { toBase64Url, fromBase64Url } from './encoding.js';
export { wrapKey, unwrapKey, extractSalt } from './wrap.js';
export {
  generateMasterKey,
  wrapMasterKeyWithPassword,
  unwrapMasterKeyWithPassword,
  rewrapMasterKeyWithNewPassword,
} from './master-key.js';
export {
  generateRecoveryCode,
  formatRecoveryCode,
  parseRecoveryCode,
  wrapMasterKeyWithRecoveryCode,
  restoreMasterKeyFromRecoveryCode,
} from './recovery-kit.js';
export {
  generateCapsuleKey,
  wrapCapsuleKeyForOwner,
  unwrapCapsuleKeyForOwner,
  wrapCapsuleKeyWithPassphrase,
  unwrapCapsuleKeyWithPassphrase,
  encodeCapsuleKeyForLink,
  decodeCapsuleKeyFromLink,
} from './capsule-key.js';
