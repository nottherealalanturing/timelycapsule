import base from '@tc/eslint-config';
import globals from 'globals';

export default [
  ...base,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
];
