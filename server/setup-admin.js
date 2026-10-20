#!/usr/bin/env node
/* =========================================================
   ふわり Fuwari — 管理员账号初始化
   用法：
     node server/setup-admin.js                 # 交互输入
     node server/setup-admin.js 用户名 新口令    # 直接指定（不建议写进历史记录）
   ========================================================= */
"use strict";

const path = require("node:path");
const readline = require("node:readline/promises");
const { createAuth } = require("./lib/auth");

const DATA_DIR = process.env.FUWARI_DATA_DIR || path.join(__dirname, "..", "data");

async function main() {
  const auth = createAuth(DATA_DIR);
  let user = process.argv[2];
  let pass = process.argv[3];

  if (!user || !pass) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("初始化管理后台账号（口令会以 scrypt 加盐哈希保存，不存明文）\n");
    if (!user) user = (await rl.question(`管理员用户名（回车默认 admin）: `)).trim() || "admin";
    while (!pass || pass.length < 8) {
      pass = await rl.question("口令（至少 8 位）: ");
      if (!pass || pass.length < 8) console.log("  太短啦，再想一个 8 位以上的。");
    }
    rl.close();
  }

  if (!user || user.trim().length < 2) throw new Error("用户名至少 2 个字符");
  if (!pass || pass.length < 8) throw new Error("口令至少 8 位");

  await auth.setPassword(user.trim(), pass);
  console.log(`\n完成 ✔ 用户名：${user.trim()}`);
  console.log(`口令文件：${auth.file}`);
  console.log("启动方式：npm start   然后打开 http://127.0.0.1:8787/admin.html\n");
}

main().catch((error) => {
  console.error("\n初始化失败：", error.message);
  process.exit(1);
});
