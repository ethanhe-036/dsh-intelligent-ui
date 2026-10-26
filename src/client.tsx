import type { Context } from "@deepseek-ai/cordis";
import { useMemo, useSyncExternalStore } from "react";
import type {} from "@deepseek-ai/dsh-client-ui-theme/client";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { ConversationNodeDefinition, ConversationMatch } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { AssistantChatData, ChatNodeViewProps } from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import { IntelligentUi, UiSessionStore, type UiStateSnapshot, type UiStateTransport, type UiAnalyzeRequest } from "./renderer.js";
import { toolName } from "./core.js";
import styles from "./styles.css";

interface UiChatData { assistant: AssistantChatData; attempt: number }
declare module "@deepseek-ai/dsh-client-ui-chat/client" {
  interface ChatNodeDataMap { "intelligent-ui": UiChatData }
}

/** 读取官方 assistant-step 发布值，只增加一个专属节点，不重写 Assistant 或历史。 */
export const uiDefinition: ConversationNodeDefinition<{ attempt: number; anchorSeq?: number }> = {
  kind: "intelligent-ui", target: "chat",
  match(event) {
    if (event.type === "step/start") return { id: String(event.data.turn) + ":" + event.data.step, role: "start" };
    if (event.type === "assistant/live-chunk" || (event.type === "assistant/message" && event.surfaceOp === "append") || event.type === "assistant/attempt" || event.type === "llm/retry") return { id: String(event.data.turn) + ":" + event.data.step, role: "update" };
    return null;
  },
  start: (_context, match) => ({ attempt: match.event.seq }),
  update(context, match) {
    if (match.event.type === "llm/retry") return { attempt: match.event.seq };
    if (context.state.anchorSeq === undefined && match.event.type === "assistant/live-chunk" && match.event.data.chunk.type === "tool-call-delta" && match.event.data.chunk.name === toolName) return { ...context.state, anchorSeq: match.event.seq };
    return context.state;
  },
  publication: match => match.event.type === "assistant/live-chunk" ? "animation-frame" : "immediate",
  buildViewNode(context) {
    const match: ConversationMatch | undefined = context.matches.at(-1);
    if (!match || match.location.kind !== "step") return null;
    const assistant = match.location.step.data.get("assistant-step");
    if (!assistant?.blocks.some(block => block.kind === "tool-call" && block.name === toolName)) {
      const previous = context.current.get("chat");
      // 原生节点一旦发布不能撤销；取消/重试通过同 key 的隐藏节点完成生命周期交接。
      return previous ? { ...previous, visibility: "hidden" } : null;
    }
    return { key: context.key, kind: "intelligent-ui", id: context.id, target: "chat", groupTree: "turn", anchorSeq: context.state?.anchorSeq ?? match.event.seq, location: match.location, visibility: "visible", data: { assistant, attempt: context.state?.attempt ?? context.matches[0].event.seq } };
  },
};

export const inject = ["uiConversation", "slots", "connection", "theme"];

/** 原生 DSH 浏览器通过公开 Node/slot 装配共享 React 渲染器。 */
export function apply(ctx: Context): void {
  const connection = ctx.connection as unknown as ConnectionHandle;
  const stores = new Map<string, UiSessionStore>();
  const subscribeTheme = (listener: () => void) => ctx.on("theme/change", listener);
  const getTheme = () => ctx.theme.getTheme().active.colorScheme;
  ctx.effect(() => ctx.uiConversation.events.register(uiDefinition));
  const style = window.document.createElement("style");
  style.textContent = styles;
  window.document.head.append(style);
  ctx.effect(() => () => { style.remove(); stores.forEach(store => store.clear()); stores.clear(); });
  function View({ node, sessionId }: ChatNodeViewProps<"intelligent-ui">) {
    const theme = useSyncExternalStore(subscribeTheme, getTheme, getTheme);
    const store = stores.get(sessionId) ?? new UiSessionStore();
    stores.set(sessionId, store);
    const adapter = useMemo(() => {
      const call = async (endpoint: string, uiId: string, request?: unknown) => {
        const result = await connection.rpc.call("/api", "intelligent-ui/" + endpoint, { sessionId, uiId, request });
        if (!result.ok) throw Object.assign(new Error("UI_RPC_FAILED"), { code: "NETWORK_ERROR" });
        const value = result.value as { ok?: boolean; code?: string; state?: UiStateSnapshot };
        if (!value || value.ok !== true) throw Object.assign(new Error("UI_REQUEST_FAILED"), { code: value?.code ?? "NETWORK_ERROR" });
        return value;
      };
      const readState = async (endpoint: string, id: string, request?: unknown) => {
        const result = await call(endpoint, id, request);
        if (!result.state || !Number.isSafeInteger(result.state.state_revision) || !Number.isSafeInteger(result.state.document_revision) ||
          !result.state.values || typeof result.state.values !== "object" || Array.isArray(result.state.values)) throw new Error("INVALID_STATE_RESPONSE");
        return result.state;
      };
      const transport: UiStateTransport = { load: id => readState("load", id), save: (id, request) => readState("save", id, request) };
      const analyze = async (request: UiAnalyzeRequest) => { await call("send", request.uiId, request); };
      return { transport, analyze };
    }, [sessionId]);
    const language = window.document.documentElement.lang || navigator.language;
    const locale = language === "zh-TW" || language === "zh-HK" ? "zh-TW" : language.startsWith("zh") ? "zh-CN" : language.startsWith("id") ? "id" : "en";
    return <>{node.data.assistant.blocks.flatMap(block => block.kind === "tool-call" && block.name === toolName ? [
      <IntelligentUi key={block.callId} id={String(sessionId) + ":" + node.id + ":" + node.data.attempt + ":" + block.callId} argsRaw={block.argsRaw} streaming={node.data.assistant.status === "running"} store={store} transport={adapter.transport} onAnalyze={adapter.analyze} locale={locale} theme={theme} />,
    ] : [])}</>;
  }
  ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({ name: "conversation.chat.node", key: "intelligent-ui" }, View));
}
