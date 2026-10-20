#!/usr/bin/env node
/* =========================================================
   ふわり Fuwari — 博客后端（零依赖 Node 服务）
   · 前台：静态文件 + /api/content
   · 后台：/admin.html（登录后编辑人物资料 / 文章 / 图集 / 合照 / 时间线 / 留言）
   启动：node server/server.js   （或 npm start）
   ========================================================= */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { spawn } = require("node:child_process");

const { createStore, normalizeContent } = require("./lib/store");
const { createAuth, COOKIE } = require("./lib/auth");
const H = require("./lib/http");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.FUWARI_DATA_DIR || path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const PUBLIC_DIR = path.join(ROOT, "public");
const SYNC_SCRIPT = path.join(ROOT, "upload.js");

/** 配置文件里允许写 // 注释（upload.config.json / upload.js 共用同一套宽松解析） */
function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

/* ---------------- GitHub 上传设置（仓库 / 分支 / 令牌都只留在本机 data/，不进仓库） ---------------- */

const UPLOAD_CONFIG = path.join(ROOT, "upload.config.json");
const TOKEN_FILE = path.join(ROOT, "data", "github-token.txt");

function readUploadConfig() {
  try {
    return JSON.parse(stripJsonComments(fs.readFileSync(UPLOAD_CONFIG, "utf8"))) || {};
  } catch (error) {
    return {};
  }
}

async function setUploadConfig(patch) {
  const next = { ...readUploadConfig(), ...patch };
  // 只有 GitHub 相关的键写回文件，其余键（例如用 --file 合并进去的）原样保留
  await fs.promises.writeFile(UPLOAD_CONFIG, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

/** 从令牌文件里读（也认 git 凭据管理器里存的，交给 upload.js 自己去拿） */
function readGitHubToken() {
  try {
    const text = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    return /^(github_pat_|gh[ps]_)/.test(text) ? text : "";
  } catch (error) {
    return "";
  }
}

async function saveGitHubToken(token) {
  if (!/^(github_pat_|gh[ps]_)/.test(token)) throw new Error("这串令牌看起来不对（应该以 github_pat_ 或 ghp_ 开头）");
  await fs.promises.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await fs.promises.writeFile(TOKEN_FILE, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return true;
}

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || process.env.FUWARI_PORT || 8787);
const MAX_UPLOAD = Number(process.env.FUWARI_MAX_UPLOAD_MB || 8) * 1024 * 1024;

/* 允许跨域访问管理后台的站点，逗号分隔，例如
   静态托管页（GitHub Pages）上的 admin.html 连到这里来用
   FUWARI_ADMIN_ORIGINS=https://你的用户名.github.io */
const ADMIN_ORIGINS = String(process.env.FUWARI_ADMIN_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

/** 请求来源：同源返回 ""，在允许名单里返回该 origin，否则返回 null（拒绝） */
function adminOrigin(req) {
  const origin = String(req.headers.origin || "").replace(/\/+$/, "");
  if (!origin) return "";
  let self = "";
  try {
    self = `${(String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http")}://${req.headers.host}`;
  } catch (error) {
    self = "";
  }
  if (origin === self) return "";
  // "null" 来自直接双击打开的本地 HTML（file://），只允许连本机后端：此时同站 Cookie 会被浏览器拦掉，
  // 后台自己会退回到「免 Cookie 的模式」，所以不存在被陌生网页盗用凭据的风险。
  if (origin === "null") return isLocalHost(req) ? "null" : null;
  if (ADMIN_ORIGINS.includes(origin)) return origin;
  return null;
}

/** 请求是否打在本机回环地址上（127.0.0.1 / localhost / ::1） */
function isLocalHost(req) {
  const host = String(req.headers.host || "").toLowerCase();
  return host.startsWith("127.0.0.1") || host.startsWith("localhost") || host.startsWith("[::1]");
}

/** 给一个 HTTP 响应挂上跨域 + Cookie 需要的头 */
function corsHeaders(req, origin) {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Fuwari-Auth",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

/** 认证类 Cookie：跨站访问时要 SameSite=None; Secure 才会被浏览器带上 */
function authCookie(req, origin) {
  const crossSite = Boolean(origin);
  const https = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  return { sameSite: crossSite ? "None" : "Lax", secure: crossSite && https };
}

const store = createStore(DATA_DIR);

/** 监听成功后的回调（桌面启动器用它自动打开浏览器） */
let onReady = null;
const auth = createAuth(DATA_DIR);

/* ---------------- 前台地址（本地页面用相对路径，挂在域名下用环境变量覆盖） ---------------- */

let siteUrl = process.env.SITE_URL || "";

function requestOrigin(req) {
  if (siteUrl) return siteUrl.replace(/\/+$/, "") + "/";
  const host = String(req.headers.host || "").replace(/[^\w.:\-[\]]/g, "");
  const scheme = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  return `${scheme}://${host}/`;
}

/* ---------------- 上传（multipart/form-data） ---------------- */

const IMAGE_SIGNATURES = [
  { mime: "image/jpeg", ext: ".jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: ".png", test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/gif", ext: ".gif", test: (b) => b.slice(0, 3).toString("latin1") === "GIF" },
  { mime: "image/webp", ext: ".webp", test: (b) => b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP" },
  { mime: "image/avif", ext: ".avif", test: (b) => b.slice(4, 12).toString("latin1") === "ftypavif" },
  {
    mime: "image/svg+xml",
    ext: ".svg",
    test: (b) => {
      const head = b.slice(0, 2048).toString("utf8").toLowerCase();
      return head.includes("<svg");
    }
  }
];

function sniffImage(buffer) {
  return IMAGE_SIGNATURES.find((sig) => buffer.length > 16 && sig.test(buffer)) || null;
}

/** 极简 multipart 解析：只取文件 + 普通字段 */
function parseMultipart(buffer, contentType) {
  const match = /boundary=("?)([^";]+)\1/i.exec(contentType || "");
  if (!match) throw Object.assign(new Error("缺少 multipart boundary"), { status: 400 });
  const boundary = Buffer.from(`--${match[2]}`);
  const fields = {};
  let file = null;

  let index = buffer.indexOf(boundary);
  while (index !== -1) {
    const start = index + boundary.length;
    if (buffer.slice(start, start + 2).toString() === "--") break;
    const next = buffer.indexOf(boundary, start);
    if (next === -1) break;
    const part = buffer.slice(start + 2, next - 2); // 去掉开头 CRLF 与结尾 CRLF
    const split = part.indexOf("\r\n\r\n");
    if (split !== -1) {
      const rawHead = part.slice(0, split).toString("utf8");
      const body = part.slice(split + 4);
      const nameMatch = /name="([^"]*)"/i.exec(rawHead);
      const filenameMatch = /filename="([^"]*)"/i.exec(rawHead);
      const name = nameMatch ? nameMatch[1] : "";
      if (filenameMatch) {
        if (name === "file" && body.length) file = { field: name, filename: filenameMatch[1], data: body };
      } else if (name) {
        fields[name] = body.toString("utf8");
      }
    }
    index = next;
  }
  return { fields, file };
}

/* ---------------- 中间件 ---------------- */

const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  buckets.set(key, list);
  return list.length <= max;
}

function clientIP(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

/** 读当前请求携带的登录凭据：优先 httpOnly Cookie，其次 x-fuwari-auth 头（file:// 后台用） */
function authToken(req) {
  const fromCookie = H.parseCookies(req.headers.cookie)[COOKIE];
  if (fromCookie) return fromCookie;
  const fromHeader = String(req.headers["x-fuwari-auth"] || "").trim();
  return fromHeader || "";
}

/** 本机打开的后台窗口（?local=1）免登录：请求要真打在本机回环上，且来源是自己的地址或没有来源 */
function isLocalEditor(req) {
  const flag = String(req.headers["x-fuwari-local"] || "").trim();
  if (flag !== "1" || !isLocalHost(req)) return false;
  return Boolean(selfOrigin(req)) || !String(req.headers.origin || "");
}

/** 这个请求打的是哪个地址（优先用反代给的 x-forwarded-proto） */
function selfOrigin(req) {
  const proto = (String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http").toLowerCase();
  const host = String(req.headers.host || "").toLowerCase();
  return proto && host ? `${proto}://${host}` : "";
}

function isLoggedIn(req) {
  return auth.verifyToken(authToken(req));
}

/** 通过校验后返回会话令牌（本机窗口用 "local"，其余返回 true） */
function sessionToken(req) {
  if (isLocalEditor(req)) return "local";
  return isLoggedIn(req) ? true : "";
}

/* ---------------- API ---------------- */

/**
 * 带 JSONP 兜底的 JSON 输出：
 * 直接双击打开 index.html（file://）时用 <script> 标签取数据，绕开跨域限制。
 */
function sendJSONP(req, res, url, status, data) {
  const callback = String(url.searchParams.get("callback") || "");
  if (status === 200 && /^[A-Za-z_$][\w$]{0,60}$/.test(callback)) {
    H.sendJSON(res, status, data, {
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin"
    }, callback);
    return;
  }
  H.sendJSON(res, status, data, { "Cross-Origin-Resource-Policy": "cross-origin" });
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api/, "") || "/";
  const method = req.method;

  // 跨域策略只在这里设一次：
  //  · 无名（curl/同源）→ 只读接口给 *，方便本地直接打开 HTML
  //  · 白名单来源 → 回显该 origin 并允许带 Cookie（管理后台用）
  const origin = adminOrigin(req);
  // 本机编辑窗口的本地请求（来源就是自己，或没有来源）
  const localEdit = isLocalEditor(req);
  if (origin === null && !localEdit) {
    H.sendJSON(res, 403, { error: "这个来源不允许访问管理后台，请把它加进 FUWARI_ADMIN_ORIGINS" });
    return;
  }
  const cors = corsHeaders(req, origin);
  if (method === "OPTIONS") {
    res.writeHead(204, { Allow: "GET,POST,PUT,OPTIONS", ...cors });
    res.end();
    return;
  }
  if (origin) {
    for (const [key, value] of Object.entries(cors)) res.setHeader(key, value);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "false");
  }

  /* --- 前台 --- */
  if (route === "/content" && method === "GET") {
    const content = store.load();
    sendJSONP(req, res, url, 200, content);
    return;
  }

  if (route === "/notes" && method === "POST") {
    if (!rateLimit(`note:${clientIP(req)}`, 20, 60 * 60 * 1000)) {
      H.sendJSON(res, 429, { error: "一下放太多糖啦，歇一会儿再来吧。" });
      return;
    }
    const body = await H.readJSON(req, 16 * 1024);
    const content = store.load();
    const next = normalizeContent({
      ...content,
      notes: [{ name: body.name, text: body.text, color: body.color, likes: 0 }, ...content.notes]
    });
    if (!next.notes.length) {
      H.sendJSON(res, 400, { error: "写一点什么再放进来吧。" });
      return;
    }
    store.replace(next);
    H.sendJSON(res, 201, { note: next.notes[0] });
    return;
  }

  if (route === "/notes/like" && method === "POST") {
    const body = await H.readJSON(req, 4 * 1024);
    if (!rateLimit(`like:${clientIP(req)}`, 240, 60 * 1000)) {
      H.sendJSON(res, 429, { error: "慢一点，罐子有点忙。" });
      return;
    }
    const content = store.load();
    const note = (content.notes || []).find((n) => n.id === body.id);
    if (!note) {
      H.sendJSON(res, 404, { error: "找不到这颗糖" });
      return;
    }
    note.likes = Math.max(0, note.likes + (body.delta < 0 ? -1 : 1));
    store.replace(content);
    H.sendJSON(res, 200, { id: note.id, likes: note.likes });
    return;
  }

  /* --- 登录 --- */
  if (route === "/login" && method === "POST") {
    if (!auth.exists()) {
      H.sendJSON(res, 503, { error: "还没有设置管理员账号，请先运行：node server/setup-admin.js" });
      return;
    }
    const lock = auth.lockRemaining();
    if (lock > 0) {
      H.sendJSON(res, 429, { error: `输错次数太多，请 ${Math.ceil(lock / 1000)} 秒后再试` });
      return;
    }
    if (!rateLimit(`login:${clientIP(req)}`, 12, 10 * 60 * 1000)) {
      H.sendJSON(res, 429, { error: "尝试太频繁了，休息十分钟吧。" });
      return;
    }
    const body = await H.readJSON(req, 4 * 1024);
    const ok = await auth.verify(body.username, body.password);
    if (!ok) {
      auth.addFail();
      H.sendJSON(res, 401, { error: "用户名或口令不对" });
      return;
    }
    auth.resetFails();
    const token = auth.makeToken();
    H.setCookie(res, COOKIE, token, { maxAge: auth.SESSION_MS, ...authCookie(req, origin) });
    // token 同时回给前端：浏览器存不住跨站 Cookie 时（file:// 或第三方 Cookie 被拦），改用请求头续命
    H.sendJSON(res, 200, { ok: true, username: auth.username(), token });
    return;
  }

  if (route === "/logout" && method === "POST") {
    H.setCookie(res, COOKIE, "", { maxAge: 0, ...authCookie(req, origin) });
    H.sendJSON(res, 200, { ok: true });
    return;
  }

  if (route === "/session" && method === "GET") {
    H.sendJSON(res, 200, {
      loggedIn: Boolean(sessionToken(req)),
      local: isLocalEditor(req),
      setup: auth.exists(),
      username: auth.username()
    });
    return;
  }

  const session = sessionToken(req);
  if (!session) {
    H.sendJSON(res, 401, { error: "还没有登录，请先登录管理后台" });
    return;
  }

  /* --- 需要登录的部分 --- */

  if (route === "/content" && (method === "PUT" || method === "POST")) {
    const body = await H.readJSON(req, 4 * 1024 * 1024);
    // dryRun：只做校验、顺便刷新「相当于已上传」的时间戳，不落盘（自检用）
    if (body && body.dryRun) {
      store.save(store.load());
      H.sendJSON(res, 200, { ok: true, dryRun: true });
      return;
    }
    const next = store.save(body);
    H.sendJSON(res, 200, { ok: true, updatedAt: next.updatedAt });
    return;
  }

  /* 一键上传到 GitHub：跑 upload.js 并把它的输出一点点送给后台窗口 */
  if (route === "/sync" && method === "GET") {
    const reportFile = path.join(DATA_DIR, "sync-report.json");
    const cfgFile = path.join(ROOT, "upload.config.json");
    let config = {};
    try {
      config = JSON.parse(stripJsonComments(fs.readFileSync(cfgFile, "utf8")));
    } catch (error) {
      config = {};
    }
    let report = null;
    try {
      report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    } catch (error) {
      report = null;
    }
    const content = store.load();
    H.sendJSON(res, 200, {
      configured: Boolean(config.repo),
      repo: config.repo || "",
      branch: config.branch || "main",
      pages: config.pages || "",
      report,
      dirty: !report || String(report.pushedAt || "") < String(content.updatedAt || "")
    });
    return;
  }

  // 保存 GitHub 上传设置（第一次点「上传到 GitHub」时由后台窗口填好再调这里）
  if (route === "/sync/setup" && method === "POST") {
    const body = await H.readJSON(req, 512);
    const repo = String(body.repo || "").trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      H.sendJSON(res, 400, { error: "仓库地址应该是 owner/名称 这样" });
      return;
    }
    setUploadConfig({ repo, branch: body.branch || "main" });
    if (body.pages) setUploadConfig({ pages: String(body.pages).trim() });
    if (body.token) {
      try {
        await saveGitHubToken(String(body.token).trim());
      } catch (error) {
        H.sendJSON(res, 400, { error: error.message });
        return;
      }
    }
    H.sendJSON(res, 200, { ok: true, repo });
    return;
  }

  if (route === "/sync" && method === "POST") {
    if (!fs.existsSync(SYNC_SCRIPT)) {
      H.sendJSON(res, 503, { error: "找不到 upload.js，没法上传" });
      return;
    }
    // 令牌只用服务器上存好的 GitHub 令牌，避免把登录令牌写进临时文件
    const token = readGitHubToken();
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no"
    });
    // 设置以服务器上为准；上传完再把「仓库 / 令牌」回写给后台窗口（下回接着用）
    const outConfig = path.join(DATA_DIR, "sync-input.tmp.json");
    try {
      fs.rmSync(outConfig, { force: true });
    } catch (error) {
      /* 没有就算了 */
    }
    const cfg = readUploadConfig();
    const full = /[?&]full=1(&|$)/.test(req.url || "");
    const args = [SYNC_SCRIPT, "--stdin", "--out-config", outConfig];
    // 网页代码是否一起推：第一次往空仓库推时必然要推；「连网页代码一起重传」按钮显式要求
    if (full) args.push("--with-site");
    if (cfg.repo) args.push("--repo", cfg.repo);
    if (cfg.branch) args.push("--branch", cfg.branch);
    if (cfg.dataPath) args.push("--data-path", cfg.dataPath);
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    // 令牌从标准输入递过去，不出现在命令行参数里（任务管理器/ps 都看不到）
    if (token) child.stdin.write(`${token}\n`);
    child.stdin.end();
    const send = (obj) => {
      if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n");
    };
    const feed = (chunk) => {
      String(chunk)
        .split(/\r?\n/)
        .map((line) => line.replace(/\x1b\[[0-9;]*m/g, "").trimEnd())
        .filter((line) => line.length)
        .forEach((line) => send({ type: "log", text: line }));
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", (error) => send({ type: "done", ok: false, error: error.message }));
    child.on("close", (code) => {
      if (res.writableEnded) return;
      send({ type: "done", ok: code === 0, code });
      res.end();
    });
    // 注意：不能用 req.on("close") 去杀进程——请求体读完后它也触发，会把上传拦腰打断
    return;
  }

  if (route === "/content/reset" && method === "POST") {
    store.reset();
    H.sendJSON(res, 200, { ok: true });
    return;
  }

  if (route === "/image" && method === "POST") {
    const type = String(req.headers["content-type"] || "");
    if (type.startsWith("image/")) {
      const buffer = await H.readBody(req, MAX_UPLOAD);
      const sig = sniffImage(buffer);
      if (!sig) {
        H.sendJSON(res, 400, { error: "这不是一张能识别的图片" });
        return;
      }
      if (sig.mime === "image/svg+xml") {
        const head = buffer.slice(0, 2048).toString("utf8");
        if (/<script|javascript:|onload=|onerror=/i.test(head)) {
          H.sendJSON(res, 400, { error: "SVG 里含有脚本，为了安全没有保存" });
          return;
        }
      }
      const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${sig.ext}`;
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
      H.sendJSON(res, 201, { url: `uploads/${name}`, size: buffer.length });
      return;
    }
    if (type.startsWith("multipart/form-data")) {
      if (!rateLimit(`upload:${clientIP(req)}`, 60, 60 * 1000)) {
        H.sendJSON(res, 429, { error: "上传太频繁了" });
        return;
      }
      const buffer = await H.readBody(req, MAX_UPLOAD);
      const { file } = parseMultipart(buffer, type);
      if (!file) {
        H.sendJSON(res, 400, { error: "没有收到文件" });
        return;
      }
      const sig = sniffImage(file.data);
      if (!sig) {
        H.sendJSON(res, 400, { error: "只支持 JPG / PNG / WebP / GIF / AVIF / SVG" });
        return;
      }
      if (sig.mime === "image/svg+xml") {
        const head = file.data.slice(0, 2048).toString("utf8");
        if (/<script|javascript:|onload=|onerror=/i.test(head)) {
          H.sendJSON(res, 400, { error: "SVG 里含有脚本，为了安全没有保存" });
          return;
        }
      }
      const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${sig.ext}`;
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, name), file.data);
      H.sendJSON(res, 201, { url: `uploads/${name}`, size: file.data.length });
      return;
    }
    H.sendJSON(res, 415, { error: "请用图片文件上传" });
    return;
  }

  if (route === "/uploaded" && method === "GET") {
    const files = fs.existsSync(UPLOAD_DIR)
      ? fs
          .readdirSync(UPLOAD_DIR)
          .filter((f) => !f.startsWith("."))
          .map((f) => {
            const stat = fs.statSync(path.join(UPLOAD_DIR, f));
            return { url: `uploads/${f}`, name: f, size: stat.size, time: stat.mtimeMs };
          })
          .sort((a, b) => b.time - a.time)
      : [];
    H.sendJSON(res, 200, { files });
    return;
  }

  if (route === "/password" && method === "POST") {
    const body = await H.readJSON(req, 4 * 1024);
    if (!(await auth.verify(auth.username(), body.current))) {
      H.sendJSON(res, 400, { error: "当前口令不对" });
      return;
    }
    const next = String(body.next || "");
    if (next.length < 8) {
      H.sendJSON(res, 400, { error: "新口令至少 8 位" });
      return;
    }
    await auth.setPassword(String(body.username || auth.username()).trim(), next);
    const token = auth.makeToken();
    H.setCookie(res, COOKIE, token, { maxAge: auth.SESSION_MS, ...authCookie(req, origin) });
    H.sendJSON(res, 200, { ok: true, token });
    return;
  }

  if (route === "/backup" && method === "GET") {
    const content = store.load();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`fuwari-backup-${new Date().toISOString().slice(0, 10)}.json`)}`
    });
    res.end(JSON.stringify(content, null, 2));
    return;
  }

  H.sendJSON(res, 404, { error: "接口不存在" });
}

/* ---------------- 静态文件 ---------------- */

async function handleStatic(req, res, url) {
  let pathname = url.pathname;

  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin") pathname = "/admin.html";

  // 后台界面放在 public/
  if (pathname.startsWith("/admin")) {
    const target = H.resolveInside(PUBLIC_DIR, pathname);
    if (!target || target.isDir) {
      H.sendText(res, 404, "404");
      return;
    }
    if (!target.exists) {
      H.sendText(res, 404, "管理后台文件缺失（public/admin.html）");
      return;
    }
    H.serveFile(req, res, target.file, { cache: "no-cache" });
    return;
  }

  // 上传的图片
  if (pathname.startsWith("/uploads/")) {
    const target = H.resolveInside(UPLOAD_DIR, pathname.slice("/uploads".length));
    if (!target || !target.exists || target.isDir) {
      H.sendText(res, 404, "404");
      return;
    }
    H.serveFile(req, res, target.file, { cache: "public, max-age=31536000, immutable" });
    return;
  }

  // 作品目录里的前台文件
  const target = H.resolveInside(ROOT, pathname);
  if (!target) {
    H.sendText(res, 403, "403");
    return;
  }

  const blocked = [DATA_DIR, path.join(ROOT, "server"), path.join(ROOT, "node_modules")];
  const relFromRoot = path.relative(ROOT, target.file);
  const blockedHit = blocked.some((dir) => {
    const rel = path.relative(dir, target.file);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
  if (blockedHit) {
    H.sendText(res, 403, "403 · 这里不对访客开放");
    return;
  }

  if (target.isDir) {
    const indexFile = path.join(target.file, "index.html");
    if (fs.existsSync(indexFile)) {
      H.serveFile(req, res, indexFile, { cache: "no-cache" });
    } else {
      H.sendText(res, 404, "404");
    }
    return;
  }

  if (!target.exists) {
    H.sendText(res, 404, "404 · 这里什么都没有");
    return;
  }

  const ext = path.extname(target.file).toLowerCase();
  const isHtml = ext === ".html";
  H.serveFile(req, res, target.file, { cache: isHtml ? "no-cache" : "public, max-age=3600" });
}

/* ---------------- 修正后的前台页面（注入 API 地址） ---------------- */

function injectConfig(html, origin) {
  const apiBase = JSON.stringify(origin.replace(/\/+$/, ""));
  return html.replace(
    "<!--FUWARI:CONFIG-->",
    `<script>window.FUWARI_CONFIG = { apiBase: ${apiBase}, adminUrl: "admin.html" };</script>`
  );
}

function serveHome(req, res) {
  const file = path.join(ROOT, "index.html");
  fs.readFile(file, "utf8", (error, html) => {
    if (error) {
      H.sendText(res, 500, "index.html 读取失败");
      return;
    }
    const body = Buffer.from(
      html.replace(
        "<!--FUWARI:CONFIG-->",
        `<script>window.FUWARI_CONFIG = { apiBase: ${JSON.stringify(requestOrigin(req).replace(/\/+$/, ""))}, adminUrl: "admin.html" };</script>`
      ),
      "utf8"
    );
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-cache"
    });
    res.end(body);
  });
}

/* ---------------- 服务 ---------------- */

/** 由启动脚本（server/desktop.js）注入：端口起来后做点事，比如打开浏览器 */
function setReadyHook(fn) {
  onReady = typeof fn === "function" ? fn : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");

  if (req.method === "OPTIONS" && url.pathname.startsWith("/api")) {
    await handleApi(req, res, url);
    return;
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if ((url.pathname === "/" || url.pathname === "/index.html") && (req.method === "GET" || req.method === "HEAD")) {
      serveHome(req, res);
      return;
    }
    await handleStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("[fuwari]", error);
    if (!res.headersSent) H.sendJSON(res, status, { error: error.message || "服务器出了点小问题" });
    else res.end();
  }
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 端口被占用多半是已经开着一个（网页编辑窗口没关干净），直接说清楚而不是抛一堆栈
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n  ✗ 端口 ${PORT} 已经被占用了：可能已经开着一个编辑窗口。`);
    console.error(`    先关掉它，或者换端口再来：PORT=8788 npm start\n`);
  } else {
    console.error(`\n  ✗ 后端启动失败：${error.message}\n`);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const base = `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`;
  console.log("");
  console.log("  ✿ ふわり Fuwari 已经开好了");
  console.log(`  · 博客首页   ${base}/`);
  console.log(`  · 管理后台   ${base}/admin.html`);
  console.log(`  · 数据文件   ${path.relative(ROOT, store.file)}`);
  console.log(`  · 图片目录   ${path.relative(ROOT, UPLOAD_DIR)}`);
  if (!auth.exists()) {
    console.log("");
    console.log("  ⚠ 还没有管理员账号：先运行 node server/setup-admin.js");
  }
  console.log("");
  if (typeof onReady === "function") {
    try {
      onReady({ base });
    } catch (error) {
      console.error("[fuwari] 启动回调出错：", error);
    }
  }
});

module.exports = { server, injectConfig, setReadyHook };
