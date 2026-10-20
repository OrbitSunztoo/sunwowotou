/* ふわり Fuwari — 一次性迁移脚本
 * 从旧版静态站点（根目录下没有 data/ 的版本）上传来的内容里，
 * 把 /uploads/xxx.png 形式的图片地址保留为绝对路径，避免在子目录部署时 404。
 *
 * 用法：node server/migrate-static.js <旧的 content.json> [输出路径]
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const input = process.argv[2];
if (!input) {
  console.error("用法：node server/migrate-static.js <content.json> [输出路径]");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));

function walk(node) {
  if (Array.isArray(node)) return node.map(walk);
  if (node && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "image" && typeof value === "string" && value.startsWith("/")) out[key] = value.slice(1);
      else if (key === "avatar" && typeof value === "string" && value.startsWith("/")) out[key] = value.slice(1);
      else out[key] = walk(value);
    }
    return out;
  }
  return node;
}

const migrated = walk(raw);
const target = path.resolve(process.argv[3] || path.join(__dirname, "..", "data", "content.json"));
fs.mkdirSync(path.dirname(target), { recursive: true });
if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak-${Date.now()}`);
fs.writeFileSync(target, JSON.stringify(migrated, null, 2) + "\n", "utf8");

const count = (node) => (JSON.stringify(node).match(/"image":"/g) || []).length;
console.log(`✔ 已迁移 ${count(migrated)} 张图片引用 → ${target}`);
