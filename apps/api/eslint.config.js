import base from '@tc/eslint-config';
import boundaries from 'eslint-plugin-boundaries';

export default [
  ...base,
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
];
