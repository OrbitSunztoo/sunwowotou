/* =========================================================
   ふわり Fuwari — 内容规范化与保存
   - 服务端永远输出「干净、结构正确」的数据
   - 名单类内容（文章 / 图集 / 合照 / 时间线 / 留言）支持增删排序
   ========================================================= */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { defaultContent } = require("./defaults");

const TAG_CLASSES = ["tag-lav", "tag-mint", "tag-pink", "tag-cream"];
const NOTE_COLORS = ["pink", "lav", "mint", "cream"];
const GALLERY_SIZES = ["normal", "wide", "tall"];
const BLOCK_TYPES = ["p", "h2", "quote", "list"];

const str = (value, max = 400) =>
  String(value == null ? "" : value)
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, max);

const oneLine = (value, max = 200) => str(value, max).replace(/\s+/g, " ");

const bool = (value) => value === true || value === "true" || value === 1 || value === "1";

function slugifyId(prefix, seed) {
  const base = String(seed || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const tail = crypto.randomBytes(3).toString("hex");
  return base ? `${prefix}-${base}-${tail}` : `${prefix}-${tail}`;
}

function uniqueId(candidate, taken) {
  let id = candidate;
  let n = 2;
  while (taken.has(id)) id = `${candidate}-${n++}`;
  taken.add(id);
  return id;
}

/* ---------------- 图片地址 ---------------- */

// 允许：站内相对路径（assets/...、uploads/...、http(s) 图片、data:image）
function imagePath(value, max = 500) {
  const raw = oneLine(value, max);
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
  const clean = raw.replace(/^\.?\//, "").replace(/\\/g, "/");
  if (clean.includes("..")) return "";
  if (/^(assets|uploads)\//.test(clean)) return clean;
  return clean;
}

/* ---------------- 文章 ---------------- */

function normalizeBody(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((block) => {
    if (!block || typeof block !== "object") return;
    const type = BLOCK_TYPES.includes(block.type) ? block.type : "p";
    if (type === "list") {
      const items = (Array.isArray(block.items) ? block.items : [])
        .map((item) => str(item, 160))
        .filter(Boolean)
        .slice(0, 20);
      if (items.length) out.push({ type: "list", items });
      return;
    }
    const text = str(block.text, 4000);
    if (text) out.push({ type, text });
  });
  return out;
}

function normalizeArticle(raw, taken) {
  const src = raw && typeof raw === "object" ? raw : {};
  const title = oneLine(src.title, 80) || "未命名的一篇";
  const id = uniqueId(oneLine(src.id, 40).replace(/[^\w-]/g, "") || slugifyId("post", title), taken);
  const date = oneLine(src.date, 10).replace(/\//g, "-");
  return {
    id,
    title,
    tag: oneLine(src.tag, 12) || "日常",
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10),
    read: oneLine(src.read, 12),
    image: imagePath(src.image, 500),
    alt: oneLine(src.alt, 160),
    excerpt: str(src.excerpt, 240),
    body: normalizeBody(src.body)
  };
}

/* ---------------- 图集 / 合照墙 ---------------- */

function normalizeGalleryItem(raw, taken) {
  const src = raw && typeof raw === "object" ? raw : {};
  const image = imagePath(src.image, 500);
  const id = uniqueId(oneLine(src.id, 40).replace(/[^\w-]/g, "") || slugifyId("pic", src.title), taken);
  return {
    id,
    image,
    alt: oneLine(src.alt, 160),
    title: oneLine(src.title, 40),
    date: oneLine(src.date, 20),
    caption: str(src.caption, 200),
    size: GALLERY_SIZES.includes(src.size) ? src.size : "normal"
  };
}

function normalizeWallItem(raw, taken) {
  const src = raw && typeof raw === "object" ? raw : {};
  const id = uniqueId(oneLine(src.id, 40).replace(/[^\w-]/g, "") || slugifyId("wall", src.title), taken);
  return {
    id,
    image: imagePath(src.image, 500),
    alt: oneLine(src.alt, 160),
    title: oneLine(src.title, 40),
    caption: oneLine(src.caption, 120)
  };
}

function normalizeTimelineItem(raw, taken) {
  const src = raw && typeof raw === "object" ? raw : {};
  const id = uniqueId(oneLine(src.id, 40).replace(/[^\w-]/g, "") || slugifyId("t", src.date), taken);
  return {
    id,
    date: oneLine(src.date, 20),
    title: oneLine(src.title, 60),
    text: str(src.text, 300)
  };
}

/* ---------------- 留言 ---------------- */

function normalizeNote(raw, taken) {
  const src = raw && typeof raw === "object" ? raw : {};
  const text = str(src.text, 140);
  if (!text) return null;
  const id = uniqueId(oneLine(src.id, 48).replace(/[^\w-]/g, "") || slugifyId("note", src.name), taken);
  const date = oneLine(src.date, 12);
  return {
    id,
    name: oneLine(src.name, 16) || "匿名",
    text,
    color: NOTE_COLORS.includes(src.color) ? src.color : "pink",
    date: /^\d{4}\.\d{2}\.\d{2}$/.test(date) ? date : today(),
    likes: Math.max(0, Math.floor(Number(src.likes) || 0))
  };
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/* ---------------- 人物 ---------------- */

function normalizePair(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    label: oneLine(src.label, 20),
    value: oneLine(src.value, 80)
  };
}

function normalizePerson(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const person = {
    name: oneLine(src.name, 24) || "无名氏",
    latin: oneLine(src.latin, 24),
    roles: oneLine(src.roles, 60),
    avatar: imagePath(src.avatar, 500),
    alt: oneLine(src.alt, 160),
    handle: oneLine(src.handle, 40),
    vrcId: oneLine(src.vrcId, 40),
    status: oneLine(src.status, 24),
    statusAway: bool(src.statusAway),
    bio: str(src.bio, 300),
    info: (Array.isArray(src.info) ? src.info : []).map(normalizePair).filter((p) => p.label || p.value).slice(0, 8),
    tags: (Array.isArray(src.tags) ? src.tags : []).map((t) => oneLine(t, 16)).filter(Boolean).slice(0, 12),
    vrcCover: oneLine(src.vrcCover, 40),
    vrcStatus: oneLine(src.vrcStatus, 40),
    vrcStatusAway: bool(src.vrcStatusAway),
    mutual: oneLine(src.mutual, 40)
  };
  if (src.aboutTitle !== undefined || src.signature !== undefined) {
    person.signature = oneLine(src.signature, 24);
    person.signNote = oneLine(src.signNote, 60);
    person.aboutTitle = oneLine(src.aboutTitle, 24);
    person.aboutParagraphs = (Array.isArray(src.aboutParagraphs) ? src.aboutParagraphs : [])
      .map((p) => str(p, 400))
      .filter(Boolean)
      .slice(0, 8);
    person.aboutTags = (Array.isArray(src.aboutTags) ? src.aboutTags : []).map((t) => oneLine(t, 16)).filter(Boolean).slice(0, 12);
    person.currently = (Array.isArray(src.currently) ? src.currently : []).map(normalizePair).filter((p) => p.label || p.value).slice(0, 6);
    person.readNote = oneLine(src.readNote, 60);
  }
  return person;
}

/* ---------------- 整份内容 ---------------- */

function normalizeContent(raw) {
  const base = defaultContent();
  const src = raw && typeof raw === "object" ? raw : {};
  const site = { ...base.site, ...(src.site || {}) };

  const articles = new Set();
  const gallery = new Set();
  const wall = new Set();
  const timeline = new Set();
  const notes = new Set();

  const out = {
    version: 1,
    updatedAt: new Date().toISOString(),
    site: {
      brand: oneLine(site.brand, 12) || base.site.brand,
      brandEn: oneLine(site.brandEn, 20) || base.site.brandEn,
      tagline: oneLine(site.tagline, 60) || base.site.tagline,
      logo: imagePath(site.logo, 500) || base.site.logo,
      title: oneLine(site.title, 80) || base.site.title,
      eyebrowYear: oneLine(site.eyebrowYear, 8) || base.site.eyebrowYear,
      heroTitleTop: str(site.heroTitleTop, 30) || base.site.heroTitleTop,
      heroTitleBottom: str(site.heroTitleBottom, 30) || base.site.heroTitleBottom,
      lede: str(site.lede, 200) || base.site.lede,
      heroImage: imagePath(site.heroImage) || base.site.heroImage,
      heroCaption: str(site.heroCaption, 40) || base.site.heroCaption,
      moodLabel: oneLine(site.moodLabel, 12) || base.site.moodLabel,
      moodWord: oneLine(site.moodWord, 16) || base.site.moodWord,
      moodNote: oneLine(site.moodNote, 24) || base.site.moodNote,
      countdownNote: oneLine(site.countdownNote, 30) || base.site.countdownNote,
      footerText: str(site.footerText, 200) || base.site.footerText,
      footerScript: oneLine(site.footerScript, 40) || base.site.footerScript,
      footerNote: str(site.footerNote, 200) || base.site.footerNote,
      copyright: oneLine(site.copyright, 120) || base.site.copyright,
      ticker: (Array.isArray(site.ticker) ? site.ticker : base.site.ticker)
        .map((t) => oneLine(t, 30))
        .filter(Boolean)
        .slice(0, 12),
      links: (Array.isArray(site.links) ? site.links : base.site.links)
        .map((l) => ({
          label: oneLine(l && l.label, 20),
          value: oneLine(l && l.value, 60),
          toast: oneLine(l && l.toast, 80)
        }))
        .filter((l) => l.label || l.value)
        .slice(0, 8)
    },
    owner: normalizePerson(src.owner || base.owner),
    partner: normalizePerson(src.partner || base.partner),
    couple: null,
    articles: (Array.isArray(src.articles) ? src.articles : base.articles)
      .map((a) => normalizeArticle(a, articles))
      .slice(0, 60),
    gallery: (Array.isArray(src.gallery) ? src.gallery : base.gallery)
      .map((g) => normalizeGalleryItem(g, gallery))
      .slice(0, 60),
    wall: (Array.isArray(src.wall) ? src.wall : base.wall)
      .map((w) => normalizeWallItem(w, wall))
      .slice(0, 40),
    timeline: (Array.isArray(src.timeline) ? src.timeline : base.timeline)
      .map((t) => normalizeTimelineItem(t, timeline))
      .slice(0, 40),
    notes: (Array.isArray(src.notes) ? src.notes : base.notes)
      .map((n) => normalizeNote(n, notes))
      .filter(Boolean)
      .slice(0, 300),
    about: { eyebrow: oneLine((src.about && src.about.eyebrow) || base.about.eyebrow, 30) }
  };

  out.owner.readNote = out.owner.readNote || base.owner.readNote;
  out.partner.readNote = out.partner.readNote || "";

  // 情侣资料
  const couple = { ...base.couple, ...(src.couple || {}) };
  const since = oneLine(couple.since, 40);
  const isoOk = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/.test(since);
  const anniversary = oneLine(couple.anniversary, 5);
  out.couple = {
    since: isoOk ? since : base.couple.since,
    sinceLabel: oneLine(couple.sinceLabel, 20) || base.couple.sinceLabel,
    anniversary: /^\d{2}-\d{2}$/.test(anniversary) ? anniversary : base.couple.anniversary,
    titleTop: oneLine(couple.titleTop, 12) || base.couple.titleTop,
    titleBottom: oneLine(couple.titleBottom, 12) || base.couple.titleBottom,
    eyebrow: oneLine(couple.eyebrow, 60) || base.couple.eyebrow,
    lede: str(couple.lede, 200) || base.couple.lede,
    note: str(couple.note, 300) || base.couple.note,
    wallNote: oneLine(couple.wallNote, 60) || base.couple.wallNote,
    timelineTitle: oneLine(couple.timelineTitle, 30) || base.couple.timelineTitle,
    timelineFoot: oneLine(couple.timelineFoot, 40) || base.couple.timelineFoot,
    wish: str(couple.wish, 120) || base.couple.wish
  };

  return out;
}

/* ---------------- 读写 ---------------- */

function createStore(dataDir) {
  const file = path.join(dataDir, "content.json");
  fs.mkdirSync(dataDir, { recursive: true });

  let cache = null;
  let cacheStamp = "";

  // 文件被外部改过（手动编辑、从备份恢复）时自动重新读取，避免进程内缓存吞掉改动
  function stamp() {
    try {
      const stat = fs.statSync(file);
      return `${stat.mtimeMs}:${stat.size}`;
    } catch (error) {
      return "";
    }
  }

  function load() {
    if (cache && cacheStamp === stamp()) return cache;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      cache = normalizeContent(parsed);
      cacheStamp = stamp();
    } catch (error) {
      if (fs.existsSync(file)) {
        const backup = `${file}.broken-${Date.now()}`;
        try {
          fs.renameSync(file, backup);
          console.warn(`[fuwari] content.json 无法解析，已备份为 ${path.basename(backup)}`);
        } catch (e) {
          /* ignore */
        }
      }
      cache = normalizeContent(defaultContent());
      write(cache);
    }
    return cache;
  }

  function write(content) {
    const next = { ...content, updatedAt: new Date().toISOString() };
    cache = next;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    fs.renameSync(tmp, file);
    cacheStamp = stamp();
    return next;
  }

  function save(next) {
    return write(normalizeContent(next));
  }

  function replace(raw) {
    return write(normalizeContent(raw));
  }

  function reset() {
    cache = null;
    try {
      fs.unlinkSync(file);
    } catch (error) {
      /* already gone */
    }
    return load();
  }

  return { file, load, save, replace, reset };
}

module.exports = {
  createStore,
  normalizeContent,
  imagePath,
  slugifyId,
  TAG_CLASSES,
  NOTE_COLORS,
  GALLERY_SIZES
};
