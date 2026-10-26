import { defaultGenerativeUILibrary } from "@assistant-ui/generative-ui/spec";
import type { SpecComponentProps } from "generative-frame/spec/react";
import { cloneElement, createElement, isValidElement, useId, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";

/** 保留原生 Input 的键盘/表单行为；标签与绑定迟到时不重建已编辑的控件。 */
export function TextInput({ id, props, bindings, element, setProp, emit }: SpecComponentProps) {
  const domId = useId();
  const [draft, setDraft] = useState<string>();
  const binding = bindings.defaultValue;
  const previousBinding = useRef(binding);
  const adopting = binding !== undefined && previousBinding.current === undefined && draft !== undefined;
  useLayoutEffect(() => {
    // 只有真实绑定首次到达时移交未绑定草稿；后续恢复/切换路径仍以 Store 为准。
    if (adopting) setProp("defaultValue", draft);
    previousBinding.current = binding;
  }, [binding, adopting, draft, setProp]);
  const node = defaultGenerativeUILibrary.Input.render({
    ...props,
    name: typeof props.name === "string" ? props.name : binding !== undefined ? id : undefined,
    $status: "done",
    ...(element.on?.submit ? { $action: { type: "submit" } } : {}),
    $dispatch: (action: { type: string; $input?: unknown }) => emit(action.type, action.$input),
  } as never);
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  const value = binding !== undefined && !adopting ? props.defaultValue : draft ?? props.defaultValue;
  const control = cloneElement(node, {
    key: "input-control", id: domId, value: typeof value === "string" ? value : "", defaultValue: undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const text = event.currentTarget.value;
      setDraft(text);
      if (binding !== undefined) setProp("defaultValue", text);
    },
  });
  return createElement("div", { className: "iui-labeled-control" },
    typeof props.label === "string" && props.label
      ? createElement("label", { className: "iui-field-label", htmlFor: domId }, props.label) : null,
    control);
}
