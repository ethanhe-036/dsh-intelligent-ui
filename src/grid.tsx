import type { CSSProperties } from "react";
import type { SpecComponentProps } from "generative-frame/spec/react";

/** 外层提供尺寸容器，内层仅由 CSS 改变列数；断点不会更换子节点身份。 */
export function Grid({ props, children }: SpecComponentProps) {
  const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
  const gap = typeof props.gap === "number" && Number.isFinite(props.gap) && props.gap >= 0 && props.gap <= 8 ? props.gap : 4;
  return <div data-iui-grid-container="">
    <div data-aui="grid" data-columns={columns} style={{ "--iui-gap": `${gap * 4}px` } as CSSProperties}>{children}</div>
  </div>;
}
