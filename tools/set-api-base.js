#!/usr/bin/env node
/**
 * 生成/更新 assets/js/api-config.js
 * 用法：node tools/set-api-base.js https://你的域名
 *       node tools/set-api-base.js ""     ← 清空（改回默认）
 */
const fs = require("fs");
const path = require("path");

const RAW = process.argv[2];
if (RAW === undefined) {
  console.log("用法：node tools/set-api-base.js https://你的域名");
  process.exit(1);
}
const base = String(RAW).trim().replace(/\/+$/, "");
if (base && !/^https?:\/\//i.test(base)) {
  console.error("后端地址要以 http:// 或 https:// 开头");
  process.exit(1);
}
const target = path.join(__dirname, "..", "assets", "js", "api-config.js");
const body = [
  "/* 由 tools/set-api-base.js 生成 —— 前台和后台都会读这个文件拿到后端地址 */",
  `window.FUWARI_API = ${JSON.stringify(base)};`,
  ""
].join("\n");
fs.writeFileSync(target, body, "utf8");
console.log(base ? `已写入后端地址：${base}` : "已清空后端地址（回退到同源 /api 或 data/content.json）");
