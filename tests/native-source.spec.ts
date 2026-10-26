import { afterEach, describe, expect, it, vi } from "vitest";
import { Session, type SessionEvent, type SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-llm-retry";
import type { StreamChunk, LlmAttemptId } from "@deepseek-ai/dsh-llm";
import { DomainFacility, type descriptorOf } from "@deepseek-ai/dsh-storage-domain";
import { toolName, uiDocumentRevision, type Spec } from "../src/core.js";
import { NativeUiSender } from "../src/native-send.js";
import { NativeUiIndex, NativeUiSource } from "../src/native-source.js";
import { NativeUiStateStore } from "../src/native-state.js";

type CallId = SessionEvent<"tool/call">["data"]["callId"];
type AssistantMessage = SessionEvent<"assistant/message">["data"]["message"];
afterEach(() => vi.restoreAllMocks());

function argumentsFor(amount: number) {
  const spec: Spec = { root: "main", state: { amount }, elements: {
    main: { type: "Col", props: {}, children: ["amount"] },
    amount: { type: "NumberInput", props: { label: "Amount", value: { $bindState: "/amount" } } },
  } };
  const jsonl = [{ op: "add", path: "/root", value: spec.root },
    { op: "add", path: "/state", value: spec.state },
    { op: "add", path: "/elements", value: spec.elements }].map(x => JSON.stringify(x)).join("\n");
  return { raw: JSON.stringify({ title: "相同标题🙂", jsonl }), jsonl, spec };
}

function started(id = "session-a") {
  const session = Session.create(id as SessionId);
  session.append("turn/start", { turn: 1 });
  const step = session.append("step/start", { turn: 1, step: 1 });
  return { session, attempt: step.seq };
}
function identity(session: Session, attempt: number, call = "call-a", step = 1) {
  return session.id + ":1:" + step + ":" + attempt + ":" + call;
}
function chunk(raw: string, name: string | undefined = toolName, call = "call-a", index = 0): StreamChunk {
  return { type: "tool-call-delta", index, id: call as CallId, ...(name ? { name } : {}), argumentsDelta: raw };
}
function message(session: Session, raw: string, call = "call-a", step = 1) {
  return session.append("assistant/message", { turn: 1, step, stream: [],
    message: { id: ("message-" + session.seq) as AssistantMessage["id"], role: "assistant",
      source: { kind: "model", provider: "fixture", model: "fixture" },
      content: [{ type: "tool-call", id: call as CallId, name: toolName, arguments: raw }] },
  }, { surfaceOp: "append" });
}
function replay(session: Session) {
  const index = new NativeUiIndex(session.id);
  session.snapshotEvents().forEach(event => index.accept(event));
  return index;
}
function retry(session: Session, step = 1) {
  return session.append("llm/retry", {
    retryId: "retry-a" as SessionEvent<"llm/retry">["data"]["retryId"],
    turn: 1, step, provider: "fixture", mode: "normal", policyKey: "transient",
    retry: 1, maxRetries: 3, delayMs: 0, failure: { kind: "network" },
  });
}
function fixture() {
  const live = new Map<SessionId, Session>();
  const snapshots = new Map<SessionId, readonly SessionEvent[]>();
  const inspect = vi.fn(async (id: SessionId) => {
    const events = snapshots.get(id);
    if (!events) throw new Error("SESSION_NOT_FOUND");
    return { meta: {} as Session["header"], inheritedEventCount: 0 as never, events };
  });
  const source = new NativeUiSource({ get: id => live.get(id) }, { inspect });
  const attach = (session: Session) => {
    live.set(session.id, session);
    session.snapshotEvents().forEach(event => source.accept(session, event));
  };
  return { live, snapshots, source, inspect, attach };
}
function memoryFacility() {
  return new DomainFacility({
    storage: { backend: { get: () => ({ kv: { open: async (descriptor: ReturnType<typeof descriptorOf>) => {
      const tables = Object.fromEntries(descriptor.tables.map(table => [table, {}]));
      return { loadAll: async () => ({ global: null, tables }), putRecord: async () => {},
        deleteRecord: async () => {}, close: async () => {} };
    } } }) } }, emit: vi.fn(), logger: { warn: vi.fn() },
  } as unknown as ConstructorParameters<typeof DomainFacility>[0], { backend: "test-memory" });
}

describe("DSH V4 Intelligent UI source", () => {
  it("keeps same-title direct calls separate and ignores ordinary tools", async () => {
    const { session, attempt } = started();
    const index = replay(session);
    index.acceptChunk(1, 1, chunk(argumentsFor(10).raw));
    index.acceptChunk(1, 1, chunk(argumentsFor(99).raw, "read_file", "ordinary", 1));
    index.acceptChunk(1, 1, chunk(argumentsFor(40).raw, toolName, "call-b", 2));
    expect((await index.resolve(identity(session, attempt))).spec.state).toEqual({ amount: 10 });
    expect((await index.resolve(identity(session, attempt, "call-b"))).spec.state).toEqual({ amount: 40 });
    await expect(index.resolve(identity(session, attempt, "ordinary"))).rejects.toThrow("UI_NOT_FOUND");
  });

  it("buffers unnamed and split-Unicode arguments until the exact tool name arrives", async () => {
    const { session, attempt } = started(); const index = replay(session);
    const expected = argumentsFor(25); const split = expected.raw.indexOf("🙂") + 1;
    index.acceptChunk(1, 1, chunk(expected.raw.slice(0, split), ""));
    await expect(index.resolve(identity(session, attempt))).rejects.toThrow("UI_NOT_FOUND");
    index.acceptChunk(1, 1, chunk(expected.raw.slice(split)));
    expect(await index.resolve(identity(session, attempt))).toEqual({
      document_revision: await uiDocumentRevision(expected.spec), spec: expected.spec, complete: true,
    });
  });

  it("recognizes a canonical block-end name without double-appending streamed arguments", async () => {
    const { session, attempt } = started(); const index = replay(session); const expected = argumentsFor(25);
    index.acceptChunk(1, 1, chunk(expected.raw, ""));
    index.acceptChunk(1, 1, { type: "block-end", index: 0,
      block: { type: "tool-call", id: "call-a" as CallId, name: toolName, arguments: expected.raw } });
    expect((await index.resolve(identity(session, attempt))).spec).toEqual(expected.spec);
  });

  it("distinguishes incomplete and absent sources", async () => {
    const { session, attempt } = started(); const index = replay(session);
    index.acceptChunk(1, 1, chunk('{"title":"draft","jsonl":"'));
    await expect(index.resolve(identity(session, attempt))).rejects.toThrow("UI_NOT_READY");
    await expect(index.resolve(identity(session, attempt, "absent"))).rejects.toThrow("UI_NOT_FOUND");
  });

  it("replaces live content with durable settlement under the same identity", async () => {
    const { session, attempt } = started(); const index = replay(session); const expected = argumentsFor(20);
    index.acceptChunk(1, 1, chunk(expected.raw));
    const before = await index.resolve(identity(session, attempt));
    const final = message(session, expected.raw);
    index.accept(final); index.accept(final);
    expect(await index.resolve(identity(session, attempt))).toEqual(before);
    expect(await replay(session).resolve(identity(session, attempt))).toEqual(before);
  });

  it("restores interrupted prefixes from real compact assistant stream records", async () => {
    const { session, attempt } = started(); const expected = argumentsFor(20);
    const raw = JSON.stringify({ title: "draft", jsonl: expected.jsonl + "\n" }).slice(0, -2);
    session.append("assistant/attempt", { turn: 1, step: 1, stream: [
      { type: "tool-call-chunks", time0: 1000, index: 0, dt: [1], id: "call-a" as CallId,
        name: toolName, args: [raw.slice(0, 30), raw.slice(30)] },
    ] });
    expect(await replay(session).resolve(identity(session, attempt))).toEqual({
      document_revision: await uiDocumentRevision(expected.spec), spec: expected.spec, complete: false,
    });
  });

  it("revokes a retry while retaining other steps, even if call ids repeat", async () => {
    const { session, attempt } = started(); message(session, argumentsFor(10).raw, "prior");
    session.append("step/end", { turn: 1, step: 1 });
    const second = session.append("step/start", { turn: 1, step: 2 });
    message(session, argumentsFor(20).raw, "call-a", 2);
    const index = replay(session); const scheduled = retry(session, 2); index.accept(scheduled);
    await expect(index.resolve(identity(session, second.seq, "call-a", 2))).rejects.toThrow("UI_NOT_FOUND");
    expect((await index.resolve(identity(session, attempt, "prior"))).spec.state).toEqual({ amount: 10 });
    index.accept(message(session, argumentsFor(30).raw, "call-a", 2));
    expect(await replay(session).resolve(identity(session, scheduled.seq, "call-a", 2)))
      .toEqual(await index.resolve(identity(session, scheduled.seq, "call-a", 2)));
  });

  it("does not treat surface replacement content as a new UI call", async () => {
    const { session, attempt } = started(); const original = message(session, argumentsFor(18).raw);
    const index = replay(session);
    // 读取边界也拒绝把替换项中的工具块当作新调用，不依赖写入方是否先行拒绝。
    const replacement = { ...original, seq: session.seq, data: { turn: 1, step: 1, stream: [],
      message: { id: "compacted" as AssistantMessage["id"], role: "assistant",
        source: { kind: "model", provider: "fixture", model: "fixture" },
        content: [{ type: "tool-call", id: "injected" as CallId, name: toolName, arguments: argumentsFor(99).raw }] },
    }, surfaceOp: { op: "replace", startSeq: original.seq, endSeq: original.seq } } as SessionEvent<"assistant/message">;
    index.accept(replacement);
    await expect(index.resolve(identity(session, attempt, "injected"))).rejects.toThrow("UI_NOT_FOUND");
  });
});

describe("NativeUiSource current host and cold reads", () => {
  it("saves a valid live prefix without allowing a premature model send", async () => {
    const f = fixture(); const { session, attempt } = started(); f.attach(session);
    const expected = argumentsFor(20); const raw = JSON.stringify({ title: "draft", jsonl: expected.jsonl + "\n" });
    const attemptId = "attempt" as LlmAttemptId;
    f.source.acceptStream(session, { type: "start", attemptId, revision: 1, turn: 1, step: 1 });
    f.source.acceptStream(session, { type: "chunk", attemptId, revision: 2, index: 0, time: 1000, chunk: chunk(raw.slice(0, -2)) });
    const uiId = identity(session, attempt); const partial = await f.source.resolve(session.id, uiId);
    expect(partial.complete).toBe(false);
    const facility = memoryFacility();
    const state = new NativeUiStateStore(facility, (id, ui) => f.source.resolve(id, ui));
    const prompt = vi.fn(); const sender = new NativeUiSender(facility, { prompt }, f.source); await sender.open();
    try {
      await state.save(session.id, uiId, { document_revision: partial.document_revision, expected_revision: 0,
        operation_id: "stream-edit", values: { "/amount": 42 } });
      expect(await sender.send(session.id, { uiId, prompt: "Analyze", values: { "/amount": 42 },
        documentRevision: partial.document_revision, operationId: crypto.randomUUID() })).toEqual({ ok: false, code: "UI_NOT_READY" });
      expect(prompt).not.toHaveBeenCalled();
      f.source.acceptStream(session, { type: "chunk", attemptId, revision: 3, index: 1, time: 1001, chunk: chunk(raw.slice(-2)) });
      expect((await f.source.resolve(session.id, uiId)).complete).toBe(true);
      expect((await state.load(session.id, uiId)).values).toEqual({ "/amount": 42 });
      expect(f.inspect).not.toHaveBeenCalled();
    } finally { await sender.close(); await state.close(); }
  });

  it("drops abandoned live attempts rather than retaining a writable orphan", async () => {
    const f = fixture(); const { session, attempt } = started(); f.attach(session);
    const attemptId = "attempt" as LlmAttemptId;
    f.source.acceptStream(session, { type: "start", attemptId, revision: 1, turn: 1, step: 1 });
    f.source.acceptStream(session, { type: "chunk", attemptId, revision: 2, index: 0, time: 1, chunk: chunk(argumentsFor(20).raw) });
    await f.source.resolve(session.id, identity(session, attempt));
    f.source.acceptStream(session, { type: "end", attemptId, revision: 3, index: 1, outcome: { kind: "abandoned" } });
    f.snapshots.set(session.id, session.snapshotEvents());
    await expect(f.source.resolve(session.id, identity(session, attempt))).rejects.toThrow("UI_NOT_FOUND");
  });

  it("rechecks cold existence while reusing the same immutable snapshot", async () => {
    const f = fixture(); const { session, attempt } = started(); message(session, argumentsFor(20).raw);
    f.snapshots.set(session.id, session.snapshotEvents());
    const accept = vi.spyOn(NativeUiIndex.prototype, "accept");
    const expected = await f.source.resolve(session.id, identity(session, attempt)); const count = accept.mock.calls.length;
    expect(await f.source.resolve(session.id, identity(session, attempt))).toEqual(expected);
    expect(f.inspect).toHaveBeenCalledTimes(2); expect(accept).toHaveBeenCalledTimes(count);
    f.snapshots.delete(session.id);
    await expect(f.source.resolve(session.id, identity(session, attempt))).rejects.toThrow("SESSION_NOT_FOUND");
  });

  it("rebuilds a changed cold snapshot and rejects the replaced attempt", async () => {
    const f = fixture(); const { session, attempt } = started(); message(session, argumentsFor(20).raw);
    f.snapshots.set(session.id, session.snapshotEvents()); await f.source.resolve(session.id, identity(session, attempt));
    const next = retry(session); message(session, argumentsFor(50).raw);
    f.snapshots.set(session.id, session.snapshotEvents());
    await expect(f.source.resolve(session.id, identity(session, attempt))).rejects.toThrow("UI_NOT_FOUND");
    expect((await f.source.resolve(session.id, identity(session, next.seq))).spec.state).toEqual({ amount: 50 });
  });

  it("never uses a detached live session after current host and storage remove it", async () => {
    const f = fixture(); const { session, attempt } = started(); message(session, argumentsFor(20).raw); f.attach(session);
    await f.source.resolve(session.id, identity(session, attempt)); f.live.delete(session.id);
    await expect(f.source.resolve(session.id, identity(session, attempt))).rejects.toThrow("SESSION_NOT_FOUND");
  });

  it("keeps equal cold event snapshots isolated by session identity", async () => {
    const f = fixture(); const a = started("session-a"); const b = started("session-b");
    message(a.session, argumentsFor(20).raw); const events = a.session.snapshotEvents();
    f.snapshots.set(a.session.id, events); f.snapshots.set(b.session.id, events);
    await f.source.resolve(a.session.id, identity(a.session, a.attempt));
    expect((await f.source.resolve(b.session.id, identity(b.session, b.attempt))).spec.state).toEqual({ amount: 20 });
    await expect(f.source.resolve(b.session.id, identity(a.session, a.attempt))).rejects.toThrow("UI_NOT_FOUND");
  });
});
