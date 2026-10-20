/* =========================================================
   ふわり Fuwari — 砂糖情侣 / couple page
   纪念日计时、倒计时、留言糖果罐（走后台接口）、VRChat ID 复制
   ========================================================= */
(function () {
  "use strict";

  if (!document.body.classList.contains("page-couple")) return;

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, "0");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CONTENT = () => window.FuwariContent;
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

  /* ---------------- live timer & countdown ---------------- */

  const daysEl = $("#daysTogether");
  const hoursEl = $("#liveHours");
  const minsEl = $("#liveMins");
  const secsEl = $("#liveSecs");
  const cdDays = $("#cdDays");
  const cdHours = $("#cdHours");
  const cdMins = $("#cdMins");
  const cdSecs = $("#cdSecs");
  const versaryNo = $("#versaryNo");
  const yearProgress = $("#yearProgress");
  const yearPercent = $("#yearPercent");

  const escapeHTML = (value) =>
    String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function nextAnniversary(now) {
    const { month, day } = anniversary();
    let target = new Date(now.getFullYear(), month - 1, day, 0, 0, 0, 0);
    if (now >= target) target = new Date(now.getFullYear() + 1, month - 1, day, 0, 0, 0, 0);
    return target;
  }

  function tick() {
    const now = new Date();
    const start = startDate();
    const elapsed = Math.max(0, now.getTime() - start.getTime());
    const totalDays = Math.floor(elapsed / 86400000);
    const hours = Math.floor((elapsed % 86400000) / 3600000);
    const mins = Math.floor((elapsed % 3600000) / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);

    if (daysEl) daysEl.textContent = totalDays.toLocaleString("en-US");
    if (hoursEl) hoursEl.textContent = pad(hours);
    if (minsEl) minsEl.textContent = pad(mins);
    if (secsEl) secsEl.textContent = pad(secs);

    const target = nextAnniversary(now);
    const remains = Math.max(0, target.getTime() - now.getTime());
    const d = Math.floor(remains / 86400000);
    const h = Math.floor((remains % 86400000) / 3600000);
    const m = Math.floor((remains % 3600000) / 60000);
    const s = Math.floor((remains % 60000) / 1000);

    if (cdDays) cdDays.textContent = d;
    if (cdHours) cdHours.textContent = pad(h);
    if (cdMins) cdMins.textContent = pad(m);
    if (cdSecs) cdSecs.textContent = pad(s);

    // 纪念日当年算第 1 个
    if (versaryNo) versaryNo.textContent = Math.max(1, target.getFullYear() - start.getFullYear() + 1);

    const { month, day } = anniversary();
    const previous = new Date(target.getFullYear() - 1, month - 1, day, 0, 0, 0, 0);
    const span = target.getTime() - previous.getTime();
    const percent = span > 0 ? Math.max(0, Math.min(100, Math.round(((now - previous) / span) * 100))) : 0;
    if (yearProgress) yearProgress.style.width = `${percent}%`;
    if (yearPercent) yearPercent.textContent = `${percent}%`;
  }

  tick();
  setInterval(tick, 1000);

  /* ---------------- message candy jar（后台接口） ---------------- */

  const COLORS = ["pink", "lav", "mint", "cream"];
  const ROTATIONS = [-1.3, 0.9, -0.6, 1.2, 0.55, -1.1];
  const LIKED_KEY = "fuwari-liked-notes-v1";

  const form = $("#messageForm");
  const notesGrid = $("#notesGrid");
  const notesEmpty = $("#notesEmpty");
  const charCount = $("#charCount");
  const submitBtn = form ? form.querySelector('[type="submit"]') : null;

  let notes = [];

  function readLiked() {
    try {
      const raw = JSON.parse(localStorage.getItem(LIKED_KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (error) {
      return new Set();
    }
  }

  function writeLiked(set) {
    try {
      localStorage.setItem(LIKED_KEY, JSON.stringify(Array.from(set)));
    } catch (error) {
      /* 私密模式下忽略即可 */
    }
  }

  let liked = readLiked();

  function updateCounts() {
    const total = notes.length;
    $$("#noteCount, #noteCountTop").forEach((el) => (el.textContent = total));
    if (notesEmpty) notesEmpty.hidden = total > 0;
  }

  function noteCard(note, index) {
    const article = document.createElement("article");
    article.className = `note note-${COLORS.includes(note.color) ? note.color : "pink"}`;
    article.style.setProperty("--rot", `${ROTATIONS[index % ROTATIONS.length]}deg`);
    article.dataset.id = note.id;

    const isLiked = liked.has(note.id);
    const tape = document.createElement("span");
    tape.className = "note-tape";
    tape.setAttribute("aria-hidden", "true");

    const text = document.createElement("p");
    text.className = "note-text";
    text.textContent = note.text;

    const foot = document.createElement("div");
    foot.className = "note-foot";

    const author = document.createElement("div");
    const name = document.createElement("span");
    name.className = "note-name";
    name.textContent = note.name;
    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = note.date;
    author.append(name, date);

    const like = document.createElement("button");
    like.type = "button";
    like.className = `note-like${isLiked ? " is-liked" : ""}`;
    like.setAttribute("aria-pressed", String(isLiked));
    like.setAttribute("aria-label", `给 ${note.name} 的留言点赞`);
    const heart = document.createElement("span");
    heart.className = "icon";
    heart.textContent = "♥";
    const count = document.createElement("em");
    count.textContent = note.likes;
    like.append(heart, count);

    like.addEventListener("click", async () => {
      const nowLiked = !liked.has(note.id);
      const delta = nowLiked ? 1 : -1;
      // 先动界面，再同步后台（失败再回滚）
      if (nowLiked) liked.add(note.id);
      else liked.delete(note.id);
      writeLiked(liked);
      note.likes = Math.max(0, Number(note.likes || 0) + delta);
      count.textContent = note.likes;
      like.classList.toggle("is-liked", nowLiked);
      like.setAttribute("aria-pressed", String(nowLiked));
      if (!reduceMotion) {
        heart.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.45)" }, { transform: "scale(1)" }],
          { duration: 360, easing: "cubic-bezier(.22,.8,.28,1)" }
        );
      }
      try {
        const store = CONTENT();
        if (!store) throw new Error("后台还没连上");
        await store.likeNote(note.id, delta);
      } catch (error) {
        if (nowLiked) liked.delete(note.id);
        else liked.add(note.id);
        writeLiked(liked);
        note.likes = Math.max(0, Number(note.likes || 0) - delta);
        count.textContent = note.likes;
        like.classList.toggle("is-liked", !nowLiked);
        like.setAttribute("aria-pressed", String(!nowLiked));
        window.fuwariToast?.(error.message || "这颗心没能送出去，再试一次吧。");
      }
    });

    foot.append(author, like);
    article.append(tape, text, foot);
    return article;
  }

  function renderNotes() {
    if (!notesGrid) return;
    notesGrid.innerHTML = "";
    if (!notes.length) {
      updateCounts();
      return;
    }
    let row = null;
    notes.forEach((note, index) => {
      if (index % 2 === 0) {
        row = document.createElement("div");
        row.className = "note-row";
        notesGrid.append(row);
      }
      row.append(noteCard(note, index));
    });
    updateCounts();
  }

  function shakeJar() {
    const jar = $(".jar");
    if (!jar || reduceMotion) return;
    jar.animate(
      [
        { transform: "rotate(5deg) scale(1)" },
        { transform: "rotate(-3deg) scale(1.1)" },
        { transform: "rotate(6deg) scale(.97)" },
        { transform: "rotate(5deg) scale(1)" }
      ],
      { duration: 700, easing: "cubic-bezier(.22,.8,.28,1)" }
    );
  }

  function formatDate(date = new Date()) {
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  }

  function syncNotes(content) {
    notes = (content && content.notes) || [];
    renderNotes();
  }

  const store = CONTENT();
  document.addEventListener("fuwari:ready", (event) => syncNotes(event.detail.content));
  document.addEventListener("fuwari:update", (event) => syncNotes(event.detail.content));
  if (store) store.ready.then((content) => content && syncNotes(content));

  if (form) {
    const nameInput = form.elements.name;
    const textInput = form.elements.text;

    textInput?.addEventListener("input", () => {
      if (charCount) charCount.textContent = textInput.value.length;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = String(nameInput.value || "").trim();
      const text = String(textInput.value || "").trim();

      if (!name) {
        window.fuwariToast?.("先告诉我怎么称呼你呀。");
        nameInput.focus();
        return;
      }
      if (!text) {
        window.fuwariToast?.("罐子还空着，写一点什么再放进来吧。");
        textInput.focus();
        return;
      }
      if (text.length > 140) {
        window.fuwariToast?.("这颗糖有点大，140 个字以内刚刚好。");
        textInput.focus();
        return;
      }

      const colorInput = form.querySelector('input[name="color"]:checked');
      const payload = {
        name,
        text,
        color: colorInput ? colorInput.value : "pink"
      };

      const api = CONTENT();
      if (!api) {
        window.fuwariToast?.("后台没有连上，糖暂时放不进去。");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      try {
        const result = await api.postNote(payload);
        const note = result && result.note;
        if (note) notes = [note].concat(notes.filter((item) => item.id !== note.id));
        else await api.refresh();
        renderNotes();
        form.reset();
        if (charCount) charCount.textContent = "0";
        shakeJar();
        if (api.isStatic && api.isStatic()) {
          window.fuwariToast?.("糖先放进本地罐子啦（静态托管，只对这台设备可见）♥");
        } else {
          window.fuwariToast?.("糖已经放进罐子里啦，谢谢你 ♥");
        }
      } catch (error) {
        window.fuwariToast?.(error.message || "这颗糖没能放进去，稍后再试一次吧。");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ---------------- copy VRChat IDs ---------------- */

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      try {
        const helper = document.createElement("textarea");
        helper.value = value;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.append(helper);
        helper.select();
        const ok = document.execCommand("copy");
        helper.remove();
        return ok;
      } catch (fallbackError) {
        return false;
      }
    }
  }

  // 资料卡是动态渲染的，用事件委托
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy]");
    if (!button) return;
    const value = button.dataset.copy;
    if (!value) return;
    const ok = await copyText(value);
    window.fuwariToast?.(ok ? `已复制 ${value}，在 VRChat 里搜搜看。` : `复制失败了，VRChat ID 是 ${value}`);
  });
})();
