# AGENTS.md — @marianmeres/onix

Machine-oriented notes for working in this repo. For usage docs see [README.md](./README.md).

## What this is

A thin, typed HTTP client over the Kros Onix REST API (OpenAPI/Swagger 2.0 at
[`docs/V1.json`](./docs/V1.json)). Deno/JSR package that also builds to npm. Transport
is `@marianmeres/http-utils` (`createHttpApi` + typed `HTTP_ERROR.*`); logging is
`@marianmeres/clog` (`createClog`).

## Golden rules

- **No `Deno.*` in `src/`.** It must run on Node too (npm build). `Deno.*` is allowed
  only in `scripts/` and `tests/`.
- **`src/types.gen.ts` is generated — never hand-edit.** Run `deno task gen:types`
  (reads `docs/V1.json` → writes `src/types.gen.ts`, then `deno fmt`). It is type-only;
  keep runtime values (enums, `as const`) in `src/types.ts`.
- **Preserve API field names verbatim** (e.g. `Ns_Number`, `Date_Changed`,
  `Doc_Description`) — they are the exact wire keys and must serialize unchanged.
- **All HTTP goes through `BaseResource.request()`** (the logging/timing choke point).
  Resource methods build a flat `query` object + `params` and call `request()`; they do
  not call `ctx.api.*` directly.
- **Never log secrets.** No API key / `Authorization` / request bodies in logs.

## Layout

```
src/
  mod.ts        # public barrel
  client.ts     # createOnixClient factory + OnixClient facade
  resources.ts  # BaseResource (request choke point) + Documents/Partners/StockItems/Stocks
  types.ts      # config, options, PagedResult<T>, aliases, enums; re-exports types.gen.ts
  types.gen.ts  # GENERATED type-only DTOs
  result.ts     # ResultCode, isOk, assertOk, OnixResultError
  query.ts      # toSelect, toDateFilter, arr, paginate
  logging.ts    # resolveLogger, summarizeRequest, logResult
scripts/gen-types.ts   # the type generator (dev-only; may use Deno.*)
tests/_helpers.ts      # local recording HTTP server
tests/onix.test.ts     # hermetic tests
tests/live.smoke.test.ts  # env-gated read-only live test
```

## Key behaviors to keep intact

- `DatabasePath` is a **required header on every request** (client default, overridable
  per call). `apiKey` → `Authorization: Bearer …` via http-utils `token`.
- GET list endpoints return `T[]` normally, `PagedResult<T>` when `pageSize` is sent.
  `NextCursor` is **absent** on the last page — `paginate()` stops on null/absent cursor.
- StockItems pagination **requires `itemType`** (runtime guard in `listPaged`).
- A POST `Result` code ≥ 2 is a business failure on HTTP 200 — `maybeAssert()` logs it
  (ERROR; code 1 → WARNING) and throws `OnixResultError` when `throwOnResultError`.

## Tasks

| Task                  | What it does                                             |
| --------------------- | -------------------------------------------------------- |
| `deno task gen:types` | Regenerate `src/types.gen.ts` from `docs/V1.json`.       |
| `deno task test`      | Hermetic tests (local mock server; `--allow-net`).       |
| `deno task test:live` | Read-only live smoke test; gated on `API_DATABASE_PATH`. |
| `deno task check`     | `fmt --check` + `lint` + `deno check src/mod.ts`.        |
| `deno task npm:build` | Build the npm distribution.                              |

## Before publishing

Run `deno task check` and `deno publish --dry-run` to catch JSR "slow types"
diagnostics (the factory has an explicit `OnixClient` return type for this reason).

## Scope status

Core resources implemented: **Documents, Partners, StockItems, Stocks**. Types for
**all** definitions ship now. Deferred client methods: StockItemGroups,
InternalAccounting, PricingLists, StockItemBatchProperties, Enclosures (the Enclosures
upload is multipart — `FormData` passthrough, do not set `Content-Type` manually).
