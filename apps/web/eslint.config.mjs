import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Meridian V2 motion constitution (design/07 §VI) — shared with base.js so
// the ban lives in one place. This app is where it matters most: almost all
// UI is authored here, not in packages/*.
import { motionConfig } from "@tc/eslint-config/motion";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  motionConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext/Cloudflare build output (T-20) — generated, not source.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
