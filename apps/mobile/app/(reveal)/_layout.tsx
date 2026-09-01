import { Slot } from 'expo-router';

/**
 * The recipient (token-auth, no account) reveal group — deliberately
 * outside `(app)`'s auth gate and `(auth)`'s login stack. Matches
 * `apps/web/src/app/(reveal)/c/[token]/page.tsx`'s own route grouping:
 * a recipient opening a capsule link has no account and needs none
 * (`00-INDEX.md` rule 4 — "recipient reveal must work with no account, no
 * app install"). No provider/guard of its own; `app/_layout.tsx`'s
 * `MasterKeyProvider`/`AuthProvider` still wrap this group (they're in the
 * root layout), but nothing under this group reads either — PHASE-5.1's
 * own security requirement that reveal code never touches the owner
 * master-key path.
 */
export default function RevealLayout() {
  return <Slot />;
}
