/**
 * Test helpers — a local recording HTTP server used to assert the Onix client
 * builds correct requests, without touching the live API.
 *
 * @module
 */

export const HOSTNAME = "127.0.0.1";

/** A request as recorded by {@link startRecordingServer}. */
export interface RecordedRequest {
	method: string;
	pathname: string;
	/** Query params; repeated keys collected into arrays. */
	query: Record<string, string[]>;
	/** Lowercased header names → values. */
	headers: Record<string, string>;
	/** Parsed JSON body / raw text / `null`. */
	body: unknown;
	/** Non-file multipart fields (present for multipart requests). */
	formFields?: Record<string, string>;
	/** Uploaded file name (present for multipart file uploads). */
	fileName?: string;
}

type RouteValue = unknown | ((req: RecordedRequest) => unknown);

export interface ServerOptions {
	/** Map of `"METHOD /path"` → response payload (or a function of the request). */
	routes?: Record<string, RouteValue>;
	/** When set, every response uses this status + body (for error-class tests). */
	forceStatus?: number;
	forceBody?: unknown;
}

export interface TestServer {
	url: string;
	/** The most recent request received. */
	readonly last: RecordedRequest | null;
	/** All requests, in order. */
	readonly received: RecordedRequest[];
	shutdown(): Promise<void>;
}

function getAvailablePort(): number {
	const l = Deno.listen({ hostname: HOSTNAME, port: 0 });
	const port = (l.addr as Deno.NetAddr).port;
	l.close();
	return port;
}

/** Starts a recording server. Remember to `await server.shutdown()`. */
export function startRecordingServer(opts: ServerOptions = {}): TestServer {
	const port = getAvailablePort();
	const received: RecordedRequest[] = [];

	const json = (body: unknown, status = 200): Response =>
		new Response(body == null ? "" : JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});

	const handler = async (req: Request): Promise<Response> => {
		const u = new URL(req.url);

		const query: Record<string, string[]> = {};
		for (const key of new Set(u.searchParams.keys())) {
			query[key] = u.searchParams.getAll(key);
		}

		const headers: Record<string, string> = {};
		req.headers.forEach((v, k) => (headers[k] = v));

		let body: unknown = null;
		let formFields: Record<string, string> | undefined;
		let fileName: string | undefined;

		const ct = req.headers.get("content-type") ?? "";
		if (ct.includes("multipart/form-data")) {
			const fd = await req.formData();
			formFields = {};
			for (const [k, v] of fd.entries()) {
				if (v instanceof File) fileName = v.name;
				else formFields[k] = String(v);
			}
		} else {
			const text = await req.text();
			if (text) {
				try {
					body = JSON.parse(text);
				} catch {
					body = text;
				}
			}
		}

		const rec: RecordedRequest = {
			method: req.method,
			pathname: u.pathname,
			query,
			headers,
			body,
			formFields,
			fileName,
		};
		received.push(rec);

		if (opts.forceStatus) {
			return json(opts.forceBody ?? { message: "forced error" }, opts.forceStatus);
		}

		const key = `${req.method} ${u.pathname}`;
		const route = opts.routes?.[key];
		const payload = typeof route === "function"
			? (route as (r: RecordedRequest) => unknown)(rec)
			: route;
		return json(payload ?? []);
	};

	const server = Deno.serve({ hostname: HOSTNAME, port, onListen() {} }, handler);

	return {
		url: `http://${HOSTNAME}:${port}`,
		get last() {
			return received.at(-1) ?? null;
		},
		get received() {
			return received;
		},
		shutdown: () => server.shutdown(),
	};
}
