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
