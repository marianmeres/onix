/**
 * Logging wiring for `@marianmeres/onix` — built on `@marianmeres/clog`.
 *
 * Every request and every error is logged through a single choke point (the
 * resource base `request()` wrapper). This module owns logger resolution and
 * the secret-free formatting helpers used there.
 *
 * @module
 */

import { type Clog, createClog, createNoopClog } from "@marianmeres/clog";
import type { QueryValue } from "@marianmeres/http-utils";
import type { Result } from "./types.gen.ts";
import { isOk, ResultCode } from "./result.ts";
import type { OnixClientConfig } from "./types.ts";

/** Logger namespace used by the default logger. */
export const ONIX_LOG_NS = "onix";

/**
 * Resolves the {@link Clog} for a client: a custom logger if provided, a
 * silent no-op logger when `logger: false`, otherwise a default `"onix"`
 * logger (with DEBUG output gated by `config.debug`).
 */
export function resolveLogger(config: OnixClientConfig): Clog {
	if (config.logger === false) return createNoopClog(ONIX_LOG_NS);
	if (config.logger) return config.logger;
	return createClog(ONIX_LOG_NS, { debug: config.debug ?? false });
}

/**
 * Builds a short, secret-free one-line request summary. Query params are safe
 * to log (credentials and `DatabasePath` travel as headers, never as query),
 * but the value is length-capped to avoid noise.
 */
export function summarizeRequest(
	method: string,
	path: string,
	query?: Record<string, QueryValue> | null,
): string {
	const qs = query ? formatQuery(query) : "";
	return `${method} ${path}${qs ? `?${qs}` : ""}`;
}

const MAX_QUERY_LEN = 200;

function formatQuery(query: Record<string, QueryValue>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(query)) {
		if (value == null) continue;
		const rendered = Array.isArray(value)
			? value.filter((v) => v != null).join(",")
			: String(value);
		if (rendered === "") continue;
		parts.push(`${key}=${rendered}`);
	}
	const out = parts.join("&");
	return out.length > MAX_QUERY_LEN ? `${out.slice(0, MAX_QUERY_LEN)}…` : out;
}

/**
 * Logs the business outcome of an Onix {@link Result}: ERROR for failures
 * (code >= 2), WARNING for added-with-warnings (code 1), nothing for a clean
 * add. Independent of whether the caller also throws.
 */
export function logResult(logger: Clog, result: Result, context: string): void {
	if (!result) return;
	if (!isOk(result)) {
		const msgs = (result.Errors ?? []).map((e) => e.Message).filter(Boolean);
		logger.error(`${context} → Result ${result.Result} ${msgs.join("; ")}`.trim());
	} else if (result.Result === ResultCode.AddedWithWarnings) {
		const msgs = (result.Warnings ?? []).map((w) => w.Message).filter(Boolean);
		logger.warn(`${context} → Result 1 (warnings) ${msgs.join("; ")}`.trim());
	}
}
