import base from '@tc/eslint-config';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';

export default [
  ...base,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // k6 load test scripts run inside k6's own sandboxed JS runtime, not
    // Node — `open` (reads a file at init time) and `__ENV` are its globals.
    files: ['loadtest/*.js'],
    languageOptions: { globals: { open: 'readonly', __ENV: 'readonly' } },
  },
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [{ type: 'module', pattern: 'src/modules/*', capture: ['moduleName'] }],
      'boundaries/files': [{ category: 'module-entry', pattern: 'src/modules/*/index.ts' }],
      // Required so `.js`-suffixed relative imports (this repo's NodeNext-style
      // convention) resolve to their real `.ts` files for module classification.
      'import/resolver': { typescript: { project: './tsconfig.json' } },
    },
    rules: {
      // Only a module's index.ts is importable from another module — see
      // src/modules/README.md. Non-module files (lib, middleware, db) are
      // untouched since `default: 'allow'` only bites module<->module deps,
      // and same-module (internal) imports never match the disallow policy
      // below because captured.moduleName is identical on both sides.
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'module' } },
              disallow: {
                to: {
                  element: {
                    type: 'module',
                    captured: { moduleName: '!{{from.element.captured.moduleName}}' },
                  },
                },
              },
              message:
                'Import another module via its index.ts, not an internal file (see src/modules/README.md).',
            },
            {
              from: { element: { type: 'module' } },
              allow: {
                to: { element: { type: 'module' }, file: { categories: 'module-entry' } },
              },
            },
          ],
        },
      ],
    },
  },
  {
    /**
     * **Delivery must never consult payment state** — `plan/00-INDEX.md`
     * hard rule 5, and the promise the whole product rests on: *delivery is
     * never paywalled.*
     *
     * The unlock handlers are clean today, and a prose rule in a plan
     * document is not what will keep them that way in three years. This is
     * the rule made mechanical: the two handlers that actually deliver a
     * capsule cannot import entitlement, plan or quota code at all. A future
     * session reaching for `getPlanLimits` here — with the best of
     * intentions, to "check the owner is still premium before sending" —
     * fails CI instead of quietly shipping.
     *
     * Scoped to the delivery path only. Everywhere else may read
     * entitlements freely; that is what they are for.
     */
    files: [
      'src/modules/scheduler/handlers/capsule-unlock.ts',
      'src/modules/scheduler/handlers/recipient-unlock.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/capsules/entitlements*', '**/entitlements.js', '**/entitlements'],
              message:
                'Delivery must never consult payment, plan or quota state (plan/00-INDEX.md hard rule 5). A sealed capsule is delivered on the terms it was sealed with, regardless of the owner’s subscription.',
            },
          ],
        },
      ],
    },
  },
];
