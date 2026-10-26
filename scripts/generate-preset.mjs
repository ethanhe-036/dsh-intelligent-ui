import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// 复制已验证版本的完整标准组合，保留顺序、配置和禁用状态，只追加本插件工具。
const cli = createRequire(import.meta.url).resolve("@deepseek-ai/dsh/package.json");
const require = createRequire(cli);
const webPackage = require.resolve("@deepseek-ai/dsh-web-app/package.json");
const metadata = JSON.parse(await readFile(webPackage, "utf8"));
if (metadata.version !== "0.2.1-rc.3") throw new Error("Unexpected DSH preset baseline");
const standard = await readFile(join(dirname(webPackage), "presets/standard.patch.yml"), "utf8");
const preset = standard.slice(standard.indexOf("- insert:"))
  .replace("id: preset-standard", "id: preset-intelligent-ui")
  .replace("id: standard", "id: intelligent-ui-preset")
  .replace("order: 1", "order: 5").trimEnd();
const output = "# DSH 0.2.1-rc.3 标准模式的完整快照；由 scripts/generate-preset.mjs 生成。\n" +
  "- insert:\n    - id: intelligent-ui\n      name: dsh-intelligent-ui\n" + preset +
  "\n          - id: intelligent-ui-tools\n            name: dsh-intelligent-ui/tools\n";
const target = new URL("../cordis.patch.yml", import.meta.url);
if (process.argv.includes("--check")) {
  if (await readFile(target, "utf8") !== output) throw new Error("Preset differs from the pinned standard composition");
} else await writeFile(target, output);
console.log("Preset: full standard composition plus Intelligent UI");
