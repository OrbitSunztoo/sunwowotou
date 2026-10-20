/* =========================================================
   ふわり Fuwari — 登录会话（零依赖，纯 Node）
   · 口令用 scrypt 加盐哈希，存在 data/auth.json
   · 会话用 HMAC 签名的 httpOnly Cookie，重启服务后依旧有效
   · 连续输错会锁定一段时间
   ========================================================= */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const COOKIE = "fuwari_admin";
const SESSION_MS = 1000 * 60 * 60 * 24 * 7; // 7 天
const MAX_FAILS = 6;
const LOCK_MS = 1000 * 60 * 5;

const b64 = (buf) => Buffer.from(buf).toString("base64url");

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

function createAuth(dataDir) {
  const file = path.join(dataDir, "auth.json");
  fs.mkdirSync(dataDir, { recursive: true });

  let secret;
  let state;

  function read() {
    if (state) return state;
    try {
      state = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      state = null;
    }
    if (!state || !state.salt || !state.hash || !state.secret) {
      throw new Error("缺少 data/auth.json，请先运行 `node server/setup-admin.js` 设置管理员账号");
    }
    secret = Buffer.from(state.secret, "hex");
    return state;
  }

  function write(next) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch (e) {
      /* windows 下可能不支持，忽略 */
    }
  }

  async function setPassword(username, password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt);
    const next = {
      username,
      salt: salt.toString("hex"),
      hash: hash.toString("hex"),
      secret: state && state.secret ? state.secret : crypto.randomBytes(32).toString("hex"),
      createdAt: new Date().toISOString()
    };
    write(next);
    state = next;
    secret = Buffer.from(next.secret, "hex");
    fails = 0;
    return true;
  }

  let fails = 0;
  let lockedUntil = 0;

  function exists() {
    try {
      read();
      return true;
    } catch (error) {
      return false;
    }
  }

  function username() {
    try {
      return read().username;
    } catch (error) {
      return "";
    }
  }

  async function verify(name, password) {
    const data = read();
    if (String(name || "").trim() !== data.username) return false;
    const expected = Buffer.from(data.hash, "hex");
    const actual = await scrypt(String(password || ""), Buffer.from(data.salt, "hex"));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  function sign(payload) {
    return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  }

  function makeToken() {
    read();
    const payload = b64(JSON.stringify({ u: state.username, exp: Date.now() + SESSION_MS }));
    return `${payload}.${sign(payload)}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== "string") return false;
    try {
      read();
      const [payload, sig] = token.split(".");
      if (!payload || !sig) return false;
      const expected = sign(payload);
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (data.exp < Date.now()) return false;
      return data.u === state.username;
    } catch (error) {
      return false;
    }
  }

  return {
    file,
    exists,
    username,
    setPassword,
    verify,
    makeToken,
    verifyToken,
    lockRemaining() {
      return Math.max(0, lockedUntil - Date.now());
    },
    addFail() {
      fails += 1;
      if (fails >= MAX_FAILS) {
        lockedUntil = Date.now() + LOCK_MS;
        fails = 0;
      }
    },
    resetFails() {
      fails = 0;
      lockedUntil = 0;
    },
    COOKIE,
    SESSION_MS
  };
}

module.exports = { createAuth, COOKIE, SESSION_MS };
