/**
 * Pure query-building & pagination helpers for `@marianmeres/onix`.
 *
 * @module
 */

import type { DateFilter, PagedResult } from "./types.ts";

/** Joins a `$select` value into a comma list; passes strings through. */
export function toSelect(select?: string | string[]): string | undefined {
	if (select == null) return undefined;
	return Array.isArray(select) ? select.join(",") : select;
}

/** Normalizes a scalar-or-array into an array (or `undefined`) for multi params. */
export function arr<T>(value?: T | T[]): T[] | undefined {
	if (value == null) return undefined;
	return Array.isArray(value) ? value : [value];
}

const fmtDate = (d: string | Date): string => d instanceof Date ? d.toISOString() : d;

/**
 * Renders a `Date_Changed`-style value. A raw string passes through; a
 * {@link DateFilter} becomes `"<op>:<value>"`. Only one operator is sent per
 * param — precedence: `eq` (bare value), then `gte`, `lte`, `gt`, `lt`.
 */
export function toDateFilter(value?: string | DateFilter): string | undefined {
	if (value == null) return undefined;
	if (typeof value === "string") return value;
	if (value.eq != null) return fmtDate(value.eq);
	for (const op of ["gte", "lte", "gt", "lt"] as const) {
		const v = value[op];
		if (v != null) return `${op}:${fmtDate(v)}`;
	}
	return undefined;
}

/**
 * Async generator that yields every row across all pages, following the
 * `NextCursor` of each {@link PagedResult} until `HasNext` is false. Guards
 * against a missing/null/unchanged cursor (the live API omits `NextCursor` on
 * the last page) to avoid an infinite loop.
 *
 * @param fetchPage - fetches a single page given a cursor.
 */
export async function* paginate<T>(
	fetchPage: (cursor: number) => Promise<PagedResult<T>>,
): AsyncGenerator<T, void, unknown> {
	let cursor = 0;
	for (;;) {
		const page = await fetchPage(cursor);
		for (const row of page.Data ?? []) yield row;
		if (page.HasNext !== true) return;
		const next = page.NextCursor;
		if (next == null || next === cursor) return;
		cursor = next;
	}
}
