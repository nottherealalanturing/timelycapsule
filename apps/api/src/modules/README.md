# Feature modules

Each feature module (auth, capsules, media, scheduling, notifications, billing, orgs, admin — per plan/03-ARCHITECTURE.md §12) gets its own directory here with a single public `index.ts` that re-exports what other modules are allowed to use (router, public service functions, types). Everything else in the directory is private to the module.

Enforced by ESLint (`boundaries/element-types` in `eslint.config.js`) — importing a file from another module by its internal path instead of its `index.ts` is a lint error, not just a convention. This is what keeps a future extraction to separate services cheap without paying microservice operational cost today.

No modules exist yet — the first lands in T-04 (auth).
