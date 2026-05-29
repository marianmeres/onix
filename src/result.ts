/**
 * Business-result handling for `@marianmeres/onix`.
 *
 * Onix add/edit/delete endpoints answer with an HTTP 200 even when the
 * operation logically failed — the outcome lives in the body's `Result` code.
 * These helpers make that explicit and safe to act on.
 *
 * @module
 */

import type { Message, Result } from "./types.gen.ts";

/**
 * The `Result.Result` business outcome code.
 *
 * - `0` Added — record added.
 * - `1` AddedWithWarnings — added, see `Warnings`.
 * - `2` AddedWithErrors — added with errors, see `Errors`.
 * - `3` NotAdded — record not added.
 */
export const ResultCode = {
	Added: 0,
	AddedWithWarnings: 1,
	AddedWithErrors: 2,
	NotAdded: 3,
} as const;
/** One of the {@link ResultCode} values (`0 | 1 | 2 | 3`). */
export type ResultCodeValue = (typeof ResultCode)[keyof typeof ResultCode];

/**
 * Returns `true` when a {@link Result} indicates success — code `0` (added) or
 * `1` (added with warnings). Codes `2` / `3` are failures.
 */
export function isOk(result: Result): boolean {
	return (
		result?.Result === ResultCode.Added ||
		result?.Result === ResultCode.AddedWithWarnings
	);
}

/**
 * Error thrown for a failed Onix business {@link Result} (code >= 2). Carries
 * the offending result(s) and the flattened error messages.
 */
export class OnixResultError extends Error {
	/** Error name (`"OnixResultError"`). */
	override name = "OnixResultError";
	/** All results passed to the failing assertion. */
	readonly results: Result[];
	/** The first failing result's code (or {@link ResultCode.NotAdded}). */
	readonly code: ResultCodeValue;
	/** Flattened `Errors` across all failing results. */
	readonly errors: Message[];

	/**
	 * Builds an error from one or more failing results.
	 * @param results the failing {@link Result} (or array of results).
	 */
	constructor(results: Result | Result[]) {
		const list = Array.isArray(results) ? results : [results];
		const errors = list.filter((r) => !isOk(r)).flatMap((r) => r.Errors ?? []);
		const msg = errors.map((e) => e.Message).filter(Boolean).join("; ");
		super(msg || "Onix operation failed.");
		this.results = list;
		this.code = (list.find((r) => !isOk(r))?.Result ??
			ResultCode.NotAdded) as ResultCodeValue;
		this.errors = errors;
	}
}

/**
 * Throws {@link OnixResultError} if any of the given results failed (code >= 2);
 * otherwise returns the input unchanged.
 */
export function assertOk<T extends Result | Result[]>(result: T): T {
	const list = Array.isArray(result) ? result : [result];
	if (list.some((r) => !isOk(r))) throw new OnixResultError(result);
	return result;
}
