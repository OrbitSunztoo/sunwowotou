#!/usr/bin/env node
/* =========================================================
   ふわり Fuwari — 本地编辑（桌面启动器）
   ---------------------------------------------------------
   双击「打开后台.cmd」会跑这个文件：
     1. 把 Windows 自带的 Node 运行时搬到 .runtime/（只做一次）
     2. 没有管理员口令就生成一个随机口令写进 data/desktop-account.txt
     3. 启动后端，用 Edge 的「应用窗口」打开管理后台
     4. 关掉那个窗口 → 后端自动退出
   也可以在命令行直接跑：node server/desktop.js
   ========================================================= */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.FUWARI_DATA_DIR || path.join(ROOT, "data");
const PORT = Number(process.env.PORT || process.env.FUWARI_PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;

const NO_WINDOW = { windowsHide: true };
const quiet = process.argv.includes("--no-open");

/* ---------------- 终端输出 ---------------- */

const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const lav = color("38;5;140");
const dim = color("2");
const ok = color("32");
const warn = color("33");
const bad = color("31");

const line = (text = "") => console.log(text);
const blank = () => console.log("");

/* ---------------- 运行时（在没有 .runtime 时才用系统 node 自己跑） ---------------- */

function nodeExe() {
  const exe = path.join(ROOT, ".runtime", "node.exe");
  return fs.existsSync(exe) ? exe : process.execPath;
}

/* ---------------- 浏览器 ---------------- */

function findBrowser() {
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || "";
}

/**
 * 用「应用窗口」(--app) 打开后台：看起来像一个独立的小软件，关掉窗口就等于关掉编辑。
 * 用一个独立的 profile 目录，免得和你平时的浏览记录、书签混在一起。
 */
function openEditor(url) {
  if (quiet) {
    line(`  ${dim("（--no-open）请手动打开 " + url)}`);
    return null;
  }
  const browser = findBrowser();
  if (!browser) {
    line(warn("  没找到 Edge / Chrome，已经用默认浏览器打开啦"));
    openExternal(url);
    return null;
  }
  const profile = path.join(process.env.LOCALAPPDATA || DATA_DIR, "FuwariEditor");
  try {
    fs.mkdirSync(profile, { recursive: true });
  } catch (error) {
    /* 建不出来就用临时目录 */
  }
  const child = spawn(
    browser,
    [
      `--app=${url}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=Translate",
      "--window-size=1280,900"
    ],
    { detached: false, stdio: "ignore", windowsHide: false }
  );
  child.on("error", () => openExternal(url));
  return child;
}

function openExternal(url) {
  if (process.platform === "win32") {
    spawn(process.env.ComSpec || "cmd.exe", ["/c", "start", "", url], { ...NO_WINDOW, detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

/* ---------------- 首次使用的账号 ---------------- */

async function ensureAccount() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const authFile = path.join(DATA_DIR, "auth.json");
  if (fs.existsSync(authFile)) return null;
  const { createAuth } = require("./lib/auth");
  const auth = createAuth(DATA_DIR);
  const password = crypto.randomBytes(5).toString("hex");
  const username = "admin";
  await auth.setPassword(username, password);
  const note = path.join(DATA_DIR, "desktop-account.txt");
  fs.writeFileSync(
    note,
    `ふわり Fuwari 管理后台（本机编辑窗口）\n\n用户名：${username}\n口令：${password}\n\n` +
      `本机编辑窗口是免登录的，这个口令只在「远程访问后台」或「部署到服务器」时才用得上。\n` +
      `想改口令：后台「账号与备份」→ 填新口令 → 更新账号。\n` +
      `忘记口令：删掉本文件旁边的 auth.json，再双击「打开后台.cmd」会重新生成一个。\n`,
    "utf8"
  );
  return { username, password };
}

/* ---------------- 端口探测 ---------------- */

function ping(timeout = 800) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}/api/session`, { timeout }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

/* ---------------- 主流程 ---------------- */

async function main() {
  blank();
  line(lav("  ✿ ふわり Fuwari · 本地编辑"));
  blank();

  if (await ping()) {
    line(warn("  已经有一个编辑窗口开着啦，直接帮你打开它"));
    openEditor(`${BASE}/admin.html?local=1`);
    line(dim("  关掉那个窗口就等于关掉编辑（这个提示可以按任意键关闭）"));
    return;
  }

  try {
    const account = await ensureAccount();
    if (account) {
      line(`  第一次使用，帮你建好了管理员账号：`);
      line(`    ${ok("用户名 " + account.username)}   ${ok("口令 " + account.password)}`);
      line(dim(`    也已经写进 data/desktop-account.txt，忘了可以回来看`));
      blank();
    }
  } catch (error) {
    line(bad(`  账号初始化失败：${error.message}`));
  }

  const upload = path.join(ROOT, "upload.js");
  if (!fs.existsSync(upload)) {
    line(warn("  没找到 upload.js，上传功能会不可用"));
  }

  process.env.PORT = String(PORT);
  process.env.HOST = HOST;

  const { setReadyHook } = require("./server");
  let child = null;

  setReadyHook(() => {
    // ?local=1：这个地址只听本机回环，所以编辑窗口直接进后台，不用先登录；
    // 账号口令仍然存在（以后部署到服务器时用），也能在「账号与备份」里改
    const url = `${BASE}/admin.html?local=1`;
    blank();
    line(`  ${ok("编辑窗口已经打开")}   ${dim(url)}`);
    line(dim("  改完点「保存修改」，再点「上传到 GitHub」就会更新线上网站"));
    blank();
    child = openEditor(url);
    if (child) {
      child.on("exit", () => {
        line("");
        line(dim("  编辑窗口关掉了，正在保存并退出…"));
        setTimeout(() => process.exit(0), 300);
      });
    }
  });

  // 直接在当前进程里起服务（这样窗口一关就能干净退出）
  require("./server");
}

main().catch((error) => {
  console.error(bad(`  启动失败：${error.message}`));
  process.exit(1);
});
