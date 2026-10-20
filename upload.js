#!/usr/bin/env node
/* =========================================================
   ふわり Fuwari — 一键上传到 GitHub
   ---------------------------------------------------------
   把本地改好的内容（data/content.json）和上传的图片（uploads/）
   直接推到 GitHub 仓库，Pages 一会儿就会自动更新。

   用法：
     node upload.js                  # 直接上传
     node upload.js --dry-run        # 只看会推哪些文件，不真的推
     node upload.js --set-token      # 重新设置 GitHub 令牌
     node upload.js --repo owner/名称 --branch main --message "改了什么"

   需要的 GitHub fine-grained token 权限：
     Repository permissions → Contents: Read and write
   ========================================================= */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { execFileSync } = require("node:child_process");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "content.json");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const CONFIG_FILE = path.join(ROOT, "upload.config.json");
const REPORT_FILE = path.join(ROOT, "data", "sync-report.json");

const API = "https://api.github.com";
const UA = "fuwari-uploader";
const MAX_W = 1600;
const QUALITY = 82;
const WEBP_EXT = new Set([".png", ".jpg", ".jpeg"]);
const RAW_EXT = new Map([
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".avif", "image/avif"]
]);

/* ---------------- 小工具 ---------------- */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  lav: (s) => `\x1b[38;5;140m${s}\x1b[0m`
};

const log = (...args) => console.log(...args);
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

function stripJsonComments(text) {
  // 允许 upload.config.json 里写 // 注释（配置方便说明）
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
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function readConfig() {
  const defaults = { repo: "", branch: "main", dataPath: "content.json", user: "", email: "" };
  if (!fs.existsSync(CONFIG_FILE)) return defaults;
  try {
    const raw = JSON.parse(stripJsonComments(fs.readFileSync(CONFIG_FILE, "utf8")));
    return { ...defaults, ...raw };
  } catch (error) {
    console.error(c.err(`upload.config.json 不是合法的 JSON：${error.message}`));
    process.exit(1);
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

/* ---------------- 命令行参数 ---------------- */

function parseArgs(argv) {
  const out = { flags: new Set(), opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.opts[key] = next;
        i += 1;
      } else {
        out.flags.add(key);
      }
    }
  }
  return out;
}

/* ---------------- GitHub 令牌 ---------------- */

function tokenFromGitCredentialManager(owner) {
  // 本机 git 之前推过这个仓库时，凭据管理器里可能已经有令牌（不额外安装任何东西）
  const targets = [
    ["credential", "fill"],
    ["credential", "fill", "--host", "github.com", "--protocol", "https"]
  ];
  for (const args of targets) {
    try {
      const input = `protocol=https\nhost=github.com\npath=${owner}\n\n`;
      const output = execFileSync("git", args, { input, encoding: "utf8", timeout: 8000, stdio: ["pipe", "pipe", "ignore"] });
      const match = output.match(/^password=(.+)$/m);
      if (match && match[1].trim()) return match[1].trim();
    } catch (error) {
      /* 没装 git 或没有凭据，继续找下一个办法 */
    }
  }
  return "";
}

function tokenFile() {
  return path.join(ROOT, "data", "github-token.txt");
}

function savedToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    const value = fs.readFileSync(tokenFile(), "utf8").trim();
    if (value) return value;
  } catch (error) {
    /* 还没有保存过 */
  }
  return "";
}

function saveToken(token) {
  fs.mkdirSync(path.dirname(tokenFile()), { recursive: true });
  fs.writeFileSync(tokenFile(), token.trim() + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tokenFile(), 0o600);
  } catch (error) {
    /* windows 上不一定支持 */
  }
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/* ---------------- 仓库地址 ---------------- */

function normalizeRepo(input) {
  // 接受 owner/名称、完整 https 地址、末尾带 .git 的写法，统一成 owner/名称
  let value = String(input || "").trim();
  value = value.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  value = value.replace(/\.git$/i, "").replace(/\/+$/, "");
  return /^[\w.-]+\/[\w.-]+$/.test(value) ? value : "";
}

/* ---------------- 第一次使用的引导 ---------------- */

async function runSetup() {
  let config = readConfig();
  log("");
  log("  第一次使用，先设置一下要传到哪个 GitHub 仓库（设置好之后都会记住）");
  log("");
  for (;;) {
    const answer = await prompt("  仓库（owner/名称，也可以直接粘贴 https://github.com/owner/名称）：");
    const norm = normalizeRepo(answer);
    if (norm) {
      config = writeConfig({ repo: norm });
      log(c.ok(`  ✓ 仓库记下了：${norm}`));
      break;
    }
    console.error(c.err("  这个地址看起来不太对，应该是 owner/名称 这样"));
  }

  log("");
  log("  还需要一串 GitHub 令牌（只保存在本机 data/github-token.txt，不会被上传）");
  log(c.dim("  1. 打开 https://github.com/settings/personal-access-tokens/new"));
  log(c.dim(`  2. Repository access → Only select repositories → 勾上 ${config.repo}`));
  log(c.dim("  3. Permissions → Repository permissions → Contents 选 Read and write"));
  log(c.dim("  4. 点最下面的 Generate token，把 github_pat_ 开头的一整串粘贴到这里"));
  log("");
  const token = await prompt("  GitHub 令牌：");
  if (!token) {
    console.error(c.err("  没有令牌就没法上传哦，下次运行会重新问你"));
    process.exit(1);
  }
  saveToken(token);
  log(c.ok("  令牌已经保存在本机了，以后不用再输 ✿"));
  log("");
  return { config, token };
}

/* ---------------- 网站本身（第一次往空仓库上传时用） ---------------- */

const SITE_DIRS = ["assets", "public", "uploads", "docs"];
const SITE_FILES = [
  "index.html",
  "couple.html",
  "README.md",
  "DEPLOY.md",
  "package.json",
  ".gitignore",
  ".github/workflows/pages.yml",
  "upload.js",
  "server/server.js",
  "server/desktop.js",
  "server/setup-admin.js",
  "server/migrate-static.js",
  "server/lib/auth.js",
  "server/lib/defaults.js",
  "server/lib/http.js",
  "server/lib/store.js",
  "打开后台.cmd",
  "上传到GitHub.cmd"
];
const SITE_SKIP = new Set(["node_modules", "data", ".runtime", ".git", ".qa", ".qa2", ".build", ".push", ".push3", ".gh", ".publish"]);
// 这些是「本地才有意义」的文件，传上去也没用（甚至会被误用）
const SITE_SKIP_REL = new Set(["upload.config.json", "assets/js/api-config.js"]);

// 更新管理后台自己时，本地正在被这个接口调用的 upload.js 可能被覆盖：
// 先写临时文件，成功后 mv 覆盖（Windows 也能原子替换），保证正在跑的这一次不受影响
function writeAtomically(abs, data) {
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, abs);
  } catch (error) {
    try {
      fs.copyFileSync(tmp, abs);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch (ignored) {
        /* 无所谓的清理 */
      }
    }
  }
}

async function collectSite() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SITE_SKIP.has(entry.name)) continue;
        walk(abs, relPath);
      } else if (entry.isFile()) {
        if (SITE_SKIP_REL.has(relPath)) continue;
        if (/\.(md|cmd|ps1)$/i.test(relPath) && relPath !== "README.md") continue;
        out.push({ rel: relPath, data: fs.readFileSync(abs) });
      }
    }
  };
  for (const dir of SITE_DIRS) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs)) walk(abs, dir);
  }
  for (const file of SITE_FILES) {
    const abs = path.join(ROOT, file);
    if (fs.existsSync(abs)) out.push({ rel: file, data: fs.readFileSync(abs) });
  }
  return out;
}

/* ---------------- GitHub API ---------------- */

function makeApi(token) {
  return async function api(urlPath, init = {}) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let res;
      try {
        res = await fetch(API + urlPath, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": UA,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(init.headers || {})
          }
        });
      } catch (error) {
        if (attempt === 2) throw new Error(`连不上 GitHub（网络不稳定）：${error.message}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const text = await res.text();
      let body = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch (error) {
        /* 非 JSON 响应 */
      }
      if (res.ok) return body;
      const message = (body && body.message) || String(text).slice(0, 160);
      if (res.status === 401) throw new Error("GitHub 令牌无效或过期了（401），请重新设置令牌");
      if (res.status === 403 && /rate limit/i.test(message)) throw new Error("GitHub 接口限流了，等几分钟再试");
      if (res.status >= 500 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw new Error(`GitHub 返回 ${res.status}：${message}`);
    }
    return null;
  };
}

async function resolveRef(api, repo, branch) {
  try {
    const ref = await api(`/repos/${repo}/git/ref/heads/${branch}`);
    return ref.object.sha;
  } catch (error) {
    if (!/404/.test(error.message)) throw error;
    // 空仓库（还没提交过任何东西）：先建一个空的初始提交
    log(c.dim("  仓库还是空的，先建一个初始提交…"));
    const commit = await api(`/repos/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: "初始化仓库", tree: [] })
    });
    await api(`/repos/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha })
    });
    return commit.sha;
  }
}

/* ---------------- 图片压缩（有 sharp 就用 sharp） ---------------- */

async function loadSharp() {
  try {
    return require("sharp");
  } catch (error) {
    return null;
  }
}

async function convertImage(abs, rel) {
  const ext = path.extname(abs).toLowerCase();
  if (!WEBP_EXT.has(ext)) {
    const mime = RAW_EXT.get(ext);
    if (!mime) return null;
    return { rel, data: fs.readFileSync(abs), converted: false, mime };
  }
  const sharp = await loadSharp();
  if (!sharp) {
    // 没装 sharp：不能压缩，只能原样推（可能比较大）
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return { rel, data: fs.readFileSync(abs), converted: false, mime, noSharp: true };
  }
  try {
    let img = sharp(abs, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    if ((meta.width || 0) > MAX_W) img = img.resize({ width: MAX_W, withoutEnlargement: true });
    const data = await img.webp({ quality: QUALITY, effort: 5 }).toBuffer();
    const target = rel.replace(/\.(png|jpe?g)$/i, ".webp");
    // 压完反而更大（小图标之类）就保留原图
    if (data.length >= fs.statSync(abs).size) {
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      return { rel, data: fs.readFileSync(abs), converted: false, mime };
    }
    return { rel: target, data, converted: true, mime: "image/webp" };
  } catch (error) {
    log(c.warn(`  ${path.basename(abs)} 压缩失败（${error.message}），原样上传`));
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return { rel, data: fs.readFileSync(abs), converted: false, mime };
  }
}

/* ---------------- 主流程 ---------------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let config = readConfig();

  if (args.opts.repo) config = writeConfig({ repo: args.opts.repo });
  if (args.opts.branch) config = writeConfig({ branch: args.opts.branch });
  if (args.opts["data-path"]) config = writeConfig({ dataPath: args.opts["data-path"] });

  log("");
  log(c.lav("  ✿ ふわり · 一键上传到 GitHub"));
  log("");

  /* 1. 推送设置：仓库 + 令牌
        第一次（upload.config.json 里还没有仓库）走一遍引导；
        之后从「上传到GitHub.cmd」进来时，这些设置已经在网页上填好了（见 --file/--stdin） */
  let token = args.opts.token || "";
  try {
    for (const file of args.opts.file || []) {
      if (fs.existsSync(file)) config = writeConfig(JSON.parse(fs.readFileSync(file, "utf8")));
    }
  } catch (error) {
    // 从网页里传过来的设置读不出来就算了，退回手动 / 已保存的设置
    log(c.warn(`  网页里填的设置没读出来（${error.message}），用本机已经保存的设置`));
  }
  const stdinValues = args.flags.has("stdin") ? (fs.readFileSync(0, "utf8") || "").split(/\r?\n/) : [];
  const stdinToken = (stdinValues.find((v) => /^github_pat_|^gh[ps]_/.test(v)) || "").trim();
  if (stdinToken) token = stdinToken;

  // 还没设置过（没有仓库）就引导一次；--dry-run 只看文件，不需要设置
  let askedNow = false;
  if (!config.repo && !args.flags.has("dry-run")) {
    const setup = await runSetup();
    config = setup.config;
    if (setup.token) token = setup.token;
    askedNow = true;
  }
  const [owner] = config.repo.split("/");

  if (!token && !args.flags.has("dry-run")) {
    token = savedToken();
    if (args.flags.has("set-token")) token = "";
    if (!token) token = tokenFromGitCredentialManager(owner);
  }
  if (!token && !args.flags.has("dry-run")) {
    log(c.dim("  还需要一串 GitHub 令牌（只保存在本机 data/github-token.txt）"));
    log(c.dim("  打开 https://github.com/settings/personal-access-tokens/new ，"));
    log(c.dim("  只勾这个仓库的 Contents → Read and write，生成后粘贴到这里"));
    token = await prompt("  GitHub 令牌：");
    if (!token) {
      console.error(c.err("  没有令牌就没法上传哦，下次再运行会重新问你"));
      process.exit(1);
    }
    saveToken(token);
    log(c.ok("  令牌已经保存在本机了，下次不用再输 ✿"));
  }

  /* 2. 本地内容 */
  if (!fs.existsSync(DATA_FILE)) {
    console.error(c.err("  找不到 data/content.json：先在管理后台保存一次，或者 npm start 生成"));
    process.exit(1);
  }
  const content = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const reportPath = path.join(path.dirname(DATA_FILE), "sync-report.json");
  const report = (() => {
    try {
      return JSON.parse(fs.readFileSync(reportPath, "utf8"));
    } catch (error) {
      return null;
    }
  })();

  /* 3. 收集要推的文件 */
  const uploadFiles = fs.existsSync(UPLOAD_DIR)
    ? fs
        .readdirSync(UPLOAD_DIR)
        .filter((f) => !f.startsWith("."))
        .map((f) => path.join(UPLOAD_DIR, f))
    : [];

  log(c.dim(`  仓库：${config.repo}（分支 ${config.branch}）`));
  log(c.dim(`  本地：${content.articles.length} 篇文章 / ${content.gallery.length} 张图集 / ${content.wall.length} 张合照 / ${content.notes.length} 条留言 / ${uploadFiles.length} 个上传文件`));
  log("");

  /* 4. 处理图片：能压就压成 webp */
  const done = [];
  const renames = new Map(); // 资源原地址 → 仓库里的新地址
  if (uploadFiles.length) {
    const sharp = await loadSharp();
    if (!sharp && uploadFiles.some((f) => WEBP_EXT.has(path.extname(f).toLowerCase()))) {
      log(c.warn("  没装 sharp，图片会原样上传（在文件夹里运行一次 npm install 就能自动压缩）"));
    }
    for (const abs of uploadFiles) {
      const rel = `uploads/${path.basename(abs)}`;
      const result = await convertImage(abs, rel);
      if (!result) continue;
      done.push(result);
      if (result.converted) renames.set(rel, result.rel);
    }
  }

  /* 5. 内容里的图片地址跟着换 */
  const json = JSON.stringify(content, (key, value) => {
    if (typeof value === "string" && renames.has(value)) return renames.get(value);
    return value;
  });
  const finalContent = JSON.parse(json);
  const dataBuf = Buffer.from(JSON.stringify(finalContent, null, 2) + "\n", "utf8");

  const totalBefore = uploadFiles.reduce((sum, abs) => sum + fs.statSync(abs).size, 0);
  const totalAfter = done.reduce((sum, f) => sum + f.data.length, 0);
  if (done.length) {
    log(`  图片：${done.length} 个，${kb(totalBefore)} → ${kb(totalAfter)}${renames.size ? c.dim(`（${renames.size} 张转成 webp）`) : ""}`);
  }
  log(`  内容：content.json ${kb(dataBuf.length)}`);
  if (renames.size) log(c.dim(`  ${renames.size} 处图片地址已经自动改成 .webp`));

  // 从管理后台点「上传到 GitHub」时，网页那边要读一份设置（仓库 / 分支 / 页面地址）
  // 只写非敏感信息：令牌留在 data/github-token.txt，不进这个临时文件
  if (args.opts["out-config"]) {
    const payload = { repo: config.repo, branch: config.branch, pages: config.pages || "" };
    const target = args.opts["out-config"];
    try {
      fs.writeFileSync(target, JSON.stringify(payload));
      fs.chmodSync(target, 0o600);
    } catch (error) {
      log(c.warn(`  设置文件写不了：${error.message}`));
    }
  }

  if (args.flags.has("dry-run")) {
    log("");
    log(c.ok("  干跑模式：没有真的上传。会推这些文件："));
    for (const f of done) log(c.dim(`    ${f.rel}`));
    log(c.dim(`    ${config.dataPath}`));
    log("");
    return;
  }

  /* 6. 推上去 */
  const api = makeApi(token);
  let me = null;
  try {
    me = await api("/user");
  } catch (error) {
    if (/401/.test(error.message) && !args.flags.has("set-token")) {
      console.error(c.err("  GitHub 令牌无效或过期了（401）"));
      console.error(c.dim("  再运行一次「上传到GitHub.cmd」，这次会重新问你一串新令牌："));
      // 坏令牌清掉，下次重新问一串新的
      if (askedNow) writeConfig({ repo: "" });
      // 坏掉的令牌删掉，免得下次又被拿来用
      try {
        fs.unlinkSync(tokenFile());
      } catch (unlinkError) {
        /* 本来就没有文件 */
      }
      process.exit(1);
    }
    console.error(c.err(`  ${error.message}`));
    process.exit(1);
  }

  const headSha = await resolveRef(api, config.repo, config.branch);
  const headCommit = await api(`/repos/${config.repo}/git/commits/${headSha}`);

  // 找增量：小于 900KB 的文件先查一下远端是不是一样，一样就跳过
  const remoteBlobs = new Map();
  try {
    const tree = await api(`/repos/${config.repo}/git/trees/${headCommit.tree.sha}?recursive=1`);
    for (const item of tree.tree || []) {
      if (item.type === "blob") remoteBlobs.set(item.path, { sha: item.sha, size: item.size });
    }
  } catch (error) {
    /* 拿不到就全量比，不影响正确性 */
  }
  const gitBlobSha = (buf) => {
    const crypto = require("node:crypto");
    const header = Buffer.from(`blob ${buf.length}\0`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, buf])).digest("hex");
  };

  const tree = [];
  let skipped = 0;
  // 「已经转成 webp 的原图」这一轮直接不推：否则每上传一次都会把 14 张原图重新推一遍，
  // 紧接着又在下面被删掉，白白多出一批 blob 和一次提交
  const superseded = new Set(renames.keys());
  // 第一次往一个新仓库上传时，仓库里可能没有任何网页文件：顺手把现在的网站也推上去，
  // 这样从管理后台点「上传到 GitHub」得到的结果和双击「上传到GitHub.cmd」完全一样。
  // --with-site（后台按钮默认加上）：连网页代码一起同步，内容和网页代码永远对得上。
  const withSite = args.flags.has("with-site") || args.flags.has("site");
  const siteNeeded = withSite || (!remoteBlobs.has("index.html") && !args.flags.has("data-only"));

  // 先把网页代码收齐，好判断内容文件到底有没有变化：
  // 前端页面是从 content.json 里渲染的，只要前端代码升级了、内容没变，也要重写一次内容文件，
  // 免得管理后台一直显示「有还没上传的修改」
  const siteFiles = siteNeeded ? await collectSite() : [];

  const push = async (rel, buf, mode = "100644", force = false) => {
    if (superseded.has(rel)) return;
    if (buf.length < 900 * 1024 && !force) {
      const local = gitBlobSha(buf);
      const remote = remoteBlobs.get(rel);
      if (remote && remote.sha === local) {
        skipped += 1;
        return;
      }
    }
    const blob = await api(`/repos/${config.repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: buf.toString("base64"), encoding: "base64" })
    });
    tree.push({ path: rel, mode, type: "blob", sha: blob.sha });
    // 顺带把本地那份也更新成和云端一致（只动本地还没被 webp 取代的文件）
    if (!superseded.has(rel)) {
      try {
        const abs = path.join(ROOT, rel);
        if (fs.existsSync(abs) && fs.statSync(abs).size !== buf.length) writeAtomically(abs, buf);
      } catch (error) {
        /* 本地写不了就算了，云端已经成功 */
      }
    }
    log(c.dim(`    ↑ ${rel}`));
  };

  for (const file of done) await push(file.rel, file.data);

  // 网页代码：先推，好知道前端有没有升级
  let siteChanged = 0;
  if (siteNeeded) {
    log(c.dim(withSite ? `  顺带同步网页代码（${siteFiles.length} 个文件）` : `  这个仓库里还没有网页，顺带把网站一起传上去（${siteFiles.length} 个文件）`));
    for (const file of siteFiles) {
      const before = tree.length;
      await push(file.rel, file.data);
      if (tree.length > before) siteChanged += 1;
    }
  }

  // 前端升级（部署）之后内容文件也要重写一次：GitHub Pages 就会重新部署，
  // 而且 data/sync-report.json 里记的 pushedAt 会比 content.updatedAt 新，后台不再显示「有还没上传的修改」
  const mustWrite = siteChanged > 0 || siteNeeded;
  await push(config.dataPath, dataBuf, "100644", mustWrite);

  // 已经转成 webp 的原图：本地还留着、云端也推过的话顺手清掉，仓库不会越堆越大
  const toDelete = [];
  for (const rel of renames.keys()) {
    if (!remoteBlobs.has(rel)) continue; // 云端本来就没有
    if (!fs.existsSync(path.join(ROOT, rel))) continue; // 本地已经删了，不用管
    toDelete.push(rel);
  }
  if (toDelete.length) {
    log(c.dim(`  清理 ${toDelete.length} 个已经被 webp 取代的原图`));
    for (const rel of toDelete) tree.push({ path: rel, mode: "100644", type: "blob", sha: null });
  }

  // （tree 里 sha 为 null 的是删除项，也要算进去）
  if (!tree.length) {
    // 什么都没变：本地也记一次「此刻云端是新的」，后台的判断依据才不会一直卡在旧时间
    try {
      fs.writeFileSync(
        REPORT_FILE,
        JSON.stringify({ pushedAt: new Date().toISOString(), commit: headSha, files: [], unchanged: true }, null, 2)
      );
    } catch (error) {
      /* 写不了也无所谓 */
    }
    log("");
    log(c.ok("  云端已经是最新的啦，没什么要推的 ✿"));
    log("");
    return;
  }

  const newTree = await api(`/repos/${config.repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree })
  });
  const message = args.opts.message || `更新内容（${new Date().toISOString().slice(0, 16).replace("T", " ")}）`;

  const author = config.user || me.login;
  const commit = await api(`/repos/${config.repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [headSha],
      author: {
        name: author,
        email: config.email || `${me.id}+${me.login}@users.noreply.github.com`,
        date: new Date().toISOString()
      }
    })
  });

  await api(`/repos/${config.repo}/git/refs/heads/${config.branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: true })
  });

  /* 7. 记一份上次推上去的样子，方便管理后台显示「有未上传的修改」 */
  try {
    fs.writeFileSync(
      REPORT_FILE,
      JSON.stringify({ pushedAt: new Date().toISOString(), commit: commit.sha, files: tree.map((t) => t.path) }, null, 2)
    );
  } catch (error) {
    /* 写不了也无所谓 */
  }

  log("");
  log(c.ok(`  ✔ 上传完成：${tree.length} 个文件${skipped ? c.dim(`（${skipped} 个没变，跳过）`) : ""}`));
  log(c.dim(`    提交 ${commit.sha.slice(0, 7)} · ${config.branch}`));
  const pages = config.pages || `https://${owner.toLowerCase()}.github.io/${config.repo.split("/")[1]}/`;
  log("");
  log(`  网站：${c.lav(pages)}`);
  log(c.dim("  GitHub Pages 通常 30～90 秒后生效，刷新一下就能看到 ✿"));
  log("");
}

main().catch((error) => {
  console.error("");
  console.error(c.err(`  ✗ 上传失败：${error.message}`));
  console.error("");
  process.exit(1);
});
