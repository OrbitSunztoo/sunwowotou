/* =========================================================
   ふわり Fuwari — assets/js/content.js
   从后台（/api/content）取数据，渲染首页 + 砂糖情侣页的所有动态内容。
   暴露：
     window.FuwariContent = { ready, content, refresh(), on(name, fn), openArticle(id), api }
   事件（document 上派发）：
     fuwari:ready   { content }
     fuwari:update  { content }
     fuwari:error   { error }
   ========================================================= */
(() => {
  "use strict";

  const config = window.FUWARI_CONFIG || {};
  // 用 file:// 直接打开时，配成后台地址即可（例如 "http://127.0.0.1:8787"）
  const BASE = String(config.apiBase || "").replace(/\/+$/, "");
  // 纯静态托管时，配 dataUrl 指向一个 content.json（例如 "./content.json" 或 "../data/content.json"）
  const DATA_URL = String(config.dataUrl || "").trim();

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  const esc = (value) =>
    String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /* ---------------- 小工具 ---------------- */

  const TAG_CLASSES = ["tag-lav", "tag-mint", "tag-pink", "tag-cream"];
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const MONTHS_CN = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

  function tagClass(seed) {
    const text = String(seed || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 9973;
    return TAG_CLASSES[hash % TAG_CLASSES.length];
  }

  /** "2026-10-20" → "2026.10.20" */
  function dotDate(value) {
    return String(value || "").replace(/-/g, ".");
  }

  /** "2026-10-20" → { year: "2026", month: "OCT", day: "20" } */
  function parts(value) {
    const match = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value || ""));
    if (!match) return { year: String(value || ""), month: "", day: "" };
    return {
      year: match[1],
      month: MONTHS[Number(match[2]) - 1] || "",
      day: match[3].padStart(2, "0")
    };
  }

  /** 解析后台里的时间字符串，兼容 Safari */
  function parseDate(value, fallback) {
    const text = String(value || "").trim();
    if (!text) return fallback;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? fallback : date;
  }

  function sinceDate(content) {
    return parseDate(content.couple && content.couple.since, new Date("2022-05-20T20:00:00+08:00"));
  }

  function anniversaryParts(content) {
    const raw = String((content.couple && content.couple.anniversary) || "05-20");
    const match = /(\d{1,2})-(\d{1,2})/.exec(raw) || [null, "5", "20"];
    return { month: Math.min(12, Math.max(1, Number(match[1]))), day: Math.min(31, Math.max(1, Number(match[2]))) };
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /* ---------------- 站点文案 ---------------- */

  function setText(node, value) {
    if (value == null || value === "") return;
    node.textContent = value;
  }

  function setHTML(node, value) {
    if (value == null || value === "") return;
    node.innerHTML = value;
  }

  /** 支持 root 是 Element 或 Document */
  function pick(root, selector) {
    if (root && root.nodeType === 1 && root.matches && root.matches(selector)) return root;
    return root.querySelector(selector);
  }

  function all(root, selector) {
    return Array.from(root.querySelectorAll(selector));
  }

  function each(root, selector, value, asHTML) {
    if (value == null || value === "") return;
    all(root, selector).forEach((node) => {
      if (asHTML) node.innerHTML = value;
      else node.textContent = value;
    });
  }

  function applySite(content, root) {
    const site = content.site || {};
    const owner = content.owner || {};
    const partner = content.partner || {};
    const couple = content.couple || {};
    const about = content.about || {};

    each(root, '[data-site="brand"]', site.brand);
    each(root, '[data-site="brandEn"]', site.brandEn);
    each(root, '[data-site="eyebrow"]', site.eyebrowYear);
    each(root, '[data-site="heroLine1"]', site.heroTitleTop);
    each(root, '[data-site="heroLine2"]', site.heroTitleBottom);
    each(root, '[data-site="heroLede"]', site.lede);
    each(root, '[data-site="heroCaption"]', site.heroCaption);
    each(root, '[data-site="moodLabel"]', site.moodLabel);
    each(root, '[data-site="moodWord"]', site.moodWord);
    each(root, '[data-site="moodNote"]', site.moodNote);
    each(root, '[data-site="countdownNote"]', site.countdownNote);

    if (site.title) document.title = site.title;

    each(root, '[data-footer="tagline"]', site.footerText, true);
    each(root, '[data-footer="script"]', site.footerScript);
    each(root, '[data-footer="note"]', site.footerNote, true);
    each(root, '[data-footer="copyright"]', site.copyright);

    // 关于区的小标题年份
    each(root, '[data-about-year]', about.eyebrow);

    // 人物
    ["name", "latin", "roles", "handle", "status", "signature", "signNote"].forEach((key) => {
      each(root, `[data-owner="${key}"]`, owner[key]);
    });
    ["name", "latin", "roles", "handle", "status"].forEach((key) => {
      each(root, `[data-partner="${key}"]`, partner[key]);
    });

    // 图片（data-key）
    all(root, "img[data-key]").forEach((img) => {
      const key = img.dataset.key;
      const src =
        key === "site.heroImage"
          ? site.heroImage
          : key === "site.logo"
            ? site.logo
            : key === "owner.avatar"
              ? owner.avatar
              : key === "partner.avatar"
                ? partner.avatar
                : "";
      if (src) img.src = src;
      const altKey = img.dataset.alt;
      if (altKey === "site.heroAlt" && site.heroAlt) img.alt = site.heroAlt;
      if (altKey === "owner.alt" && owner.alt) img.alt = owner.alt;
      if (altKey === "partner.alt" && partner.alt) img.alt = partner.alt;
    });

    // 在线状态
    [["owner", owner], ["partner", partner]].forEach(([who, person]) => {
      all(root, `[data-status="${who}"]`).forEach((pill) => {
        pill.classList.toggle("away", Boolean(person.statusAway));
      });
    });

    // 情侣区
    each(root, '[data-couple="titleMain"]', couple.titleTop);
    each(root, '[data-couple="titleAccent"]', couple.titleBottom);
    each(root, '[data-couple="eyebrow"]', couple.eyebrow);
    each(root, '[data-couple="timelineTitle"]', couple.timelineTitle);
    each(root, '[data-couple-html="lede"]', couple.lede, true);
    each(root, '[data-couple-html="wallNote"]', couple.wallNote, true);
    each(root, '[data-couple-html="profileNote"]', couple.profileNote, true);
    each(root, '[data-couple-html="versarySub"]', couple.versarySub, true);
    each(root, '[data-couple-html="wish"]', couple.wish, true);
    each(root, '[data-couple-html="timelineFoot"]', couple.timelineFoot, true);
    each(root, '[data-couple-html="note"]', couple.note, true);

    each(root, "[data-couple-pair]", [owner.latin || owner.name, partner.latin || partner.name].filter(Boolean).join(" & "));

    // 纪念日文字
    const since = sinceDate(content);
    const { month, day } = anniversaryParts(content);
    const sinceText = couple.sinceLabel || `${since.getFullYear()}.${pad(since.getMonth() + 1)}.${pad(since.getDate())}`;
    each(root, "[data-since-label]", `${sinceText} — forever`);
    each(root, "[data-since-text]", `${sinceText} ${pad(since.getHours())}:${pad(since.getMinutes())}`);
    each(root, "[data-bridge-label]", `${pad(month)} · ${pad(day)}`);
    each(root, "[data-bridge-mini]", `since ${since.getFullYear()}`);
    each(root, "[data-verse-short]", `${month}·${day}`);
    each(root, "[data-stamp-year]", String(since.getFullYear()));

    const now = new Date();
    each(root, '[data-footer="date"]', `${now.getFullYear()} · ${MONTHS_CN[now.getMonth()]}月`);

    // 计数
    each(root, "[data-count-posts]", String((content.articles || []).length));
    each(root, "[data-count-gallery]", String((content.gallery || []).length));
    each(root, "[data-count-wall]", String((content.wall || []).length));
  }

  function applySections(content, root) {
    const owner = content.owner || {};
    each(root, "[data-about-title]", owner.aboutTitle);
    const body = pick(root, "[data-about-body]");
    if (body && owner.aboutParagraphs && owner.aboutParagraphs.length) {
      body.innerHTML = owner.aboutParagraphs.map((text) => `<p>${esc(text)}</p>`).join("");
    }
    const tags = pick(root, "#aboutTags");
    if (tags) {
      tags.innerHTML = (owner.aboutTags || []).map((tag) => `<span>${esc(tag)}</span>`).join("");
    }

    const currently = pick(root, "#currentlyList");
    if (currently) {
      currently.innerHTML = (owner.currently || [])
        .map((item) => `<li><span>${esc(item.label)}</span>${esc(item.value)}</li>`)
        .join("");
    }

    const links = pick(root, "#footerLinks");
    if (links) {
      links.innerHTML =
        "<h3>找到我</h3>" +
        ((content.site && content.site.links) || [])
          .map(
            (link) =>
              `<button type="button" data-toast="${esc(link.toast || `记得去 ${link.label} 找我 ♥`)}">${esc(link.label)}<span>${esc(link.value)}</span></button>`
          )
          .join("");
    }
  }

  /* ---------------- 跑马灯 ---------------- */

  function renderTicker(content, root) {
    const track = pick(root, "#tickerTrack");
    if (!track) return;
    const words = ((content.site && content.site.ticker) || []).filter(Boolean);
    if (!words.length) return;
    const icons = ["✦", "♥"];
    const line = words.map((word, index) => `<span>${esc(word)}</span><i>${icons[index % 2]}</i>`).join("");
    track.innerHTML = line + line;
  }

  /* ---------------- 手帐 ---------------- */

  function renderPosts(content, root) {
    const grid = pick(root, "#postGrid");
    if (!grid) return;
    const posts = content.articles || [];
    if (!posts.length) {
      grid.innerHTML = `<p class="empty-hint">手帐还是空的，去后台写下第一件小事情吧 ✿</p>`;
      return;
    }
    grid.classList.remove("is-loading");
    const owner = content.owner || {};
    grid.innerHTML = posts
      .map((post, index) => {
        const variant = index === 0 ? "post-lead" : index === 1 ? "post-side" : "post-mini";
        const date = parts(post.date);
        const image = post.image || "assets/img/scene-cafe.svg";
        return `
        <article class="post-card ${variant}" data-art="${esc(post.id)}" tabindex="0" role="button" aria-label="阅读《${esc(post.title)}》">
          <div class="post-media">
            <img src="${esc(image)}" alt="${esc(post.alt || post.title)}" loading="${index < 2 ? "eager" : "lazy"}">
            <span class="post-badge">${esc(date.month || "JOURNAL")}</span>
          </div>
          <div class="post-body">
            <div class="post-meta">
              <span class="tag ${tagClass(post.tag)}">${esc(post.tag || "日常")}</span>
              <span>${esc(date.day)} ${esc(date.month)} ${esc(date.year)}</span>
            </div>
            <h3>${esc(post.title)}</h3>
            <p>${esc(post.excerpt || "")}</p>
            <div class="post-foot">
              <span class="post-author">
                <img src="${esc(owner.avatar || "assets/img/avatar-yuzu.svg")}" alt="">
                ${esc(owner.name || "柚子")}
              </span>
              <span class="post-read">${esc(post.read || "阅读")} <svg class="icon"><use href="#i-arrow"/></svg></span>
            </div>
          </div>
        </article>`;
      })
      .join("");
  }

  /* ---------------- 图集 ---------------- */

  function renderGallery(content, root) {
    const grid = pick(root, "#galleryGrid");
    if (!grid) return;
    const items = content.gallery || [];
    if (!items.length) {
      grid.innerHTML = `<p class="empty-hint">还没有照片，去后台挑几张喜欢的吧 ✿</p>`;
      return;
    }
    grid.innerHTML = items
      .map((item) => {
        const size = item.size === "wide" ? "g-wide" : item.size === "tall" ? "g-tall" : "";
        const date = parts(item.date);
        const meta = [date.year, date.month].filter(Boolean).join(" · ");
        return `
        <button class="gallery-item ${size}" type="button" data-img="${esc(item.image)}" data-caption="${esc(item.caption || item.title || "")}">
          <span class="g-tape" aria-hidden="true"></span>
          <img src="${esc(item.image)}" alt="${esc(item.alt || item.title || "相册照片")}" loading="lazy">
          <span class="g-cap">${esc(item.title || "")}<em>${esc(meta)}</em></span>
        </button>`;
      })
      .join("");
  }

  /* ---------------- 合照墙 ---------------- */

  function renderWall(content, root) {
    const grid = pick(root, "#wallGrid");
    if (!grid) return;
    const items = content.wall || [];
    if (!items.length) {
      grid.innerHTML = `<p class="empty-hint">合照墙还空着 ✿</p>`;
      return;
    }
    grid.innerHTML = items
      .map((item, index) => {
        const rot = `rot-${(index % 8) + 1}`;
        const date = parts(item.date);
        return `
        <figure class="polaroid ${rot} reveal">
          <span class="p-tape" aria-hidden="true"></span>
          <div class="p-photo"><img src="${esc(item.image)}" alt="${esc(item.alt || item.title || "合照")}" loading="lazy"></div>
          <figcaption><span>${esc(item.title || "")}</span><em>${esc(item.caption || [date.year, date.month].filter(Boolean).join(" · "))}</em></figcaption>
        </figure>`;
      })
      .join("");
  }

  /* ---------------- VRC 资料卡 ---------------- */

  function vrcCard(person, variant) {
    const extra = variant === "owner" ? "" : "vrc-sei";
    // vrcCover 存的是图片地址；只有当它确实像图片路径时才当作封面背景
    const coverSrc = String(person.vrcCover || "");
    const isImage = /^(https?:|data:image|\/?assets\/|\/?uploads\/)/i.test(coverSrc);
    const cover = isImage
      ? ` style="background-image:url('${esc(coverSrc)}');background-size:cover;background-position:center"`
      : "";
    const info = (person.info || [])
      .map((item) => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`)
      .join("");
    const tags = (person.tags || []).map((tag) => `<span>${esc(tag)}</span>`).join("");
    const status = person.vrcStatusAway ? "away" : "";
    return `
      <article class="vrc-card ${extra} reveal">
        <div class="vrc-cover"${cover}>
          <span class="vrc-plat"><i></i> VRChat · PC</span>
          <span class="vrc-world">${esc(person.vrcWorld || "ふわり星海")}</span>
          <span class="vrc-cover-star cover-s1">✦</span>
          <span class="vrc-cover-star cover-s2">✧</span>
          <span class="vrc-cover-star cover-s3">✦</span>
        </div>
        <div class="vrc-head">
          <span class="vrc-avatar"><img src="${esc(person.avatar)}" alt="${esc(person.alt || person.name)}"></span>
          <div class="vrc-name">
            <span class="vrc-status ${status}"><i></i> ${esc(person.vrcStatus || "在线")}</span>
            <h3>${esc(person.name)} <small>${esc(person.latin)}</small></h3>
            <button class="vrc-handle" type="button" data-copy="${esc(person.vrcId || person.handle || "")}">
              ${esc(person.handle || "")}
              <svg class="icon"><use href="#i-copy"/></svg>
            </button>
          </div>
        </div>
        <p class="vrc-bio">${esc(person.bio || "")}</p>
        <dl class="vrc-info">${info}</dl>
        <div class="vrc-tags">${tags}</div>
        <div class="vrc-foot">
          <button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(person.vrcId || "")}">
            <svg class="icon"><use href="#i-copy"/></svg> 复制 VRChat ID
          </button>
          <span class="vrc-mutual">${esc(person.mutual || "")}</span>
        </div>
      </article>`;
  }

  function renderProfiles(content, root) {
    const grid = pick(root, "#profileGrid");
    if (!grid) return;
    grid.innerHTML = vrcCard(content.owner || {}, "owner") + vrcCard(content.partner || {}, "partner");
  }

  /* ---------------- 时间线 ---------------- */

  function renderTimeline(content, root) {
    const list = pick(root, "#timelineList");
    if (!list) return;
    const items = content.timeline || [];
    list.innerHTML = items
      .map(
        (item) => `
        <li>
          <span class="t-date">${esc(item.date)}</span>
          <span class="t-dot" aria-hidden="true"></span>
          <div class="t-body"><h4>${esc(item.title)}</h4><p>${esc(item.text)}</p></div>
        </li>`
      )
      .join("");
  }

  /* ---------------- 留言计数 ---------------- */

  function renderNoteCount(content, root) {
    const total = (content.notes || []).length;
    each(root, "#noteCount", String(total));
    each(root, "#noteCountTop", String(total));
    const empty = pick(root, "#notesEmpty");
    if (empty) empty.hidden = total > 0;
  }

  /* ---------------- 取数据 ---------------- */

  let requestSeq = 0;
  let currentContent = null;

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const name = `__fuwari_cb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("读取内容超时了"));
      }, 12000);

      function cleanup() {
        clearTimeout(timer);
        delete window[name];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[name] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("没有连上后台服务"));
      };
      script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${name}`;
      document.head.append(script);
    });
  }

  async function fetchContent() {
    let url;
    if (DATA_URL) url = DATA_URL;
    else if (BASE) url = `${BASE}/api/content`;
    else url = "/api/content";
    try {
      const res = await fetch(url, { credentials: "omit", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (!DATA_URL && url.startsWith("http")) return jsonp(url);
      throw error;
    }
  }

  function render(content, root) {
    applySite(content, root);
    applySections(content, root);
    renderTicker(content, root);
    renderPosts(content, root);
    renderGallery(content, root);
    renderWall(content, root);
    renderProfiles(content, root);
    renderTimeline(content, root);
    renderNoteCount(content, root);
  }

  async function load(options = {}) {
    const seq = (requestSeq += 1);
    let content = null;
    let error = null;
    try {
      content = await fetchContent();
    } catch (err) {
      error = err;
    }
    if (seq !== requestSeq) return currentContent;
    if (!content) {
      document.body.classList.remove("is-loading");
      document.body.classList.add("is-offline");
      console.warn("[fuwari] 内容没有加载成功：", (error && error.message) || error);
      document.dispatchEvent(new CustomEvent("fuwari:error", { detail: { error } }));
      return null;
    }
    currentContent = content;
    render(content, document);
    document.body.classList.remove("is-loading", "is-offline");
    document.dispatchEvent(new CustomEvent(options.silent ? "fuwari:update" : "fuwari:ready", { detail: { content } }));
    return content;
  }

  const ready = load();

  /* ---------------- 对外接口 ---------------- */

  function on(name, handler) {
    document.addEventListener(name, handler);
    return () => document.removeEventListener(name, handler);
  }

  window.FuwariContent = {
    ready,
    get content() {
      return currentContent;
    },
    refresh: () => load({ silent: true }),
    on,
    render,
    esc,
    dotDate,
    parts,
    tagClass,
    sinceDate,
    anniversaryParts,
    api: async (path, options = {}) => {
      const res = await fetch(`${BASE}/api${path}`, {
        credentials: "same-origin",
        headers: options.body ? { "Content-Type": "application/json" } : {},
        ...options
      });      let data = null;
      try {
        data = await res.json();
      } catch (error) {
        data = null;
      }
      if (!res.ok) {
        const err = new Error((data && data.error) || "请求失败了，稍后再试一次吧");
        err.status = res.status;
        throw err;
      }
      return data;
    },
    // 纯静态托管（config.dataUrl）时没有后端，留言无法保存，这里给出可读的错误
    async postNote(input) {
      const payload = { name: input.name, text: input.text, color: input.color };
      const body = JSON.stringify(payload);
      if (DATA_URL) {
        const err = new Error("这个站点是静态托管的，留言暂时没法保存哦");
        err.status = 501;
        throw err;
      }
      return this.api("/notes", { method: "POST", body });
    },

    async likeNote(id, delta) {
      if (DATA_URL) {
        const err = new Error("这个站点是静态托管的，点赞暂时没法保存哦");
        err.status = 501;
        throw err;
      }
      return this.api("/notes/like", { method: "POST", body: JSON.stringify({ id, delta }) });
    },

    asset(url) {
      const text = String(url || "");
      if (!text) return "";
      if (/^(https?:|data:|blob:)/i.test(text)) return text;
      if (text.startsWith("/") || /^(assets|uploads)\//.test(text)) return text; // 同源资源直接用相对路径
      return BASE ? `${BASE}/${text}` : text;
    }
  };
})();

