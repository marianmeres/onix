# @marianmeres/onix

A thin, typed HTTP client over the [Kros Onix](https://www.kros.sk/onix/) REST API
(Swagger `V1`). Ships ready-made DTOs/models, ergonomic resource methods, cursor
pagination, business-result helpers, and request/error logging — so you can just
_consume_ the API instead of building a client from scratch.

Built on [`@marianmeres/http-utils`](https://jsr.io/@marianmeres/http-utils) 
(transport - typed HTTP errors) and [`@marianmeres/clog`](https://jsr.io/@marianmeres/clog) 
(logging).

## Features

- **Typed DTOs** for every Onix schema definition, generated 1:1 from the OpenAPI
  spec — with the original (Slovak) field docs surfaced as JSDoc in your IDE.
- **Resource namespaces** mirroring the API: `documents`, `partners`, `stockItems`,
  `stocks` _(core set; more to come)_.
- **Cursor pagination** done right: `list()`, `listPaged()`, and an auto-following
  `listAll()` async iterator.
- **Business-result helpers** — Onix returns HTTP 200 even on logical failures;
  `isOk` / `assertOk` / `throwOnResultError` make that explicit.
- **Typed HTTP errors** re-exported from `http-utils` (`Unauthorized`, `NotFound`,
  `ServiceUnavailable`, …).
- **Request & error logging** via `clog` — every request and error is logged; opt
  out or inject your own logger.
- Runs on **Deno** and **Node** (published to JSR and npm).

## Install

```sh
# Deno / JSR
deno add jsr:@marianmeres/onix

# Node / npm
npx jsr add @marianmeres/onix
```

## Quick start

```ts
import { createOnixClient, isOk } from "@marianmeres/onix";

const onix = createOnixClient({
	baseUrl: "http://195.146.148.139/ONIX_API/", // your Onix API base
	apiKey: "…", // sent as `Authorization: Bearer …`
	databasePath: "my_db", // sent as the required `DatabasePath` header
});

// Read
const types = await onix.documents.types(); // DocumentType[]
const stocks = await onix.stocks.list(); // Stock[]

// Paginate (auto-following async iterator)
for await (const partner of onix.partners.listAll({ pageSize: 100 })) {
	console.log(partner.Ns_Number, partner.Name);
}

// Write
const result = await onix.partners.save({
	RecordExternalIdentificator: "ext-1",
	Ns_Number: "P1",
	Name: "ACME s.r.o.",
});
if (!isOk(result)) console.warn("save failed:", result.Errors);
```

## Configuration

| Option               | Required | Description                                                               |
| -------------------- | -------- | ------------------------------------------------------------------------- |
| `baseUrl`            | yes      | API base URL. `/api/v1` is appended automatically.                        |
| `apiKey`             | yes      | Sent as `Authorization: Bearer <apiKey>` on every request.                |
| `databasePath`       | yes      | Sent as the required `DatabasePath` header. Overridable per call.         |
| `throwOnResultError` | no       | Throw `OnixResultError` on a failed `Result` (code ≥ 2). Default `false`. |
| `logger`             | no       | A custom `Clog`, or `false` to silence logging. Default: `"onix"` logger. |
| `debug`              | no       | Enable DEBUG-level logging (timings). Default `false`.                    |
| `defaultHeaders`     | no       | Extra headers merged into every request.                                  |
| `timeout`            | no       | Default per-request timeout (ms).                                         |

> **`DatabasePath`** is required on every Onix endpoint and is provided by Kros a.s.
> It is **not** part of the API key. Set it once on the client and override per call
> with the `databasePath` option when needed.

Reading config from the environment (Deno):

```ts
const onix = createOnixClient({
	baseUrl: Deno.env.get("API_URL")!,
	apiKey: Deno.env.get("API_KEY")!,
	databasePath: Deno.env.get("API_DATABASE_PATH")!,
});
```

## Resources & methods

### `documents`

```ts
onix.documents.list(documentTypeId, opts?)        // → Document[]
onix.documents.listPaged(documentTypeId, opts)    // → PagedResult<Document>  (opts.pageSize)
onix.documents.listAll(documentTypeId, opts?)     // → AsyncGenerator<Document>
onix.documents.save(documentTypeId, doc, opts?)   // → Result
onix.documents.saveMany(documentTypeId, docs)     // → Result[]   (upstream-deprecated)
onix.documents.delete(documentTypeId, nsNumber, nsCode, nsEvidCode) // → Result
onix.documents.types()                            // → DocumentType[]
onix.documents.states(documentTypeId)             // → DocumentState[]
onix.documents.setState(documentTypeId, state)    // → Result
onix.documents.setCustomColumns(documentTypeId, cols) // → Result
```

### `partners`

```ts
onix.partners.list(opts?)        // → Partner[]
onix.partners.listPaged(opts)    // → PagedResult<Partner>
onix.partners.listAll(opts?)     // → AsyncGenerator<Partner>
onix.partners.save(partner)      // → Result
onix.partners.saveMany(partners) // → Result[]
```

### `stockItems`

```ts
onix.stockItems.list(opts?)                       // → StockItem[]
onix.stockItems.listPaged({ pageSize, itemType }) // → PagedResult<StockItem>  (itemType REQUIRED)
onix.stockItems.listAll({ itemType, pageSize? })  // → AsyncGenerator<StockItem>
onix.stockItems.save(item)                        // → Result
onix.stockItems.balances(opts?)                   // → Balance[]
onix.stockItems.propertyBalances(stockItemId, stockId, propertyNumber, opts?)
onix.stockItems.propertyBalancesAll(propertyNumber, opts?)
```

> When paginating stock items, `itemType` is **required** (`1`=card, `2`=service,
> `6`=equipment) — each type is paginated separately. Use the `ItemType` enum.

### `stocks`

```ts
onix.stocks.list(opts?) // → Stock[]
```

## Pagination

List endpoints return a plain array by default, or a `PagedResult<T>` when you pass
`pageSize`. `listAll()` follows `NextCursor` until `HasNext` is false:

```ts
// One page at a time
const page = await onix.partners.listPaged({ pageSize: 100, cursor: 0 });
page.Data; // Partner[]
page.NextCursor; // pass as `cursor` for the next page
page.HasNext; // false ⇒ last page

// Or let the client follow the cursor for you
for await (const p of onix.partners.listAll({ pageSize: 100 })) { /* … */ }
```

## Filtering & field selection

```ts
await onix.documents.list(100, {
	tables: ["DOCITEMS", "ENCLOSURES"], // sub-tables to include (repeatable)
	partnerName: "ACME",
	nsNumber: "F2024-1",
	dateChanged: { gte: "2024-01-01" }, // → Date_Changed=gte:2024-01-01
	select: ["Ns_Number", "Sum", "Items.Stock_Items_Name"], // → $select
	filters: { Some_Other_Field: "x" }, // ad-hoc model-field filters
});
```

`dateChanged` accepts a raw string (`"gte:2024-01-01"`) or a `DateFilter`
(`{ gte | lte | gt | lt | eq }`). Only one operator is sent per param
(`eq` wins, then `gte`, `lte`, `gt`, `lt`).

## Results & error handling

Onix add/edit/delete endpoints answer **HTTP 200 even on logical failures** — the
outcome is in `Result.Result` (`0` added, `1` added w/ warnings, `2` added w/ errors,
`3` not added).

```ts
import { assertOk, isOk, OnixResultError, ResultCode } from "@marianmeres/onix";

const r = await onix.partners.save(partner);
if (isOk(r)) { /* 0 or 1 */ }
else console.error(r.Errors);

// Opt into throwing on failure (per client or per call):
try {
	await onix.partners.save(partner, { throwOnResultError: true });
} catch (e) {
	if (e instanceof OnixResultError) console.error(e.code, e.errors);
}
```

Transport-level failures throw typed `http-utils` errors:

```ts
import { getErrorMessage, HTTP_ERROR } from "@marianmeres/onix";

try {
	await onix.stocks.list();
} catch (e) {
	if (e instanceof HTTP_ERROR.Unauthorized) { /* bad token */ }
	if (e instanceof HTTP_ERROR.ServiceUnavailable) { /* 503 — see retry-after */ }
	console.error(getErrorMessage(e));
}
```

## Logging

Every request is logged at INFO and every error at ERROR via a `@marianmeres/clog`
logger (namespace `"onix"`). DEBUG (timings) is off by default.

```ts
// Silence logging
createOnixClient({ /* … */, logger: false });

// Enable DEBUG timing logs
createOnixClient({ /* … */, debug: true });

// Inject your own logger
import { createClog } from "@marianmeres/onix";
createOnixClient({ /* … */, logger: createClog("my-app:onix") });
```

The API key, `Authorization` header, and request/response bodies are **never** logged.

## Types

Friendly aliases (`Document`, `DocumentInput`, `Partner`, `PartnerInput`, `StockItem`,
`Stock`, …) sit on top of the raw generated DTOs (`DtoDocumentGet`, `DtoDocumentPost`,
…) — both are exported, pick whichever reads better. Read models map to the API's
`*_get` DTOs; write/input models to `*_post`.

## Caveats

- **int64 → `number`.** IDs (`IdRecord`) and cursors are int64 and may exceed
  `Number.MAX_SAFE_INTEGER`. JSON parsing can lose precision (JSDoc-flagged).
- **base64 fields.** Enclosure binary fields are base64 `string`s.
- **`CustomField.Value`** is an unschema'd value bag, typed `unknown`.
- **Deferred resources.** `StockItemGroups`, `InternalAccounting`, `PricingLists`,
  `StockItemBatchProperties`, and `Enclosures` ship their **types** but not yet their
  client methods. Use `onix.http` (the underlying `http-utils` instance) for those in
  the meantime.

## Development

```sh
deno task gen:types   # regenerate src/types.gen.ts from docs/V1.json
deno task test        # hermetic tests (local mock server)
deno task test:live   # read-only live smoke test (needs API_* in .env)
deno task check       # fmt --check + lint + type-check
```

`src/types.gen.ts` is **generated** — never edit it by hand; run `deno task gen:types`.

## License

MIT — see [LICENSE](./LICENSE).
