/* =========================================================
   public/admin.js — ふわり 管理后台
   纯手写，无框架。数据流：GET /api/content → 本地编辑 → PUT /api/content
   ========================================================= */
(() => {
  "use strict";

  /* 后端地址：
     · 本地/服务器站内打开（/admin.html）→ 同源 /api
     · 从 GitHub Pages 这类纯静态托管打开时，没有后端，
       用 ?api=https://你的域名 指定后端；也可以是相对路径 ../其它目录 */
  const params = new URLSearchParams(location.search);
  let API_PARAM = (params.get("api") || "").replace(/\/+$/, "");
  let API = API_PARAM ? API_PARAM + "/api" : "/api";
  // 本机编辑窗口（桌面程序打开的 ?local=1）：这个地址只监听本机回环，所以免登录直接进后台
  let LOCAL_ENTRY = params.get("local") === "1";
  let LOCAL_SESSION = false;
  const LOCAL_HEADER = () => (LOCAL_ENTRY && LOCAL_SESSION ? { "X-Fuwari-Local": "1" } : {});

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const pad = (n) => String(n).padStart(2, "0");

  const GALLERY_SIZES = [
    ["normal", "普通"],
    ["wide", "横长"],
    ["tall", "竖长"]
  ];
  const TAG_CLASSES = [
    ["tag-lav", "薰衣草"],
    ["tag-mint", "薄荷"],
    ["tag-pink", "草莓"],
    ["tag-cream", "牛奶"]
  ];
  const NOTE_COLORS = [
    ["pink", "草莓"],
    ["lav", "薰衣草"],
    ["mint", "薄荷"],
    ["cream", "牛奶"]
  ];

  let content = null;
  let pristine = null;
  let dirty = false;
  let currentTab = "people";

  const esc = (value) =>
    String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const PLACEHOLDER =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#f6eef7"/><text x="80" y="68" font-size="30" text-anchor="middle" fill="#b9a8e3">✿</text></svg>`
    );

  /* ---------------- 请求 ---------------- */

  // 跨域连服务器时必须带 Cookie，否则登录状态存不住
  let CREDENTIALS = API_PARAM ? "include" : "same-origin";
  let LOCAL_MODE = false;

  /** 读取发布时生成的 api-config.js（形如 window.FUWARI_API = "https://xxx"） */
  function loadBackendConfig() {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      // 站内打开时 admin.html 挂在 /admin.html，线上 Pages 时挂在 /public/admin.html，两种层级都试
      script.src = /\/public\//.test(location.pathname) ? "../assets/js/api-config.js" : "assets/js/api-config.js";
      script.onload = () => {
        const base = String((window.FUWARI_API || (window.FUWARI_CONFIG || {}).apiBase || "")).replace(/\/+$/, "");
        if (base) {
          API_PARAM = base;
          API = base + "/api";
        }
        resolve();
      };
      script.onerror = () => resolve();
      document.head.append(script);
      setTimeout(resolve, 2500);
    });
  }

  /** 后台顶部放一个「回到前台」的小链接 */
  function showSiteLink() {
    const link = $("#siteLink");
    if (!link || API_PARAM) return;
    link.href = /\/public\//.test(location.pathname) ? "../index.html" : "/";
    link.hidden = false;
  }

  // 浏览器存不住跨站 Cookie（file:// 或第三方 Cookie 被拦）时，用登录时拿到的 token 换成请求头
  const TOKEN_KEY = "fuwari-admin-token";
  const readToken = () => {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  };
  const writeToken = (value) => {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      /* 隐私模式下写不进去就算了 */
    }
  };

  async function api(path, options = {}) {
    const headers = { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}) };
    const token = readToken();
    if (token) headers["X-Fuwari-Auth"] = token;
    if (LOCAL_ENTRY) headers["X-Fuwari-Local"] = "1";
    Object.assign(headers, LOCAL_HEADER());
    const res = await fetch(API + path, { credentials: CREDENTIALS, ...options, headers });
    let data = null;
    try {
      data = await res.json();
    } catch (error) {
      data = null;
    }
    if (res.status === 401) {
      writeToken("");
      // 顺手清掉这台机器上可能残留的会话记录（安全起见）
      try {
        for (const key of ["fuwari-session", "fuwari-auth"]) localStorage.removeItem(key);
      } catch (error) {
        /* 隐私模式 */
      }
      if (LOCAL_ENTRY) {
        LOCAL_ENTRY = false;
        LOCAL_SESSION = false;
      }
      showLogin();
      throw new Error("登录已过期，请重新登录");
    }
    if (!res.ok) throw new Error((data && data.error) || `请求失败（${res.status}）`);
    return data;
  }

  /* ---------------- 提示 ---------------- */

  function toast(message, kind = "") {
    const el = document.createElement("div");
    el.className = `toast ${kind ? `is-${kind}` : ""}`;
    el.textContent = message;
    $("#toasts").append(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => el.remove(), 320);
    }, 2600);
  }

  /* ---------------- 路径读写 ---------------- */

  function getPath(obj, path) {
    return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split(".");
    let cursor = obj;
    keys.slice(0, -1).forEach((key) => {
      if (cursor[key] == null || typeof cursor[key] !== "object") cursor[key] = {};
      cursor = cursor[key];
    });
    cursor[keys[keys.length - 1]] = value;
  }

  /* ---------------- 时间格式 ---------------- */

  function toLocalInput(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso || ""));
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : "";
  }

  const OFFSET = (() => {
    const m = /([+-])(\d{2}):(\d{2})$/.exec(String((content && content.couple && content.couple.since) || ""));
    return m ? `${m[1]}${m[2]}:${m[3]}` : "+08:00";
  })();

  function fromLocalInput(value) {
    if (!value) return "";
    return value.length === 16 ? `${value}:00${OFFSET}` : value;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayDot() {
    const d = new Date();
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }

  /* ---------------- 脏状态 ---------------- */

  function markDirty() {
    dirty = true;
    const state = $("#saveState");
    state.textContent = "有未保存的修改";
    state.classList.add("is-dirty");
  }

  function markClean() {
    dirty = false;
    const state = $("#saveState");
    state.textContent = "已保存";
    state.classList.remove("is-dirty");
    pristine = clone(content);
  }

  function setContent(next) {
    content = next;
    markClean();
  }

  /* ---------------- 本机模式（没有后端时只改当前浏览器） ---------------- */

  const LOCAL_CONTENT_KEY = "fuwari-local-content-v1";

  function readLocalContent() {
    try {
      const raw = localStorage.getItem(LOCAL_CONTENT_KEY);
      const data = raw ? JSON.parse(raw) : null;
      return data && typeof data === "object" ? data : null;
    } catch (error) {
      return null;
    }
  }

  function writeLocalContent(next) {
    try {
      localStorage.setItem(LOCAL_CONTENT_KEY, JSON.stringify(next));
      return true;
    } catch (error) {
      return false;
    }
  }

  /** 静态托管时用的兜底数据：前台目录里的 content.json */
  async function loadStaticContent() {
    const candidates = ["../content.json", "./content.json"];
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) continue;
        const type = String(res.headers.get("content-type") || "");
        if (type && !/json/i.test(type)) continue;
        return await res.json();
      } catch (error) {
        /* 换下一个候选地址 */
      }
    }
    throw new Error("找不到 content.json，无法进入本机编辑模式");
  }

  async function startLocalMode() {
    LOCAL_MODE = true;
    CREDENTIALS = "same-origin";
    API = "/api";
    $("#staticNotice").classList.add("hidden");
    $("#localBar").hidden = false;
    showSiteLink();
    try {
      setContent(readLocalContent() || (await loadStaticContent()));
      showApp();
      if (readLocalContent()) toast("已经把本机保存的内容读出来啦 ✿", "ok");
    } catch (error) {
      showStaticNotice();
      toast(error.message, "error");
    }
  }

  /* ---------------- 登录 ---------------- */

  /* ---------------- 一键上传到 GitHub ---------------- */

  let syncState = null;

  async function checkSync() {
    const button = $("#syncBtn");
    try {
      syncState = await api("/sync");
    } catch (error) {
      if (button) button.hidden = true;
      return;
    }
    if (!button) return;
    // 只要上传服务在（server/server.js 的 /api/sync），按钮就该出现；
    // 纯静态托管时 LOCAL_MODE 为真、/api/sync 根本不存在，上面的 catch 已经把它藏起来了
    button.hidden = false;
    button.classList.toggle("is-dirty", Boolean(syncState.dirty));
    button.title = syncState.configured
      ? `${syncState.repo}（${syncState.branch}）${syncState.dirty ? "· 有还没上传的修改" : "· 云端已是最新"}`
      : "第一次上传会让你填仓库和 GitHub 令牌";
    button.textContent = syncState.configured ? "☁ 上传到 GitHub" : "☁ 开始设置上传";
    const tip = $("#syncRepo");
    if (tip && !tip.value && syncState.repo) tip.value = syncState.repo;
    fillSyncPanel();
  }

  function syncLogLine(text, kind) {
    const box = $("#syncLog");
    if (!box) return;
    const line = document.createElement("div");
    if (kind) line.className = `is-${kind}`;
    line.textContent = text;
    box.append(line);
    box.scrollTop = box.scrollHeight;
  }

  async function runSync(options = {}) {
    if (!options.quiet && dirty && !confirm("还有没保存的修改，先保存再上传吗？\n（点「取消」就直接上传已经保存过的内容）")) {
      await save();
      if (dirty) return;
    }
    const button = $("#syncBtn");
    const box = $("#syncBox");
    button.disabled = true;
    button.textContent = "☁ 上传中…";
    box.classList.remove("hidden");
    $("#syncLog").innerHTML = "";
    $("#syncTitle").textContent = "正在上传…";
    $("#syncSub").textContent = "";
    try {
      const token = readToken();
      const res = await fetch(`${API}/sync${options.full ? "?full=1" : ""}`, {
        method: "POST",
        credentials: CREDENTIALS,
        headers: { ...(token ? { "X-Fuwari-Auth": token } : {}), ...LOCAL_HEADER() }
      });
      if (res.status === 401) {
        writeToken("");
        showLogin();
        throw new Error("登录已过期");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.error) || `上传接口出错（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          let msg;
          try {
            msg = JSON.parse(raw);
          } catch (error) {
            continue;
          }
          if (msg.type === "done") result = msg;
          else if (msg.type === "log") syncLogLine(msg.text, /✔|完成/.test(msg.text) ? "ok" : /✗|失败|错误|不对|404/.test(msg.text) ? "err" : "");
        }
      }
      if (result && result.ok) {
        $("#syncTitle").textContent = "上传完成 ✿";
        $("#syncSub").textContent = "GitHub Pages 大约 30～90 秒后更新";
        toast("已经传到 GitHub 啦，稍等一下网站就会更新 ✿", "ok");
        await checkSync();
      } else {
        $("#syncTitle").textContent = "上传没有完成";
        $("#syncSub").textContent = "看看下面的说明";
        toast("上传没成功，具体原因看下面的日志", "error");
      }
    } catch (error) {
      $("#syncTitle").textContent = "上传出错";
      syncLogLine(error.message, "err");
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = syncState && syncState.configured ? "☁ 上传到 GitHub" : "☁ 开始设置上传";
    }
  }

  $("#syncBtn").addEventListener("click", () => {
    if (syncState && !syncState.configured) {
      // 第一次用：先把「仓库 + 令牌」填好，填完自动接着上传
      const box = $("#syncSetup");
      box.classList.remove("hidden");
      $("#syncRepo").focus();
      return;
    }
    runSync();
  });
  $("#syncSetupClose").addEventListener("click", () => $("#syncSetup").classList.add("hidden"));
  $("#syncSetupInputCancel").addEventListener("click", () => $("#syncSetup").classList.add("hidden"));

  $("#syncSetup").addEventListener("submit", async (event) => {
    event.preventDefault();
    const repoInput = $("#syncRepo");
    const tokenInput = $("#syncToken");
    const button = $("#syncSetupSave");
    const repo = repoInput.value.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
    const token = tokenInput.value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return toast("仓库写成 owner/名称 这样，例如 OrbitSunztoo/sunwowotou", "error");
    if (!/^(github_pat_|gh[ps]_)/.test(token)) return toast("令牌应该以 github_pat_ 或 ghp_ 开头，再看一眼？", "error");
    button.disabled = true;
    button.textContent = "正在保存…";
    try {
      await api("/sync/setup", { method: "POST", body: JSON.stringify({ repo, token }) });
      tokenInput.value = "";
      $("#syncSetup").classList.add("hidden");
      await checkSync();
      toast("设置好啦，开始上传 ✿", "ok");
      await runSync();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "保存并上传";
    }
  });

  $("#syncClose").addEventListener("click", () => $("#syncBox").classList.add("hidden"));

  async function boot() {
    // 纯静态托管（GitHub Pages、gitee pages 等）没有 /api，先探一下
    if (!API_PARAM) {
      // 线上是静态托管时，真正的后端地址通常由发布时写入的脚本文件提供
      await loadBackendConfig();
      showSiteLink();
      if (!API_PARAM) {
        const reachable = await Promise.race([
          fetch(`/api/session?probe=${Date.now()}`, { credentials: CREDENTIALS, cache: "no-store" })
            .then((res) => {
              // 真正的 /api 一定会回 JSON；静态托管对未知路径多半回 200 + HTML，不能当成可达
              const type = String(res.headers.get("content-type") || "");
              return res.status !== 404 && /json/i.test(type);
            })
            .catch(() => false),
          new Promise((resolve) => setTimeout(() => resolve(false), 4000))
        ]);
        if (!reachable) {
          await startLocalMode();
          return;
        }
      }
    }
    try {
      const session = await api("/session");
      LOCAL_SESSION = Boolean(session.local);
      $("#setupHint").hidden = session.setup;
      if (!session.setup) {
        $("#loginHint").textContent = "还没有设置管理员账号，先在项目目录运行 node server/setup-admin.js。";
      }
      if (session.loggedIn) {
        await loadContent();
        showApp();
      } else {
        showLogin(session.username);
      }
    } catch (error) {
      showLogin();
      toast(error.message, "error");
    }
  }

  function showLogin(username) {
    $("#staticNotice").classList.add("hidden");
    $("#loginView").classList.remove("hidden");
    $("#appView").classList.add("hidden");
    if (username && !$("#loginForm").elements.username.value) $("#loginForm").elements.username.value = username;
    setTimeout(() => $("#loginForm").elements.password.focus(), 60);
  }

  function showStaticNotice() {
    $("#loginView").classList.add("hidden");
    $("#appView").classList.add("hidden");
    $("#staticNotice").classList.remove("hidden");
    const base = location.href.split("?")[0].split("#")[0];
    const el = $("#staticUrl");
    if (el) el.textContent = `${base}?api=https://你的服务器域名`;
    const hint = $("#staticHint");
    if (hint) {
      hint.innerHTML =
        "GitHub Pages 只能放静态网页，管理后台需要连接你自己的服务器（按 DEPLOY.md 部好之后就自带后台）。<br>把服务器地址当作参数带上再打开，例如：";
    }
  }

  function showApp() {
    $("#loginView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    renderAll();
    renderTab(currentTab);
    checkSync();
  }

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "正在进入…";
    try {
      const result = await api("/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.elements.username.value.trim(),
          password: form.elements.password.value
        })
      });
      // Cookie 存不下时会话就靠这个 token 续命（服务端只在白名单来源下发放）
      if (result && result.token) writeToken(result.token);
      await loadContent();
      showApp();
      toast("欢迎回来 ✿", "ok");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "进入后台";
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    if (dirty && !confirm("还有没保存的修改，确定要退出吗？")) return;
    try {
      await api("/logout", { method: "POST" });
    } catch (error) {
      /* 已经退出过也无所谓 */
    }
    writeToken("");
    location.reload();
  });

  async function loadContent() {
    if (LOCAL_MODE) {
      setContent(readLocalContent() || (await loadStaticContent()));
      return;
    }
    setContent(await api("/content"));
  }

  /* ---------------- 保存 ---------------- */

  async function save() {
    if (!content) return;
    const button = $("#saveBtn");
    button.disabled = true;
    button.textContent = "保存中…";
    try {
      if (LOCAL_MODE) {
        // 本机模式：存到浏览器里，前台刷新即可看到
        const body = clone(content);
        body.updatedAt = new Date().toISOString();
        if (!writeLocalContent(body)) throw new Error("浏览器存储写不进去（可能是隐私模式），先用「导出 content.json」保存一份");
        setContent(body);
        renderAll();
        renderTab(currentTab);
        toast("已经存到这台浏览器啦，刷新前台就能看到 ✿（想给别人看请导出后上传到服务器）", "ok");
      } else {
        await api("/content", { method: "PUT", body: JSON.stringify(content) });
        // 重新读一次，拿到服务端整理后的 id 与更新时间
        await loadContent();
        renderAll();
        renderTab(currentTab);
        toast("保存好啦，前台已经更新 ✿", "ok");
      }
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "保存修改";
    }
  }

  $("#saveBtn").addEventListener("click", save);

  $("#reloadBtn").addEventListener("click", async () => {
    if (dirty && !confirm("放弃未保存的修改，重新读取服务端内容？")) return;
    try {
      await loadContent();
      renderAll();
      renderTab(currentTab);
      toast("已重新读取");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
    }
  });

  /* ---------------- 标签页 ---------------- */

  const TITLES = {
    people: ["人物资料", "改名字、换头像、写简介，前台立刻同步"],
    couple: ["情侣与纪念日", "在一起的日期、标题文字、纪念日愿望"],
    posts: ["文章", "新增、编辑、删除手帐文章"],
    gallery: ["图集", "首页「一些舍不得删的画面」"],
    wall: ["合照墙", "砂糖情侣页的拍立得"],
    timeline: ["时间线", "我们的小时间线节点"],
    notes: ["留言", "糖果罐里的糖"],
    site: ["站点与页脚", "站名、首页文案、页脚与联系方式"],
    account: ["账号与备份", "修改口令、导出与恢复内容"]
  };

  function renderTab(tab) {
    currentTab = tab;
    $$(".tab").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
    $$(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tab));
    $("#pageTitle").textContent = TITLES[tab][0];
    $("#pageCrumb").textContent = TITLES[tab][1];
    if (tab === "account") {
      $("#accUser").value = "";
      const mode = $("#accMode");
      if (mode) {
        const local = LOCAL_ENTRY && LOCAL_SESSION;
        mode.textContent = local ? "本机编辑窗口 · 免登录" : "已登录";
        mode.classList.toggle("is-local", local);
      }
    }
  }

  $$(".tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (dirty && !confirm("当前修改还没保存，切换页面会丢掉它们，继续吗？")) return;
      if (dirty) {
        loadContent()
          .then(() => {
            renderAll();
            renderTab(btn.dataset.tab);
          })
          .catch((error) => toast(error.message, "error"));
        return;
      }
      renderTab(btn.dataset.tab);
    })
  );

  /* ---------------- 渲染：整页 ---------------- */

  function renderAll() {
    if (!content) return;
    $("#countPosts").textContent = content.articles.length;
    $("#countGallery").textContent = content.gallery.length;
    $("#countWall").textContent = content.wall.length;
    $("#countTimeline").textContent = content.timeline.length;
    $("#countNotes").textContent = content.notes.length;
    const stamp = new Date(content.updatedAt || Date.now());
    $("#sideUpdated").textContent = `最近保存 ${stamp.getFullYear()}.${pad(stamp.getMonth() + 1)}.${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;
    fillFields();
    renderImages();
    renderPairLists();
    renderTags();
    renderPosts();
    renderGallery();
    renderWall();
    renderTimeline();
    renderNotes();
  }

  /* ---------------- 渲染：普通字段 ---------------- */

  function fillFields() {
    $$("[data-field]").forEach((input) => {
      const path = input.dataset.field;
      const value = getPath(content, path);
      const mode = input.dataset.mode;
      if (input.type === "checkbox") {
        input.checked = Boolean(value);
      } else if (mode === "lines") {
        input.value = Array.isArray(value) ? value.join("\n") : "";
      } else if (mode === "csv") {
        input.value = Array.isArray(value) ? value.join("，") : "";
      } else if (input.dataset.type === "localISO") {
        input.value = toLocalInput(value);
      } else {
        input.value = value == null ? "" : String(value);
      }
    });
    if (!$("#accUser").value && !$("#accUser").dataset.touched) {
      // 留空表示不修改用户名
    }
  }

  document.addEventListener("change", onFieldChange);
  document.addEventListener("input", (event) => {
    const el = event.target;
    if (el.matches("[data-field]") && !["checkbox", "datetime-local"].includes(el.type)) onFieldChange(event, false);
  });

  function onFieldChange(event, fromChange = true) {
    const input = event.target.closest("[data-field]");
    if (!input || !content) return;
    const path = input.dataset.field;
    const mode = input.dataset.mode;
    let value;

    if (input.type === "checkbox") value = input.checked;
    else if (input.dataset.type === "localISO") value = fromLocalInput(input.value);
    else if (mode === "lines") value = input.value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    else if (mode === "csv") value = input.value.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean);
    else value = input.value;

    setPath(content, path, value);
    markDirty();

    if (fromChange && input.dataset.field.startsWith("couple.since")) syncSinceLabel();
  }

  function syncSinceLabel() {
    const since = content.couple.since || "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(since);
    if (!m) return;
    content.couple.sinceLabel = `${m[1]}.${m[2]}.${m[3]}`;
    const input = $('[data-field="couple.sinceLabel"]');
    if (input) input.value = content.couple.sinceLabel;
  }

  /* ---------------- 渲染：图片预览 ---------------- */

  function renderImages() {
    $$("[data-img-for]").forEach((img) => {
      const key = img.dataset.imgFor;
      const src = key === "site"
        ? content.site.heroImage
        : key === "site.logo"
          ? content.site.logo
          : content[key].avatar;
      img.src = src || PLACEHOLDER;
      img.onerror = () => {
        img.src = PLACEHOLDER;
      };
    });
  }

  /* ---------------- 渲染：成对列表（info / currently / links） ---------------- */

  const PAIR_LABELS = {
    "owner.info": "资料",
    "partner.info": "资料",
    "owner.currently": "在做 / 在读 / 在听",
    "site.links": "链接"
  };

  function renderPairLists() {
    $$("[data-list]").forEach((wrap) => {
      const path = wrap.dataset.list;
      const items = getPath(content, path) || [];
      wrap.innerHTML = "";
      if (!items.length) {
        wrap.innerHTML = `<div class="empty">还没有内容，点下面的按钮添加</div>`;
      }
      items.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "item";
        const labelPh = path === "site.links" ? "平台名（VRChat）" : path.endsWith("currently") ? "在做 / 在读 / 在听" : "项目名（身高）";
        const valuePh = path === "site.links" ? "内容（Yuzu_mochi）" : "内容（1.52 m）";
        row.innerHTML = `
          <div class="meta row" style="gap:8px">
            <input class="input slim" data-pair-label placeholder="${labelPh}" value="${esc(item.label || "")}">
            <input class="input slim" data-pair-value placeholder="${valuePh}" value="${esc(item.value || "")}">
            ${path === "site.links" ? `<input class="input slim" data-pair-toast placeholder="点击时的小提示" value="${esc(item.toast || "")}">` : ""}
          </div>
          <div class="ops">
            <button class="icon-btn danger" type="button" data-pair-del title="删除">✕</button>
          </div>`;
        row.querySelector("[data-pair-label]").addEventListener("input", (e) => {
          item.label = e.target.value;
          syncPair();
        });
        row.querySelector("[data-pair-value]").addEventListener("input", (e) => {
          item.value = e.target.value;
          syncPair();
        });
        const toastInput = row.querySelector("[data-pair-toast]");
        if (toastInput) {
          toastInput.addEventListener("input", (e) => {
            item.toast = e.target.value;
            syncPair();
          });
        }
        row.querySelector("[data-pair-del]").addEventListener("click", () => {
          items.splice(index, 1);
          setPath(content, path, items);
          syncPair();
          renderPairLists();
        });
        function syncPair() {
          setPath(content, path, items);
          markDirty();
        }
        wrap.append(row);
      });
    });
  }

  $$("[data-list-add]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const path = btn.dataset.listAdd;
      const items = getPath(content, path) || [];
      const blank = path === "site.links" ? { label: "", value: "", toast: "" } : { label: "", value: "" };
      items.push(blank);
      setPath(content, path, items);
      markDirty();
      renderPairLists();
      const wrap = $(`[data-list="${path}"]`);
      const last = wrap && wrap.lastElementChild;
      const focusMe = last && last.querySelector("[data-pair-label]");
      if (focusMe) focusMe.focus();
    })
  );

  /* ---------------- 渲染：标签 ---------------- */

  function renderTags() {
    $$("[data-tags]").forEach((wrap) => {
      const path = wrap.dataset.tags;
      const tags = getPath(content, path) || [];
      wrap.innerHTML = "";
      tags.forEach((tag, index) => {
        const chip = document.createElement("span");
        chip.className = "tag";
        chip.innerHTML = `${esc(tag)}<button type="button" title="删除">✕</button>`;
        chip.querySelector("button").addEventListener("click", () => {
          tags.splice(index, 1);
          setPath(content, path, tags);
          markDirty();
          renderTags();
        });
        wrap.append(chip);
      });
    });
  }

  $$("[data-tag-add]").forEach((btn) =>
    btn.addEventListener("click", () => addTag(btn.dataset.tagAdd))
  );
  $$("[data-tag-input]").forEach((input) =>
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addTag(input.dataset.tagInput);
    })
  );

  function addTag(path) {
    const input = $(`[data-tag-input="${path}"]`);
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;
    const tags = getPath(content, path) || [];
    if (!tags.includes(value)) tags.push(value);
    setPath(content, path, tags);
    input.value = "";
    markDirty();
    renderTags();
  }

  /* ---------------- 图片挑选 ---------------- */

  let pickerResolve = null;
  const pickedTarget = { path: "", mode: "circle" };

  function openPicker(path, mode = "circle") {
    pickedTarget.path = path;
    pickedTarget.mode = mode;
    $("#picker").classList.remove("hidden");
    $("#pickerUrl").value = "";
    loadPickerImages();
    return new Promise((resolve) => {
      pickerResolve = resolve;
    });
  }

  function closePicker(value) {
    $("#picker").classList.add("hidden");
    const resolve = pickerResolve;
    pickerResolve = null;
    if (resolve) resolve(value);
  }

  async function loadPickerImages() {
    const grid = $("#pickerGrid");
    grid.innerHTML = "";
    const builtin = [
      "assets/img/avatar-yuzu.svg",
      "assets/img/avatar-sei.svg",
      "assets/img/hero-girl.svg",
      "assets/img/scene-sakura.svg",
      "assets/img/scene-fireworks.svg",
      "assets/img/scene-cafe.svg",
      "assets/img/scene-camp.svg",
      "assets/img/scene-snow.svg",
      "assets/img/scene-birthday.svg",
      "assets/img/scene-room.svg",
      "assets/img/scene-letter.svg",
      "assets/img/scene-milk.svg"
    ];
    let uploaded = [];
    try {
      const data = await api("/uploaded");
      uploaded = (data.files || []).map((f) => f.url);
    } catch (error) {
      uploaded = [];
    }
    [...uploaded, ...builtin].forEach((url) => {
      const button = document.createElement("button");
      button.type = "button";
      button.title = url;
      const img = document.createElement("img");
      img.src = url.startsWith("uploads/") ? `../${url}` : `../${url}`;
      img.alt = "";
      img.loading = "lazy";
      button.append(img);
      button.addEventListener("click", () => closePicker(url));
      grid.append(button);
    });
  }

  async function uploadFiles(files) {
    if (LOCAL_MODE) {
      toast("本机模式不能上传图片——先在上面「图片库」里挑一张，或者部署服务器后再传 ✿", "error");
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast(`${file.name} 不是图片`, "error");
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast(`${file.name} 超过 8MB 了`, "error");
        continue;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        const data = await api("/image", { method: "POST", body: form });
        toast(`${file.name} 上传好了 ✿`, "ok");
        await loadPickerImages();
        closePicker(data.url);
        return;
      } catch (error) {
        toast(error.message, "error");
      }
    }
  }

  $("#pickerClose").addEventListener("click", () => closePicker(null));
  $("#picker").addEventListener("click", (event) => {
    if (event.target.id === "picker") closePicker(null);
  });
  $("#pickerFile").addEventListener("change", (event) => {
    uploadFiles(Array.from(event.target.files || []));
    event.target.value = "";
  });
  const drop = $("#pickerDrop");
  ["dragenter", "dragover"].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add("is-over");
    })
  );
  ["dragleave", "drop"].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.remove("is-over");
    })
  );
  drop.addEventListener("drop", (event) => uploadFiles(Array.from(event.dataTransfer.files || [])));

  $("#pickerUseUrl").addEventListener("click", () => {
    const value = $("#pickerUrl").value.trim();
    if (!value) {
      toast("先粘贴一个图片地址吧");
      return;
    }
    closePicker(value);
  });

  document.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-pick-image]");
    if (!trigger) return;
    const path = trigger.dataset.pickImage === "site" ? trigger.dataset.pickPath || "site.heroImage" : `${trigger.dataset.pickImage}.avatar`;
    const url = await openPicker(path, trigger.dataset.mode || "circle");
    if (!url) return;
    setPath(content, path, url);
    markDirty();
    fillFields();
    renderImages();
  });

  /* ---------------- 通用编辑器 ---------------- */

  let editorResolve = null;

  function openEditor(title, body, onSave) {
    $("#editorTitle").textContent = title;
    $("#editorBody").innerHTML = body;
    $("#editor").classList.remove("hidden");
    return new Promise((resolve) => {
      editorResolve = { resolve, onSave };
    });
  }

  function closeEditor(saved) {
    $("#editor").classList.add("hidden");
    const pending = editorResolve;
    editorResolve = null;
    if (pending) pending.resolve(saved);
  }

  $("#editorCancel").addEventListener("click", () => closeEditor(false));
  $("#editorSave").addEventListener("click", async () => {
    if (!editorResolve) return;
    const ok = await editorResolve.onSave();
    if (ok) closeEditor(true);
  });
  $("#editor").addEventListener("click", (event) => {
    if (event.target.id === "editor" && confirm("关闭会丢掉这次编辑，确定吗？")) closeEditor(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#editor").classList.contains("hidden")) closeEditor(false);
  });

  /* ---------------- 渲染：文章 ---------------- */

  function formatDate(date) {
    return String(date || "").replace(/-/g, ".");
  }

  function renderPosts() {
    const list = $("#postList");
    list.innerHTML = "";
    if (!content.articles.length) {
      list.innerHTML = `<div class="empty">还没有文章，点右上角写第一篇</div>`;
      return;
    }
    content.articles.forEach((post, index) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <img src="../${esc(post.image || "")}" alt="" onerror="this.src='${PLACEHOLDER}'">
        <div class="meta">
          <strong>${index === 0 ? "★ " : ""}${esc(post.title)}</strong>
          <span>${esc(formatDate(post.date))} · ${esc(post.tag)}${post.read ? ` · ${esc(post.read)}` : ""} · ${post.body.length} 段</span>
        </div>
        <div class="ops">
          <button class="icon-btn" type="button" data-up title="上移">↑</button>
          <button class="icon-btn" type="button" data-down title="下移">↓</button>
          <button class="btn btn-ghost btn-sm" type="button" data-edit>编辑</button>
          <button class="icon-btn danger" type="button" data-del title="删除">✕</button>
        </div>`;
      row.querySelector("[data-edit]").addEventListener("click", () => editPost(index));
      row.querySelector("[data-del]").addEventListener("click", () => {
        if (!confirm(`删除《${post.title}》？`)) return;
        content.articles.splice(index, 1);
        markDirty();
        renderAll();
        toast("删掉了，记得点右上角保存");
      });
      row.querySelector("[data-up]").addEventListener("click", () => moveItem(content.articles, index, -1));
      row.querySelector("[data-down]").addEventListener("click", () => moveItem(content.articles, index, 1));
      list.append(row);
    });
  }

  function moveItem(array, index, delta) {
    const target = index + delta;
    if (target < 0 || target >= array.length) return;
    const [item] = array.splice(index, 1);
    array.splice(target, 0, item);
    markDirty();
    renderAll();
  }

  let editingPost = null;
  let editingPostIndex = -1;

  function blankPost() {
    return {
      id: "",
      title: "",
      tag: "日常",
      date: todayISO(),
      read: "4 分钟",
      image: "assets/img/scene-sakura.svg",
      alt: "",
      excerpt: "",
      body: [{ type: "p", text: "" }]
    };
  }

  $("#newPost").addEventListener("click", () => {
    editingPost = blankPost();
    editingPostIndex = -1;
    renderPostEditor();
  });

  function editPost(index) {
    editingPost = clone(content.articles[index]);
    editingPostIndex = index;
    renderPostEditor();
  }

  function blockRow(block, index) {
    const typeOptions = [
      ["p", "正文"],
      ["h2", "小标题"],
      ["quote", "引用"],
      ["list", "清单"]
    ]
      .map(([value, label]) => `<option value="${value}" ${block.type === value ? "selected" : ""}>${label}</option>`)
      .join("");
    const value = block.type === "list" ? (block.items || []).join("\n") : block.text || "";
    return `
      <div class="block" data-block-index="${index}">
        <select class="select" data-block-type>${typeOptions}</select>
        <textarea class="textarea" data-block-text placeholder="${
          block.type === "list" ? "一行一条清单" : "写点什么…"
        }">${esc(value)}</textarea>
        <div class="block-ops">
          <button class="icon-btn" type="button" data-block-up title="上移">↑</button>
          <button class="icon-btn" type="button" data-block-down title="下移">↓</button>
          <button class="icon-btn danger" type="button" data-block-del title="删除">✕</button>
        </div>
      </div>`;
  }

  function renderPostEditor() {
    const post = editingPost;
    const body = `
      <div class="avatar-pick">
        <img class="preview is-wide" id="postCover" src="../${esc(post.image || "")}" alt="" style="width:150px;height:100px"
             onerror="this.src='${PLACEHOLDER}'">
        <div class="pick-actions">
          <div class="row">
            <button class="btn btn-pink btn-sm" type="button" id="postCoverPick">上传 / 选择封面</button>
          </div>
          <input class="input slim" id="postCoverUrl" value="${esc(post.image || "")}" placeholder="图片地址">
        </div>
      </div>
      <label class="field"><span>标题</span><input class="input" id="postTitle" value="${esc(post.title)}" placeholder="今天想记下什么？"></label>
      <label class="field"><span>摘要（首页卡片上的那段话）</span><textarea class="textarea" id="postExcerpt" rows="2">${esc(post.excerpt)}</textarea></label>
      <div class="row">
        <label class="field"><span>分类</span><input class="input" id="postTag" value="${esc(post.tag)}"></label>
        <label class="field"><span>日期</span><input class="input" type="date" id="postDate" value="${esc(post.date)}"></label>
        <label class="field"><span>阅读时长</span><input class="input" id="postRead" value="${esc(post.read)}" placeholder="6 分钟"></label>
      </div>
      <label class="field"><span>图片 alt 描述</span><input class="input" id="postAlt" value="${esc(post.alt)}"></label>
      <label class="field-label">正文</label>
      <div class="blocks" id="postBlocks">${post.body.map(blockRow).join("")}</div>
      <button class="btn btn-ghost btn-sm" type="button" id="postAddP" style="margin-top:8px">＋ 正文</button>
      <button class="btn btn-ghost btn-sm" type="button" id="postAddH" style="margin-top:8px">＋ 小标题</button>
      <button class="btn btn-ghost btn-sm" type="button" id="postAddQ" style="margin-top:8px">＋ 引用</button>
      <button class="btn btn-ghost btn-sm" type="button" id="postAddL" style="margin-top:8px">＋ 清单</button>
      <p class="hint">提示：正文里不会解析 HTML，放心地写吧。</p>
    `;

    openEditor(editingPostIndex < 0 ? "写新文章" : `编辑《${post.title || "无标题"}》`, body, () => {
      const title = $("#postTitle").value.trim();
      if (!title) {
        toast("给文章取个标题吧", "error");
        $("#postTitle").focus();
        return false;
      }
      editingPost.title = title;
      editingPost.excerpt = $("#postExcerpt").value.trim();
      editingPost.tag = $("#postTag").value.trim() || "日常";
      editingPost.date = $("#postDate").value || todayISO();
      editingPost.read = $("#postRead").value.trim();
      editingPost.alt = $("#postAlt").value.trim();
      editingPost.image = $("#postCoverUrl").value.trim();
      editingPost.body = readBlocks();
      if (!editingPost.body.length) editingPost.body = [{ type: "p", text: "" }];

      if (editingPostIndex < 0) content.articles.unshift(editingPost);
      else content.articles[editingPostIndex] = editingPost;
      markDirty();
      renderAll();
      toast("文章已写进手帐，记得保存", "ok");
      return true;
    });

    function readBlocks() {
      return $$("#postBlocks .block")
        .map((row) => {
          const type = row.querySelector("[data-block-type]").value;
          const raw = row.querySelector("[data-block-text]").value;
          if (type === "list") {
            const items = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
            return items.length ? { type: "list", items } : null;
          }
          const text = raw.trim();
          return text ? { type, text } : null;
        })
        .filter(Boolean);
    }

    function addBlock(type) {
      const blocks = readBlocks();
      blocks.push(type === "list" ? { type, items: [] } : { type, text: "" });
      editingPost.body = blocks;
      $("#postBlocks").innerHTML = blocks.map(blockRow).join("");
    }

    $("#postAddP").addEventListener("click", () => addBlock("p"));
    $("#postAddH").addEventListener("click", () => addBlock("h2"));
    $("#postAddQ").addEventListener("click", () => addBlock("quote"));
    $("#postAddL").addEventListener("click", () => addBlock("list"));

    $("#postCoverPick").addEventListener("click", async () => {
      const url = await openPicker("", "wide");
      if (!url) return;
      $("#postCoverUrl").value = url;
      $("#postCover").src = `../${url}`;
      $("#postCover").onerror = () => ($("#postCover").src = PLACEHOLDER);
    });

    $("#postBlocks").addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      const row = btn.closest(".block");
      const rows = $$("#postBlocks .block");
      const index = rows.indexOf(row);
      let blocks = readBlocks();
      if (btn.hasAttribute("data-block-del")) blocks.splice(index, 1);
      if (btn.hasAttribute("data-block-up") && index > 0) {
        [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
      }
      if (btn.hasAttribute("data-block-down") && index < blocks.length - 1) {
        [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
      }
      // 读取时丢掉了空块，所以补齐一个空段落避免越界
      if (!blocks.length) blocks = [{ type: "p", text: "" }];
      $("#postBlocks").innerHTML = blocks.map(blockRow).join("");
    });

    $("#postBlocks").addEventListener("change", (event) => {
      if (!event.target.matches("[data-block-type]")) return;
      const row = event.target.closest(".block");
      const index = $$("#postBlocks .block").indexOf(row);
      const blocks = readBlocks();
      const type = event.target.value;
      blocks[index] = type === "list" ? { type, items: [] } : { type, text: blocks[index] ? blocks[index].text || "" : "" };
      const raw = blocks;
      $("#postBlocks").innerHTML = raw.map(blockRow).join("");
    });
  }

  /* ---------------- 渲染：图集 ---------------- */

  function renderGallery() {
    const list = $("#galleryList");
    list.innerHTML = "";
    if (!content.gallery.length) {
      list.innerHTML = `<div class="empty">图集还是空的，添加几张吧</div>`;
      return;
    }
    content.gallery.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <img src="../${esc(item.image)}" alt="" onerror="this.src='${PLACEHOLDER}'" style="cursor:pointer" data-img>
        <div class="meta">
          <strong>${esc(item.title || "未命名")}</strong>
          <span>${esc(item.date || "")} · ${GALLERY_SIZES.find((s) => s[0] === item.size)[1]} · ${esc(item.caption).slice(0, 28)}</span>
        </div>
        <div class="ops">
          <button class="icon-btn" type="button" data-up title="上移">↑</button>
          <button class="icon-btn" type="button" data-down title="下移">↓</button>
          <button class="btn btn-ghost btn-sm" type="button" data-edit>编辑</button>
          <button class="icon-btn danger" type="button" data-del title="删除">✕</button>
        </div>`;
      row.querySelector("[data-img]").addEventListener("click", async () => {
        const url = await openPicker("");
        if (!url) return;
        item.image = url;
        markDirty();
        renderAll();
      });
      row.querySelector("[data-edit]").addEventListener("click", () => editGallery(index));
      row.querySelector("[data-del]").addEventListener("click", () => {
        if (!confirm(`删除图集里的「${item.title || "这张图"}」？`)) return;
        content.gallery.splice(index, 1);
        markDirty();
        renderAll();
      });
      row.querySelector("[data-up]").addEventListener("click", () => moveItem(content.gallery, index, -1));
      row.querySelector("[data-down]").addEventListener("click", () => moveItem(content.gallery, index, 1));
      list.append(row);
    });
  }

  $("#newGallery").addEventListener("click", () => editGallery(-1));

  function editGallery(index) {
    const item =
      index < 0
        ? { id: "", image: "", alt: "", title: "", date: "", caption: "", size: "normal" }
        : clone(content.gallery[index]);
    const body = `
      <div class="avatar-pick">
        <img class="preview is-wide" id="gImg" src="../${esc(item.image)}" alt="" style="width:160px;height:110px" onerror="this.src='${PLACEHOLDER}'">
        <div class="pick-actions">
          <div class="row"><button class="btn btn-pink btn-sm" type="button" id="gPick">上传 / 选择图片</button></div>
          <input class="input slim" id="gUrl" value="${esc(item.image)}" placeholder="图片地址">
        </div>
      </div>
      <div class="row">
        <label class="field"><span>标题（照片下方第一行）</span><input class="input" id="gTitle" value="${esc(item.title)}" placeholder="四月 · 樱花坡道"></label>
        <label class="field"><span>小字（如 04 / 08）</span><input class="input" id="gDate" value="${esc(item.date)}"></label>
      </div>
      <label class="field"><span>点击放大时的说明</span><textarea class="textarea" id="gCaption" rows="2">${esc(item.caption)}</textarea></label>
      <label class="field"><span>图片 alt 描述</span><input class="input" id="gAlt" value="${esc(item.alt)}"></label>
      <label class="field"><span>排布</span>
        <select class="select" id="gSize">
          ${GALLERY_SIZES.map(([v, l]) => `<option value="${v}" ${item.size === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>`;
    openEditor(index < 0 ? "添加图集图片" : "编辑图集图片", body, () => {
      item.image = $("#gUrl").value.trim();
      if (!item.image) {
        toast("先选一张图片吧", "error");
        return false;
      }
      item.title = $("#gTitle").value.trim();
      item.date = $("#gDate").value.trim();
      item.caption = $("#gCaption").value.trim();
      item.alt = $("#gAlt").value.trim();
      item.size = $("#gSize").value;
      if (index < 0) content.gallery.push(item);
      else content.gallery[index] = item;
      markDirty();
      renderAll();
      return true;
    });
    $("#gPick").addEventListener("click", async () => {
      const url = await openPicker("");
      if (!url) return;
      $("#gUrl").value = url;
      $("#gImg").src = `../${url}`;
    });
  }

  /* ---------------- 渲染：合照墙 ---------------- */

  function renderWall() {
    const list = $("#wallList");
    list.innerHTML = "";
    if (!content.wall.length) {
      list.innerHTML = `<div class="empty">还没有合照的底片</div>`;
      return;
    }
    content.wall.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <img src="../${esc(item.image)}" alt="" onerror="this.src='${PLACEHOLDER}'" style="cursor:pointer" data-img>
        <div class="meta"><strong>${esc(item.title || "未命名")}</strong><span>${esc(item.caption)}</span></div>
        <div class="ops">
          <button class="icon-btn" type="button" data-up title="上移">↑</button>
          <button class="icon-btn" type="button" data-down title="下移">↓</button>
          <button class="btn btn-ghost btn-sm" type="button" data-edit>编辑</button>
          <button class="icon-btn danger" type="button" data-del title="删除">✕</button>
        </div>`;
      row.querySelector("[data-img]").addEventListener("click", async () => {
        const url = await openPicker("");
        if (!url) return;
        item.image = url;
        markDirty();
        renderAll();
      });
      row.querySelector("[data-edit]").addEventListener("click", () => editWall(index));
      row.querySelector("[data-del]").addEventListener("click", () => {
        if (!confirm(`从合照墙移除「${item.title || "这张"}」？`)) return;
        content.wall.splice(index, 1);
        markDirty();
        renderAll();
      });
      row.querySelector("[data-up]").addEventListener("click", () => moveItem(content.wall, index, -1));
      row.querySelector("[data-down]").addEventListener("click", () => moveItem(content.wall, index, 1));
      list.append(row);
    });
  }

  $("#newWall").addEventListener("click", () => editWall(-1));

  function editWall(index) {
    const item = index < 0 ? { id: "", image: "", alt: "", title: "", caption: "" } : clone(content.wall[index]);
    const body = `
      <div class="avatar-pick">
        <img class="preview is-wide" id="wImg" src="../${esc(item.image)}" alt="" style="width:160px;height:110px" onerror="this.src='${PLACEHOLDER}'">
        <div class="pick-actions">
          <div class="row"><button class="btn btn-pink btn-sm" type="button" id="wPick">上传 / 选择合照</button></div>
          <input class="input slim" id="wUrl" value="${esc(item.image)}" placeholder="图片地址">
        </div>
      </div>
      <label class="field"><span>标题</span><input class="input" id="wTitle" value="${esc(item.title)}" placeholder="第一次见面"></label>
      <label class="field"><span>小字（日期 · 一句话）</span><input class="input" id="wCaption" value="${esc(item.caption)}" placeholder="2022.05.20 · 樱花坡道"></label>
      <label class="field"><span>图片 alt 描述</span><input class="input" id="wAlt" value="${esc(item.alt)}"></label>`;
    openEditor(index < 0 ? "添加合照" : "编辑合照", body, () => {
      item.image = $("#wUrl").value.trim();
      if (!item.image) {
        toast("先选一张图片吧", "error");
        return false;
      }
      item.title = $("#wTitle").value.trim();
      item.caption = $("#wCaption").value.trim();
      item.alt = $("#wAlt").value.trim();
      if (index < 0) content.wall.push(item);
      else content.wall[index] = item;
      markDirty();
      renderAll();
      return true;
    });
    $("#wPick").addEventListener("click", async () => {
      const url = await openPicker("");
      if (!url) return;
      $("#wUrl").value = url;
      $("#wImg").src = `../${url}`;
    });
  }

  /* ---------------- 渲染：时间线 ---------------- */

  function renderTimeline() {
    const list = $("#timelineList");
    list.innerHTML = "";
    if (!content.timeline.length) {
      list.innerHTML = `<div class="empty">还没有节点</div>`;
      return;
    }
    content.timeline.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="meta">
          <strong>${esc(item.date)} · ${esc(item.title)}</strong>
          <span>${esc(item.text)}</span>
        </div>
        <div class="ops">
          <button class="icon-btn" type="button" data-up title="上移">↑</button>
          <button class="icon-btn" type="button" data-down title="下移">↓</button>
          <button class="btn btn-ghost btn-sm" type="button" data-edit>编辑</button>
          <button class="icon-btn danger" type="button" data-del title="删除">✕</button>
        </div>`;
      row.querySelector("[data-edit]").addEventListener("click", () => editTimeline(index));
      row.querySelector("[data-del]").addEventListener("click", () => {
        if (!confirm("删除这个时间线节点？")) return;
        content.timeline.splice(index, 1);
        markDirty();
        renderAll();
      });
      row.querySelector("[data-up]").addEventListener("click", () => moveItem(content.timeline, index, -1));
      row.querySelector("[data-down]").addEventListener("click", () => moveItem(content.timeline, index, 1));
      list.append(row);
    });
  }

  $("#newTimeline").addEventListener("click", () => editTimeline(-1));

  function editTimeline(index) {
    const item = index < 0 ? { id: "", date: "", title: "", text: "" } : clone(content.timeline[index]);
    const body = `
      <div class="row">
        <label class="field"><span>日期文字</span><input class="input" id="tDate" value="${esc(item.date)}" placeholder="2022.05.20"></label>
        <label class="field"><span>标题</span><input class="input" id="tTitle" value="${esc(item.title)}"></label>
      </div>
      <label class="field"><span>小故事</span><textarea class="textarea" id="tText" rows="3">${esc(item.text)}</textarea></label>`;
    openEditor(index < 0 ? "添加时间线节点" : "编辑时间线节点", body, () => {
      item.date = $("#tDate").value.trim();
      item.title = $("#tTitle").value.trim();
      if (!item.title) {
        toast("给这段回忆取个标题吧", "error");
        return false;
      }
      item.text = $("#tText").value.trim();
      if (index < 0) content.timeline.push(item);
      else content.timeline[index] = item;
      markDirty();
      renderAll();
      return true;
    });
  }

  /* ---------------- 渲染：留言 ---------------- */

  function renderNotes() {
    const list = $("#noteList");
    list.innerHTML = "";
    if (!content.notes.length) {
      list.innerHTML = `<div class="empty">罐子空空的</div>`;
      return;
    }
    content.notes.forEach((note, index) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="meta">
          <strong>${esc(note.name)} <span style="font-weight:400">· ${esc(note.date)} · ♥ ${note.likes}</span></strong>
          <span style="display:block;white-space:normal">${esc(note.text)}</span>
        </div>
        <div class="ops">
          <button class="btn btn-ghost btn-sm" type="button" data-edit>改一改</button>
          <button class="icon-btn danger" type="button" data-del title="删除">✕</button>
        </div>`;
      row.querySelector("[data-edit]").addEventListener("click", () => editNote(index));
      row.querySelector("[data-del]").addEventListener("click", () => {
        if (!confirm(`删除 ${note.name} 的这颗糖？`)) return;
        content.notes.splice(index, 1);
        markDirty();
        renderAll();
      });
      list.append(row);
    });
  }

  $("#newNote").addEventListener("click", () => editNote(-1));

  function editNote(index) {
    const note =
      index < 0
        ? { id: "", name: "", text: "", color: "pink", date: todayDot(), likes: 0 }
        : clone(content.notes[index]);
    const body = `
      <div class="row">
        <label class="field"><span>名字</span><input class="input" id="nName" value="${esc(note.name)}"></label>
        <label class="field"><span>日期</span><input class="input" id="nDate" value="${esc(note.date)}" placeholder="2026.10.20"></label>
        <label class="field"><span>糖果颜色</span>
          <select class="select" id="nColor">${NOTE_COLORS.map(([v, l]) => `<option value="${v}" ${note.color === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        </label>
      </div>
      <label class="field"><span>留言内容</span><textarea class="textarea" id="nText" rows="4" maxlength="140">${esc(note.text)}</textarea></label>
      <label class="field"><span>点赞数</span><input class="input" type="number" min="0" id="nLikes" value="${note.likes}"></label>`;
    openEditor(index < 0 ? "添加一颗糖" : "改留言", body, () => {
      note.name = $("#nName").value.trim() || "匿名";
      note.text = $("#nText").value.trim();
      if (!note.text) {
        toast("留言内容是空的", "error");
        return false;
      }
      note.date = $("#nDate").value.trim() || todayDot();
      note.color = $("#nColor").value;
      note.likes = Math.max(0, Number($("#nLikes").value) || 0);
      if (index < 0) content.notes.unshift(note);
      else content.notes[index] = note;
      markDirty();
      renderAll();
      return true;
    });
  }

  /* ---------------- 账号 / 备份 ---------------- */

  fillSyncPanel();

  $("#accSave").addEventListener("click", async () => {
    if (LOCAL_MODE) return toast("本机模式下没有服务器账号可改，部署到服务器后再来设置", "error");
    if (LOCAL_ENTRY !== Boolean(LOCAL_SESSION)) {
      // 本机编辑窗口为了省事不登录，但改口令必须先验旧口令（点「退出登录」就能用账号密码登录）
      LOCAL_ENTRY = false;
      LOCAL_SESSION = false;
      toast("改口令要先验证旧口令，帮你打开登录框啦", "");
      return showLogin();
    }
    const current = $("#accCurrent").value;
    const next = $("#accNext").value;
    const next2 = $("#accNext2").value;
    if (!current) return toast("先输入当前口令", "error");
    if (next.length < 8) return toast("新口令至少 8 位", "error");
    if (next !== next2) return toast("两次输入的新口令不一样", "error");
    try {
      await api("/password", {
        method: "POST",
        body: JSON.stringify({ current, next, username: $("#accUser").value.trim() })
      });
      $("#accCurrent").value = $("#accNext").value = $("#accNext2").value = "";
      toast("账号已更新 ✿", "ok");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  /* --- 账号与备份里的「上传到 GitHub」设置 --- */
  function fillSyncPanel() {
    if (!syncState) return;
    const repo = $("#accRepo");
    const branch = $("#accBranch");
    const state = $("#accSyncState");
    if (repo && document.activeElement !== repo) repo.value = syncState.repo || "";
    if (branch && document.activeElement !== branch) branch.value = syncState.branch || "main";
    if (state) {
      state.textContent = syncState.configured
        ? `${syncState.repo}（${syncState.branch}）${syncState.dirty ? "· 有还没上传的修改" : "· 云端已是最新"}`
        : "还没有设置仓库";
    }
  }

  $("#accSyncSave").addEventListener("click", async () => {
    const repo = $("#accRepo").value.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
    const branch = $("#accBranch").value.trim() || "main";
    const token = $("#accToken").value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return toast("仓库写成 owner/名称 这样，例如 OrbitSunztoo/sunwowotou", "error");
    if (token && !/^(github_pat_|gh[ps]_)/.test(token)) return toast("令牌应该以 github_pat_ 或 ghp_ 开头，再看一眼？", "error");
    const button = $("#accSyncSave");
    button.disabled = true;
    try {
      await api("/sync/setup", { method: "POST", body: JSON.stringify({ repo, branch, token }) });
      $("#accToken").value = "";
      await checkSync();
      fillSyncPanel();
      toast("上传设置保存好啦 ✿", "ok");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  $("#accSyncFull").addEventListener("click", async () => {
    if (!syncState || !syncState.configured) return toast("先把仓库和令牌保存一下", "error");
    await runSync({ full: true, quiet: true });
  });

  function downloadJSON(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // 本机模式：导出成 content.json，可以直接替换仓库 / 服务器上的同名文件
  $("#localExport").addEventListener("click", () => {
    if (!content) return;
    downloadJSON(content, "content.json");
    toast("已导出 content.json，替换站点根目录的同名文件即可发布", "ok");
  });

  $("#backupBtn").addEventListener("click", async () => {
    if (LOCAL_MODE) {
      if (content) downloadJSON(content, `fuwari-backup-${todayISO()}.json`);
      return;
    }
    try {
      const data = await api("/backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `fuwari-backup-${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("#restoreBtn").addEventListener("click", () => $("#restoreFile").click());
  $("#restoreFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !data.owner || !data.articles) throw new Error("这个文件看起来不是ふわり的备份");
      if (!confirm("用这个备份替换现在的全部内容？")) return;
      if (LOCAL_MODE) {
        if (!writeLocalContent(data)) throw new Error("浏览器存储写不进去，换一个浏览器试试");
      } else {
        await api("/content", { method: "PUT", body: JSON.stringify(data) });
      }
      await loadContent();
      renderAll();
      renderTab(currentTab);
      toast("已从备份恢复", "ok");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("把全部内容恢复成初始示例？这个操作会覆盖现在的文章、图集与留言。")) return;
    try {
      await api("/content/reset", { method: "POST" });
      await loadContent();
      renderAll();
      renderTab(currentTab);
      toast("已恢复初始内容", "ok");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  /* ---------------- 启动 ---------------- */

  boot();
})();
