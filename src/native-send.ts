import { defineDomain, domainTable, type Domain, type DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import type { SessionController, SessionRequestId } from "@deepseek-ai/dsh-api-session-controller";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { z } from "zod";
import type { NativeUiSource } from "./native-source.js";

const requestSchema = z.object({
  uiId: z.string().min(1), prompt: z.string(), values: z.record(z.string(), z.json()),
  documentRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), operationId: z.string().uuid(),
}).strict();
const receiptsDomain = defineDomain({ name: "intelligent_ui_sends", version: 1, tables: {
  receipts: domainTable(z.object({ body: z.string(), status: z.enum(["reserved", "accepted", "rejected"]) }).strict()),
} });

/** 冻结一次点击的内容；原生 requestId 去重之外，收据拒绝同键换值并核对未知接纳。 */
export class NativeUiSender {
  private domain?: Domain<typeof receiptsDomain>;
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  constructor(private readonly facility: Pick<DomainFacility, "open">, private readonly api: Pick<SessionController, "prompt">,
    private readonly source: NativeUiSource) {}

  async open(): Promise<void> { this.domain = await this.facility.open(receiptsDomain); }

  send(sessionId: string, input: unknown, signal: AbortSignal = new AbortController().signal): Promise<{ ok: boolean; code?: string }> {
    const request = requestSchema.safeParse(input);
    if (!request.success) return Promise.resolve({ ok: false, code: "INVALID_REQUEST" });
    const frozen = structuredClone(request.data);
    if (this.closed) return Promise.resolve({ ok: false, code: "STATE_UNAVAILABLE" });
    const result = this.tail.then(async () => {
      const source = await this.source.resolve(sessionId, frozen.uiId);
      const table = this.domain!.table("receipts");
      const key = JSON.stringify([sessionId, frozen.operationId]);
      const body = JSON.stringify(frozen);
      const stored = table.get(key);
      if (stored) {
        if (stored.body !== body) return { ok: false, code: "OPERATION_CONFLICT" };
        if (stored.status === "accepted") return { ok: true };
        if (stored.status === "rejected") return { ok: false, code: "SEND_REJECTED" };
        if (await this.source.hasAdmission(sessionId, frozen.operationId)) {
          await table.update(key, value => ({ ...value, status: "accepted" }));
          return { ok: true };
        }
        return { ok: false, code: "SEND_UNKNOWN" };
      }
      if (source.document_revision !== frozen.documentRevision) return { ok: false, code: "DOC_CHANGED" };
      if (!source.complete) return { ok: false, code: "UI_NOT_READY" };
      await table.put(key, { body, status: "reserved" });
      // 此调用只进入官方队列。插件不创建 Agent、不组装历史，也不自动继续另一轮。
      try {
        await this.api.prompt({ requestId: frozen.operationId as SessionRequestId,
          sessionId: sessionId as SessionId, mode: "queue", content: [{ type: "text",
            text: "Intelligent UI\n" + frozen.prompt + "\n\n" + JSON.stringify({ ui: frozen.uiId, version: frozen.documentRevision, values: frozen.values }) }] }, signal);
        await table.update(key, value => ({ ...value, status: "accepted" }));
        return { ok: true };
      } catch (error) {
        if (!remoteErrorOf(error)) throw error;
        await table.update(key, value => ({ ...value, status: "rejected" }));
        return { ok: false, code: "SEND_REJECTED" };
      }
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async close(): Promise<void> { this.closed = true; await this.tail; await this.domain?.close(); }
}
