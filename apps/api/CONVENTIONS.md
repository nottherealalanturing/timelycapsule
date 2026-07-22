# API Conventions

Engineering conventions for `apps/api` (built T-03). Product/architecture decisions live in `plan/`; this is the concrete "how do I write a route in this codebase" reference. Read this before adding anything under `src/modules/`.

## Error envelope

Every error response has the shape from `plan/03-ARCHITECTURE.md §14`:

```json
{ "error": { "code": "validation_failed", "message": "...", "details": { ... }, "requestId": "..." } }
```

- Throw `ApiError` (see `src/lib/errors.ts`) anywhere in a route or service — it's caught by the global `errorHandler` middleware (mounted last in `app.ts`) and turned into this envelope with the correct HTTP status.
- Known codes live in `packages/contracts/src/common.ts` (`ERROR_CODES`). Add new ones there as features need them (e.g. `capsule_sealed` in T-08) rather than using ad-hoc strings.
- Unhandled (non-`ApiError`) exceptions become a generic `internal_error` 500 — the real error is logged server-side (with `requestId`) but never leaked to the client.
- Unmatched routes get the same envelope with `not_found`, via `notFoundHandler` (mounted just before `errorHandler`).

## Validation

Use `validate({ body?, params?, query? })` from `src/middleware/validate.ts` with Zod schemas:

```ts
router.post('/capsules', validate({ body: CreateCapsuleSchema }), async (req, res) => {
  // req.body is now the parsed, defaulted, coerced value
});
```

Query is special-cased: Express 5 makes `req.query` a read-only getter, so validated query params land on `req.validatedQuery`, not `req.query`.

Failures throw `ApiError.validationFailed(zodError.flatten())` automatically — you don't need to catch anything.

## Idempotency

`Idempotency-Key` is **honored, not required** — routes that need it opt in explicitly:

```ts
router.post('/capsules/:id/seal', idempotency(db), validate({ ... }), handler);
```

Mount `idempotency` **before** `validate` so a replayed request short-circuits before touching validation or the handler. Behavior (table-backed via `idempotency_keys`, see `src/db/schema/system.ts`):
- No header → passes through untouched.
- Same key + same request body → replays the stored response, handler does not re-run.
- Same key + different body → `409 idempotency_conflict`.
- Same key, still in progress (including a genuine concurrent race, caught via the table's unique constraint) → `409 idempotency_conflict`.

Known gap (logged in `plan/PROGRESS.md`): uniqueness is scoped to `(key, method, path, userId)`, and until auth (T-04) populates `req.user`, `userId` is always null — Postgres treats every anonymous row as distinct, so idempotency doesn't yet dedupe unauthenticated requests. This resolves itself once auth middleware sets `req.user`.

## Rate limiting

`rateLimit({ windowMs, max, keyFn? })` from `src/middleware/rate-limit.ts` — in-memory (single API instance, per `plan/04-ZERO-COST-PLAN.md`; no Redis). Defaults to keying by `req.ip`; pass `keyFn` to key by user id on authenticated routes instead. Sets `X-RateLimit-{Limit,Remaining,Reset}` on every response and throws `ApiError.rateLimited()` (429) once exceeded.

## Pagination

Cursor-based, per `plan/03-ARCHITECTURE.md §14` (`?cursor=&limit=` → `{ data, nextCursor }`). Use `src/lib/pagination.ts`:

```ts
const rows = await db.select().from(capsules).where(...).limit(limit + 1);
const page = buildPage(rows, limit, (row) => row.id);
// page.nextCursor is null when there's no more data
```

Decode an incoming cursor with `decodeCursor(req.validatedQuery.cursor)` before using it in a `WHERE id > ?`-style clause. Cursors are opaque to clients — never construct one by hand outside this helper.

## Module boundaries

Feature modules live under `src/modules/<name>/`, each with exactly one public `index.ts` (see `src/modules/README.md`). ESLint (`boundaries/dependencies` in `eslint.config.js`) enforces this at lint time: importing another module's internal file directly (instead of its `index.ts`) is a lint error, not just a convention someone can forget. Same-module (internal) imports are unaffected; non-module files (`lib/`, `middleware/`, `db/`) aren't subject to this rule at all.

This requires `import/resolver: { typescript }` in the ESLint config — without it, `.js`-suffixed relative imports (this repo's convention, since `tsconfig` uses `Bundler` resolution) don't resolve to their real `.ts` files and the rule silently never fires. If module-boundary violations ever stop being caught, check that resolver config first.

## Adding a new route — recipe

1. Add/extend Zod schemas in `packages/contracts` if the shape is shared with clients.
2. Build the module under `src/modules/<name>/` with a private implementation + a single `index.ts` exporting the Express `Router`.
3. Mount it in `app.ts`.
4. Compose middleware in this order: `rateLimit` → `idempotency` (only for side-effecting POSTs that need it) → `validate` → your handler.
5. Throw `ApiError` for anything error-shaped; let success responses `res.json(...)` directly.
6. Write a Supertest test against the route, or against the middleware directly via a small standalone `express()` instance (see any `*.test.ts` in `src/middleware/` for the pattern) — prefer the latter for testing a single middleware's behavior in isolation, the former for a real end-to-end route.
