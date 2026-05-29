/**
 * Live, READ-ONLY smoke test against the real Onix API.
 *
 * Skipped unless `API_DATABASE_PATH` (plus `API_URL` and `API_KEY`) is present.
 * Run with: `deno task test:live` (loads `.env`). Performs no writes.
 *
 * @module
 */

import { assert } from "@std/assert";
import { createOnixClient } from "../src/mod.ts";

/** Reads an env var, tolerating the absence of `--allow-env` (returns undefined). */
function env(key: string): string | undefined {
	try {
		return Deno.env.get(key);
	} catch {
		return undefined;
	}
}

const baseUrl = env("API_URL");
const apiKey = env("API_KEY");
const databasePath = env("API_DATABASE_PATH");
const gated = !(baseUrl && apiKey && databasePath);

Deno.test({
	name: "LIVE: read-only smoke (documents.types, stocks.list, partners.listPaged)",
	ignore: gated,
	async fn() {
		const onix = createOnixClient({
			baseUrl: baseUrl!,
			apiKey: apiKey!,
			databasePath: databasePath!,
		});

		const types = await onix.documents.types();
		assert(Array.isArray(types), "documents.types() should return an array");

		const stocks = await onix.stocks.list();
		assert(Array.isArray(stocks), "stocks.list() should return an array");

		const page = await onix.partners.listPaged({ pageSize: 2 });
		assert(
			Array.isArray(page.Data),
			"partners.listPaged() should return a PagedResult",
		);
		assert((page.Data?.length ?? 0) <= 2, "page should respect pageSize");
	},
});
