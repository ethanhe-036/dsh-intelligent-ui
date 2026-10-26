import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionFetchRoute } from "@deepseek-ai/dsh-client-connection";
import { DomainFacility, type descriptorOf } from "@deepseek-ai/dsh-storage-domain";
import { apply } from "../src/index.js";

async function fixture() {
  const routes: ConnectionFetchRoute[] = [];
  const disposers: (() => unknown)[] = [];
  const facility = new DomainFacility({ storage: { backend: { get: () => ({ kv: {
    open: async (descriptor: ReturnType<typeof descriptorOf>) => ({
      loadAll: async () => ({ global: null, tables: Object.fromEntries(descriptor.tables.map(table => [table, {}])) }),
      putRecord: async () => {}, deleteRecord: async () => {}, close: async () => {},
    }),
  } }) } }, emit: vi.fn(), logger: { warn: vi.fn() } } as never, { backend: "memory" });
  const inspect = vi.fn(async () => { throw new Error("private diagnostic must not reach the browser"); });
  const ctx = { sessions: { get: () => undefined }, sessionController: { inspect, prompt: vi.fn() },
    storageDomain: facility, on: vi.fn(), effect: (create: () => () => unknown) => disposers.push(create()),
    connection: { fetch: { register: (route: ConnectionFetchRoute) => routes.push(route) } },
  } as unknown as Context;
  await apply(ctx);
  return { routes, inspect, close: () => Promise.all(disposers.map(dispose => dispose())) };
}

describe("native shared API route", () => {
  it("uses the documented owner-only exact routes and native RPC envelopes", async () => {
    const f = await fixture();
    try {
      expect(f.routes.map(route => route.path)).toEqual([
        "/api/intelligent-ui/load", "/api/intelligent-ui/save", "/api/intelligent-ui/send",
      ]);
      for (const route of f.routes) {
        expect(route.methods).toEqual(["POST"]);
        expect(route.requestBody).toBe("buffered");
      }
      const response = await f.routes[0].fetch(new Request("http://localhost/api/intelligent-ui/load", {
        method: "POST", body: JSON.stringify({ type: "client-request", rpcId: "fixture-rpc",
          method: "intelligent-ui/load", payload: { sessionId: "missing", uiId: "missing" } }),
      }));
      expect(await response.json()).toEqual({ type: "server-response", rpcId: "fixture-rpc",
        result: { ok: true, value: { ok: false, code: "STATE_UNAVAILABLE" } } });
      expect(f.inspect).toHaveBeenCalledTimes(1);
    } finally { await f.close(); }
  });

  it("rejects malformed JSON and mismatched endpoint envelopes before touching state", async () => {
    const f = await fixture();
    try {
      for (const body of ["{", JSON.stringify({ type: "client-request", rpcId: "fixture-rpc",
        method: "intelligent-ui/send", payload: { sessionId: "s", uiId: "u" } })]) {
        const response = await f.routes[0].fetch(new Request("http://localhost/api/intelligent-ui/load", { method: "POST", body }));
        expect(response.status).toBe(400);
        expect(await response.text()).toBe("INVALID_REQUEST");
      }
      expect(f.inspect).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
});
