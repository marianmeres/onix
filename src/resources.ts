/**
 * Resource classes for `@marianmeres/onix` (core set: Documents, Partners,
 * StockItems, Stocks).
 *
 * Every method routes through the module-private {@link doRequest} — the single
 * choke point that logs each request, times it, and logs transport errors.
 * Business `Result` outcomes are logged (and optionally thrown) via
 * {@link maybeAssert}.
 *
 * @module
 */

import {
	type FetchParams,
	getErrorMessage,
	HTTP_ERROR,
	type HttpApi,
	opts,
	type QueryValue,
	type RequestData,
} from "@marianmeres/http-utils";
import type { Clog } from "@marianmeres/clog";

import { arr, paginate, toDateFilter, toSelect } from "./query.ts";
import { assertOk } from "./result.ts";
import { logResult, summarizeRequest } from "./logging.ts";
import type {
	Balance,
	CallOptions,
	Document,
	DocumentInput,
	DocumentListOptions,
	DocumentState,
	DocumentType,
	ItemTypeValue,
	PagedResult,
	Partner,
	PartnerInput,
	PartnerListOptions,
	Result,
	ResultOptions,
	Stock,
	StockItem,
	StockItemBalanceOptions,
	StockItemInput,
	StockItemListOptions,
	StockItemPropertyBalance,
	StockItemPropertyBalanceOptions,
} from "./types.ts";
import type { DocumentCurrentState, DocumentCustomColumns } from "./types.gen.ts";

/** Shared client context handed to every resource (internal wiring). */
export interface OnixContext {
	/** The configured http-utils transport instance. */
	api: HttpApi;
	/** The logger used for request/error logging. */
	logger: Clog;
	/** Client default for whether a failed `Result` throws (per-call overridable). */
	throwOnResultError: boolean;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestArgs {
	query?: Record<string, QueryValue>;
	/** Request body — a DTO object/array; JSON-serialized by http-utils. */
	data?: unknown;
	params?: FetchParams;
}

const enc = encodeURIComponent;
const DEFAULT_PAGE_SIZE = 500;

/** Single HTTP entry point — logs request (INFO), success (DEBUG), error (ERROR). */
async function doRequest<T>(
	ctx: OnixContext,
	method: HttpMethod,
	path: string,
	args: RequestArgs = {},
): Promise<T> {
	const { api, logger } = ctx;
	const params: FetchParams = { ...args.params };
	if (args.query) params.query = args.query;

	logger.log(summarizeRequest(method, path, params.query));
	const t0 = performance.now();
	const call = (): Promise<T> => {
		switch (method) {
			case "GET":
				return api.get<T>(path, opts({ params }));
			case "DELETE":
				return api.del<T>(path, opts({ params }));
			case "POST":
				return api.post<T>(
					path,
					opts({ data: args.data as RequestData, params }),
				);
			case "PUT":
				return api.put<T>(path, opts({ data: args.data as RequestData, params }));
			case "PATCH":
				return api.patch<T>(
					path,
					opts({ data: args.data as RequestData, params }),
				);
		}
	};
	try {
		const res = await call();
		logger.debug(`${method} ${path} → ok (${Math.round(performance.now() - t0)}ms)`);
		return res;
	} catch (err) {
		const status = err instanceof HTTP_ERROR.HttpError ? err.status : 0;
		logger.error(`${method} ${path} → ${status} ${getErrorMessage(err)}`);
		throw err;
	}
}

/** Maps friendly {@link CallOptions} to http-utils {@link FetchParams}. */
function buildParams(o: CallOptions = {}): FetchParams {
	const headers: Record<string, string> = { ...(o.headers ?? {}) };
	if (o.databasePath) headers.DatabasePath = o.databasePath; // per-call override wins
	const params: FetchParams = {};
	if (Object.keys(headers).length) params.headers = headers;
	if (o.signal) params.signal = o.signal;
	if (o.timeout != null) params.timeout = o.timeout;
	return params;
}

/** Logs business-result outcomes and (optionally) throws on failure. */
function maybeAssert<T extends Result | Result[]>(
	ctx: OnixContext,
	result: T,
	context: string,
	override?: boolean,
): T {
	const list = Array.isArray(result) ? result : [result];
	for (const r of list) logResult(ctx.logger, r, context);
	if (override ?? ctx.throwOnResultError) assertOk(result);
	return result;
}

// ===========================================================================
// Documents
// ===========================================================================

const docPath = (documentTypeId: number) => `/documents/${documentTypeId}`;

/** `documents` resource — documents of a given type (evidence) + types/states. */
export class DocumentsResource {
	#ctx: OnixContext;

	/** Internal — obtain via {@link OnixClient.documents}. */
	constructor(ctx: OnixContext) {
		this.#ctx = ctx;
	}

	/** Lists documents of a type (non-paged → plain array). */
	list(documentTypeId: number, o: DocumentListOptions = {}): Promise<Document[]> {
		return doRequest<Document[]>(this.#ctx, "GET", docPath(documentTypeId), {
			query: this.#listQuery(o),
			params: buildParams(o),
		});
	}

	/** Lists one page of documents (paged → {@link PagedResult}). */
	listPaged(
		documentTypeId: number,
		o: DocumentListOptions & { pageSize: number; cursor?: number },
	): Promise<PagedResult<Document>> {
		return doRequest<PagedResult<Document>>(
			this.#ctx,
			"GET",
			docPath(documentTypeId),
			{
				query: { ...this.#listQuery(o), pageSize: o.pageSize, cursor: o.cursor },
				params: buildParams(o),
			},
		);
	}

	/** Iterates every document across all pages, following the cursor. */
	async *listAll(
		documentTypeId: number,
		o: DocumentListOptions & { pageSize?: number } = {},
	): AsyncGenerator<Document, void, unknown> {
		const pageSize = o.pageSize ?? DEFAULT_PAGE_SIZE;
		yield* paginate<Document>((cursor) =>
			this.listPaged(documentTypeId, { ...o, pageSize, cursor })
		);
	}

	/** Adds or edits a single document. */
	async save(
		documentTypeId: number,
		document: DocumentInput,
		o: CallOptions & ResultOptions = {},
	): Promise<Result> {
		const path = docPath(documentTypeId);
		const r = await doRequest<Result>(this.#ctx, "POST", path, {
			data: document,
			params: buildParams(o),
		});
		return maybeAssert(this.#ctx, r, `POST ${path}`, o.throwOnResultError);
	}

	/** Adds or edits multiple documents (upstream-deprecated). */
	async saveMany(
		documentTypeId: number,
		documents: DocumentInput[],
		o: CallOptions & ResultOptions = {},
	): Promise<Result[]> {
		const path = `${docPath(documentTypeId)}/list`;
		const r = await doRequest<Result[]>(this.#ctx, "POST", path, {
			data: documents,
			params: buildParams(o),
		});
		return maybeAssert(this.#ctx, r, `POST ${path}`, o.throwOnResultError);
	}

	/** Deletes a document by its number / serial-code / evidence-code. */
	async delete(
		documentTypeId: number,
		nsNumber: string,
		nsCode: string,
		nsEvidCode: string,
		o: CallOptions & ResultOptions = {},
	): Promise<Result> {
		const path = `${docPath(documentTypeId)}/${enc(nsNumber)}/${enc(nsCode)}/${
			enc(nsEvidCode)
		}`;
		const r = await doRequest<Result>(this.#ctx, "DELETE", path, {
			params: buildParams(o),
		});
		return maybeAssert(this.#ctx, r, `DELETE ${path}`, o.throwOnResultError);
	}

	/** Lists all document types (evidences). */
	types(o: CallOptions = {}): Promise<DocumentType[]> {
		return doRequest<DocumentType[]>(this.#ctx, "GET", "/documents/types", {
			query: { $select: toSelect(o.select) },
			params: buildParams(o),
		});
	}

	/** Lists the states available for a document type. */
	states(documentTypeId: number, o: CallOptions = {}): Promise<DocumentState[]> {
		return doRequest<DocumentState[]>(
			this.#ctx,
			"GET",
			`${docPath(documentTypeId)}/states`,
			{ query: { $select: toSelect(o.select) }, params: buildParams(o) },
		);
	}

	/** Sets a document's state. */
	async setState(
		documentTypeId: number,
		state: DocumentCurrentState,
		o: CallOptions & ResultOptions = {},
	): Promise<Result> {
		const path = `${docPath(documentTypeId)}/states`;
		const r = await doRequest<Result>(this.#ctx, "POST", path, {
			data: state,
			params: buildParams(o),
		});
		return maybeAssert(this.#ctx, r, `POST ${path}`, o.throwOnResultError);
	}

	/** Sets custom-column values on a document. */
	async setCustomColumns(
		documentTypeId: number,
		columns: DocumentCustomColumns,
		o: CallOptions & ResultOptions = {},
	): Promise<Result> {
		const path = `${docPath(documentTypeId)}/customcolumns`;
		const r = await doRequest<Result>(this.#ctx, "POST", path, {
			data: columns,
			params: buildParams(o),
		});
		return maybeAssert(this.#ctx, r, `POST ${path}`, o.throwOnResultError);
	}

	#listQuery(o: DocumentListOptions): Record<string, QueryValue> {
		return {
			tables: arr(o.tables),
			htmlFormat: o.htmlFormat,
			Partner_Name: o.partnerName,
			Ns_Number: o.nsNumber,
			Date_Changed: toDateFilter(o.dateChanged),
			$select: toSelect(o.select),
			...o.filters,
		};
	}
}

// ===========================================================================
// Partners
// ===========================================================================

/** `partners` resource. */
export class PartnersResource {
	#ctx: OnixContext;

	/** Internal — obtain via {@link OnixClient.partners}. */
	constructor(ctx: OnixContext) {
		this.#ctx = ctx;
	}

	/** Lists partners (non-paged → plain array). */
	list(o: PartnerListOptions = {}): Promise<Partner[]> {
		return doRequest<Partner[]>(this.#ctx, "GET", "/partners", {
			query: this.#listQuery(o),
			params: buildParams(o),
		});
	}

	/** Lists one page of partners. */
	listPaged(
		o: PartnerListOptions & { pageSize: number; cursor?: number },
	): Promise<PagedResult<Partner>> {
		return doRequest<PagedResult<Partner>>(this.#ctx, "GET", "/partners", {
			query: { ...this.#listQuery(o), pageSize: o.pageSize, cursor: o.cursor },
			params: buildParams(o),
		});
	}

	/** Iterates every partner across all pages. */
	async *listAll(
		o: PartnerListOptions & { pageSize?: number } = {},
	): AsyncGenerator<Partner, void, unknown> {
		const pageSize = o.pageSize ?? DEFAULT_PAGE_SIZE;
		yield* paginate<Partner>((cursor) => this.listPaged({ ...o, pageSize, cursor }));
	}

	/** Adds or edits a single partner. */
	async save(
		partner: PartnerInput,
		o: CallOptions & ResultOptions = {},
	): Promise<Result> {
		const r = await doRequest<Result>(this.#ctx, "POST", "/partners", {
			data: partner,
			params: buildParams(o),
		});
		return maybeAssert(this.#ctx, r, "POST /partners", o.throwOnResultError);
	}

	/** Adds or edits multiple partners. */
	async saveMany(
		partners: PartnerInput[],
		o: CallOptions & ResultOptions = {},
	): Promise<Result[]> {
		const r = await doRequest<Result[]>(this.#ctx, "POST", "/partners/list", {
			data: partners,
			params: buildParams(o),
		});
		return maybeAssert(this.#ctx, r, "POST /partners/list", o.throwOnResultError);
	}

	#listQuery(o: PartnerListOptions): Record<string, QueryValue> {
		return {
			tables: arr(o.tables),
			Ns_Number: o.nsNumber,
			Date_Changed: toDateFilter(o.dateChanged),
			$select: toSelect(o.select),
			...o.filters,
		};
	}
}

// ===========================================================================
// StockItems
// ===========================================================================

/** `stockItems` resource — cards, services, equipment, balances. */
export class StockItemsResource {
	#ctx: OnixContext;

	/** Internal — obtain via {@link OnixClient.stockItems}. */
	constructor(ctx: OnixContext) {
		this.#ctx = ctx;
	}

	/** Lists stock items (non-paged → plain array). */
	list(o: StockItemListOptions = {}): Promise<StockItem[]> {
		return doRequest<StockItem[]>(this.#ctx, "GET", "/stockitems", {
			query: this.#listQuery(o),
			params: buildParams(o),
		});
	}

	/** Lists one page of stock items. `itemType` is REQUIRED when paginating. */
	listPaged(
		o: StockItemListOptions & {
			pageSize: number;
			itemType: ItemTypeValue;
			cursor?: number;
		},
	): Promise<PagedResult<StockItem>> {
		if (o.itemType == null) {
			throw new Error(
				"stockItems pagination requires `itemType` (1=card, 2=service, 6=equipment).",
			);
		}
		return doRequest<PagedResult<StockItem>>(this.#ctx, "GET", "/stockitems", {
			query: { ...this.#listQuery(o), pageSize: o.pageSize, cursor: o.cursor },
			params: buildParams(o),
		});
	}

	/** Iterates every stock item across all pages (for the given `itemType`). */
	async *listAll(
		o: StockItemListOptions & { itemType: ItemTypeValue; pageSize?: number },
	): AsyncGenerator<StockItem, void, unknown> {
		const pageSize = o.pageSize ?? DEFAULT_PAGE_SIZE;
		yield* paginate<StockItem>((cursor) =>
			this.listPaged({ ...o, pageSize, cursor })
		);
	}

	/** Adds or edits a single stock item. */
	async save(
		item: StockItemInput,
		o: CallOptions & ResultOptions = {},
	): Promise<Result> {
		const r = await doRequest<Result>(this.#ctx, "POST", "/stockitems", {
			data: item,
			params: buildParams(o),
		});
		return maybeAssert(this.#ctx, r, "POST /stockitems", o.throwOnResultError);
	}

	/** Balances for all stock items on all stocks. */
	balances(o: StockItemBalanceOptions = {}): Promise<Balance[]> {
		return doRequest<Balance[]>(this.#ctx, "GET", "/stockitems/balances", {
			query: {
				SerialNumber: o.serialNumber,
				StockName: o.stockName,
				DateManufacture: o.dateManufacture,
				$select: toSelect(o.select),
			},
			params: buildParams(o),
		});
	}

	/** Balances for a stock item on a stock for a given batch property. */
	propertyBalances(
		stockItemId: number,
		stockId: number,
		propertyNumber: number,
		o: StockItemPropertyBalanceOptions = {},
	): Promise<StockItemPropertyBalance[]> {
		const path =
			`/stockitems/propertyBalances/${stockItemId}/${stockId}/${propertyNumber}`;
		return doRequest<StockItemPropertyBalance[]>(this.#ctx, "GET", path, {
			query: { PropertyText: arr(o.propertyText), $select: toSelect(o.select) },
			params: buildParams(o),
		});
	}

	/** Balances for all stock items on all stocks for a given batch property. */
	propertyBalancesAll(
		propertyNumber: number,
		o: StockItemPropertyBalanceOptions = {},
	): Promise<StockItemPropertyBalance[]> {
		const path = `/stockitems/propertyBalancesAll/${propertyNumber}`;
		return doRequest<StockItemPropertyBalance[]>(this.#ctx, "GET", path, {
			query: { PropertyText: arr(o.propertyText), $select: toSelect(o.select) },
			params: buildParams(o),
		});
	}

	#listQuery(o: StockItemListOptions): Record<string, QueryValue> {
		return {
			tables: arr(o.tables),
			itemType: o.itemType,
			StockCode: arr(o.stockCode),
			SupplierCode: arr(o.supplierCode),
			Date_Changed: toDateFilter(o.dateChanged),
			$select: toSelect(o.select),
			...o.filters,
		};
	}
}

// ===========================================================================
// Stocks
// ===========================================================================

/** `stocks` resource — warehouses. */
export class StocksResource {
	#ctx: OnixContext;

	/** Internal — obtain via {@link OnixClient.stocks}. */
	constructor(ctx: OnixContext) {
		this.#ctx = ctx;
	}

	/** Lists all stocks (warehouses). */
	list(o: CallOptions = {}): Promise<Stock[]> {
		return doRequest<Stock[]>(this.#ctx, "GET", "/stocks", {
			query: { $select: toSelect(o.select) },
			params: buildParams(o),
		});
	}
}
