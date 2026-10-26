import type { SpecComponentProps } from "generative-frame/spec/react";
/** 保留原生 Input 的键盘/表单行为；标签与绑定迟到时不重建已编辑的控件。 */
export declare function TextInput({ id, props, bindings, element, setProp, emit }: SpecComponentProps): import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement> | null;
