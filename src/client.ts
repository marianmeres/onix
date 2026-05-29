/**
 * Client factory & facade for `@marianmeres/onix`.
 *
 * @module
 */

import { createHttpApi, type HttpApi } from "@marianmeres/http-utils";
import type { Clog } from "@marianmeres/clog";

import { resolveLogger } from "./logging.ts";
import type { OnixClientConfig } from "./types.ts";
import {
	DocumentsResource,
	type OnixContext,
	PartnersResource,
	StockItemsResource,
	StocksResource,
} from "./resources.ts";

const API_PREFIX = "/api/v1";

/** Strips trailing slashes from the base URL and appends the `/api/v1` prefix. */
function normalizeBaseUrl(baseUrl: string): string {
	const trimmed = String(baseUrl ?? "").replace(/\/+$/, "");
	if (!trimmed) throw new Error("createOnixClient: `baseUrl` is required.");
	return trimmed + API_PREFIX;
}

/**
 * A typed Onix API client. Created via {@link createOnixClient}. Groups the
 * available operations under resource namespaces mirroring the API.
 */
export class OnixClient {
	/** Document operations (`/documents/*`). */
	readonly documents: DocumentsResource;
	/** Partner operations (`/partners*`). */
	readonly partners: PartnersResource;
	/** Stock-item operations (`/stockitems*`). */
	readonly stockItems: StockItemsResource;
	/** Stock (warehouse) operations (`/stocks`). */
	readonly stocks: StocksResource;
	/** Escape hatch: the underlying http-utils instance. */
	readonly http: HttpApi;
	/** The logger used for request/error logging. */
	readonly logger: Clog;

	/**
	 * Prefer {@link createOnixClient} over calling this directly.
	 * @param ctx shared client context (transport, logger, defaults).
	 */
	constructor(ctx: OnixContext) {
		this.http = ctx.api;
		this.logger = ctx.logger;
		this.documents = new DocumentsResource(ctx);
		this.partners = new PartnersResource(ctx);
		this.stockItems = new StockItemsResource(ctx);
		this.stocks = new StocksResource(ctx);
	}
}

/**
 * Creates a typed Onix API client.
 *
 * Wires `@marianmeres/http-utils` with the `Authorization: Bearer <apiKey>`
 * token and the required default `DatabasePath` header, and a `@marianmeres/clog`
 * logger that logs every request and error.
 *
 * @example
 * ```ts
 * const onix = createOnixClient({
 *   baseUrl: "http://195.146.148.139/ONIX_API/",
 *   apiKey: "…",
 *   databasePath: "my_db",
 * });
 * const stocks = await onix.stocks.list();
 * ```
 */
export function createOnixClient(config: OnixClientConfig): OnixClient {
	if (!config?.apiKey) throw new Error("createOnixClient: `apiKey` is required.");
	if (!config?.databasePath) {
		throw new Error("createOnixClient: `databasePath` is required.");
	}

	const api = config.httpApi ?? createHttpApi(normalizeBaseUrl(config.baseUrl), {
		token: config.apiKey,
		timeout: config.timeout ?? null,
		headers: { DatabasePath: config.databasePath, ...config.defaultHeaders },
	});

	const ctx: OnixContext = {
		api,
		logger: resolveLogger(config),
		throwOnResultError: config.throwOnResultError ?? false,
	};

	return new OnixClient(ctx);
}
