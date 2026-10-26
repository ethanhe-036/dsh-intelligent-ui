import { useId, useLayoutEffect, useRef, useState } from "react";
import type { SpecComponentProps } from "generative-frame/spec/react";
import { useUiEditContext } from "./edit-context.js";

const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const textOf = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? String(value) : "";
const words = {
  en: { invalid: "Finish entering a valid number.", range: "Enter a number within the displayed range.", editing: "Finish entering this number.", empty: "Empty" },
  "zh-CN": { invalid: "请输入完整有效的数字。", range: "请输入显示范围内的数字。", editing: "请完成当前数字输入。", empty: "未填写" },
  "zh-TW": { invalid: "請輸入完整有效的數字。", range: "請輸入顯示範圍內的數字。", editing: "請完成目前數字輸入。", empty: "未填寫" },
  id: { invalid: "Selesaikan angka yang valid.", range: "Masukkan angka dalam rentang yang ditampilkan.", editing: "Selesaikan angka ini.", empty: "Kosong" },
};

/** 未完成文本仅留在控件；合法输入与伴随滑块共用一个 number/null 值，单位不改变数值。 */
export function NumberInput({ props, bindings, element, setProp, emit }: SpecComponentProps) {
  const { locale, setPending } = useUiEditContext();
  const domId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({ text: textOf(props.value), base: props.value });
  const [composing, setComposing] = useState(false);
  const minimum = number(props.min), maximum = number(props.max), step = number(props.step);
  const value = number(props.value) ?? null;
  const text = Object.is(draft.base, props.value) ? draft.text : textOf(props.value);
  const read = (raw: string) => {
    if (raw === "") return { value: null, error: "" } as const;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u.test(raw.trim()) || !Number.isFinite(Number(raw)))
      return { value: undefined, error: words[locale].invalid };
    const parsed = Number(raw);
    return { value: parsed, error: minimum !== undefined && parsed < minimum || maximum !== undefined && parsed > maximum ? words[locale].range : "" };
  };
  const error = composing ? words[locale].editing : read(text).error;
  const actions = element.on?.change;
  const paths = [...new Set([...(bindings.value ? [bindings.value] : []),
    ...(Array.isArray(actions) ? actions : actions ? [actions] : [])
      .flatMap(action => action.action === "setState" && typeof action.params?.path === "string" ? [action.params.path] : [])])];
  const pathKey = JSON.stringify(paths);
  const pending = () => ({ paths, focus: () => inputRef.current?.focus() });
  useLayoutEffect(() => {
    setDraft(previous => Object.is(previous.base, props.value) ? previous : { text: textOf(props.value), base: props.value });
  }, [props.value]);
  useLayoutEffect(() => {
    setPending(domId, error ? pending() : undefined);
    inputRef.current?.setCustomValidity(error);
    return () => setPending(domId);
  }, [domId, error, pathKey, setPending]);
  const change = (raw: string, isComposing = composing) => {
    const parsed = read(raw);
    const invalid = isComposing || !!parsed.error;
    setDraft({ text: raw, base: invalid ? props.value : parsed.value });
    setPending(domId, invalid ? pending() : undefined);
    if (!invalid) { setProp("value", parsed.value); emit("change", parsed.value); }
  };
  const slider = props.showSlider === true && minimum !== undefined && maximum !== undefined && minimum < maximum;
  const unit = typeof props.unit === "string" ? props.unit : undefined;
  const label = typeof props.label === "string" ? props.label : "";
  return <div data-aui="number-input" className="intelligent-ui-number" data-invalid={!!error || undefined}>
    <div className="iui-number-field">
      <label id={`${domId}-label`} htmlFor={domId}>{label}</label>
      <div className="iui-number-control">
        <input ref={inputRef} id={domId} type="text" inputMode="decimal" role="spinbutton" value={text}
          aria-labelledby={`${domId}-label`} aria-valuenow={error || value === null ? undefined : value}
          aria-valuetext={text === "" ? words[locale].empty : error ? text : unit && value !== null ? `${value} ${unit}` : undefined}
          aria-valuemin={minimum} aria-valuemax={maximum} aria-invalid={!!error || undefined}
          aria-describedby={[unit ? `${domId}-unit` : "", slider ? `${domId}-range` : "", error ? `${domId}-error` : ""].filter(Boolean).join(" ") || undefined}
          onChange={event => change(event.currentTarget.value)}
          onCompositionStart={() => { setComposing(true); setPending(domId, pending()); }}
          onCompositionEnd={event => { setComposing(false); change(event.currentTarget.value, false); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || composing || error || value === null || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const next = value + (event.key === "ArrowUp" ? 1 : -1) * (step ?? 1);
            change(String(Math.max(minimum ?? -Infinity, Math.min(maximum ?? Infinity, next))));
          }} />
        {unit && <span className="iui-number-unit" id={`${domId}-unit`}>{unit}</span>}
      </div>
    </div>
    {slider && <>
      <input className="iui-number-slider" type="range" min={minimum} max={maximum} step={step ?? "any"}
        value={value !== null && minimum !== undefined && maximum !== undefined && value >= minimum && value <= maximum ? value : minimum} disabled={value === null || !!error}
        aria-labelledby={`${domId}-label`} aria-valuetext={value === null ? "" : `${value}${unit ? ` ${unit}` : ""}`}
        onChange={event => change(event.currentTarget.value)} />
      <div className="iui-number-range" id={`${domId}-range`}><span>{minimum}</span><span>{maximum}</span></div>
    </>}
    {error && <span className="iui-field-error" id={`${domId}-error`}>{error}</span>}
  </div>;
}
