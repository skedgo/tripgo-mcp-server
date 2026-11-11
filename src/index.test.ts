import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

type CapturedEvent = { event: string; properties: Record<string, unknown> };

const posthog = vi.hoisted(() => ({
	log: [] as string[],
	events: [] as CapturedEvent[],
	captureThrows: false,
	flush: (): Promise<void> => Promise.resolve(),
}));

vi.mock("posthog-node", () => ({
	PostHog: class {
		capture(event: CapturedEvent) {
			if (posthog.captureThrows) throw new Error("capture failed");
			posthog.log.push(event.event);
			posthog.events.push(event);
		}
		flush() {
			posthog.log.push("flush");
			return posthog.flush();
		}
	},
}));

const env = {
	TRIPGO_API_KEY: "test-key",
	POSTHOG_API_KEY: "test-token",
	POSTHOG_HOST: "https://posthog.test",
};

function createContext() {
	const waits: Promise<unknown>[] = [];
	const ctx = {
		waitUntil: (promise: Promise<unknown>) => waits.push(promise),
		passThroughOnException: () => {},
	} as unknown as ExecutionContext;
	return { ctx, settled: () => Promise.all(waits), waits };
}

function toolCall(name: string, args: Record<string, unknown>, accept?: string) {
	return new Request("https://mcp.test/mcp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: accept ?? "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name, arguments: args },
		}),
	});
}

function stubTripGo(body: Record<string, unknown>, gate: Promise<void> = Promise.resolve()) {
	vi.stubGlobal("fetch", async () => {
		await gate;
		// fetchRegions rejects a response without `regions`.
		return Response.json({ regions: [], ...body });
	});
}

async function invokeTool(name: string, args: Record<string, unknown>) {
	const { ctx, settled } = createContext();
	const response = await worker.fetch(toolCall(name, args), env, ctx);
	const text = await response.text();
	await settled();
	const data = text.split("\n").find((line) => line.startsWith('data: {"'));
	return JSON.parse(data?.slice("data: ".length) ?? "{}").result;
}

const customEvents = () => posthog.events.filter(({ event }) => !event.startsWith("$"));

const locationsArgs = { lat: -33.8, lng: 151.2, radius: 500, modes: ["pt_pub"] };

beforeEach(() => {
	posthog.log = [];
	posthog.events = [];
	posthog.captureThrows = false;
	posthog.flush = () => Promise.resolve();
	vi.unstubAllGlobals();
});

describe("PostHog flushing on /mcp", () => {
	it("does not hold the response back for a slow flush", async () => {
		posthog.flush = () => new Promise(() => {});
		stubTripGo({ groups: [] });
		const { ctx } = createContext();

		const response = await worker.fetch(toolCall("tripgo-locations", locationsArgs), env, ctx);

		expect(response.status).toBe(200);
		await response.body?.cancel();
	});

	it("flushes after the tool's events, held open by waitUntil", async () => {
		let releaseTripGo = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseTripGo = resolve;
		});
		stubTripGo({ groups: [] }, gate);
		const { ctx, settled, waits } = createContext();

		const response = await worker.fetch(toolCall("tripgo-locations", locationsArgs), env, ctx);

		// The SSE response is already back while the tool is still waiting on TripGo.
		expect(posthog.log).not.toContain("flush");
		expect(waits).toHaveLength(1);

		releaseTripGo();
		await response.text();
		await settled();

		expect(posthog.log.at(-1)).toBe("flush");
		expect(posthog.log).toContain("location_search_completed");
		expect(posthog.log).toContain("$mcp_tool_call");
	});

	it("still flushes when the client disconnects", async () => {
		stubTripGo({ groups: [] });
		const { ctx, settled } = createContext();

		const response = await worker.fetch(toolCall("tripgo-locations", locationsArgs), env, ctx);
		await response.body?.cancel();
		await settled();

		expect(posthog.log).toContain("flush");
	});

	it("flushes for a non-SSE response", async () => {
		const { ctx, settled } = createContext();

		const response = await worker.fetch(
			toolCall("tripgo-locations", locationsArgs, "text/plain"),
			env,
			ctx,
		);
		await settled();

		expect(response.status).toBe(406);
		expect(posthog.log).toEqual(["flush"]);
	});

	it("registers nothing without PostHog configuration", async () => {
		const { ctx, waits } = createContext();

		await worker.fetch(
			toolCall("tripgo-locations", locationsArgs, "text/plain"),
			{ TRIPGO_API_KEY: "k" },
			ctx,
		);

		expect(waits).toHaveLength(0);
	});
});

const trip = {
	weightedScore: 1,
	depart: 1000,
	arrive: 2000,
	segments: [],
};

describe.each([
	{
		tool: "tripgo-routing",
		args: {
			fromLat: -33.8,
			fromLng: 151.2,
			toLat: -33.9,
			toLng: 151.1,
			modes: ["pt_pub", "wa_wal"],
			wheelchair: true,
		},
		tripgo: { groups: [{ trips: [trip] }], segmentTemplates: [], alerts: [] },
		expected: {
			event: "trip_routing_completed",
			properties: {
				trip_count: 1,
				requested_mode_count: 2,
				wheelchair_requested: true,
				time_constraint: "none",
			},
		},
	},
	{
		tool: "tripgo-locations",
		args: locationsArgs,
		tripgo: {
			groups: [
				{
					stops: [
						{
							code: "a",
							name: "A",
							lat: -33.8,
							lng: 151.2,
							class: "StopLocation",
							modeInfo: { alt: "bus" },
						},
					],
				},
			],
		},
		expected: {
			event: "location_search_completed",
			properties: {
				location_count: 1,
				group_count: 1,
				requested_mode_count: 1,
				radius_specified: true,
			},
		},
	},
	{
		tool: "tripgo-departures",
		args: { region: "AU_NSW_Sydney", stopCodes: ["a", "b"] },
		tripgo: {
			embarkationStops: [
				{
					stopCode: "a",
					services: [
						{
							startTime: 1000,
							serviceNumber: "1",
							serviceName: "One",
							serviceTripID: "x",
							operator: "o",
							modeInfo: { alt: "bus" },
						},
					],
				},
			],
		},
		expected: {
			event: "departures_retrieved",
			properties: { departure_count: 1, requested_stop_count: 2, time_specified: false },
		},
	},
])("$tool capture site", ({ tool, args, tripgo, expected }) => {
	it("captures one event with only aggregate properties", async () => {
		stubTripGo(tripgo);

		const result = await invokeTool(tool, args);

		expect(result.isError).toBeFalsy();
		expect(customEvents()).toEqual([expected]);
	});

	it("captures nothing when TripGo returns an error", async () => {
		stubTripGo({ error: "nope" });

		const result = await invokeTool(tool, args);

		expect(result.isError).toBe(true);
		expect(customEvents()).toEqual([]);
	});

	it("still returns the result when capture throws", async () => {
		posthog.captureThrows = true;
		stubTripGo(tripgo);

		const result = await invokeTool(tool, args);

		expect(result.isError).toBeFalsy();
	});
});
