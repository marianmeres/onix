import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
	arr,
	assertOk,
	createClog,
	createOnixClient,
	HTTP_ERROR,
	isOk,
	type ItemTypeValue,
	OnixResultError,
	type PartnerInput,
	type Result,
	toDateFilter,
	toSelect,
} from "../src/mod.ts";
import { type RecordedRequest, startRecordingServer } from "./_helpers.ts";

// ---------------------------------------------------------------------------
// Request construction
// ---------------------------------------------------------------------------

Deno.test("documents.list builds the correct request", async () => {
	const srv = await startRecordingServer({
		routes: { "GET /api/v1/documents/100": [{ Ns_Number: "F1" }] },
	});
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "secret-token",
			databasePath: "db.onx",
			logger: false,
		});
		const rows = await onix.documents.list(100, {
			tables: ["DOCITEMS", "ENCLOSURES"],
			dateChanged: "gte:2024-01-01",
			select: ["Ns_Number", "Sum"],
		});
		const r = srv.last!;
		assertEquals(r.method, "GET");
		assertEquals(r.pathname, "/api/v1/documents/100"); // /api/v1 prefix + path param
		assertEquals(r.headers["authorization"], "Bearer secret-token");
		assertEquals(r.headers["databasepath"], "db.onx");
		assertEquals(r.query["tables"], ["DOCITEMS", "ENCLOSURES"]); // repeated keys
		assertEquals(r.query["Date_Changed"], ["gte:2024-01-01"]);
		assertEquals(r.query["$select"], ["Ns_Number,Sum"]);
		assertEquals(rows.length, 1);
	} finally {
		await srv.shutdown();
	}
});

Deno.test("DateFilter object renders an operator-prefixed value", async () => {
	const srv = await startRecordingServer({ routes: { "GET /api/v1/partners": [] } });
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "k",
			databasePath: "d",
			logger: false,
		});
		await onix.partners.list({ dateChanged: { gte: "2024-01-01" } });
		assertEquals(srv.last!.query["Date_Changed"], ["gte:2024-01-01"]);
	} finally {
		await srv.shutdown();
	}
});

Deno.test("per-call databasePath overrides the client default", async () => {
	const srv = await startRecordingServer({ routes: { "GET /api/v1/stocks": [] } });
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "k",
			databasePath: "DEFAULT",
			logger: false,
		});
		await onix.stocks.list({ databasePath: "OVERRIDE" });
		assertEquals(srv.last!.headers["databasepath"], "OVERRIDE");
	} finally {
		await srv.shutdown();
	}
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

Deno.test("partners.listAll follows NextCursor and stops when absent", async () => {
	const srv = await startRecordingServer({
		routes: {
			"GET /api/v1/partners": (req: RecordedRequest) => {
				const cursor = Number(req.query["cursor"]?.[0] ?? "0");
				return cursor === 0
					? {
						Data: [{ Ns_Number: "P1" }],
						NextCursor: 42,
						HasNext: true,
						PageSize: 1,
					}
					: { Data: [{ Ns_Number: "P2" }], HasNext: false, PageSize: 1 }; // no NextCursor
			},
		},
	});
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "k",
			databasePath: "d",
			logger: false,
		});
		const out: string[] = [];
		for await (const p of onix.partners.listAll({ pageSize: 1 })) {
			out.push(p.Ns_Number ?? "");
		}
		assertEquals(out, ["P1", "P2"]);
		assertEquals(srv.received.length, 2);
		assertEquals(srv.received[0].query["pageSize"], ["1"]);
		assertEquals(srv.received[1].query["cursor"], ["42"]);
	} finally {
		await srv.shutdown();
	}
});

Deno.test("stockItems pagination requires itemType", async () => {
	const srv = await startRecordingServer({ routes: { "GET /api/v1/stockitems": [] } });
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "k",
			databasePath: "d",
			logger: false,
		});
		assertThrows(
			() =>
				onix.stockItems.listPaged({
					pageSize: 10,
					itemType: undefined as unknown as ItemTypeValue,
				}),
			Error,
			"itemType",
		);
	} finally {
		await srv.shutdown();
	}
});

// ---------------------------------------------------------------------------
// Result handling
// ---------------------------------------------------------------------------

const PARTNER: PartnerInput = { RecordExternalIdentificator: "ext-1", Name: "ACME" };

Deno.test("save returns Result; failures detected via isOk", async () => {
	const srv = await startRecordingServer({
		routes: {
			"POST /api/v1/partners": {
				Result: 2,
				Errors: [{ Message: "boom" }],
				Warnings: [],
			},
		},
	});
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "k",
			databasePath: "d",
			logger: false,
		});
		const r = await onix.partners.save(PARTNER);
		assertEquals(r.Result, 2);
		assertEquals(isOk(r), false);
	} finally {
		await srv.shutdown();
	}
});

Deno.test("throwOnResultError (per-call) throws OnixResultError", async () => {
	const srv = await startRecordingServer({
		routes: {
			"POST /api/v1/partners": {
				Result: 3,
				Errors: [{ Message: "nope" }],
				Warnings: [],
			},
		},
	});
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "k",
			databasePath: "d",
			logger: false,
		});
		await assertRejects(
			() => onix.partners.save(PARTNER, { throwOnResultError: true }),
			OnixResultError,
			"nope",
		);
	} finally {
		await srv.shutdown();
	}
});

// ---------------------------------------------------------------------------
// HTTP error propagation (http-utils typed errors)
// ---------------------------------------------------------------------------

const ERROR_CASES = [
	[400, HTTP_ERROR.BadRequest],
	[401, HTTP_ERROR.Unauthorized],
	[404, HTTP_ERROR.NotFound],
	[503, HTTP_ERROR.ServiceUnavailable],
] as const;

for (const [status, Ctor] of ERROR_CASES) {
	Deno.test(`HTTP ${status} throws ${Ctor.name}`, async () => {
		const srv = await startRecordingServer({
			forceStatus: status,
			forceBody: { message: "x" },
		});
		try {
			const onix = createOnixClient({
				baseUrl: srv.url,
				apiKey: "k",
				databasePath: "d",
				logger: false,
			});
			await assertRejects(() => onix.stocks.list(), Ctor);
		} finally {
			await srv.shutdown();
		}
	});
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

Deno.test("toSelect / toDateFilter / arr", () => {
	assertEquals(toSelect(undefined), undefined);
	assertEquals(toSelect("a"), "a");
	assertEquals(toSelect(["a", "b"]), "a,b");

	assertEquals(toDateFilter(undefined), undefined);
	assertEquals(toDateFilter("2024-01-01"), "2024-01-01");
	assertEquals(toDateFilter({ gte: "2024-01-01" }), "gte:2024-01-01");
	assertEquals(toDateFilter({ eq: "2024-01-01", gte: "x" }), "2024-01-01"); // eq wins

	assertEquals(arr(undefined), undefined);
	assertEquals(arr("a"), ["a"]);
	assertEquals(arr(["a", "b"]), ["a", "b"]);
});

Deno.test("isOk codes 0/1 ok, 2/3 not ok; assertOk throws on failure", () => {
	const ok0: Result = { Result: 0 };
	const ok1: Result = { Result: 1 };
	const bad2: Result = { Result: 2, Errors: [{ Message: "e" }] };
	assertEquals(isOk(ok0), true);
	assertEquals(isOk(ok1), true);
	assertEquals(isOk(bad2), false);

	assertEquals(assertOk(ok0), ok0); // passes through
	assertThrows(() => assertOk(bad2), OnixResultError, "e");
	assertThrows(() => assertOk([ok0, bad2]), OnixResultError); // any failure throws
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function capturing() {
	const entries: { level: string; text: string }[] = [];
	const logger = createClog("onix", {
		writer: (d) =>
			entries.push({ level: d.level, text: d.args.map(String).join(" ") }),
	});
	return { logger, entries };
}

Deno.test("logs an INFO request line and never logs the API key", async () => {
	const srv = await startRecordingServer({ routes: { "GET /api/v1/stocks": [] } });
	const { logger, entries } = capturing();
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "secret-token",
			databasePath: "d",
			logger,
		});
		await onix.stocks.list({ select: "Name" });
		const info = entries.filter((e) => e.level === "INFO");
		assert(
			info.some((e) => e.text.includes("GET /stocks")),
			"expected INFO request line",
		);
		assert(
			entries.every((e) => !e.text.includes("secret-token")),
			"API key must never be logged",
		);
	} finally {
		await srv.shutdown();
	}
});

Deno.test("logs an ERROR line on HTTP failure", async () => {
	const srv = await startRecordingServer({
		forceStatus: 404,
		forceBody: { message: "nope" },
	});
	const { logger, entries } = capturing();
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "k",
			databasePath: "d",
			logger,
		});
		await assertRejects(() => onix.stocks.list(), HTTP_ERROR.NotFound);
		const errs = entries.filter((e) => e.level === "ERROR");
		assert(errs.some((e) => e.text.includes("404")), "expected ERROR with status");
	} finally {
		await srv.shutdown();
	}
});

Deno.test("logs ERROR for Result>=2 and WARNING for Result===1", async () => {
	// Result 3 -> ERROR
	const srvErr = await startRecordingServer({
		routes: {
			"POST /api/v1/partners": {
				Result: 3,
				Errors: [{ Message: "boom" }],
				Warnings: [],
			},
		},
	});
	const a = capturing();
	try {
		const onix = createOnixClient({
			baseUrl: srvErr.url,
			apiKey: "k",
			databasePath: "d",
			logger: a.logger,
		});
		await onix.partners.save(PARTNER);
		assert(a.entries.some((e) => e.level === "ERROR" && e.text.includes("boom")));
	} finally {
		await srvErr.shutdown();
	}

	// Result 1 -> WARNING (does not throw even if throwOnResultError)
	const srvWarn = await startRecordingServer({
		routes: {
			"POST /api/v1/partners": {
				Result: 1,
				Errors: [],
				Warnings: [{ Message: "watch" }],
			},
		},
	});
	const b = capturing();
	try {
		const onix = createOnixClient({
			baseUrl: srvWarn.url,
			apiKey: "k",
			databasePath: "d",
			logger: b.logger,
			throwOnResultError: true,
		});
		const r = await onix.partners.save(PARTNER);
		assertEquals(isOk(r), true);
		assert(b.entries.some((e) => e.level === "WARNING" && e.text.includes("watch")));
	} finally {
		await srvWarn.shutdown();
	}
});

Deno.test("logger:false produces no console output", async () => {
	const srv = await startRecordingServer({ routes: { "GET /api/v1/stocks": [] } });
	const calls: unknown[] = [];
	const keys = ["log", "info", "warn", "error", "debug"] as const;
	const orig: Record<string, unknown> = {};
	for (const k of keys) {
		orig[k] = console[k];
		console[k] = (...a: unknown[]) => calls.push(a);
	}
	try {
		const onix = createOnixClient({
			baseUrl: srv.url,
			apiKey: "k",
			databasePath: "d",
			logger: false,
		});
		await onix.stocks.list();
		assertEquals(calls.length, 0);
	} finally {
		for (const k of keys) {
			// deno-lint-ignore no-explicit-any
			(console as any)[k] = orig[k];
		}
		await srv.shutdown();
	}
});
