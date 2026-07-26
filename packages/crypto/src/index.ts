// Zero-access encryption primitives — plan/06-FEATURE-ADDENDUM.md §A,
// plan/05-BUILD-PLAYBOOK.md T-07b. See README.md for threat notes.
export { encryptBytes, decryptBytes, encryptStream, decryptStream, type Encrypted } from './aes';
export { deriveKeyFromPassword, deriveKeyFromRecoveryCode } from './kdf';
export { generateAesKey, generateIv, generateSalt, generateRecoveryCodeBytes } from './random';
export { toBase64Url, fromBase64Url } from './encoding';
export { wrapKey, unwrapKey, extractSalt } from './wrap';
export {
  generateMasterKey,
  wrapMasterKeyWithPassword,
  unwrapMasterKeyWithPassword,
  rewrapMasterKeyWithNewPassword,
} from './master-key';
export {
  generateRecoveryCode,
  formatRecoveryCode,
  parseRecoveryCode,
  wrapMasterKeyWithRecoveryCode,
  restoreMasterKeyFromRecoveryCode,
} from './recovery-kit';
export {
  generateCapsuleKey,
  wrapCapsuleKeyForOwner,
  unwrapCapsuleKeyForOwner,
  wrapCapsuleKeyWithPassphrase,
  unwrapCapsuleKeyWithPassphrase,
  encodeCapsuleKeyForLink,
  decodeCapsuleKeyFromLink,
} from './capsule-key';
