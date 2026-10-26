import type { Context } from "@deepseek-ai/cordis";
import { clientRequestSchema } from "@deepseek-ai/dsh-client-connection";
import type {} from "@deepseek-ai/dsh-llm-retry";
import type {} from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-api-session-controller";
import { NativeUiStateStore } from "./native-state.js";
import { NativeUiSource } from "./native-source.js";
import { NativeUiSender } from "./native-send.js";
import { freezeUiSaveRequest, UiStateError } from "./state.js";

export const name = "dsh-intelligent-ui";
export const inject = ["connection", "sessions", "sessionController", "storageDomain"];

/** 原生宿主使用官方信任边界和 storageDomain；工具仍按 Preset 注册。 */
export async function apply(ctx: Context): Promise<void> {
  const source = new NativeUiSource(ctx.sessions, ctx.sessionController);
  ctx.on("session/event", (session, event) => source.accept(session, event));
  ctx.on("agent/assistant-stream", ({ agent, frame }) => source.acceptStream(agent.session, frame));
  const state = new NativeUiStateStore(ctx.storageDomain, (sessionId, uiId) => source.resolve(sessionId, uiId));
  await state.open();
  ctx.effect(() => () => state.close());
  const sender = new NativeUiSender(ctx.storageDomain, ctx.sessionController, source);
  await sender.open();
  ctx.effect(() => () => sender.close());
  const handle = async (endpoint: string, payload: unknown, signal: AbortSignal) => {
    try {
      if (payload === null || typeof payload !== "object") throw new Error("INVALID_REQUEST");
      const input = payload as Record<string, unknown>;
      if (typeof input.sessionId !== "string" || typeof input.uiId !== "string") throw new Error("INVALID_REQUEST");
      if (endpoint === "load") return { ok: true, value: { ok: true, state: await state.load(input.sessionId, input.uiId) } };
      if (endpoint === "save") return { ok: true, value: { ok: true, state: await state.save(input.sessionId, input.uiId, freezeUiSaveRequest(input.request)) } };
      if (endpoint === "send") return { ok: true, value: await sender.send(input.sessionId, input.request, signal) };
      throw new Error("INVALID_REQUEST");
    } catch (error) {
      const code = error instanceof UiStateError ? error.code : error instanceof Error &&
        ["UI_NOT_FOUND", "UI_NOT_READY", "INVALID_REQUEST"].includes(error.message) ? error.message : "STATE_UNAVAILABLE";
      return { ok: true, value: { ok: false, code, ...(error instanceof UiStateError && error.current ? { current: error.current } : {}) } };
    }
  };
  // 使用新版共享 API 的精确路由；Connection 统一执行 Host/Origin、认证和 owner Peer 校验。
  for (const endpoint of ["load", "save", "send"]) {
    ctx.connection.fetch.register({
      path: "/api/intelligent-ui/" + endpoint, methods: ["POST"], requestBody: "buffered",
      async fetch(request) {
        let body: unknown;
        try { body = await request.json(); } catch { return new Response("INVALID_REQUEST", { status: 400 }); }
        const parsed = clientRequestSchema.safeParse(body);
        if (!parsed.success || parsed.data.method !== "intelligent-ui/" + endpoint) return new Response("INVALID_REQUEST", { status: 400 });
        const result = await handle(endpoint, parsed.data.payload, request.signal);
        return Response.json({ type: "server-response", rpcId: parsed.data.rpcId, result });
      },
    });
  }
}
