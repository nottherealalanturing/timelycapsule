export { capsulesRouter } from './routes.js';
export { findOwnedCapsuleOrThrow } from './service.js';
export {
  purgeCapsuleNow,
  withdrawCapsule,
  cancelPendingMediaRelease,
  scheduleMediaRelease,
  expireCapsule,
  scheduleCapsuleExpiry,
} from './lifecycle.js';
export { generateUniquePublicId } from './public-id.js';
export { assertCanPatch, assertCanReleaseMedia } from './state-machine.js';
export {
  getMediaRetention,
  releasesAutomatically,
  getSealedStorageAllowanceBytes,
  isLegacySnapshot,
  buildSealedEntitlementSnapshot,
  type SealedEntitlementSnapshot,
} from './sealed-entitlement.js';
export {
  getPlanLimits,
  assertWithinRecipientLimit,
  assertFileWithinSizeLimit,
  assertWithinStorageQuota,
  commitActualStorageUsage,
  type PlanLimits,
  type EntitlementPlan,
} from './entitlements.js';
