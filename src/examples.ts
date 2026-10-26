/** 模型可见示例与真实工具回归共用原文，避免说明和可执行契约漂移。 */
export const firstUseExample = {
  title: "Budget comparison",
  jsonl: [
    { op: "add", path: "", value: { root: "plan", state: { items: [{ amount: 30 }, { amount: 20 }], limit: 60 }, elements: {} } },
    { op: "add", path: "/elements/plan", value: { type: "Col", props: {}, children: ["first", "second", "total", "over"] } },
    { op: "add", path: "/elements/first", value: { type: "NumberInput", props: { label: "First amount", value: { $bindState: "/items/0/amount" } } } },
    { op: "add", path: "/elements/second", value: { type: "NumberInput", props: { label: "Second amount", value: { $bindState: "/items/1/amount" } } } },
    { op: "add", path: "/elements/total", value: { type: "Fact", props: { label: "Total", value: { $calc: "sum(${/items}, '/amount')" } } } },
    { op: "add", path: "/elements/over", value: { type: "Alert", props: { tone: "warning", title: "Over budget" } } },
    { op: "add", path: "/elements/over/visible", value: { $calc: "sum(${/items}, '/amount') > ${/limit}" } },
  ].map(patch => JSON.stringify(patch)).join("\n"),
};

/** 不支持的复利公式用已核算快照表达，明确固定假设与重新计算方式。 */
export const precomputedExample = {
  title: "Fixed compound-growth snapshot",
  jsonl: [
    { op: "add", path: "", value: { root: "snapshot", elements: {
      snapshot: { type: "Col", props: {}, children: ["result", "update"] },
      result: { type: "Fact", props: { label: "Precomputed: principal 100, annual rate 3%, 2 years", value: 106.09 } },
      update: { type: "Text", props: { value: "This result is fixed. Request a new calculation to change the rate or term; it does not recalculate when other controls change." } },
    } } },
  ].map(patch => JSON.stringify(patch)).join("\n"),
};
