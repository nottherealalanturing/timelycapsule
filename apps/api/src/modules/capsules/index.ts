export { capsulesRouter } from './routes.js';
export { findOwnedCapsuleOrThrow } from './service.js';
export { assertCanPatch } from './state-machine.js';
export {
  getPlanLimits,
  assertWithinRecipientLimit,
  assertFileWithinSizeLimit,
  assertWithinStorageQuota,
  type PlanLimits,
  type EntitlementPlan,
} from './entitlements.js';
