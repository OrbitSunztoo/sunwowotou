/* =========================================================
   ふわり Fuwari — 轻量 HTTP 工具
   ========================================================= */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function parseCookies(header) {
  const out = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const idx = part.indexOf("=");
      if (idx < 0) return;
      const key = part.slice(0, idx).trim();
      if (!key) return;
      try {
        out[key] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch (error) {
        out[key] = part.slice(idx + 1).trim();
      }
    });
  return out;
}

function sendJSON(res, status, data, headers = {}, callback = "") {
  const json = JSON.stringify(data);
  const body = callback ? `${callback}(${json});` : json;
  res.writeHead(status, {
    "Content-Type": callback ? "application/javascript; charset=utf-8" : "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function sendText(res, status, text, headers = {}) {
  const body = Buffer.from(String(text), "utf8");
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    ...headers
  });
  res.end(body);
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("请求体太大了"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJSON(req, limit) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw Object.assign(new Error("请求内容不是合法的 JSON"), { status: 400 });
  }
}

/**
 * 把 URL 路径安全地解析到 root 目录内的真实文件
 * 返回 { file, exists, isDir } 或 null（越界）
 */
function resolveInside(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (error) {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const clean = decoded.replace(/[\\/]+/g, path.sep);
  const target = path.resolve(root, `.${path.sep}${clean}`);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  let stat = null;
  try {
    stat = fs.statSync(target);
  } catch (error) {
    stat = null;
  }
  return { file: target, exists: Boolean(stat), isDir: Boolean(stat && stat.isDirectory()) };
}

function serveFile(req, res, file, { cache = "no-cache", download = false } = {}) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    sendText(res, 404, "404 · 这里什么都没有");
    return;
  }
  if (stat.isDirectory()) {
    sendText(res, 404, "404 · 这里什么都没有");
    return;
  }
  const headers = {
    "Content-Type": mimeFor(file),
    "Content-Length": stat.size,
    "Cache-Control": cache,
    "Last-Modified": stat.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff"
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`;
  }
  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

function setCookie(res, name, value, { maxAge = 0, httpOnly = true, sameSite = "Lax", path: cookiePath = "/" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${cookiePath}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (maxAge > 0) parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
  if (maxAge <= 0) parts.push("Max-Age=0");
  const existing = res.getHeader("Set-Cookie");
  const list = existing ? (Array.isArray(existing) ? existing.slice() : [String(existing)]) : [];
  list.push(parts.join("; "));
  res.setHeader("Set-Cookie", list);
}

module.exports = {
  MIME,
  mimeFor,
  parseCookies,
  sendJSON,
  sendText,
  readBody,
  readJSON,
  resolveInside,
  serveFile,
  setCookie
};
