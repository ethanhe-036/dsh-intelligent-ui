import { describe, expect, it, vi } from "vitest";
import { DomainFacility, type descriptorOf } from "@deepseek-ai/dsh-storage-domain";
import type { Spec } from "generative-frame/spec";
import { NativeUiStateStore, type UiStateAuthority } from "../src/native-state.js";
import { type UiSaveRequest, UiStateError } from "../src/state.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  // 只替换介质，open/schema/串行 mutation/close 全部执行安装包的真实 DomainFacility。
  const records = new Map<string, Map<string, unknown>>();
  let version: number | undefined;
  let failWrite = false;
  let blockWrite: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  const closed = vi.fn(async () => {});
  const put = vi.fn(async (table: string, key: string, value: unknown) => {
    if (blockWrite) {
      const block = blockWrite; blockWrite = undefined;
      block.entered.resolve();
      await block.release.promise;
    }
    if (failWrite) { failWrite = false; throw new Error("backend-unavailable"); }
    records.get(table)!.set(key, structuredClone(value));
  });
  const open = vi.fn(async (descriptor: ReturnType<typeof descriptorOf>) => {
    if (version !== undefined && descriptor.version !== version) {
      throw Object.assign(new Error("version-mismatch"), { code: "version-mismatch" });
    }
    version = descriptor.version;
    for (const table of descriptor.tables) if (!records.has(table)) records.set(table, new Map());
    return {
      loadAll: async () => ({ global: null, tables: Object.fromEntries(
        [...records].map(([table, entries]) => [table, Object.fromEntries(structuredClone(entries))]),
      ) }),
      putRecord: put,
      deleteRecord: async (table: string, key: string) => { records.get(table)!.delete(key); },
      close: closed,
    };
  });
  const ctx = {
    storage: { backend: { get: () => ({ kv: { open } }) } },
    emit: vi.fn(), logger: { warn: vi.fn() },
  } as unknown as ConstructorParameters<typeof DomainFacility>[0];
  const facility = new DomainFacility(ctx, { backend: "test-memory" });
  let documentRevision = 1;
  let denial: Error | undefined;
  let spec: Spec = { root: "input", elements: {
    input: { type: "Input", props: { inputType: "number", defaultValue: { $bindState: "/amount" } } },
  }, state: { amount: 20, businessFact: "must-not-persist" } };
  const authority = vi.fn<UiStateAuthority>(async () => {
    if (denial) throw denial;
    return { document_revision: documentRevision, spec };
  });
  const store = new NativeUiStateStore(facility, authority);
  return { store, facility, authority, records, open, put, closed,
    deny: (error: Error | undefined) => { denial = error; },
    revise: (revision: number, nextSpec?: Spec) => { documentRevision = revision; if (nextSpec) spec = nextSpec; },
    setVersion: (next: number) => { version = next; },
    failNextWrite: () => { failWrite = true; },
    blockNextWrite: () => { blockWrite = { entered: deferred(), release: deferred() }; return blockWrite; },
  };
}

function request(expected = 0, operation = "op-1", value = "30", revision = 1): UiSaveRequest {
  return { document_revision: revision, expected_revision: expected, operation_id: operation, values: { "/amount": value } };
}

describe("NativeUiStateStore with official storageDomain", () => {
  it("loads revision zero without copying defaults, business facts or UI documents", async () => {
    const f = fixture();
    expect(await f.store.load("session", "ui")).toEqual({ document_revision: 1, state_revision: 0, values: {} });
    expect(f.authority).toHaveBeenCalledWith("session", "ui");
    expect(f.open).toHaveBeenCalledWith({ name: "intelligent_ui_inputs", version: 1, tables: ["inputs"], hasGlobal: false });
    expect(f.put).not.toHaveBeenCalled();
    await f.store.close();
  });

  it("saves CAS changes through the native update API and isolates returned snapshots", async () => {
    const f = fixture();
    expect(await f.store.save("s", "u", request())).toEqual({ document_revision: 1, state_revision: 1, values: { "/amount": "30" } });
    const table = f.facility.get("intelligent_ui_inputs")!.table("inputs");
    const update = vi.spyOn(table, "update");
    const ack = await f.store.save("s", "u", request(1, "op-2", ""));
    expect(update).toHaveBeenCalledOnce();
    expect(ack).toEqual({ document_revision: 1, state_revision: 2, values: { "/amount": "" } });
    ack.values["/amount"] = "private-mutated";
    expect((await f.store.load("s", "u")).values).toEqual({ "/amount": "" });
    expect(JSON.stringify([...f.records.get("inputs")!.values()])).not.toContain("businessFact");
    expect(JSON.stringify([...f.records.get("inputs")!.values()])).not.toContain("spec");
    await f.store.close();
  });

  it("returns the identical ack for the last frozen operation without rewriting durability", async () => {
    const f = fixture();
    const save = request();
    const ack = await f.store.save("s", "u", save);
    expect(await f.store.save("s", "u", { ...save })).toEqual(ack);
    expect(f.put).toHaveBeenCalledTimes(1);
    await f.store.close();
  });

  it.each([
    { values: { "/amount": "private-different" } }, { expected_revision: 1 }, { values: {} },
  ])("rejects last operation id reuse with a different frozen body", async change => {
    const f = fixture();
    const ack = await f.store.save("s", "u", request());
    await expect(f.store.save("s", "u", { ...request(), ...change })).rejects.toMatchObject({
      code: "OPERATION_CONFLICT", path: "/operation_id", current: { document_revision: 1, state_revision: 1 },
    });
    expect(await f.store.load("s", "u")).toEqual(ack);
    expect(f.put).toHaveBeenCalledTimes(1);
    await f.store.close();
  });

  it("rejects stale device edits and unknown ack retries after a newer operation", async () => {
    const f = fixture();
    await f.store.save("s", "u", request());
    const latest = await f.store.save("s", "u", request(1, "op-2", "40"));
    for (const stale of [request(), request(0, "old-device", "private")]) {
      await expect(f.store.save("s", "u", stale)).rejects.toMatchObject({ code: "REVISION_CONFLICT", current: { document_revision: 1, state_revision: 2 } });
    }
    expect(await f.store.load("s", "u")).toEqual(latest);
    expect(f.put).toHaveBeenCalledTimes(2);
    await f.store.close();
  });

  it.each([0, 1])("allows one winner when two devices save concurrently at revision %i", async revision => {
    const f = fixture();
    if (revision) await f.store.save("s", "u", request());
    const results = await Promise.allSettled([
      f.store.save("s", "u", request(revision, "device-a", "41")),
      f.store.save("s", "u", request(revision, "device-b", "42")),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: "REVISION_CONFLICT" });
    const winner = results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<unknown>;
    expect(await f.store.load("s", "u")).toEqual(winner.value);
    expect(f.put).toHaveBeenCalledTimes(revision + 1);
    await f.store.close();
  });

  it("coalesces simultaneous identical first saves", async () => {
    const f = fixture();
    const [first, second] = await Promise.all([f.store.save("s", "u", request()), f.store.save("s", "u", request())]);
    expect(second).toEqual(first);
    expect(f.put).toHaveBeenCalledOnce();
    await f.store.close();
  });

  it("freezes values before authority waits and subsequent caller edits", async () => {
    const f = fixture();
    const gate = deferred();
    f.authority.mockImplementationOnce(async () => { await gate.promise; return { document_revision: 1, spec: { root: "", elements: {} } }; });
    const draft = request();
    const pending = f.store.save("s", "u", draft);
    draft.values["/amount"] = "private-later-edit";
    draft.operation_id = "different";
    gate.resolve();
    const ack = await pending;
    expect(ack.values).toEqual({ "/amount": "30" });
    expect(await f.store.save("s", "u", request())).toEqual(ack);
    await f.store.close();
  });

  it.each(["missing-session", "deleted-session", "access-denied"])("rejects late saves when authority says %s", async reason => {
    const f = fixture();
    const denial = new Error(reason);
    f.deny(denial);
    await expect(f.store.load("s", "u")).rejects.toBe(denial);
    await expect(f.store.save("s", "u", request())).rejects.toBe(denial);
    expect(f.open).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
    await f.store.close();
  });

  it("checks authority even for retries and already persisted records", async () => {
    const f = fixture();
    await f.store.save("s", "u", request());
    const denial = new Error("deleted-session");
    f.deny(denial);
    await expect(f.store.save("s", "u", request())).rejects.toBe(denial);
    await expect(f.store.load("s", "u")).rejects.toBe(denial);
    expect(f.put).toHaveBeenCalledTimes(1);
    await f.store.close();
  });

  it("authorizes invalid requests too, without disclosing validation before denial", async () => {
    const f = fixture();
    const denial = new Error("access-denied");
    f.deny(denial);
    await expect(f.store.save("s", "u", { ...request(), expected_revision: -1 })).rejects.toBe(denial);
    expect(f.authority).toHaveBeenCalledOnce();
    f.deny(undefined);
    await expect(f.store.save("s", "u", { ...request(), expected_revision: -1 })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.authority).toHaveBeenCalledTimes(2);
    expect(f.open).not.toHaveBeenCalled();
    await f.store.close();
  });

  it("rechecks authority for queued saves so deletion cannot create a new UI row", async () => {
    const f = fixture();
    const block = f.blockNextWrite();
    const first = f.store.save("s", "first", request());
    await block.entered.promise;
    const late = f.store.save("s", "late", request());
    await Promise.resolve();
    const denial = new Error("deleted-session");
    f.deny(denial);
    const rejected = expect(late).rejects.toBe(denial);
    block.release.resolve();
    await first; await rejected;
    expect(f.records.get("inputs")!.size).toBe(1);
    expect(f.put).toHaveBeenCalledOnce();
    await f.store.close();
  });

  it("returns DOC_CHANGED/current revisions, keeps the request draft, and never rewrites it as success", async () => {
    const f = fixture();
    await f.store.save("s", "u", request());
    const draft = request(1, "draft", "private-draft");
    const original = structuredClone(draft);
    f.revise(2);
    for (const stale of [draft, request()]) {
      await expect(f.store.save("s", "u", stale)).rejects.toMatchObject({
        code: "DOC_CHANGED", path: "/document_revision", current: { document_revision: 2, state_revision: 1 },
      });
    }
    expect(draft).toEqual(original);
    expect(await f.store.load("s", "u")).toEqual({ document_revision: 2, state_revision: 1, values: { "/amount": "30" } });
    expect(f.put).toHaveBeenCalledTimes(1);
    expect(await f.store.save("s", "u", request(1, "new-document", "50", 2))).toEqual({
      document_revision: 2, state_revision: 2, values: { "/amount": "50" },
    });
    await f.store.close();
  });

  it("restores a partial-spec edit after table/chart patches, completion and reopen without rewriting it", async () => {
    const f = fixture();
    await f.store.save("s", "u", request(0, "partial-edit", "37"));
    const persisted = structuredClone([...f.records.get("inputs")!.entries()]);
    const completed: Spec = { root: "root", state: { amount: 999 }, elements: {
      root: { type: "Col", children: ["input", "table", "chart"] },
      input: { type: "Input", props: { inputType: "number", defaultValue: { $bindState: "/amount" } } },
      table: { type: "Table", props: { columns: [{ label: "Amount" }], rows: [[{ $state: "/amount" }]] } },
      chart: { type: "Chart", props: { variant: "bar", data: [{ label: "Amount", value: { $calc: "${/amount} * 1" } }] } },
    } };
    f.revise(900000001, completed);
    expect(await f.store.load("s", "u")).toEqual({
      document_revision: 900000001, state_revision: 1, values: { "/amount": "37" },
    });
    // 内容派生修订不要求递增，完成/历史继续使用相同输入；新的回答由 uiId 隔离。
    f.revise(71, { ...completed, elements: { ...completed.elements,
      root: { ...completed.elements.root, children: ["input", "chart", "table"] },
    } });
    const current = { document_revision: 71, state_revision: 1, values: { "/amount": "37" } };
    expect(await f.store.load("s", "u")).toEqual(current);
    expect(await f.store.load("s", "new-answer")).toEqual({ document_revision: 71, state_revision: 0, values: {} });
    expect([...f.records.get("inputs")!.entries()]).toEqual(persisted);
    expect(f.put).toHaveBeenCalledOnce();
    await f.store.close();
    const reopened = new NativeUiStateStore(f.facility, f.authority);
    expect(await reopened.load("s", "u")).toEqual(current);
    expect(f.put).toHaveBeenCalledOnce();
    await reopened.close();
  });

  it.each(["removed", "type", "derived", "range"])("reports incompatible saved input after a %s change without falling back to seed", async change => {
    const f = fixture();
    const slider: Spec = { root: "input", state: { amount: 0 }, elements: { input: {
      type: "Slider", props: { min: 0, max: 10, defaultValue: { $bindState: "/amount" } },
    } } };
    if (change === "range") f.revise(1, slider);
    await f.store.save("s", "u", { ...request(), values: { "/amount": change === "range" ? 5 : "37" } });
    const persisted = structuredClone([...f.records.get("inputs")!.entries()]);
    const replacement: Spec = change === "type" || change === "range" ? { ...slider, elements: { input: {
      ...slider.elements.input, props: { ...slider.elements.input.props, max: 3 },
    } } } : { root: "input", state: { amount: "seed-must-not-be-recovery" }, elements: { input: {
      type: "Input", props: { defaultValue: { $bindState: change === "removed" ? "/other" : "/amount" } },
      ...(change === "derived" ? { watch: { "/source": { action: "setState", params: { path: "/amount", value: "derived" } } } } : {}),
    } } };
    f.revise(2, replacement);
    await expect(f.store.load("s", "u")).rejects.toMatchObject({
      code: "STATE_CONFLICT", path: "/values/*", current: { document_revision: 2, state_revision: 1 },
    });
    expect([...f.records.get("inputs")!.entries()]).toEqual(persisted);
    expect(f.put).toHaveBeenCalledOnce();
    // 用户明确纠正后的新请求仍可保存，旧内容不会被 load 隐式清理或自动 merge。
    const corrected = change === "removed" ? { "/other": "corrected" } :
      change === "derived" ? {} : { "/amount": 2 };
    expect(await f.store.save("s", "u", { ...request(1, "corrected", "", 2), values: corrected })).toEqual({
      document_revision: 2, state_revision: 2, values: corrected,
    });
    await f.store.close();
  });

  it("keeps a newer client draft after DOC_CHANGED and requires an explicit current-version request", async () => {
    const f = fixture();
    await f.store.save("s", "u", request());
    const draft = request(1, "newer-draft", "39");
    const frozen = structuredClone(draft);
    f.revise(2);
    await expect(f.store.save("s", "u", draft)).rejects.toMatchObject({ code: "DOC_CHANGED" });
    const loaded = await f.store.load("s", "u");
    expect(loaded.values).toEqual({ "/amount": "30" });
    expect(draft).toEqual(frozen);
    expect(f.put).toHaveBeenCalledOnce();
    const retry = { ...draft, operation_id: "explicit-current-retry",
      document_revision: loaded.document_revision, expected_revision: loaded.state_revision };
    expect(await f.store.save("s", "u", retry)).toEqual({ document_revision: 2, state_revision: 2, values: { "/amount": "39" } });
    expect(draft).toEqual(frozen);
    await f.store.close();
  });

  it("detects a source revision changed while a save waits in the queue", async () => {
    const f = fixture();
    const block = f.blockNextWrite();
    const first = f.store.save("s", "first", request());
    await block.entered.promise;
    const pending = f.store.save("s", "late", request());
    await Promise.resolve();
    f.revise(2);
    const rejected = expect(pending).rejects.toMatchObject({ code: "DOC_CHANGED", current: { document_revision: 2, state_revision: 0 } });
    block.release.resolve();
    await first; await rejected;
    expect(f.records.get("inputs")!.size).toBe(1);
    await f.store.close();
  });

  it("rejects undeclared values before any durable creation", async () => {
    const f = fixture();
    await expect(f.store.save("s", "u", { ...request(), values: { "/private-field": 5 } })).rejects.toMatchObject({ code: "UNDECLARED_INPUT", path: "/values/*" });
    expect(f.put).not.toHaveBeenCalled();
    expect(await f.store.load("s", "u")).toEqual({ document_revision: 1, state_revision: 0, values: {} });
    await f.store.close();
  });

  it("isolates sessions and UI ids without ambiguous concatenation", async () => {
    const f = fixture();
    await f.store.save("a:b", "c", request(0, "same", "one"));
    await f.store.save("a", "b:c", request(0, "same", "two"));
    await f.store.save("a", "other", request(0, "same", "three"));
    expect((await f.store.load("a:b", "c")).values).toEqual({ "/amount": "one" });
    expect((await f.store.load("a", "b:c")).values).toEqual({ "/amount": "two" });
    expect((await f.store.load("a", "other")).values).toEqual({ "/amount": "three" });
    expect(f.records.get("inputs")!.size).toBe(3);
    await f.store.close();
  });

  it("does not acknowledge failed durability or poison the queue; the same request can retry", async () => {
    const f = fixture();
    await f.store.save("s", "u", request());
    f.failNextWrite();
    await expect(f.store.save("s", "u", request(1, "op-2", "50"))).rejects.toThrow("backend-unavailable");
    expect((await f.store.load("s", "u")).state_revision).toBe(1);
    expect((await f.store.save("s", "u", request(1, "op-2", "50"))).state_revision).toBe(2);
    await f.store.close();
  });

  it("preserves the last ack over close/reopen using native schema validation", async () => {
    const f = fixture();
    const ack = await f.store.save("s", "u", request());
    await f.store.close();
    await f.store.close();
    expect(f.closed).toHaveBeenCalledOnce();
    const reopened = new NativeUiStateStore(f.facility, f.authority);
    expect(await reopened.load("s", "u")).toEqual(ack);
    expect(await reopened.save("s", "u", request())).toEqual(ack);
    expect(f.put).toHaveBeenCalledOnce();
    await reopened.close();
  });

  it("drains accepted operations on close and rejects subsequent use", async () => {
    const f = fixture();
    const block = f.blockNextWrite();
    const first = f.store.save("s", "u", request());
    await block.entered.promise;
    const second = f.store.save("s", "u", request(1, "op-2"));
    await Promise.resolve();
    const closed = f.store.close();
    expect(f.closed).not.toHaveBeenCalled();
    block.release.resolve();
    await first; await second; await closed;
    expect(f.closed).toHaveBeenCalledOnce();
    await expect(f.store.open()).rejects.toBeInstanceOf(UiStateError);
    await expect(f.store.load("s", "u")).rejects.toMatchObject({ code: "STORE_CLOSED" });
    await expect(f.store.save("s", "u", request())).rejects.toMatchObject({ code: "STORE_CLOSED" });
  });

  it("propagates native version mismatch without erasing the medium", async () => {
    const f = fixture();
    f.setVersion(99);
    await expect(f.store.open()).rejects.toMatchObject({ code: "version-mismatch" });
    expect(f.put).not.toHaveBeenCalled();
    await expect(f.store.close()).rejects.toMatchObject({ code: "version-mismatch" });
  });

  it("rejects malformed persisted records via the native schema at reopen", async () => {
    const f = fixture();
    await f.store.save("s", "u", request());
    await f.store.close();
    f.records.get("inputs")!.set(JSON.stringify(["s", "u"]), { state_revision: -1 });
    const reopened = new NativeUiStateStore(f.facility, f.authority);
    await expect(reopened.open()).rejects.toMatchObject({ code: "invalid-record" });
    expect(f.put).toHaveBeenCalledOnce();
    await expect(reopened.close()).rejects.toMatchObject({ code: "invalid-record" });
  });
});
