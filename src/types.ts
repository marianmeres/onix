/**
 * Public types for `@marianmeres/onix`.
 *
 * Re-exports the raw generated DTOs ({@link ./types.gen.ts}) and layers on a
 * consumer-friendly surface: semantic aliases, the generic {@link PagedResult},
 * the per-endpoint `tables` enums, and the client/option interfaces.
 *
 * @module
 */

import type { HttpApi } from "@marianmeres/http-utils";
import type { Clog } from "@marianmeres/clog";

import type {
	DtoBalance,
	DtoDocumentGet,
	DtoDocumentItemGet,
	DtoDocumentItemPost,
	DtoDocumentPost,
	DtoDocumentState,
	DtoDocumentType,
	DtoGroups,
	DtoInternalAccountingGet,
	DtoInternalAccountingPost,
	DtoPartnersGet,
	DtoPartnersPost,
	DtoStockItemPropBalance,
	DtoStockItemsGet,
	DtoStockItemsPost,
	DtoStocks,
} from "./types.gen.ts";

// Raw, schema-faithful DTO names remain available for power users.
export * from "./types.gen.ts";

export type { Clog, HttpApi };

// ---------------------------------------------------------------------------
// Semantic aliases — the friendly names most consumers should reach for.
// Read models map to the `*_get` DTOs; write/input models to the `*_post` DTOs.
// ---------------------------------------------------------------------------

/** A document (read model). Alias of {@link DtoDocumentGet}. */
export type Document = DtoDocumentGet;
/** A document to add/edit (write model). Alias of {@link DtoDocumentPost}. */
export type DocumentInput = DtoDocumentPost;
/** A document line item (read model). */
export type DocumentItem = DtoDocumentItemGet;
/** A document line item (write model). */
export type DocumentItemInput = DtoDocumentItemPost;
/** A business partner (read model). Alias of {@link DtoPartnersGet}. */
export type Partner = DtoPartnersGet;
/** A business partner to add/edit (write model). */
export type PartnerInput = DtoPartnersPost;
/** A stock item / card (read model). Alias of {@link DtoStockItemsGet}. */
export type StockItem = DtoStockItemsGet;
/** A stock item to add/edit (write model). */
export type StockItemInput = DtoStockItemsPost;
/** A warehouse / stock (read model). Alias of {@link DtoStocks}. */
export type Stock = DtoStocks;
/** A stock-item group (read model). Alias of {@link DtoGroups}. */
export type StockItemGroup = DtoGroups;
/** A stock-item stock balance row. Alias of {@link DtoStockItemPropBalance}. */
export type StockItemPropertyBalance = DtoStockItemPropBalance;
/** An overall stock balance row. Alias of {@link DtoBalance}. */
export type Balance = DtoBalance;
/** An internal-accounting entry (read model). */
export type InternalAccounting = DtoInternalAccountingGet;
/** An internal-accounting entry to add/edit (write model). */
export type InternalAccountingInput = DtoInternalAccountingPost;
/** A document type (evidence) reference. */
export type DocumentType = DtoDocumentType;
/** A document state reference. */
export type DocumentState = DtoDocumentState;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Wrapper returned by list endpoints ONLY when pagination params (`pageSize`,
 * `cursor`, and — for stock items — `itemType`) are supplied. Without them the
 * endpoints return a plain `T[]` instead.
 *
 * @template T - the row type of the current page.
 */
export interface PagedResult<T> {
	/** Records of the current page. */
	Data?: T[];
	/**
	 * Cursor to fetch the next page (pass as `cursor`). Absent / `null` when
	 * there are no more records.
	 * @format int64 (may exceed JS Number.MAX_SAFE_INTEGER)
	 */
	NextCursor?: number | null;
	/** Whether more records exist after this page. */
	HasNext?: boolean;
	/** Page size used for this request. */
	PageSize?: number;
}

// ---------------------------------------------------------------------------
// `tables` sub-table selectors (per endpoint) — not in the schema definitions;
// sourced from the path query params in docs/V1.json.
// ---------------------------------------------------------------------------

/** Sub-tables selectable on `documents` list calls. */
export const DocumentTables = {
	ALL: "ALL",
	DOCITEMS: "DOCITEMS",
	ENCLOSURES: "ENCLOSURES",
} as const;
/** A `documents` sub-table value (see {@link DocumentTables}). */
export type DocumentTable = (typeof DocumentTables)[keyof typeof DocumentTables];

/** Sub-tables selectable on `partners` list calls. */
export const PartnerTables = {
	ALL: "ALL",
	ADDRESSES: "ADDRESSES",
	BANKACCOUNTS: "BANKACCOUNTS",
	CONTACTS: "CONTACTS",
} as const;
/** A `partners` sub-table value (see {@link PartnerTables}). */
export type PartnerTable = (typeof PartnerTables)[keyof typeof PartnerTables];

/** Sub-tables selectable on `stockItems` list calls. */
export const StockItemTables = {
	ALL: "ALL",
	ACCESSORIES: "ACCESSORIES",
	ALTERNATIVES: "ALTERNATIVES",
	ENCLOSURES: "ENCLOSURES",
	GROUPS: "GROUPS",
	PARAMS: "PARAMS",
	CODES: "CODES",
	PARTNERS: "PARTNERS",
	MU: "MU",
} as const;
/** A `stockItems` sub-table value (see {@link StockItemTables}). */
export type StockItemTable = (typeof StockItemTables)[keyof typeof StockItemTables];

/** Sub-tables selectable on `stockItemGroups` list calls (deferred resource). */
export const StockItemGroupTables = {
	ALL: "ALL",
	ENCLOSURES: "ENCLOSURES",
} as const;
/** A `stockItemGroups` sub-table value (see {@link StockItemGroupTables}). */
export type StockItemGroupTable =
	(typeof StockItemGroupTables)[keyof typeof StockItemGroupTables];

// ---------------------------------------------------------------------------
// Numeric type enums (mirror the schema integer enums as named constants)
// ---------------------------------------------------------------------------

/** Stock-item type; REQUIRED when paginating `stockItems`. */
export const ItemType = {
	STOCK_CARD: 1,
	SERVICE: 2,
	DEVICE: 6,
} as const;
/** A stock-item type value: `1 | 2 | 6` (see {@link ItemType}). */
export type ItemTypeValue = (typeof ItemType)[keyof typeof ItemType];

/** Internal-accounting variant (1–6). */
export type InternalAccountingVariant = 1 | 2 | 3 | 4 | 5 | 6;

/** `DtoStocks.Stock_Type`. */
export const StockType = {
	UNDEFINED: 0,
	GOODS: 1,
	MATERIAL: 2,
	TRANSPORT: 3,
	CUSTOMS: 4,
	CONSIGNMENT: 5,
	GROUP: 6,
} as const;
/** A `DtoStocks.Stock_Type` value (see {@link StockType}). */
export type StockTypeValue = (typeof StockType)[keyof typeof StockType];

/** `DtoStocks.Valuation_Type`. */
export const ValuationType = {
	UNDEFINED: 0,
	WEIGHTED_AVERAGE: 1,
	FIFO: 2,
} as const;
/** A `DtoStocks.Valuation_Type` value (see {@link ValuationType}). */
export type ValuationTypeValue = (typeof ValuationType)[keyof typeof ValuationType];

// ---------------------------------------------------------------------------
// Client configuration & call options
// ---------------------------------------------------------------------------

/** Configuration for {@link createOnixClient}. */
export interface OnixClientConfig {
	/** API base URL, e.g. `http://195.146.148.139/ONIX_API/`. Trailing slash optional. */
	baseUrl: string;
	/** Onix API key. Sent as `Authorization: Bearer <apiKey>` on every request. */
	apiKey: string;
	/**
	 * Source Onix database path (provided by Kros a.s.). Sent as the REQUIRED
	 * `DatabasePath` header on every request; overridable per call.
	 */
	databasePath: string;
	/** Extra headers merged into every request (lowest precedence). */
	defaultHeaders?: Record<string, string>;
	/** Default request timeout in ms (per-call `timeout` overrides). */
	timeout?: number | null;
	/**
	 * When `true`, save/delete methods throw {@link OnixResultError} when a
	 * returned `Result` code is >= 2 (added-with-errors / not-added). Overridable
	 * per call.
	 * @default false
	 */
	throwOnResultError?: boolean;
	/**
	 * Logger used for request/error logging. Pass your own {@link Clog}, or
	 * `false` to silence all logging. Defaults to a namespaced `"onix"` logger.
	 */
	logger?: Clog | false;
	/**
	 * Enable DEBUG-level logging (per-request timing, etc.). Only applies to the
	 * default logger; ignored when a custom `logger` is injected.
	 * @default false
	 */
	debug?: boolean;
	/** Escape hatch: a preconfigured {@link HttpApi} (mainly for testing). */
	httpApi?: HttpApi;
}

/** Options accepted by (almost) every client method. */
export interface CallOptions {
	/** Override the client-level `DatabasePath` for this call. */
	databasePath?: string;
	/** Restrict returned fields (maps to `$select`). Arrays are joined with ",". */
	select?: string | string[];
	/** Per-call abort signal. */
	signal?: AbortSignal;
	/** Per-call timeout in ms. */
	timeout?: number | null;
	/** Extra headers for this call (merged over the client defaults). */
	headers?: Record<string, string>;
}

/** Result-handling override, mixed into save/delete options. */
export interface ResultOptions {
	/** Override the client-level `throwOnResultError` for this call. */
	throwOnResultError?: boolean;
}

/** Cursor pagination knobs. */
export interface PageOptions {
	/** Page size; presence switches the endpoint into paged mode. */
	pageSize?: number;
	/** Cursor from a previous page's `NextCursor` (0 / omitted for the first page). */
	cursor?: number;
}

/**
 * A date filter for `Date_Changed`-style query params. Provide a raw string
 * (e.g. `"gte:2024-01-01"`) or a structured filter. Only ONE operator is sent
 * per param (`eq` wins, then `gte`, `lte`, `gt`, `lt`).
 */
export interface DateFilter {
	/** Greater-than-or-equal (`gte:`). */
	gte?: string | Date;
	/** Less-than-or-equal (`lte:`). */
	lte?: string | Date;
	/** Greater-than (`gt:`). */
	gt?: string | Date;
	/** Less-than (`lt:`). */
	lt?: string | Date;
	/** Equals (bare value, no operator prefix). Takes precedence over the others. */
	eq?: string | Date;
}

/** Ad-hoc model-field filters appended verbatim as query params. */
export type ModelFilters = Record<string, string | number | boolean>;

/** Options for `documents.list` / `listPaged` / `listAll`. */
export interface DocumentListOptions extends CallOptions {
	/** Sub-tables to include. */
	tables?: DocumentTable | DocumentTable[];
	/** Return formatted (HTML) text for `Doc_Description`. */
	htmlFormat?: boolean;
	/** Filter by partner name (`Partner_Name`). */
	partnerName?: string;
	/** Filter by document number (`Ns_Number`). */
	nsNumber?: string;
	/** Filter by change date (`Date_Changed`). */
	dateChanged?: string | DateFilter;
	/** Additional model-field filters. */
	filters?: ModelFilters;
}

/** Options for `partners.list` / `listPaged` / `listAll`. */
export interface PartnerListOptions extends CallOptions {
	/** Sub-tables to include. */
	tables?: PartnerTable | PartnerTable[];
	/** Filter by partner number (`Ns_Number`). */
	nsNumber?: string;
	/** Filter by change date (`Date_Changed`). */
	dateChanged?: string | DateFilter;
	/** Additional model-field filters. */
	filters?: ModelFilters;
}

/** Options for `stockItems.list` / `listPaged` / `listAll`. */
export interface StockItemListOptions extends CallOptions {
	/** Sub-tables to include. */
	tables?: StockItemTable | StockItemTable[];
	/** Item type (1=card, 2=service, 6=equipment). REQUIRED when paginating. */
	itemType?: ItemTypeValue;
	/** Filter by stock code(s) (`StockCode`, repeatable). */
	stockCode?: string | string[];
	/** Filter by supplier code(s) (`SupplierCode`, repeatable). */
	supplierCode?: string | string[];
	/** Filter by change date (`Date_Changed`). */
	dateChanged?: string | DateFilter;
	/** Additional model-field filters. */
	filters?: ModelFilters;
}

/** Options for `stockItems.balances`. */
export interface StockItemBalanceOptions extends CallOptions {
	/** Filter by serial number (`SerialNumber`). */
	serialNumber?: string;
	/** Filter by stock name (`StockName`). */
	stockName?: string;
	/** Filter by manufacture date (`DateManufacture`). */
	dateManufacture?: string;
}

/** Options for `stockItems.propertyBalances` / `propertyBalancesAll`. */
export interface StockItemPropertyBalanceOptions extends CallOptions {
	/** Filter by batch-property value(s) (`PropertyText`, repeatable). */
	propertyText?: string | string[];
}
