import { describe, expect, it } from "vitest";
import { uiDefinition } from "../src/client.js";

describe("native chat node lifecycle", () => {
  it("keeps an interactive UI outside the host's folded tool process", () => {
    const assistant = { blocks: [{ kind: "tool-call", name: "render_intelligent_ui" }], status: "settled" };
    const context = { key: "ui:1:1", id: "1:1", kind: "intelligent-ui", state: { attempt: 1, anchorSeq: 2 },
      current: new Map(), matches: [{ event: { seq: 5 }, location: { kind: "step", step: { data: new Map([["assistant-step", assistant]]) } } }] };
    expect(uiDefinition.buildViewNode!(context as never)).toMatchObject({
      groupTree: "turn", key: "ui:1:1", visibility: "visible", anchorSeq: 2,
    });
  });
  it("preserves a published key as hidden when cancellation removes undispatched calls", () => {
    const previous = { key: "ui:1:1", kind: "intelligent-ui", id: "1:1", target: "chat", visibility: "visible", data: { assistant: { blocks: [] }, attempt: 1 } };
    const context = { key: previous.key, id: previous.id, kind: "intelligent-ui", state: { attempt: 1 },
      current: new Map([["chat", previous]]), matches: [{ event: { seq: 5 }, location: { kind: "step", step: { data: new Map([["assistant-step", { blocks: [], status: "done" }]]) } } }] };
    const node = uiDefinition.buildViewNode!(context as never);
    expect(node).toEqual({ ...previous, visibility: "hidden" });
  });
  it("does not create a node for an ordinary text-only assistant step", () => {
    const context = { key: "ui:1:1", id: "1:1", kind: "intelligent-ui", state: { attempt: 1 },
      current: new Map(), matches: [{ event: { seq: 5 }, location: { kind: "step", step: { data: new Map([["assistant-step", { blocks: [], status: "done" }]]) } } }] };
    expect(uiDefinition.buildViewNode!(context as never)).toBeNull();
  });
});
