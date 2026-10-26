# DSH Intelligent UI

在 DeepSeek Harness 对话中生成可交互表格、图表、清单、表单和计算器。
当前版本 `0.3.0` 面向 **DSH `0.2.1-rc.3`**，也提供独立 React 嵌入入口。
其他 DSH 版本尚未验证；具体场景与限制见 [验收记录](docs/acceptance.md)。

## 安装

在 DSH「插件 → 添加插件」中输入：

```text
https://github.com/ethanhe-036/dsh-intelligent-ui
```

安装后新建会话，选择 **intelligent-ui-preset**。它复制该版本标准模式的完整插件树，
保留标准工具、配置及禁用状态，只增加 Intelligent UI 工具。原有标准模式保持原样。
已经创建的会话不会自动切换 Preset。

仓库包含预构建 `dist/`，安装不依赖本机 TypeScript 构建或安装脚本。也可以在「添加插件」中
填入本仓库的本地绝对目录。此包尚未发布到 npm，不能直接使用 npm 包名安装。

例如：

- “帮我算装修预算，我想自己改面积和单价看看。”
- “联网查这些项目的官方信息，用表格对照，保留来源链接。”
- 上传销售文件后说：“按产品汇总数据，用表格和图表展示。”

输入默认只保存在当前 DSH 宿主。界面提供“提交/分析”等明确发送动作时，才把点击时冻结的值
发送给会话中的模型；稍后继续编辑不会改变已经发送的内容。

组件、公式、状态和增量解析复用 @assistant-ui/generative-ui 0.0.7 与 generative-frame 0.0.8 spec。
包内不包含业务系统类型、模型凭据或第二 Agent Loop。

宿主只装配一次根入口，目标 Preset 使用 dsh-intelligent-ui/tools 注册工具和目录。
每个真实直接调用创建新 UI；标题只展示，Code Mode/嵌套调用不提供渐进展示。
普通用户状态由宿主保存，模型只接收用户明确发送时冻结的值。

## 条件可见性

`visible` 是原生 element 字段，与 `type`、`props` 同级；由 generative-frame 的
`SpecRenderer` / `resolveSpec` 使用原生条件求值。以预算提醒为例：

```json
{"type":"Alert","props":{"tone":"danger","title":"超出预算"},"visible":{"$calc":"${/total} > ${/budget}"}}
```

相反提醒在自己的 `visible` 使用 `<=` 条件，包含恰好等于预算的边界。
不要把条件写入 `props.visible`；纠正时移到 `/elements/<id>/visible`，并按工具契约
提交完整新文档，不以续补片修改此前界面。模型可见工具说明包含相同位置与纠正示例。

锁定上游的 Alert Zod 输入定义只声明 `title`、`description`、`tone`；
公开 `propsSchema` 使用 Standard Schema 的 `jsonSchema.input`，没有
`additionalProperties: false`，所以未知属性可以通过校验，但不会获得可见性行为。
本插件保留该开放输入合同，不自动搬移字段，也不把开放对象统一改成闭合对象；
工具成功和流式 `valid` 只表示现有合同校验通过。
目录已声明的组件属性必须放在 `props` 内，例如 Alert 的 `title`、`description` 和 `tone`。
这些属性误放到 element 顶层时，最终流校验与工具执行一致返回 `invalid-props`，提示移入
`props`；部分流仍允许逐步生成。原生 element 字段和未知开放属性保持原语义，校验不自动
搬移字段或改写历史文档。

JSONL 补片错误先于公式校验返回。工具按脱敏行号提示核对 JSON 闭合、转义和 op/path；
`missing-child` 提示补齐 children/slots 引用的节点，包括初始隐藏内容。纠正仍须提交
完整新文档，不自动补括号、删引用或改写参数，错误反馈不回显动态节点名和输入值。

工具指引覆盖普通表格、清单、可调预算和带费用的行程等意图，不要求用户指定组件名。
完整首次及能力边界示例与工具回归共用同一份 JSONL。每个原生 $calc 最多 500 字符、嵌套 32 层；
长合计优先使用现有 sum 等数组聚合，字段参数为 /amount 这样的 JSON Pointer。
显示计算结果不会创建可被后续公式引用的 state 字段。乘方、循环和任意 JavaScript 不在
当前公式能力中；复利和摊还等固定预计算结果须标明假设及更新方式，不冒充任意参数实时重算。

## 本地开发

共享目录 `core-v2` 提供 29 个通用组件。Grid 按自身外层容器宽度使用一至三列，
`columns` 是最大列数，`gap` 与原生 Card/Col/Row 的间距保持 4px 单位并接受小数。
NumberInput 的可选 `showSlider` 要求有限的 `min < max`，`unit` 只作展示；数字框与滑块
共用一个 number/null 绑定。未完成的数字编辑不写入 Store，明确分析会定位相关未完成字段。
`step` 控制滑块与箭头增量，不对数字框的合法数值额外取整。
文字和多行 Input 需要即时同步时，在 `defaultValue` 使用 `$bindState`；DatePicker
在 `value` 绑定。仅在 submit 写状态的描述不会逐字同步摘要。Input、Select、DatePicker
已显示可访问的 `label`，模型无需再增加同名文字标签。
`$template` 只替换状态或重复项路径；派生数值及包含计算的文字使用独立 `$calc`，
不在模板占位中嵌套公式或 `${$calc}`。工具接纳不代表所有生成文案的计算含义正确，
仍须通过实际值与编辑联动验收。

React 入口接受可选 `theme="light"` 或 `theme="dark"`；未指定时默认随系统偏好。
原生客户端订阅 DSH 公开 `theme/change` 并读取 `theme.getTheme()`，使用宿主解析后的主题。
Input 的标签和绑定逐条到达时保留控件节点与已输入文字；真实绑定首次出现后，
未绑定阶段的本地编辑移交到该路径，后续恢复仍以既有 Store 为准。
未绑定且没有显式 `name` 的 Input 保留原生匿名表单字段语义，不自动增加提交键。
配套样式拥有完整 `--iui-*` 默认变量，宿主可以在根容器作窄主题映射，不要求宿主全局 CSS。
Card/Box 的显式纯色背景按浏览器解析及透明叠加后的底色选择默认前景，保留原背景、
显式 Text 颜色和 Fact 趋势语义；渐变、图片、混合或自引用背景不推断对比度，仍需人工复核。
目录版本与文档摘要命名空间独立：目录扩展仍沿用 `core-v1` 摘要规则，纯样式不会改变旧文档版本。
输入 Store 在第一次渲染前播种，后续补片仍在挂载生命周期中更新，不重置用户已写入的值。
流式来源的首次恢复失败后，不随每个补片重复请求；来源未就绪类失败在宿主 sourceReady
就绪时再恢复，权限拒绝、冲突和其他失败不因此自动重读。
未指定该属性的嵌入入口以流结束为准；自定义宿主应提供真实来源就绪状态。
同一 UI 的重复 RadioGroup 也按挂载实例隔离 DOM 分组，不相互取消选中。转为只读时冻结此前
未保存的草稿，仍经宿主当前来源校验及 CAS 保存；新编辑和分析动作保持禁用。保存冲突与
未知回执沿原重读或同操作重试语义处理，不自动覆盖其他页面的修改，不用本地缓存冒充已保存。
重复行的 `$bindItem` 适合本地交互，但当前不作为可持久化字段。需要保存和提交时，应使用
具体 `$bindState` 路径，或通过事件更新已绑定的数组；工具目录提供相应合同。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` 包含目录与完整 Preset 快照检查、状态/来源/发送测试和 JSDOM 单选分组测试。
13 个浏览器色彩测试为可选门禁：安装 Playwright 浏览器后，设置 `IUI_BROWSER_TESTS=1`，
再运行 `pnpm exec vitest run tests/catalog-surface.browser.spec.ts`。
`IUI_BROWSER_ENGINES=chromium,firefox,webkit` 可选择引擎，默认 Chromium。

React 嵌入入口为 `dsh-intelligent-ui/react`。原生客户端使用 DSH 公开的 `assistant-step`、
`assistant/live-chunk` 与 `conversation.chat.node` 接点；宿主使用 SessionController、
StorageDomain 和 Connection 的认证路由。每次修改源码后须重建并提交发布用 `dist/`。
