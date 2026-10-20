/* =========================================================
   ふわり Fuwari — shared interactions
   ========================================================= */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, "0");

  // 后台（content.js）取回内容后才会渲染动态区块
  const CONTENT = () => window.FuwariContent;

  /* ---------------- toast ---------------- */

  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
  }
  window.fuwariToast = toast;

  /* ---------------- dates ---------------- */

  const FALLBACK_START = new Date("2022-05-20T20:00:00+08:00");
  const FALLBACK_ANNIVERSARY = { month: 5, day: 20 };

  function startDate() {
    const store = CONTENT();
    if (store && store.content && typeof store.sinceDate === "function") return store.sinceDate(store.content);
    return FALLBACK_START;
  }

  function anniversary() {
    const store = CONTENT();
    if (store && store.content && typeof store.anniversaryParts === "function") {
      return store.anniversaryParts(store.content);
    }
    return FALLBACK_ANNIVERSARY;
  }

  function daysTogether() {
    return Math.max(0, Math.floor((Date.now() - startDate().getTime()) / 86400000));
  }

  function nextAnniversary(now = new Date()) {
    const { month, day } = anniversary();
    let target = new Date(now.getFullYear(), month - 1, day, 0, 0, 0);
    if (now >= target) target = new Date(now.getFullYear() + 1, month - 1, day, 0, 0, 0);
    return target;
  }

  function updateDates() {
    const together = daysTogether().toLocaleString("en-US");
    $$("[data-together-days]").forEach((el) => (el.textContent = together));

    const metaValues = $$(".hero-meta .meta-item strong");
    if (metaValues[1]) metaValues[1].textContent = together;

    const countdown = $("[data-countdown-days]");
    if (countdown) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const days = Math.max(0, Math.ceil((nextAnniversary(now) - today) / 86400000));
      countdown.textContent = days;
    }
  }
  updateDates();
  setInterval(updateDates, 60000);

  /* ---------------- navigation ---------------- */

  const nav = $(".site-nav");
  const navLinks = $("#navLinks");
  const navScrim = $("#navScrim");
  const menuToggle = $(".menu-toggle");
  const mobileNav = window.matchMedia("(max-width: 900px)");

  function setMenu(open) {
    if (!menuToggle || !navLinks) return;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    navLinks.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    if (navScrim) navScrim.hidden = !open;
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
    });
  }
  if (navScrim) navScrim.addEventListener("click", () => setMenu(false));
  if (navLinks) {
    navLinks.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMenu(false);
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });
  mobileNav.addEventListener("change", (event) => {
    if (!event.matches) setMenu(false);
  });

  let lastScroll = -1;
  function onScroll() {
    const y = window.scrollY;
    if (Math.abs(y - lastScroll) < 6) return;
    lastScroll = y;
    if (nav) nav.classList.toggle("is-scrolled", y > 24);
    const backTop = $("[data-back-top]");
    if (backTop) backTop.classList.toggle("show", y > 720);
    updateActiveNav(y);
  }

  /* ---------------- active nav (home) ---------------- */

  const isMerged = document.body.classList.contains("page-home");
  const navSections = (isMerged ? ["journal", "gallery", "couple", "wall", "profiles", "versary", "messages", "about"] : [])
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const baseLinks = $$('#navLinks a[href^="#"]');

  function setActive(links, current) {
    // current 已带 # 前缀（如 "#couple"）
    links.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === current);
    });
  }

  function updateActiveNav(y) {
    if (!navSections.length || !baseLinks.length) return;
    // 用元素在文档里的绝对位置比较：兼容平滑滚动与 getBoundingClientRect 的坐标语义
    const probe = (y || 0) + window.innerHeight * 0.3;
    let current = "top";
    navSections.forEach((section) => {
      const top = section.getBoundingClientRect().top + window.scrollY;
      if (probe >= top - 8) current = section.id;
    });
    // 手帐 / 图集 / 砂糖情侣 / 关于 作为一级入口，其余小节归到所属区域
    const group =
      current === "wall" || current === "profiles" || current === "versary" || current === "messages"
        ? "couple"
        : current;
    setActive(baseLinks, group === "top" ? "#top" : `#${group}`);

    const inCoupleArea = ["couple", "wall", "profiles", "versary", "messages"].includes(current);
    // 砂糖情侣与关于之间的分段导航（只在进入这两个区域后才高亮）
    $$(".couple-divider .divider-link").forEach((link) => {
      const href = link.getAttribute("href");
      const inCouple = inCoupleArea;
      link.classList.toggle("is-active", (inCouple && href === "#couple") || (current === "about" && href === "#about"));
    });

    // 右上角的 首页 / 砂糖情侣 切换按钮（结构与 href 固定，点击统一走平滑回顶）
    const switchBtn = $(".view-switch");
    if (switchBtn) {
      switchBtn.classList.toggle("is-couple", inCoupleArea);
      switchBtn.setAttribute("data-target", inCoupleArea ? "top" : "couple");
      switchBtn.setAttribute("href", inCoupleArea ? "#top" : "#couple");
      switchBtn.setAttribute("aria-label", inCoupleArea ? "回到博客首页" : "前往砂糖情侣区域");
      const label = switchBtn.querySelector(".view-switch-label");
      if (label) label.textContent = inCoupleArea ? "回首页" : "砂糖情侣";
      const emoji = switchBtn.querySelector(".view-switch-emoji");
      if (emoji) emoji.textContent = inCoupleArea ? "✿" : "♥";
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("hashchange", () => {
    lastScroll = -1;
    onScroll();
  });
  onScroll();

  function goTop() {
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    const toggle = mobileNav.matches ? $(".menu-toggle") : null;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    setMenu(false);
  }

  $$("[data-back-top]").forEach((btn) => btn.addEventListener("click", goTop));

  // 顶栏“首页”与页脚“回到顶部”同样平滑回顶，并清掉 hash 以便下次重新触发
  $$('#navLinks a[href="#top"], .to-top[href="#top"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setMenu(false);
      goTop();
    });
  });

  // 顶栏右上角的 首页 ⇄ 砂糖情侣 切换
  const viewSwitch = $(".view-switch");
  if (viewSwitch) {
    viewSwitch.addEventListener("click", (event) => {
      const target = viewSwitch.getAttribute("data-target");
      if (target === "top" || viewSwitch.getAttribute("href") === "#top") {
        event.preventDefault();
        goTop();
        return;
      }
      event.preventDefault();
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      const coupleSection = document.getElementById("couple");
      if (!coupleSection) return;
      window.scrollTo({
        top: coupleSection.getBoundingClientRect().top + window.scrollY - 110,
        behavior: reduceMotion ? "auto" : "smooth",
      });
      history.replaceState(null, "", "#couple");
    });
  }

  /* ---------------- toast triggers ---------------- */

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-toast]");
    if (!trigger) return;
    event.preventDefault();
    toast(trigger.getAttribute("data-toast"));
  });

  /* ---------------- reveal on scroll ---------------- */

  const staggered = new WeakSet();
  const revealObserver =
    reduceMotion || !("IntersectionObserver" in window)
      ? null
      : new IntersectionObserver(
          (entries, observer) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -54px 0px" }
        );

  /** 观察（新出现的）渐入元素；动态渲染的区块可以在内容更新后重新调用 */
  function observeReveal(root = document) {
    const scope = root && root.querySelectorAll ? root : document;
    const items = scope.nodeType === 1 && scope.classList && scope.classList.contains("reveal") ? [scope] : [];
    items.push(...scope.querySelectorAll(".reveal"));

    items.forEach((el) => {
      if (!staggered.has(el)) {
        staggered.add(el);
        if (el.closest(".hero-copy")) {
          const group = items.filter((node) => node.closest(".hero-copy"));
          el.style.transitionDelay = `${Math.min(6, group.indexOf(el)) * 85}ms`;
        } else if (el.closest(".couple-hero-inner")) {
          const group = items.filter((node) => node.closest(".couple-hero-inner"));
          el.style.transitionDelay = `${Math.min(6, group.indexOf(el)) * 85}ms`;
        } else if (el.closest(".polaroid-wall")) {
          el.style.transitionDelay = `${(items.indexOf(el) % 4) * 65}ms`;
        } else if (el.closest(".gallery-grid")) {
          el.style.transitionDelay = `${(items.indexOf(el) % 4) * 70}ms`;
        } else if (el.closest(".post-grid")) {
          el.style.transitionDelay = `${(items.indexOf(el) % 3) * 90}ms`;
        }
      }
      if (!revealObserver) {
        el.classList.add("is-visible");
        return;
      }
      if (el.classList.contains("is-visible")) return;
      revealObserver.observe(el);
    });
  }

  observeReveal();

  /* ---------------- article reader ---------------- */

  const readerDialog = $("#readerDialog");
  const readerImg = $("#readerImg");
  const readerMeta = $("#readerMeta");
  const readerTitle = $("#readerTitle");
  const readerLede = $("#readerLede");
  const readerContent = $("#readerContent");
  let lastFocused = null;

  const escapeHTML = (value) =>
    String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /** 后台里的正文块：{type:"p"|"h2"|"quote", text} | {type:"list", items:[]} */
  function blockHTML(block) {
    if (!block) return "";
    const type = block.type || (block.h ? "h2" : block.q ? "quote" : block.ul || block.items ? "list" : "p");
    const text = block.text || block.p || block.h || block.q || "";
    if (type === "h2") return `<h3>${escapeHTML(text)}</h3>`;
    if (type === "quote") return `<blockquote>${escapeHTML(text)}</blockquote>`;
    if (type === "list") {
      const items = block.items || block.ul || [];
      return `<ul>${items
        .filter(Boolean)
        .map((item) => `<li>${escapeHTML(item)}</li>`)
        .join("")}</ul>`;
    }
    return `<p>${escapeHTML(text)}</p>`;
  }

  function dotDate(value) {
    return String(value || "").replace(/-/g, ".");
  }

  function findArticle(id) {
    const store = CONTENT();
    const list = (store && store.content && store.content.articles) || [];
    return list.find((item) => item.id === id) || null;
  }

  function openArticle(id) {
    const data = findArticle(id);
    if (!data || !readerDialog) return;
    const card = $(".post-card[data-art=\"" + String(id).replace(/"/g, "\\\"") + "\"]");
    const cardImg = card ? $("img", card) : null;

    readerImg.src = (cardImg && cardImg.getAttribute("src")) || data.image || "";
    readerImg.alt = (cardImg && cardImg.alt) || data.alt || "";
    readerTitle.textContent = data.title;
    readerLede.textContent = data.excerpt || "";

    readerMeta.innerHTML = "";
    const tag = document.createElement("span");
    tag.className = `tag ${(CONTENT() && CONTENT().tagClass && CONTENT().tagClass(data.tag)) || "tag-lav"}`;
    tag.textContent = data.tag || "日常";
    const date = document.createElement("span");
    date.textContent = dotDate(data.date);
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.textContent = "·";
    const read = document.createElement("span");
    read.textContent = data.read || "";
    readerMeta.append(tag, date, dot, read);

    readerContent.innerHTML = (data.body || []).map(blockHTML).join("");
    lastFocused = document.activeElement;
    closeSearch();
    if (!readerDialog.open) readerDialog.showModal();
    const shell = readerDialog.querySelector(".reader-shell");
    if (shell) shell.scrollTop = 0;
    document.body.classList.add("modal-open");
  }

  // 对外暴露，content.js / 搜索都能调用
  window.fuwariOpenArticle = openArticle;

  // 卡片是动态渲染的，用事件委托绑定阅读
  document.addEventListener("click", (event) => {
    const card = event.target.closest(".post-card");
    if (!card || !card.dataset.art) return;
    event.preventDefault();
    openArticle(card.dataset.art);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest(".post-card")
      : null;
    if (!card || !card.dataset.art) return;
    event.preventDefault();
    openArticle(card.dataset.art);
  });

  function closeDialog(dialog, restoreFocus = true) {
    if (!dialog || !dialog.open) return;
    dialog.close();
    if (restoreFocus && lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus({ preventScroll: true });
    }
    document.body.classList.remove("modal-open");
  }


  $$("[data-close-reader]").forEach((btn) =>
    btn.addEventListener("click", () => closeDialog(readerDialog))
  );
  if (readerDialog) {
    readerDialog.addEventListener("click", (event) => {
      if (event.target === readerDialog) closeDialog(readerDialog);
    });
    readerDialog.addEventListener("close", () => document.body.classList.remove("modal-open"));
  }

  /* ---------------- search ---------------- */

  const searchDialog = $("#searchDialog");
  const searchInput = $("#searchInput");
  const searchResults = $("#searchResults");

  // 搜索索引：文章来自后台内容，分区入口来自页面结构
  let searchIndex = [];

  function rebuildSearchIndex(content) {
    const articles = (content && content.articles) || [];
    const owner = (content && content.owner) || {};
    const partner = (content && content.partner) || {};
    const cards = $$(".post-card");

    const articleEntries = articles.map((article) => {
      const card = cards.find((item) => item.dataset.art === article.id);
      const cardImg = card ? $("img", card) : null;
      const paragraph = card ? $("p", card) : null;
      const query = [
        article.title,
        article.tag,
        article.excerpt,
        paragraph ? paragraph.textContent : "",
        (article.body || []).map((block) => block.text || (block.items || []).join(" ")).join(" ")
      ]
        .join(" ")
        .toLowerCase();
      return {
        art: article.id,
        title: article.title || "",
        meta: `${dotDate(article.date)} · ${article.tag || ""}`,
        img: (cardImg && cardImg.getAttribute("src")) || article.image || "",
        query
      };
    });

    // 页面各区（共用一个页面后，搜索也能带到分区）
    const sectionEntries = [
      {
        anchor: "#couple",
        title: `砂糖情侣 · ${owner.name || "柚子"} & ${partner.name || "星澈"}`,
        meta: "从纪念日开始的、一起走过的日子",
        img: owner.avatar || "assets/img/avatar-yuzu.svg",
        text: "砂糖情侣 双人头像 vrc 星海 vrchat 情侣 在一起 纪念日 倒计时"
      },
      {
        anchor: "#wall",
        title: "合照墙：舍不得删的拍立得",
        meta: "相纸会泛黄，但心动不会",
        img: "assets/img/scene-sakura.svg",
        text: "合照 拍立得 樱花坡道 花火大会 雨天咖啡馆 星海露营 初雪 生日房间 周末的房间 夏日慢信"
      },
      {
        anchor: "#profiles",
        title: `VRChat 角色资料：${owner.name || "柚子"} & ${partner.name || "星澈"}`,
        meta: `${owner.handle || ""} · ${partner.handle || ""}`,
        img: partner.avatar || "assets/img/avatar-sei.svg",
        text: "vrchat 角色 模型 头像 世界 ふわり星海 星海营地 旧书店 樱花温泉"
      },
      {
        anchor: "#versary",
        title: "纪念日倒计时与小时间线",
        meta: "把普通日子过成纪念日",
        img: "assets/img/scene-birthday.svg",
        text: "纪念日 倒计时 周年 时间线 生日 第一次见面 花火 围巾"
      },
      {
        anchor: "#messages",
        title: "留言糖果罐",
        meta: "写一点甜的、酸的，或者只是今天想说的话",
        img: "assets/img/scene-milk.svg",
        text: "留言 糖果 罐子 祝福 想说的话 点赞"
      },
      {
        anchor: "#about",
        title: `关于${owner.name || "柚子"}`,
        meta: owner.roles || "",
        img: owner.avatar || "assets/img/avatar-yuzu.svg",
        text: "关于 手帐 vrchat 咖啡 猫 草莓牛奶 生活"
      }
    ]
      .filter((item) => document.querySelector(item.anchor))
      .map((item) => ({ ...item, query: item.text.toLowerCase() }));

    searchIndex = articleEntries.concat(sectionEntries);
  }

  function renderSearch(query) {
    if (!searchResults) return;
    const q = query.trim().toLowerCase();
    let matches = searchIndex;
    if (q) {
      matches = searchIndex.filter((item) => item.query.includes(q));
    } else {
      matches = searchIndex.slice(0, 3);
    }

    searchResults.innerHTML = "";
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "search-empty";
      empty.innerHTML = "<span>✿</span>没有找到这篇小心事，换个词试试？";
      searchResults.append(empty);
      return;
    }

    matches.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";

      const img = document.createElement("img");
      img.src = item.img;
      img.alt = "";
      img.width = 64;
      img.height = 48;

      const wrap = document.createElement("span");
      wrap.className = "search-result-text";
      const strong = document.createElement("strong");
      strong.textContent = item.title;
      const meta = document.createElement("span");
      meta.textContent = item.meta;
      wrap.append(strong, meta);
      button.append(img, wrap);

      button.addEventListener("click", () => {
        closeDialog(searchDialog, false);
        if (item.anchor) {
          const target = document.querySelector(item.anchor);
          if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
          history.replaceState(null, "", item.anchor);
          return;
        }
        openArticle(item.art);
      });
      searchResults.append(button);
    });
  }

  function openSearch() {
    if (!searchDialog) return;
    lastFocused = document.activeElement;
    searchDialog.showModal();
    document.body.classList.add("modal-open");
    renderSearch(searchInput ? searchInput.value : "");
    setTimeout(() => searchInput && searchInput.focus(), 40);
  }

  function closeSearch() {
    if (!searchDialog || !searchDialog.open) return;
    searchDialog.close();
    document.body.classList.remove("modal-open");
  }

  $$("[data-open-search]").forEach((btn) => btn.addEventListener("click", openSearch));
  $$("[data-close-search]").forEach((btn) => btn.addEventListener("click", closeSearch));
  if (searchInput) {
    searchInput.addEventListener("input", () => renderSearch(searchInput.value));
  }
  if (searchDialog) {
    searchDialog.addEventListener("click", (event) => {
      if (event.target === searchDialog) closeSearch();
    });
    searchDialog.addEventListener("close", () => document.body.classList.remove("modal-open"));
  }

  document.addEventListener("keydown", (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (searchDialog && searchDialog.open) closeSearch();
      else openSearch();
    } else if (event.key === "/" && !typing && !searchDialog?.open) {
      event.preventDefault();
      openSearch();
    }
  });

  /* ---------------- lightbox ---------------- */

  const lightbox = $("#lightbox");
  const lightboxImg = $("#lightboxImg");
  const lightboxCap = $("#lightboxCap");
  let galleryIndex = 0;

  // 图集是动态渲染的，每次打开时重新取一遍
  function currentGallery() {
    return $$(".gallery-item");
  }

  function showPhoto(index) {
    const items = currentGallery();
    if (!items.length || !lightbox) return;
    galleryIndex = (index + items.length) % items.length;
    const item = items[galleryIndex];
    const img = $("img", item);
    lightboxImg.src = item.dataset.img || (img && img.src) || "";
    lightboxImg.alt = (img && img.alt) || "";
    const caption = item.dataset.caption || (img && img.alt) || "";
    lightboxCap.textContent = `${caption}  ·  ${pad(galleryIndex + 1)} / ${pad(items.length)}`;
  }

  document.addEventListener("click", (event) => {
    const item = event.target.closest(".gallery-item");
    if (!item || !lightbox) return;
    const items = currentGallery();
    showPhoto(items.indexOf(item));
    if (!lightbox.open) lightbox.showModal();
    document.body.classList.add("modal-open");
  });

  if (lightbox) {
    $$("[data-close-lightbox]").forEach((btn) =>
      btn.addEventListener("click", () => lightbox.close())
    );
    $$("[data-lightbox-prev]").forEach((btn) =>
      btn.addEventListener("click", () => showPhoto(galleryIndex - 1))
    );
    $$("[data-lightbox-next]").forEach((btn) =>
      btn.addEventListener("click", () => showPhoto(galleryIndex + 1))
    );
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener("close", () => document.body.classList.remove("modal-open"));
    document.addEventListener("keydown", (event) => {
      if (!lightbox.open) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showPhoto(galleryIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPhoto(galleryIndex - 1);
      }
    });
  }


  /* ---------------- ambient particles ---------------- */

  function initParticles() {
    const canvas = $("#particleField");
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const colors = ["243,191,209", "185,168,227", "207,230,220", "255,224,233", "244,214,238"];
    let width = 0;
    let height = 0;
    let petals = [];
    let burst = [];
    let raf = 0;

    function random(min, max) {
      return min + Math.random() * (max - min);
    }

    function makePetal(initial = false) {
      const type = Math.random() < 0.58 ? "petal" : Math.random() < 0.56 ? "heart" : "candy";
      const size = type === "petal" ? random(3.4, 7.4) : random(2.8, 5.8);
      return {
        type,
        x: random(-20, width + 20),
        y: initial ? random(-20, height) : type === "petal" ? random(-60, -10) : random(height + 10, height + 70),
        size,
        vy: type === "petal" ? random(0.16, 0.5) : random(-0.34, -0.1),
        vx: random(-0.14, 0.14),
        sway: random(0.4, 1.5),
        phase: random(0, Math.PI * 2),
        rot: random(0, Math.PI * 2),
        spin: random(-0.01, 0.01),
        alpha: random(0.3, 0.68),
        color: colors[Math.floor(Math.random() * colors.length)]
      };
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(42, Math.max(14, Math.round((width * height) / 52000)));
      petals = Array.from({ length: target }, () => makePetal(true));
    }

    function drawPetal(p) {
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.82, s * 0.35, s * 0.18, s * 0.94);
      ctx.bezierCurveTo(s * 0.06, s * 1.03, -s * 0.06, s * 1.03, -s * 0.18, s * 0.94);
      ctx.bezierCurveTo(-s * 0.82, s * 0.35, -s * 0.9, -s * 0.5, 0, -s);
      ctx.closePath();
      ctx.fill();
    }

    function drawHeart(p) {
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.95);
      ctx.bezierCurveTo(-s * 1.16, s * 0.18, -s * 0.96, -s * 0.78, -s * 0.36, -s * 0.78);
      ctx.bezierCurveTo(-s * 0.08, -s * 0.78, 0, -s * 0.56, 0, -s * 0.3);
      ctx.bezierCurveTo(0, -s * 0.56, s * 0.08, -s * 0.78, s * 0.36, -s * 0.78);
      ctx.bezierCurveTo(s * 0.96, -s * 0.78, s * 1.16, s * 0.18, 0, s * 0.95);
      ctx.closePath();
      ctx.fill();
    }

    function drawCandy(p) {
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.28);
      ctx.lineTo(-s * 1.18, -s * 0.52);
      ctx.lineTo(-s * 1.05, 0);
      ctx.lineTo(-s * 1.18, s * 0.52);
      ctx.lineTo(-s * 0.5, s * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.5, -s * 0.28);
      ctx.lineTo(s * 1.18, -s * 0.52);
      ctx.lineTo(s * 1.05, 0);
      ctx.lineTo(s * 1.18, s * 0.52);
      ctx.lineTo(s * 0.5, s * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.4, 0.5, 2.4);
      ctx.stroke();
    }

    function spawnBurst(x, y) {
      for (let i = 0; i < 7; i += 1) {
        burst.push({
          x,
          y,
          size: random(3, 7),
          vx: random(-1.5, 1.5),
          vy: random(-2.8, -0.7),
          life: 1,
          decay: random(0.01, 0.017),
          rot: random(-0.4, 0.4),
          color: colors[Math.floor(Math.random() * 3)]
        });
      }
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(2.4, (now - last) / 16.667);
      last = now;
      ctx.clearRect(0, 0, width, height);

      petals.forEach((p) => {
        p.phase += 0.008 * dt;
        p.y += p.vy * dt;
        p.x += (p.vx + Math.sin(p.phase) * p.sway * 0.24) * dt;
        p.rot += p.spin * dt;
        if (p.y > height + 30 || p.y < -40) {
          Object.assign(p, makePetal(false));
        }
        if (p.x < -40) p.x = width + 30;
        if (p.x > width + 40) p.x = -30;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
        if (p.type === "petal") drawPetal(p);
        else if (p.type === "heart") drawHeart(p);
        else drawCandy(p);
        ctx.restore();
      });

      burst = burst.filter((p) => p.life > 0);
      burst.forEach((p) => {
        p.life -= p.decay * dt;
        p.vy += 0.045 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(${p.color},${Math.max(0, p.life) * 0.8})`;
        drawHeart(p);
        ctx.restore();
      });

      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }

    resize();
    start();
    window.addEventListener("resize", () => {
      clearTimeout(resize._timer);
      resize._timer = setTimeout(resize, 180);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    });
    document.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      spawnBurst(event.clientX, event.clientY);
    });
  }

  initParticles();

  /* ---------------- after content is rendered ---------------- */

  function refreshDynamic() {
    const store = CONTENT();
    const content = store && store.content;
    if (content) rebuildSearchIndex(content);
    observeReveal();
    updateDates();
    onScroll();
  }

  const store = CONTENT();
  if (store) store.ready.then((content) => content && refreshDynamic());
  document.addEventListener("fuwari:ready", refreshDynamic);
  document.addEventListener("fuwari:update", refreshDynamic);
  rebuildSearchIndex(null);
})();
