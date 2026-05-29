/**
 * `@marianmeres/onix` — a thin, typed HTTP client over the Kros Onix REST API.
 *
 * Built on `@marianmeres/http-utils` (transport + typed HTTP errors) and
 * `@marianmeres/clog` (request/error logging).
 *
 * @example
 * ```ts
 * import { createOnixClient, isOk } from "@marianmeres/onix";
 *
 * const onix = createOnixClient({
 *   baseUrl: "http://195.146.148.139/ONIX_API/",
 *   apiKey: "…",
 *   databasePath: "my_db",
 * });
 *
 * const types = await onix.documents.types();
 * for await (const partner of onix.partners.listAll({ pageSize: 100 })) {
 *   console.log(partner.Name);
 * }
 *
 * const result = await onix.partners.save({ Name: "ACME", Ns_Number: "P1" });
 * if (!isOk(result)) console.warn(result.Errors);
 * ```
 *
 * @module
 */

// Client + facade
export { createOnixClient, OnixClient } from "./client.ts";
export type { OnixContext } from "./resources.ts";
export {
	DocumentsResource,
	PartnersResource,
	StockItemsResource,
	StocksResource,
} from "./resources.ts";

// Types: friendly aliases, generated DTOs, enums, options, PagedResult
export * from "./types.ts";

// Business-result helpers
export { assertOk, isOk, OnixResultError, ResultCode } from "./result.ts";
export type { ResultCodeValue } from "./result.ts";

// Query/pagination helpers (handy for advanced consumers)
export { arr, paginate, toDateFilter, toSelect } from "./query.ts";

// Re-export http-utils error surface so consumers need only one import.
export {
	createHttpError,
	getErrorMessage,
	HTTP_ERROR,
	HTTP_STATUS,
} from "@marianmeres/http-utils";

// Re-export clog factories for building/injecting a custom logger.
export { createClog, createNoopClog } from "@marianmeres/clog";
