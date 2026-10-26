import { describe, expect, it, vi } from "vitest";
import { DomainFacility, type descriptorOf } from "@deepseek-ai/dsh-storage-domain";
import { NativeUiSender } from "../src/native-send.js";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";

async function fixture() {
  const records = new Map<string, unknown>();
  const facility = new DomainFacility({ storage: { backend: { get: () => ({ kv: {
    open: async (_descriptor: ReturnType<typeof descriptorOf>) => ({
      loadAll: async () => ({ global: null, tables: { receipts: Object.fromEntries(records) } }),
      putRecord: async (_table: string, key: string, value: unknown) => { records.set(key, structuredClone(value)); },
      deleteRecord: async (_table: string, key: string) => { records.delete(key); }, close: async () => {},
    }),
  } }) } }, emit: vi.fn(), logger: { warn: vi.fn() } } as unknown as ConstructorParameters<typeof DomainFacility>[0], { backend: "memory" });
  const source = { resolve: vi.fn(async () => ({ document_revision: 7, spec: { root: "root", elements: {} }, complete: true })),
    hasAdmission: vi.fn(async () => false) };
  const prompt = vi.fn(async (_request: unknown) => ({ accepted: true as const }));
  const sender = new NativeUiSender(facility, { prompt }, source as unknown as ConstructorParameters<typeof NativeUiSender>[2]);
  await sender.open();
  const request = { uiId: "ui", prompt: "Analyze", values: { "/count": 12 }, documentRevision: 7, operationId: crypto.randomUUID() };
  return { sender, request, source, prompt, records };
}

describe("native explicit sends", () => {
  it("accepts a concurrent same-operation double click once; a new explicit click can send identical values", async () => {
    const f = await fixture();
    expect(await Promise.all([f.sender.send("s", f.request), f.sender.send("s", f.request)])).toEqual([{ ok: true }, { ok: true }]);
    expect(f.prompt).toHaveBeenCalledTimes(1);
    expect(await f.sender.send("s", { ...f.request, operationId: crypto.randomUUID() })).toEqual({ ok: true });
    expect(f.prompt).toHaveBeenCalledTimes(2);
    await f.sender.close();
  });

  it("only reconciles a lost receipt against native admission and never invokes prompt twice", async () => {
    const f = await fixture();
    f.prompt.mockImplementationOnce(async () => { f.source.hasAdmission.mockResolvedValue(true); throw new Error("lost response"); });
    await expect(f.sender.send("s", f.request)).rejects.toThrow("lost response");
    expect(await f.sender.send("s", f.request)).toEqual({ ok: true });
    expect(f.prompt).toHaveBeenCalledTimes(1);
    await f.sender.close();
  });

  it("keeps an unresolved reservation unknown instead of guessing that a timeout rejected it", async () => {
    const f = await fixture();
    f.prompt.mockRejectedValueOnce(new Error("disconnect"));
    await expect(f.sender.send("s", f.request)).rejects.toThrow();
    expect(await f.sender.send("s", f.request)).toEqual({ ok: false, code: "SEND_UNKNOWN" });
    expect(f.prompt).toHaveBeenCalledTimes(1);
    await f.sender.close();
  });

  it("rejects partial documents and changed versions before admission", async () => {
    const f = await fixture();
    f.source.resolve.mockResolvedValueOnce({ document_revision: 7, spec: { root: "root", elements: {} }, complete: false });
    expect(await f.sender.send("s", f.request)).toEqual({ ok: false, code: "UI_NOT_READY" });
    expect(await f.sender.send("s", { ...f.request, documentRevision: 6 })).toEqual({ ok: false, code: "DOC_CHANGED" });
    expect(f.prompt).not.toHaveBeenCalled();
    expect(f.records.size).toBe(0);
    await f.sender.close();
  });

  it("distinguishes explicit rejection from unknown and permits a new operation afterwards", async () => {
    const f = await fixture();
    f.prompt.mockRejectedValueOnce(new RemoteError("session/agent-busy", "busy", { reason: "busy" }));
    expect(await f.sender.send("s", f.request)).toEqual({ ok: false, code: "SEND_REJECTED" });
    expect(await f.sender.send("s", f.request)).toEqual({ ok: false, code: "SEND_REJECTED" });
    expect(await f.sender.send("s", { ...f.request, operationId: crypto.randomUUID() })).toEqual({ ok: true });
    expect(f.prompt).toHaveBeenCalledTimes(2);
    await f.sender.close();
  });

  it("does not let an operation key change its frozen values", async () => {
    const f = await fixture();
    await f.sender.send("s", f.request);
    expect(await f.sender.send("s", { ...f.request, values: { "/count": 99 } })).toEqual({ ok: false, code: "OPERATION_CONFLICT" });
    expect(f.prompt).toHaveBeenCalledTimes(1);
    await f.sender.close();
  });

  it("submits user analysis through the native queue without invoking slash commands", async () => {
    const f = await fixture();
    await f.sender.send("s", { ...f.request, prompt: "/reset" });
    const sent = f.prompt.mock.calls[0][0] as { requestId: string; mode: string; content: { text: string }[] };
    expect(sent.requestId).toBe(f.request.operationId);
    expect(sent.mode).toBe("queue");
    expect(sent.content[0].text).toMatch(/^Intelligent UI\n\/reset/);
    expect(sent.content[0].text).toContain('"/count":12');
    await f.sender.close();
  });
});
