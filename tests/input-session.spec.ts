import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uiDocumentRevision, type Spec } from "../src/core.js";
import { UiInputSession, type UiStateTransport } from "../src/input-session.js";
import type { UiStateSnapshot } from "../src/state.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function document(defaultAmount = 20): Spec {
  return { root: "main", elements: {
    main: { type: "Col", props: {}, children: ["amount", "note"] },
    amount: { type: "Input", props: { inputType: "number", defaultValue: { $bindState: "/amount" } } },
    note: { type: "Input", props: { defaultValue: { $bindState: "/note" } } },
  }, state: { amount: defaultAmount, note: "default", derived: 100 } };
}

const sessions: UiInputSession[] = [];
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => {
  sessions.splice(0).forEach(session => session.close());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle() {
  // restore 仅等待 transport；save 使用事先计算的真实文档摘要，不依赖墙钟等待。
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

async function fixture(options: {
  load?: UiStateTransport["load"];
  values?: Record<string, unknown>;
  revision?: number;
  streaming?: boolean;
} = {}) {
  const spec = document();
  const documentRevision = await uiDocumentRevision(spec);
  const snapshot = (values: Record<string, unknown> = {}, revision = 0): UiStateSnapshot => ({
    document_revision: documentRevision, state_revision: revision, values: structuredClone(values),
  });
  const load = vi.fn<UiStateTransport["load"]>(options.load ??
    (async () => snapshot(options.values, options.revision)));
  const save = vi.fn<UiStateTransport["save"]>(async (_id, request) =>
    ({ document_revision: request.document_revision, state_revision: request.expected_revision + 1,
      values: structuredClone(request.values) }));
  const session = new UiInputSession("segment-ui-1");
  sessions.push(session);
  const transport = { load, save };
  session.configure(spec, transport, false, options.streaming);
  await settle();
  return { session, spec, transport, load, save, snapshot, documentRevision };
}

function error(code: string) { return Object.assign(new Error("safe failure"), { code }); }

describe("UiInputSession input and receipt behavior", () => {
  it("does not retry a late permission denial when the host source becomes ready", async () => {
    const pending = deferred<UiStateSnapshot>();
    const f = await fixture({ streaming: true, load: () => pending.promise });
    f.session.configure(f.spec, f.transport, false, false, true);
    pending.reject(error("FORBIDDEN"));
    await settle();
    expect(f.load).toHaveBeenCalledOnce();
    f.session.configure(document(80), f.transport, false, false, true);
    await settle();
    expect(f.load).toHaveBeenCalledOnce();
    expect(f.session.getSnapshot()).toMatchObject({ status: "unavailable", code: "FORBIDDEN" });
  });
  it("waits for the host source after streaming ends before retrying a late failed load", async () => {
    const pending = deferred<UiStateSnapshot>();
    const f = await fixture({ streaming: true, load: () => pending.promise });
    f.session.state.set("/amount", "31");
    f.session.configure(f.spec, f.transport, false, false, false);
    pending.reject(error("UI_NOT_READY"));
    await settle();
    expect(f.load).toHaveBeenCalledOnce();
    expect(f.session.getSnapshot().status).toBe("unavailable");
    f.load.mockResolvedValueOnce(f.snapshot({}, 0));
    f.session.configure(f.spec, f.transport, false, false, true);
    await settle();
    await f.session.save();
    expect(f.load).toHaveBeenCalledTimes(2);
    expect(f.save.mock.calls[0][1].values).toEqual({ "/amount": "31" });
    expect(f.session.getSnapshot().status).toBe("saved");
  });
  it("does not retry a racing restore for every streamed patch and saves the frozen pre-stop draft", async () => {
    const f = await fixture({ streaming: true, load: async () => { throw error("DOC_CHANGED"); } });
    f.session.state.set("/amount", "31");
    for (let i = 0; i < 4; i++) {
      f.session.configure(document(80 + i), f.transport, false, true);
      await settle();
    }
    expect(f.load).toHaveBeenCalledOnce();
    f.load.mockResolvedValueOnce(f.snapshot({ "/amount": "10" }, 3));
    const final = document(90);
    await uiDocumentRevision(final);
    f.session.configure(final, f.transport, true, false);
    f.session.state.set("/amount", "late event");
    await settle();
    await f.session.save();
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.save.mock.calls[0][1]).toMatchObject({ expected_revision: 3, values: { "/amount": "31" } });
    expect(f.session.getSnapshot().status).toBe("saved");
    f.session.state.set("/amount", "after stop");
    await f.session.save();
    expect(f.save).toHaveBeenCalledOnce();
  });
  it("does not save defaults when opening an already read-only partial interface", async () => {
    const f = await fixture();
    f.session.configure(f.spec, f.transport, true, false);
    await vi.advanceTimersByTimeAsync(800);
    await f.session.save();
    expect(f.save).not.toHaveBeenCalled();
  });
  it("retries once after a streaming restore finishes too late for the read-only transition", async () => {
    const pending = deferred<UiStateSnapshot>();
    const f = await fixture({ streaming: true, load: () => pending.promise });
    f.session.state.set("/amount", "31");
    f.load.mockResolvedValueOnce(f.snapshot({}, 0));
    f.session.configure(f.spec, f.transport, true, false);
    pending.reject(error("DOC_CHANGED"));
    await settle();
    await f.session.save();
    expect(f.load).toHaveBeenCalledTimes(2);
    expect(f.save.mock.calls[0][1].values).toEqual({ "/amount": "31" });
    expect(f.session.getSnapshot().status).toBe("saved");
  });
  it("keeps the frozen pre-stop draft on CAS conflict until explicit resolution", async () => {
    const f = await fixture({ revision: 2, streaming: true });
    f.session.state.set("/amount", "31");
    f.session.configure(f.spec, f.transport, true, false);
    f.save.mockRejectedValueOnce(error("REVISION_CONFLICT"));
    await f.session.save();
    expect(f.session.getSnapshot().status).toBe("conflict");
    await vi.advanceTimersByTimeAsync(1600);
    expect(f.save).toHaveBeenCalledOnce();
    f.load.mockResolvedValueOnce(f.snapshot({ "/amount": "25" }, 3));
    await f.session.restore(true);
    await f.session.save();
    expect(f.save.mock.calls[1][1]).toMatchObject({ expected_revision: 3, values: { "/amount": "31" } });
    expect(f.session.hasFinalDraft).toBe(false);
  });
  it("initializes the first render without turning seeds into writes or notifying later mounts", () => {
    const session = new UiInputSession("first-render"); sessions.push(session);
    const spec = document();
    session.initialize(spec);
    expect(session.state.get("/amount")).toBe(20);
    expect(session.state.writes()).toEqual([]);
    const listener = vi.fn();
    const unsubscribe = session.state.subscribe(listener);
    session.initialize(document(999));
    expect(listener).not.toHaveBeenCalled();
    expect(session.state.get("/amount")).toBe(20);
    session.configure(spec);
    session.state.set("/amount", "37");
    session.configure(document(999));
    expect(session.state.get("/amount")).toBe("37");
    expect(session.values()).toEqual({ "/amount": "37" });
    unsubscribe();
  });
  it("keeps edits made during initial server restore and does not save defaults or derived writes", async () => {
    const response = deferred<UiStateSnapshot>();
    const f = await fixture({ load: () => response.promise });
    expect(f.session.getSnapshot().status).toBe("loading");
    f.session.state.set("/amount", "37");
    f.session.state.set("/derived", 999);
    response.resolve(f.snapshot({ "/amount": "15", "/note": "server note" }, 4));
    await settle();
    expect(f.session.values()).toEqual({ "/amount": "37", "/note": "server note" });
    expect(f.session.getSnapshot().status).toBe("dirty");
    await f.session.save();
    expect(f.save).toHaveBeenCalledWith("segment-ui-1", expect.objectContaining({
      expected_revision: 4, values: { "/amount": "37", "/note": "server note" },
    }));
    expect(f.session.getSnapshot().status).toBe("saved");
  });

  it("seeds newly streamed defaults without replacing the user's existing edits", async () => {
    const f = await fixture();
    expect(f.session.values()).toEqual({});
    f.session.state.set("/amount", "37");
    const newer = document(999);
    newer.state = { ...newer.state, later: "ready" };
    f.session.configure(newer, f.transport);
    expect(f.session.state.get("/amount")).toBe("37");
    expect(f.session.state.get("/later")).toBe("ready");
    expect(f.session.values()).toEqual({ "/amount": "37" });
    expect(f.load).toHaveBeenCalledOnce();
  });

  it("uses the acknowledged revision for a second save without overwriting edits made in flight", async () => {
    const f = await fixture({ revision: 4 });
    const response = deferred<UiStateSnapshot>();
    f.save.mockImplementationOnce(() => response.promise);
    f.session.state.set("/amount", "30");
    const firstSave = f.session.save();
    await settle();
    expect(f.save).toHaveBeenCalledOnce();
    const original = structuredClone(f.save.mock.calls[0][1]);
    f.session.state.set("/amount", "45");
    await vi.advanceTimersByTimeAsync(400);
    await f.session.save();
    expect(f.save).toHaveBeenCalledOnce();
    response.resolve(f.snapshot({ "/amount": "30" }, 5));
    await firstSave;
    expect(f.session.state.get("/amount")).toBe("45");
    expect(f.session.getSnapshot().status).toBe("dirty");
    await f.session.save();
    expect(f.save.mock.calls[1][1]).toMatchObject({
      expected_revision: 5, values: { "/amount": "45" },
    });
    expect(f.save.mock.calls[1][1].operation_id).not.toBe(original.operation_id);
    expect(f.session.getSnapshot().status).toBe("saved");
  });

  it.each([undefined, "NETWORK_ERROR", "STATE_UNAVAILABLE"])(
    "retries the frozen original operation and body after unknown outcome %s", async code => {
      const f = await fixture({ revision: 2 });
      f.save.mockRejectedValueOnce(code ? error(code) : new Error("connection lost"));
      f.session.state.set("/amount", "30");
      await vi.advanceTimersByTimeAsync(400);
      await settle();
      const original = structuredClone(f.save.mock.calls[0][1]);
      expect(f.session.getSnapshot().status).toBe("unknown");
      f.session.state.set("/amount", "88");
      const newer = document(99);
      await uiDocumentRevision(newer);
      f.session.configure(newer, f.transport);
      await vi.advanceTimersByTimeAsync(1600);
      expect(f.save).toHaveBeenCalledOnce();
      await f.session.save();
      expect(f.save.mock.calls[1][1]).toEqual(original);
      expect(f.save.mock.calls[1][1]).not.toBe(f.save.mock.calls[0][1]);
      expect(f.session.state.get("/amount")).toBe("88");
      expect(f.session.getSnapshot().status).toBe("dirty");
      await f.session.save();
      expect(f.save.mock.calls[2][1]).toMatchObject({
        expected_revision: 3, document_revision: await uiDocumentRevision(newer),
        values: { "/amount": "88" },
      });
      expect(f.save.mock.calls[2][1].operation_id).not.toBe(original.operation_id);
    },
  );

  it("does not let a transport mutate the body retained for an unknown retry", async () => {
    const f = await fixture();
    f.save.mockImplementationOnce(async (_id, request) => {
      request.values["/amount"] = "transport mutation";
      request.operation_id = "changed-by-transport";
      throw error("NETWORK_ERROR");
    });
    f.session.state.set("/amount", "30");
    await f.session.save();
    await f.session.save();
    expect(f.save.mock.calls[1][1].values).toEqual({ "/amount": "30" });
    expect(f.save.mock.calls[1][1].operation_id).not.toBe("changed-by-transport");
  });

  it.each(["REVISION_CONFLICT", "STATE_CONFLICT", "OPERATION_CONFLICT"])(
    "requires an explicit resolution of %s before issuing another CAS", async code => {
      const f = await fixture({ revision: 2 });
      f.save.mockRejectedValueOnce(error(code));
      f.session.state.set("/amount", "30");
      await f.session.save();
      f.session.state.set("/amount", "40");
      await vi.advanceTimersByTimeAsync(1600);
      await f.session.save();
      expect(f.session.getSnapshot()).toMatchObject({ status: "conflict", code });
      expect(f.save).toHaveBeenCalledOnce();
      expect(f.load).toHaveBeenCalledOnce();
      f.load.mockResolvedValueOnce(f.snapshot({ "/amount": "remote" }, 5));
      await f.session.restore(true);
      expect(f.session.state.get("/amount")).toBe("40");
      await f.session.save();
      expect(f.save.mock.calls[1][1]).toMatchObject({
        expected_revision: 5, values: { "/amount": "40" },
      });
      expect(f.save.mock.calls[1][1].operation_id).not.toBe(f.save.mock.calls[0][1].operation_id);
    },
  );

  it("discards local values only after the explicit reload choice and does not save them back", async () => {
    const f = await fixture();
    f.save.mockRejectedValueOnce(error("REVISION_CONFLICT"));
    f.session.state.set("/amount", "30");
    await f.session.save();
    f.load.mockResolvedValueOnce(f.snapshot({ "/amount": "17" }, 8));
    await f.session.restore(false);
    expect(f.session.values()).toEqual({ "/amount": "17" });
    expect(f.session.getSnapshot().status).toBe("saved");
    await vi.advanceTimersByTimeAsync(1600);
    expect(f.save).toHaveBeenCalledOnce();
  });

  it("waits after DOC_CHANGED, then saves a new operation against the newly streamed document", async () => {
    const f = await fixture({ revision: 2 });
    f.session.state.set("/amount", "30");
    f.save.mockRejectedValueOnce(error("DOC_CHANGED"));
    await f.session.save();
    const original = structuredClone(f.save.mock.calls[0][1]);
    expect(f.session.getSnapshot()).toMatchObject({ status: "dirty", code: "DOC_CHANGED" });
    await vi.advanceTimersByTimeAsync(1600);
    expect(f.save).toHaveBeenCalledOnce();
    const newer = document(999);
    const revision = await uiDocumentRevision(newer);
    f.session.configure(newer, f.transport);
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(f.save.mock.calls[1][1]).toMatchObject({
      document_revision: revision, expected_revision: 2, values: { "/amount": "30" },
    });
    expect(f.save.mock.calls[1][1].operation_id).not.toBe(original.operation_id);
    expect(f.session.getSnapshot().status).toBe("saved");
  });

  it("recovers a not-yet-ready streaming source when another spec arrives without losing edits", async () => {
    const f = await fixture({ load: async () => { throw error("UI_NOT_READY"); } });
    expect(f.session.getSnapshot()).toMatchObject({ status: "unavailable", code: "UI_NOT_READY" });
    f.session.state.set("/amount", "31");
    f.load.mockResolvedValueOnce(f.snapshot({ "/amount": "10" }, 3));
    f.session.configure(document(80), f.transport);
    await settle();
    expect(f.load).toHaveBeenCalledTimes(2);
    expect(f.session.state.get("/amount")).toBe("31");
    expect(f.session.getSnapshot().status).toBe("dirty");
  });

  it("does not mark a restored JSON mapping dirty merely because the server reordered its keys", async () => {
    const f = await fixture({ values: { "/note": "server", "/amount": "20" }, revision: 3 });
    expect(f.session.values()).toEqual({ "/amount": "20", "/note": "server" });
    expect(f.session.getSnapshot().status).toBe("saved");
    await vi.advanceTimersByTimeAsync(1600);
    expect(f.save).not.toHaveBeenCalled();
  });

  it("accepts a reordered save acknowledgment without issuing another unchanged write", async () => {
    const f = await fixture();
    f.session.state.set("/amount", "20");
    f.session.state.set("/note", "user");
    f.save.mockResolvedValueOnce(f.snapshot({ "/note": "user", "/amount": "20" }, 1));
    await f.session.save();
    expect(f.session.getSnapshot().status).toBe("saved");
    await vi.advanceTimersByTimeAsync(1600);
    expect(f.save).toHaveBeenCalledOnce();
  });

  it.each(["success", "failure"])("ignores a late load %s after disposal", async outcome => {
    const response = deferred<UiStateSnapshot>();
    const f = await fixture({ load: () => response.promise });
    const listener = vi.fn();
    f.session.subscribe(listener);
    f.session.close();
    const before = f.session.getSnapshot();
    if (outcome === "success") response.resolve(f.snapshot({ "/amount": "late" }, 9));
    else response.reject(error("STATE_UNAVAILABLE"));
    await settle();
    expect(f.session.getSnapshot()).toEqual(before);
    expect(f.session.state.get("/amount")).toBe(20);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(f.save).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"])("ignores a late save %s after disposal", async outcome => {
    const f = await fixture();
    const response = deferred<UiStateSnapshot>();
    f.save.mockImplementationOnce(() => response.promise);
    f.session.state.set("/amount", "30");
    const saving = f.session.save();
    await settle();
    expect(f.save).toHaveBeenCalledOnce();
    const listener = vi.fn();
    f.session.subscribe(listener);
    f.session.close();
    const before = f.session.getSnapshot();
    if (outcome === "success") response.resolve(f.snapshot({ "/amount": "30" }, 1));
    else response.reject(error("NETWORK_ERROR"));
    await saving;
    expect(f.session.getSnapshot()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(f.save).toHaveBeenCalledOnce();
  });
});
