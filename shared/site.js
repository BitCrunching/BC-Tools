/* shared/site.js — theme toggle, cookie consent, nav share menu,
   privacy-check helpers, and downloadBlob(), shared by every standalone
   (MPA) page. Ported from index.html's inline scripts — same
   localStorage keys ("bc-theme", "bc-cookie-consent") so choices made
   here stay in sync with the SPA pages. Load with `defer` so the DOM
   (nav/footer/cookie markup) exists before this runs.

   Not a 1:1 copy of the SPA's version: the Cookies-page "docked" panel
   variant and its mobile-reopen button are dropped (that page still
   lives in the SPA). The language switcher (translations object,
   applyLanguage, the nav-lang button/menu) was removed from the live
   site on request — see the comment further down where it used to
   live, and shared/i18n-archive.js for the archived version. */

/* ===== Custom scroll-position restore on reload, replacing the
   browser's own native one entirely (history.scrollRestoration stays
   "manual" for the rest of the page's life, never switched back to
   "auto") — same fix as index.html's own copy (that one stays inline
   and early in <head> instead of here, since the SPA is one single
   long-lived page where the timing matters more; every other page
   gets it for free through this file instead of needing its own
   per-page copy — see index.html's version for the fuller writeup of
   why. window.scrollTo, not a direct scrollTop assignment — a direct
   assignment gets silently reset back to 0 on this site (confirmed on
   both the SPA and a standalone tool page, so treat it as a site-wide
   quirk, not a one-page fluke); scrollTo actually holds. behavior:
   "instant" skips scroll-behavior:smooth so this is a single jump, not
   a visible scroll animation down the page on every reload.

   history.scrollRestoration = "manual" itself lives in the early inline
   <head> script (alongside the theme flash fix), not here — this file
   loads with defer and only runs after the full page is already
   parsed, too late to rule out a race against the browser's own native
   restoration if set this late.

   Written as an explicit readiness gate — "wait for exactly these
   conditions, then restore, once" — rather than several independent
   event listeners each re-attempting restore. "Ready" is: the DOM has
   parsed, and (only if this page actually has a "Continue where you
   left off" button) its async session check has resolved — with `load`
   as a ceiling so a page can never wait past its own full load, and the
   timeout only as a last-resort safety net in case something upstream
   never fires at all.

   A localStorage-flag redesign was tried on top of this — making the
   button's shown/hidden state synchronous instead of waiting on
   bc:session-check-done at all, so this readiness gate could be deleted
   entirely — but reverted: reported as not actually fixing the visible
   flicker in practice (existing saved sessions predate the flag and
   don't get it until their next save, so the old async-timing behavior
   was still what most real sessions hit) and worth re-approaching later
   rather than keeping half-working.

   Keyed by location.pathname, not a single flat "bc-scrollY" —
   sessionStorage is per-origin/per-tab, not per-page, so every
   standalone page sharing this one file was actually sharing the same
   key too: leaving the homepage scrolled deep down and clicking
   through to, say, a tool restored that same deep offset there,
   landing on its article instead of its top. Namespacing by path keeps this purely a
   same-page reload restore, which is all it was ever meant to be. */
var bcScrollKey = "bc-scrollY:" + location.pathname;
function bcRestoreScroll(){
  try {
    const y = sessionStorage.getItem(bcScrollKey);
    if (y) window.scrollTo({ top: parseInt(y, 10), behavior: "instant" });
  } catch(e){ /* unavailable */ }
}
const bcDomReady = new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
/* Only pages with a "Continue where you left off" button have an async
   session check to wait for at all — its mere presence in the DOM (the
   button markup exists, just hidden, regardless of whether a session is
   actually saved) is enough to know whether bc:session-check-done is
   coming, without waiting on an event that would otherwise never fire. */
const bcSessionCheckReady = bcDomReady.then(() =>
  document.querySelector(".tool-continue-btn")
    ? new Promise(resolve => document.addEventListener("bc:session-check-done", resolve, { once: true }))
    : true
);
const bcLoaded = new Promise(resolve => window.addEventListener("load", resolve, { once: true }));
const bcTimedOut = new Promise(resolve => setTimeout(resolve, 1200));
Promise.race([
  Promise.all([bcDomReady, bcSessionCheckReady]),
  Promise.all([bcLoaded]),
  bcTimedOut
]).then(bcRestoreScroll);
window.addEventListener("pagehide", () => {
  try { sessionStorage.setItem(bcScrollKey, String(window.scrollY)); } catch(e){ /* unavailable */ }
});

/* ===== Translations (see tools/build_translations.py) =====
   Translated pages (/cs/...) load shared/i18n/<lang>.js first, which sets
   window.BC_LANG, window.BC_LANG_PAGES (paths that have a translated copy)
   and window.BC_I18N (English sentence -> translation). bcT() looks a
   sentence up there and returns it unchanged when there's no entry (or on
   an English page), so wrapping a string in bcT() is always safe.
   Strings with values use {name} placeholders: bcT(message, {n}).
   A translation may leave a placeholder out (handy to dodge plural forms). */
function bcT(s, vars){
  const dict = window.BC_I18N;
  let out = (dict && dict[s]) || s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out;
}
/* Prefixes a site path with the current language folder when that page
   has a translated copy (e.g. "/convert/" -> "/cs/convert/"). */
function bcLangPath(path){
  const lang = window.BC_LANG;
  if (lang && Array.isArray(window.BC_LANG_PAGES) && window.BC_LANG_PAGES.includes(path)) return "/" + lang + path;
  return path;
}

/* ===== data-goto -> real navigation (no SPA gotoPage() here) ===== */
const SITE_PATH_MAP = {
  mainpage: "/",
  about: "/about/",
  faq: "/faq/",
  terms: "/terms/",
  privacy: "/privacy/",
  cookies: "/cookies/",
  convert: "/convert/",
  compress: "/compress/",
  combine: "/combine/",
  exif: "/cleanly/",
  context: "/context/",
  gif: "/congify/"
};

document.addEventListener("click", (e) => {
  const gotoEl = e.target.closest("[data-goto]");
  if (gotoEl){
    e.preventDefault();
    if (typeof gtag === "function") gtag("event", "nav_click", { destination: gotoEl.dataset.goto });
    const target = bcLangPath(SITE_PATH_MAP[gotoEl.dataset.goto] || "/");
    location.href = target;
    return;
  }
});

/* ===== Golden Rules guide: avatar challenge and reward on a tool page ===== */
function bcSetupGuides(){
  const box = document.querySelector(".gr-inline[data-tool]");
  if (!box) return;
  const challenge = bcAddChallengeBanner(box);
  bcAddGuideReward(box, challenge);
}

const GR_ACCENT = { convert:"#B84CFF", compress:"#3FBFE8", combine:"#FF6961", exif:"#7ED321", context:"#F6D44A", colorfy:"#FF8A4C", gif:"#22D3D0", coudio:"#18C98A", codify:"#C81C86", comprio:"#3B6CF6", convido:"#B84CFF" };
const GR_TOOL_NAME = { convert:"Convert", compress:"Compress", combine:"Combine", exif:"Cleanly", context:"Context", colorfy:"Colorfy", gif:"Congify", coudio:"Coudio", codify:"Codify", comprio:"Comprio", convido:"Convido" };
function bcAddChallengeBanner(box){
  const tool = GR_TOOL_NAME[box.dataset.tool] || "this tool";
  const flagKey = "bc-gr-challenge-" + box.dataset.tool;
  let on = false;
  try { on = localStorage.getItem(flagKey) === "1" || !!localStorage.getItem("bc-gr-progress-" + box.dataset.tool); } catch (e) {}
  const listeners = [];
  const el = document.createElement("div");
  el.className = "gr-say";
  el.style.setProperty("--gr-accent", GR_ACCENT[box.dataset.tool] || "#3FBFE8");
  el.innerHTML = '<div class="gr-buddy-face gr-say-face"><span aria-hidden="true"></span></div>' +
    '<div class="gr-say-slot"><div class="gr-say-bubble"><span class="gr-buddy-text" aria-hidden="true"></span></div></div>' +
    '<button type="button" class="gr-challenge-btn gr-say-btn" hidden></button>';
  const face = el.querySelector(".gr-say-face span");
  face.innerHTML = GR_AVATAR;
  const art = face.querySelector("svg");
  bcDressAvatar(art);
  art.dataset.mood = on ? "good" : "start";
  const bubble = el.querySelector(".gr-say-bubble");
  const textEl = el.querySelector(".gr-buddy-text");
  const btn = el.querySelector(".gr-say-btn");
  btn.textContent = bcT("START THE CHALLENGE");
  const intro = bcT("Take up on a Challenge! Gain all the knowledge there is about {tool}. Finish it and receive a reward.", { tool });
  const startedText = bcT("Challenge started. Read each guide, and take your time.");
  let typeTimer = 0;
  const setText = text => {
    clearInterval(typeTimer);
    el.classList.remove("typing");
    bubble.setAttribute("aria-label", text);
    textEl.textContent = text;
  };
  const say = (text, done) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches){ setText(text); if (done) done(); return; }
    clearInterval(typeTimer);
    bubble.setAttribute("aria-label", text);
    textEl.textContent = "";
    el.classList.add("typing");
    let i = 0;
    typeTimer = setInterval(() => {
      i += 2;
      textEl.textContent = text.slice(0, i);
      if (i >= text.length){
        clearInterval(typeTimer);
        el.classList.remove("typing");
        if (done) done();
      }
    }, 30);
  };
  const item = GR_ITEMS[box.dataset.tool];
  let teaseTimer = 0;
  if (item){
    const rw = document.createElement("div");
    rw.className = "gr-say-reward";
    rw.setAttribute("aria-hidden", "true");
    rw.innerHTML = '<div class="gr-buddy-face gr-say-rface"><span></span></div><span class="gr-say-rname"></span>';
    rw.querySelector(".gr-say-rface span").innerHTML = GR_AVATAR;
    const rsvg = rw.querySelector("svg");
    rsvg.dataset.mood = "good";
    rsvg.querySelector(".av-item").innerHTML = item.svg;
    rw.querySelector(".gr-say-rname").textContent = bcT("It's {item} for your avatar!", { item: ((item.det ? item.det + " " : "") + bcT(item.name).toLowerCase()) });
    bubble.appendChild(rw);
  }
  const stopTease = () => {
    clearTimeout(teaseTimer);
    el.classList.remove("rewarding");
    bubble.style.minHeight = "";
  };
  const startTease = () => {
    if (!item || on) return;
    let round = 0;
    const showReward = () => {
      if (on) return;
      bubble.style.minHeight = bubble.offsetHeight + "px";
      el.classList.remove("typing");
      el.classList.add("rewarding");
      teaseTimer = setTimeout(() => {
        if (on) return;
        el.classList.remove("rewarding");
        say(intro, () => {
          if (++round < 3) teaseTimer = setTimeout(showReward, 3000);
        });
      }, 4000);
    };
    teaseTimer = setTimeout(showReward, 3000);
  };
  btn.addEventListener("click", () => {
    if (on) return;
    on = true;
    stopTease();
    try { localStorage.setItem(flagKey, "1"); } catch (e) {}
    btn.hidden = true;
    art.dataset.mood = "good";
    say(startedText);
    listeners.forEach(f => f());
  });
  if (on) setText(startedText);
  else {
    const reveal = () => say(intro, () => { btn.hidden = false; startTease(); });
    if ("IntersectionObserver" in window){
      const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect();
        reveal();
      }, { threshold: 0.6 });
      io.observe(el);
    } else reveal();
  }
  box.insertBefore(el, box.firstChild);
  return {
    active: () => on,
    onStart: f => { listeners.push(f); },
    complete: () => { btn.hidden = true; art.dataset.mood = "done"; setText(bcT("Challenge complete! Reward unlocked.")); }
  };
}
const bcJoinList = list => list.length < 2 ? String(list[0]) : list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
async function bcSendRating(tool, vote, reason){
  const url = window.BC_REPORT_ENDPOINT;
  if (!url) throw new Error("no endpoint");
  const form = new FormData();
  form.append("type", "feedback");
  form.append("lang", document.documentElement.lang || "en");
  const name = GR_TOOL_NAME[tool] || tool;
  const why = (reason || "").trim();
  const icon = vote === "up" ? "\uD83D\uDC4D" : "\uD83D\uDC4E";
  form.append("message", why ? (icon + " " + name + ": " + why).slice(0, 100) : icon + " " + name + " guide");
  form.append("page", location.pathname || "/");
  form.append("screen", innerWidth + "x" + innerHeight);
  form.append("browser", navigator.userAgent.slice(0, 200));
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error("HTTP " + res.status);
}
function bcAddGuideReward(box, ch){
  const arts = [...box.querySelectorAll(".gr-article")];
  if (!arts.length) return;
  const IDLE_MS = 30000, STEP_MS = 500;
  const MS_PER_WORD = 143, MIN_NEED_MS = 20000, MAX_NEED_MS = 40000;
  const need = arts.map(a => {
    const words = (a.textContent || "").trim().split(/\s+/).length;
    return Math.max(MIN_NEED_MS, Math.min(MAX_NEED_MS, Math.round(words * MS_PER_WORD)));
  });
  const key = "bc-gr-progress-" + box.dataset.tool;
  let reached = new Set();
  const spent = arts.map(() => 0);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    reached = new Set(saved.r || []);
    (saved.t || []).forEach((v, i) => { if (i < spent.length) spent[i] = Number(v) || 0; });
  } catch (e) {}
  const isRead = i => reached.has(i) && spent[i] >= need[i];
  const readCount = () => arts.filter((a, i) => isRead(i)).length;
  const missing = () => arts.map((a, i) => i).filter(i => !isRead(i));
  const api = { isRead, count: readCount, missing, onUnlock: null, active: ch.active, onStart: ch.onStart };
  const save = () => { try { localStorage.setItem(key, JSON.stringify({ r: [...reached], t: spent.map(Math.round) })); } catch (e) {} };
  const toc = document.querySelector(".gr-toc");
  const tocLinks = toc ? [...toc.querySelectorAll("a")] : [];
  if (toc) toc.style.setProperty("--gr-accent", GR_ACCENT[box.dataset.tool] || "#3FBFE8");
  const card = document.createElement("div");
  card.className = "gr-reward gr-challenge engine-status-card";
  card.style.setProperty("--gr-accent", GR_ACCENT[box.dataset.tool] || "#3FBFE8");
  card.innerHTML = '<div class="gr-challenge-head"><span class="gr-challenge-dot" aria-hidden="true"></span><button type="button" class="gr-challenge-dot gr-challenge-dot-yellow" aria-expanded="true"></button><span class="gr-challenge-dot" aria-hidden="true"></span><span class="engine-status-title"></span></div>' +
    '<div class="engine-status-body gr-reward-body"><div class="gr-reward-main"><div class="engine-status-row gr-reward-title-row">&gt; <span class="gr-reward-title"></span></div>' +
    '<div class="engine-status-row">&gt; <span class="gr-reward-sub"></span></div>' +
    '<div class="engine-status-row">&gt; <span class="gr-reward-dots"></span></div>' +
    '<div class="engine-status-row gr-dl-row">&gt; <span class="gr-dl-label"></span><span class="gr-dl-tiers"></span></div>' +
    '<div class="gr-reward-rate"><div class="engine-status-row">&gt; <span class="gr-rate-label"></span> <span class="gr-rate-votes"></span> <span class="gr-rate-why" hidden><input type="text" class="gr-rate-why-input" autocomplete="off"><button type="button" class="gr-challenge-btn gr-rate-send"></button></span></div><div class="engine-status-row gr-rate-note" hidden>&gt; <span></span></div></div></div>' +
    '<div class="gr-reward-prize" hidden><div class="gr-buddy-face gr-prize-face"><span aria-hidden="true"></span></div><div class="gr-prize-name"></div><button type="button" class="gr-challenge-btn gr-prize-btn"></button></div></div>';
  card.querySelector(".engine-status-title").textContent = bcT("CHALLENGE REWARD");
  const dot = card.querySelector(".gr-challenge-dot-yellow");
  dot.setAttribute("aria-label", bcT("Minimize or restore the reward"));
  dot.addEventListener("click", () => {
    const min = card.classList.toggle("min");
    dot.setAttribute("aria-expanded", String(!min));
  });
  const title = card.querySelector(".gr-reward-title");
  const sub = card.querySelector(".gr-reward-sub");
  const dots = [...arts].map(() => card.querySelector(".gr-reward-dots").appendChild(document.createElement("span")));
  const rateKey = "bc-gr-rated-" + box.dataset.tool;
  let rated = "", sending = false;
  try { rated = localStorage.getItem(rateKey) || ""; } catch (e) {}
  const voteBox = card.querySelector(".gr-rate-votes");
  const noteRow = card.querySelector(".gr-rate-note");
  const note = noteRow.querySelector("span");
  const setNote = text => { note.textContent = text; noteRow.hidden = !text; };
  card.querySelector(".gr-rate-label").textContent = bcT("Rate this guide:");
  const THUMB = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zM7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>';
  const votes = ["up", "down"].map(v => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gr-rate-vote gr-rate-" + v;
    b.setAttribute("aria-label", bcT(v === "up" ? "Yes, helpful" : "No, not helpful"));
    b.title = b.getAttribute("aria-label");
    b.innerHTML = THUMB;
    voteBox.appendChild(b);
    return b;
  });
  const paintVotes = v => votes.forEach((b, i) => b.classList.toggle("on", (i === 0 ? "up" : "down") === v));
  const thanks = () => setNote(bcT("Thanks for your feedback!"));
  if (rated){ paintVotes(rated); thanks(); }
  else setNote("");
  const whyBox = card.querySelector(".gr-rate-why");
  const whyInput = card.querySelector(".gr-rate-why-input");
  const whySend = card.querySelector(".gr-rate-send");
  const whyPrefixLen = ("\uD83D\uDC4E " + (GR_TOOL_NAME[box.dataset.tool] || box.dataset.tool) + ": ").length;
  whyInput.maxLength = 100 - whyPrefixLen;
  whyInput.placeholder = bcT("Tell us why");
  whyInput.setAttribute("aria-label", bcT("Tell us why"));
  whySend.textContent = bcT("SEND");
  const closeWhy = () => { whyBox.hidden = true; whyInput.value = ""; };
  const submit = async (v, reason) => {
    if (rated || sending) return;
    sending = true;
    paintVotes(v);
    setNote(bcT("Sending..."));
    try {
      await bcSendRating(box.dataset.tool, v, reason);
      rated = v;
      try { localStorage.setItem(rateKey, rated); } catch (e) {}
      closeWhy();
      thanks();
    } catch (e) {
      if (v === "up") paintVotes("");
      setNote(bcT("Could not send. Please try again in a minute."));
    }
    sending = false;
  };
  votes[0].addEventListener("click", () => {
    if (rated || sending) return;
    closeWhy();
    submit("up");
  });
  votes[1].addEventListener("click", () => {
    if (rated || sending) return;
    if (!whyBox.hidden){ closeWhy(); paintVotes(""); return; }
    paintVotes("down");
    setNote("");
    whyBox.hidden = false;
    whyInput.focus();
  });
  whySend.addEventListener("click", () => submit("down", whyInput.value));
  whyInput.addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); submit("down", whyInput.value); }
    else if (e.key === "Escape"){ closeWhy(); paintVotes(""); votes[1].focus(); }
  });
  const tool = box.dataset.tool;
  const prize = card.querySelector(".gr-reward-prize");
  const prizeBtn = card.querySelector(".gr-prize-btn");
  if (GR_ITEMS[tool]){
    prize.hidden = false;
    const pf = prize.querySelector(".gr-prize-face span");
    pf.innerHTML = GR_AVATAR;
    const psvg = pf.querySelector("svg");
    psvg.dataset.mood = "good";
    psvg.setAttribute("viewBox", "4 -14 68 84");
    psvg.querySelector(".av-item").innerHTML = GR_ITEMS[tool].svg;
    prize.querySelector(".gr-prize-name").textContent = bcT(GR_ITEMS[tool].name);
    prizeBtn.addEventListener("click", () => {
      const st = bcAvatarState();
      if (!st.won.includes(tool)) st.won.push(tool);
      bcAvatarSave({ won: st.won, on: st.on === tool ? "" : tool });
    });
  }
  const renderPrize = () => {
    if (!GR_ITEMS[tool]) return;
    const open = card.classList.contains("earned");
    prize.classList.toggle("locked", !open);
    prizeBtn.disabled = !open;
    prizeBtn.textContent = bcT(!open ? "LOCKED" : bcAvatarState().on === tool ? "UNEQUIP" : "EQUIP");
  };
  document.addEventListener("bc-gr-avatar", renderPrize);
  const dlLabel = card.querySelector(".gr-dl-label");
  const dlTiers = card.querySelector(".gr-dl-tiers");
  const tierBtns = GR_TOOL_NAME[tool] ? GR_TIERS.map(n => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gr-challenge-btn gr-dl-tier";
    b.dataset.key = tool + "#" + n;
    b.textContent = n;
    b.addEventListener("click", () => {
      const st = bcAvatarState();
      if (!st.won.includes(b.dataset.key)) return;
      bcAvatarSave({ won: st.won, on: st.on === b.dataset.key ? "" : b.dataset.key });
    });
    dlTiers.appendChild(b);
    return b;
  }) : [];
  const renderDownloads = () => {
    if (!tierBtns.length) return;
    const count = Number(bcDownloadCounts()[tool]) || 0;
    const st = bcAvatarState();
    const next = GR_TIERS.find(n => count < n);
    dlLabel.textContent = next ? bcCountWord(tool) + ": " + count + ". " + bcT("Next reward at {n}.", { n: next }) : bcCountWord(tool) + ": " + count + ". " + bcT("Every reward is yours.");
    tierBtns.forEach((b, i) => {
      const got = st.won.includes(b.dataset.key);
      b.disabled = !got;
      b.classList.toggle("on", st.on === b.dataset.key);
      b.title = got ? bcT(GR_ITEMS[b.dataset.key].name) + " — " + bcT(st.on === b.dataset.key ? "Unequip" : "Equip") : bcT("Locked — {n} downloads in {tool}", { n: GR_TIERS[i], tool: GR_TOOL_NAME[tool] });
    });
  };
  document.addEventListener("bc-gr-avatar", renderDownloads);
  document.addEventListener("bc-gr-downloads", renderDownloads);
  renderDownloads();
  const paint = () => {
    const k = readCount();
    const left = missing().map(i => i + 1);
    const done = k >= arts.length;
    card.classList.toggle("earned", done);
    title.textContent = done ? bcT("Well done!") : bcT("Your reward is waiting");
    if (!ch.active()) sub.textContent = bcT("Start the challenge above to earn it.");
    else if (done) sub.textContent = bcT("You have read every guide. You are now ready.");
    else if (k > 0 && left.length === 1) sub.textContent = bcT("Still waiting: guide {list}.", { list: left[0] });
    else if (k > 0 && left.length <= 3) sub.textContent = bcT("Still waiting: guides {list}.", { list: bcJoinList(left) });
    else sub.textContent = bcT("Take your time with each guide to unlock it. {k} of {n} done.", { n: arts.length, k });
    dots.forEach((d, i) => d.classList.toggle("on", isRead(i)));
    tocLinks.forEach((a, i) => a.classList.toggle("done", isRead(i)));
    if (done && GR_ITEMS[tool]){
      const st = bcAvatarState();
      if (!st.won.includes(tool)){
        st.won.push(tool);
        if (!st.on) st.on = tool;
        bcAvatarSave(st);
      }
    }
    renderPrize();
    if (done) ch.complete();
    return done;
  };
  box.appendChild(card);
  bcAddGuideBuddy(box, card, arts, api);
  if (paint()) return;
  let lastActive = Date.now(), timer = 0, io = null;
  const celebrate = (i, all) => setTimeout(() => { if (api.onUnlock) api.onUnlock(i, all); }, 1000 + Math.random() * 1500);
  const finish = () => {
    clearInterval(timer);
    if (io) io.disconnect();
    if (typeof gtag === "function") gtag("event", "guides_completed", { tool: box.dataset.tool });
  };
  ["scroll", "wheel", "pointermove", "pointerdown", "keydown", "touchstart"].forEach(ev =>
    addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
  timer = setInterval(() => {
    if (!ch.active() || document.visibilityState !== "visible" || Date.now() - lastActive > IDLE_MS) return;
    const mid = innerHeight / 2;
    const cur = arts.findIndex(a => { const q = a.getBoundingClientRect(); return q.top <= mid && q.bottom >= mid; });
    if (cur === -1 || spent[cur] >= need[cur]) return;
    const before = isRead(cur);
    spent[cur] += STEP_MS;
    if (spent[cur] % 2000 === 0 || spent[cur] >= need[cur]) save();
    if (!before && isRead(cur)){
      const all = paint();
      celebrate(cur, all);
      if (all) finish();
    }
  }, STEP_MS);
  io = new IntersectionObserver(entries => {
    if (!ch.active()) return;
    const before = arts.map((a, i) => isRead(i));
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      reached.add(Number(en.target.dataset.i));
    });
    save();
    const all = paint();
    arts.forEach((a, i) => { if (!before[i] && isRead(i)) celebrate(i, all); });
    if (all) finish();
  });
  const ends = [];
  arts.forEach((a, i) => {
    const end = document.createElement("div");
    end.className = "gr-end-sentinel";
    end.dataset.i = i;
    a.appendChild(end);
    ends.push(end);
    io.observe(end);
  });
  ch.onStart(() => {
    io.disconnect();
    ends.forEach(e => io.observe(e));
    paint();
  });
}
const GR_ITEMS = {
  convert:  { name: "Party hat", det: "a", svg: '<g transform="rotate(-14 28 3)"><path d="M19 3 L37 3 L28 -17Z" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2"/><path d="M23 -3 L33 -3" stroke="#fff" stroke-width="2" fill="none"/><circle cx="28" cy="-18" r="2.6" fill="#F6D44A" stroke="#1d2437" stroke-width="1.5"/></g>' },
  compress: { name: "Cool shades", det: "", svg: '<rect x="14" y="16" width="20" height="15" rx="6" fill="#1d2437"/><rect x="42" y="16" width="20" height="15" rx="6" fill="#1d2437"/><path d="M34 21 H42" stroke="#1d2437" stroke-width="3" fill="none"/><path d="M18 20 L23 20 M46 20 L51 20" stroke="#fff" stroke-width="2" opacity=".45" fill="none"/>' },
  exif:     { name: "Shower cap", det: "a", svg: '<path d="M10 14 C12 -6 64 -6 66 14 C55 9 21 9 10 14Z" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2"/><circle cx="24" cy="-9" r="3.4" fill="none" stroke="#1d2437" stroke-width="1.6"/><circle cx="33" cy="-14" r="2.4" fill="none" stroke="#1d2437" stroke-width="1.6"/><circle cx="16" cy="-14" r="2" fill="none" stroke="#1d2437" stroke-width="1.6"/>' },
  combine:  { name: "Bow tie", det: "a", svg: '<path d="M38 66 L27 59 L27 73Z M38 66 L49 59 L49 73Z" fill="#FF6961" stroke="#1d2437" stroke-width="2"/><circle cx="38" cy="66" r="3.2" fill="#FF6961" stroke="#1d2437" stroke-width="2"/>' },
  context:  { name: "Reading glasses", det: "", svg: '<circle cx="24" cy="25" r="10.5" fill="#fff" fill-opacity=".3" stroke="#1d2437" stroke-width="2.6"/><circle cx="53" cy="25" r="10.5" fill="#fff" fill-opacity=".3" stroke="#1d2437" stroke-width="2.6"/><path d="M34.5 24 Q38.5 20 42.5 24" fill="none" stroke="#1d2437" stroke-width="2.6"/><path d="M13.5 24 L9 21 M63.5 24 L68 21" fill="none" stroke="#1d2437" stroke-width="2.6"/>' },
  colorfy:  { name: "Painter beret", det: "a", svg: '<g transform="rotate(-10 38 4)"><path d="M10 9 C8 -6 48 -12 62 -2 C70 5 60 12 40 11 C22 11 11 13 10 9Z" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2"/><path d="M37 -9 L39 -15" stroke="#1d2437" stroke-width="3" fill="none"/></g>' },
  gif:      { name: "Film headband", det: "a", svg: '<g transform="translate(0 -6)"><path d="M10 14 Q38 -2 66 14 L66 21 Q38 5 10 21Z" fill="#1d2437"/><g fill="#fff"><rect x="14" y="14.5" width="4" height="3" rx="1"/><rect x="25" y="9.5" width="4" height="3" rx="1"/><rect x="36" y="7.5" width="4" height="3" rx="1"/><rect x="47" y="9.5" width="4" height="3" rx="1"/><rect x="58" y="14.5" width="4" height="3" rx="1"/></g></g>' },
  coudio:   { name: "Headphones", det: "", svg: '<path d="M12 30 C9 -8 67 -8 64 30" fill="none" stroke="#1d2437" stroke-width="6"/><path d="M12 30 C9 -8 67 -8 64 30" fill="none" stroke="var(--gr-accent)" stroke-width="2.6"/><rect x="4" y="25" width="10" height="18" rx="4.5" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2"/><rect x="62" y="25" width="10" height="18" rx="4.5" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2"/>' },
  codify:   { name: "Code brackets", det: "", svg: '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 -3 L9 -11 L18 -19 M27 -2 L23 -20 M32 -3 L41 -11 L32 -19" stroke="#1d2437" stroke-width="6"/><path d="M18 -3 L9 -11 L18 -19 M27 -2 L23 -20 M32 -3 L41 -11 L32 -19" stroke="var(--gr-accent)" stroke-width="2.6"/></g>' },
  comprio:  { name: "Play cap", det: "a", svg: '<path d="M10 10 C10 -6 62 -6 66 10 L74 12 C74 16 60 15 40 14 C24 13 10 14 10 10Z" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2"/><path d="M31 -2 L31 8 L40 3Z" fill="#fff"/>' },
  convido:  { name: "Popcorn bucket", det: "a", svg: '<g transform="translate(0 -2)"><circle cx="28" cy="-13" r="4.2" fill="#fff6d6" stroke="#1d2437" stroke-width="1.6"/><circle cx="36" cy="-16" r="4.2" fill="#fff6d6" stroke="#1d2437" stroke-width="1.6"/><circle cx="44" cy="-13" r="4.2" fill="#fff6d6" stroke="#1d2437" stroke-width="1.6"/><path d="M22 6 L54 6 L50 -10 L26 -10Z" fill="#fff" stroke="#1d2437" stroke-width="2"/><path d="M30 6 L31 -10 M38 6 L38 -10 M46 6 L45 -10" stroke="var(--gr-accent)" stroke-width="3.4" fill="none"/></g>' }
};
const GR_TIERS = [10, 50, 100, 200];
const GR_PATH_TOOL = { convert:"convert", compress:"compress", combine:"combine", cleanly:"exif", context:"context", colorfy:"colorfy", congify:"gif", coudio:"coudio", codify:"codify", comprio:"comprio", convido:"convido" };
const GR_STAR = "M20,-2L22,4L28,6L22,8L20,14L18,8L12,6L18,4L20,-2Z";
const GR_TIER_ITEMS = [
  { name: "Bronze star", det: "a", svg: '<g transform="translate(18 -12.6) scale(1.1)"><path d="' + GR_STAR + '" fill="#cd7f32" stroke="#1d2437" stroke-width="1.8"/><circle cx="20" cy="6" r="1.6" fill="var(--gr-accent)"/></g>' },
  { name: "Silver halo", det: "a", svg: '<ellipse cx="40" cy="-7" rx="19" ry="5.5" fill="none" stroke="#1d2437" stroke-width="6.5"/><ellipse cx="40" cy="-7" rx="19" ry="5.5" fill="none" stroke="#cfd6e4" stroke-width="3.2"/>' },
  { name: "Gold crown", det: "a", svg: '<path d="M26,2L28,-12L34,-4L40,-14L46,-4L52,-12L54,2Z" fill="#f6c744" stroke="#1d2437" stroke-width="2"/><circle cx="40" cy="-3" r="2.6" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="1.2"/>' },
  { name: "Platinum sparkles", det: "", svg: '<g fill="#bff3f7" stroke="#1d2437" stroke-width="1.6"><path d="' + GR_STAR + '" transform="translate(-10 -1.4) scale(.9)"/><path d="' + GR_STAR + '" transform="translate(50 .6) scale(.9)"/><path d="' + GR_STAR + '" transform="translate(16 -19.2) scale(1.2)"/></g>' }
];
Object.keys(GR_TOOL_NAME).forEach(tool => GR_TIERS.forEach((n, i) => { GR_ITEMS[tool + "#" + n] = GR_TIER_ITEMS[i]; }));
function bcPageTool(){
  const seg = location.pathname.split("/").filter(Boolean);
  for (const part of seg) if (GR_PATH_TOOL[part]) return GR_PATH_TOOL[part];
  return "";
}
function bcDownloadCounts(){
  try {
    const v = JSON.parse(localStorage.getItem("bc-gr-downloads") || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (e) { return {}; }
}
function bcCountDownload(tool){
  tool = tool || bcPageTool();
  if (!GR_TOOL_NAME[tool]) return;
  const counts = bcDownloadCounts();
  const total = (Number(counts[tool]) || 0) + 1;
  counts[tool] = total;
  try { localStorage.setItem("bc-gr-downloads", JSON.stringify(counts)); } catch (e) {}
  const st = bcAvatarState();
  const fresh = GR_TIERS.filter(n => total >= n && !st.won.includes(tool + "#" + n));
  fresh.forEach(n => st.won.push(tool + "#" + n));
  if (fresh.length) bcAvatarSave(st);
  document.dispatchEvent(new Event("bc-gr-downloads"));
  if (fresh.length) bcShowRewardToast(tool + "#" + fresh[fresh.length - 1], fresh[fresh.length - 1]);
}
function bcShowRewardToast(key, tier){
  const item = GR_ITEMS[key];
  if (!item) return;
  const tool = key.split("#")[0];
  document.querySelectorAll(".gr-toast").forEach(t => t.remove());
  const el = document.createElement("div");
  el.className = "gr-toast engine-status-card";
  el.setAttribute("role", "status");
  el.style.setProperty("--gr-accent", GR_ACCENT[tool] || "#3FBFE8");
  el.innerHTML = '<div class="gr-buddy-face gr-toast-face"><span aria-hidden="true"></span></div><div class="gr-toast-main"><div class="engine-status-row">&gt; <span class="engine-status-value gr-toast-title"></span></div><div class="engine-status-row gr-toast-sub"></div><div class="gr-toast-actions"><button type="button" class="gr-challenge-btn gr-toast-equip"></button><button type="button" class="gr-challenge-btn gr-toast-close"></button></div></div>';
  const face = el.querySelector(".gr-toast-face span");
  face.innerHTML = GR_AVATAR;
  const svg = face.querySelector("svg");
  svg.dataset.mood = "good";
  svg.querySelector(".av-item").innerHTML = item.svg;
  el.querySelector(".gr-toast-title").textContent = bcT("Reward unlocked: {item}", { item: bcT(item.name) });
  el.querySelector(".gr-toast-sub").textContent = bcT("{n} downloads in {tool}.", { n: tier, tool: GR_TOOL_NAME[tool] });
  const equip = el.querySelector(".gr-toast-equip");
  const close = el.querySelector(".gr-toast-close");
  close.textContent = bcT("CLOSE");
  const paint = () => { equip.textContent = bcT(bcAvatarState().on === key ? "UNEQUIP" : "EQUIP"); };
  paint();
  equip.addEventListener("click", () => {
    const st = bcAvatarState();
    bcAvatarSave({ won: st.won, on: st.on === key ? "" : key });
    paint();
  });
  let timer = 0;
  const dismiss = () => { clearTimeout(timer); el.remove(); };
  close.addEventListener("click", dismiss);
  timer = setTimeout(dismiss, 14000);
  document.body.appendChild(el);
}
const GR_COUNT_WORD = { colorfy: "Copies" };
function bcCountWord(tool){ return bcT(GR_COUNT_WORD[tool] || "Downloads"); }
function bcFileKey(f){ return f ? f.name + ":" + f.size + ":" + (f.lastModified || 0) : ""; }
function bcDownloadGate(getSig){
  let runSig = null;
  let saved = false;
  return {
    ran(sig){ runSig = sig === undefined ? getSig() : sig; saved = false; },
    downloaded(){ saved = true; },
    resultLocked(){ return saved; },
    runLocked(){ return saved && runSig !== null && getSig() === runSig; }
  };
}
function bcSetLocked(buttons, locked){
  [].concat(buttons).forEach(b => {
    if (!b) return;
    if (b.dataset.bcTitle === undefined) b.dataset.bcTitle = b.title || "";
    b.classList.toggle("bc-locked", locked);
    b.setAttribute("aria-disabled", locked ? "true" : "false");
    b.title = locked ? bcT("Already downloaded. Change the file or the settings to unlock.") : b.dataset.bcTitle;
  });
}
function bcLockedNotice(statusEl){
  if (statusEl) statusEl.textContent = bcT("Already downloaded. Change the file or the settings to unlock.");
}
function bcSetupUsageBar(){
  const tool = bcPageTool();
  const wrap = document.querySelector(".tool-wrap");
  if (!tool || !wrap || !wrap.querySelector(".tool-app") || wrap.querySelector(".bc-usage-bar")) return;
  const bar = document.createElement("div");
  bar.className = "bc-usage-bar";
  bar.style.setProperty("--gr-accent", GR_ACCENT[tool] || "#3FBFE8");
  bar.innerHTML = '<span class="bc-usage-label"></span><div class="bc-usage-track" role="progressbar" aria-valuemin="0"><span class="bc-usage-fill"></span></div><span class="bc-usage-next"></span>';
  const label = bar.querySelector(".bc-usage-label");
  const track = bar.querySelector(".bc-usage-track");
  const fill = bar.querySelector(".bc-usage-fill");
  const next = bar.querySelector(".bc-usage-next");
  const marks = GR_TIERS.map((n, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bc-usage-mark";
    b.dataset.key = tool + "#" + n;
    b.style.left = ((i + 1) / GR_TIERS.length * 100) + "%";
    b.textContent = n;
    b.addEventListener("click", () => {
      const st = bcAvatarState();
      if (!st.won.includes(b.dataset.key)) return;
      bcAvatarSave({ won: st.won, on: st.on === b.dataset.key ? "" : b.dataset.key });
    });
    track.appendChild(b);
    return b;
  });
  let shown = null;
  const render = () => {
    const count = Number(bcDownloadCounts()[tool]) || 0;
    const st = bcAvatarState();
    let frac = 0;
    for (let i = 0; i < GR_TIERS.length; i++){
      const lo = i ? GR_TIERS[i - 1] : 0;
      if (count >= GR_TIERS[i]) frac = i + 1;
      else { frac = i + Math.max(0, count - lo) / (GR_TIERS[i] - lo); break; }
    }
    fill.style.width = (frac / GR_TIERS.length * 100) + "%";
    const nextTier = GR_TIERS.find(n => count < n);
    label.textContent = bcCountWord(tool).toUpperCase() + " " + count;
    next.textContent = nextTier
      ? bcT("Next reward at {n}", { n: nextTier })
      : bcT("All rewards unlocked");
    track.setAttribute("aria-valuemax", GR_TIERS[GR_TIERS.length - 1]);
    track.setAttribute("aria-valuenow", Math.min(count, GR_TIERS[GR_TIERS.length - 1]));
    track.setAttribute("aria-valuetext", label.textContent + ". " + next.textContent);
    const unlocked = marks.filter(b => st.won.includes(b.dataset.key)).map(b => b.dataset.key);
    marks.forEach((b, i) => {
      const got = unlocked.includes(b.dataset.key);
      b.disabled = !got;
      b.classList.toggle("got", got);
      b.classList.toggle("on", st.on === b.dataset.key);
      if (got && shown && !shown.includes(b.dataset.key)){
        b.classList.remove("pop");
        void b.offsetWidth;
        b.classList.add("pop");
      }
      b.title = got
        ? bcT(GR_ITEMS[b.dataset.key].name) + " — " + bcT(st.on === b.dataset.key ? "Unequip" : "Equip")
        : bcT("Locked — {n} downloads in {tool}", { n: GR_TIERS[i], tool: GR_TOOL_NAME[tool] });
    });
    shown = unlocked;
  };
  document.addEventListener("bc-gr-downloads", render);
  document.addEventListener("bc-gr-avatar", render);
  render();
  wrap.appendChild(bar);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bcSetupUsageBar);
else bcSetupUsageBar();
function bcAvatarState(){
  try {
    const v = JSON.parse(localStorage.getItem("bc-gr-avatar") || "{}");
    return { won: Array.isArray(v.won) ? v.won : [], on: typeof v.on === "string" ? v.on : "" };
  } catch (e) { return { won: [], on: "" }; }
}
function bcAvatarSave(state){
  try { localStorage.setItem("bc-gr-avatar", JSON.stringify(state)); } catch (e) {}
  document.dispatchEvent(new Event("bc-gr-avatar"));
}
function bcDressAvatar(svg){
  const layer = svg && svg.querySelector(".av-item");
  if (layer) layer.innerHTML = (GR_ITEMS[bcAvatarState().on] || {}).svg || "";
}
document.addEventListener("bc-gr-avatar", () => document.querySelectorAll(".gr-buddy-face svg").forEach(bcDressAvatar));
const GR_AVATAR = '<svg viewBox="4 -20 68 88" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="ant ant-a"><path d="M40,6L40,-3" transform="matrix(0.754,-0.435,0.545,0.945,6.223,11.077)" fill="none" stroke="var(--gr-accent)" stroke-width="3"/><circle class="av-tip" cx="40" cy="-6" r="4" transform="matrix(0.754,-0.435,0.545,0.945,6.223,11.077)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2.5"/></g>' +
  '<g class="ant ant-b"><path d="M40,6L40,-3" transform="matrix(0.754,0.435,-0.545,0.945,10.972,-22.185)" fill="none" stroke="var(--gr-accent)" stroke-width="3"/><circle class="av-tip" cx="40" cy="-6" r="4" transform="matrix(0.754,0.435,-0.545,0.945,10.972,-22.185)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2.5"/></g>' +
  '<path d="M40,6C60,6 74,20 72,38C70,54 54,66 40,66C26,66 10,54 8,38C6,20 20,6 40,6Z" transform="matrix(0.871,0,0,1.091,3.227,-7.214)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="3"/>' +
  '<g class="f f-start"><g class="av-hand"><path d="M10,44L26,42" transform="matrix(0.941,0,0,0.941,50.209,-4.824)" fill="none" stroke="var(--gr-accent)" stroke-width="3"/><path d="M201,203C203.76,203 206,205.24 206,208C206,210.76 203.76,213 201,213L187,213C184.24,213 182,210.76 182,208C182,205.24 184.24,203 187,203L201,203Z" transform="matrix(0.491,0,0,0.491,-11.176,-66.384)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="3.6" stroke-linecap="square"/><path d="M201,203C203.76,203 206,205.24 206,208C206,210.76 203.76,213 201,213L187,213C184.24,213 182,210.76 182,208C182,205.24 184.24,203 187,203L201,203Z" transform="matrix(0.347,-0.347,0.347,0.347,-58.169,24.385)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="3.6" stroke-linecap="square"/><path d="M201,203C203.76,203 206,205.24 206,208C206,210.76 203.76,213 201,213L187,213C184.24,213 182,210.76 182,208C182,205.24 184.24,203 187,203L201,203Z" transform="matrix(0,-0.491,0.491,0,-27.351,123.515)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="3.6" stroke-linecap="square"/><circle cx="28" cy="42" r="5" transform="matrix(0.941,0,0,0.941,50.209,-4.824)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2.5"/></g><g class="av-eyes"><path d="M401.668,158.117C401.633,158.556 401.615,159.001 401.615,159.45C401.615,163.22 402.886,166.695 404.45,168.9C399.235,168.9 395,164.666 395,159.45C395,154.235 399.235,150 404.45,150C404.063,150.546 403.694,151.169 403.358,151.855C402.897,151.757 402.406,151.704 401.896,151.704C399.241,151.704 397.085,153.142 397.085,154.912C397.085,156.632 399.118,158.037 401.668,158.117Z" transform="matrix(0,1.024,-1.024,0,188.914,-382.081)" fill="#d4dbee"/><path d="M401.628,158.781C401.62,159.003 401.615,159.226 401.615,159.45C401.615,163.22 402.886,166.695 404.45,168.9C399.235,168.9 395,164.666 395,159.45C395,154.235 399.235,150 404.45,150C403.951,150.704 403.482,151.537 403.074,152.467C402.876,152.451 402.675,152.442 402.471,152.442C399.815,152.442 397.659,153.874 397.659,155.636C397.659,157.208 399.374,158.517 401.628,158.781Z" transform="matrix(0,1.024,-1.024,0,214.452,-382.081)" fill="#1d2437"/><path d="M49.542,35.85C49.573,35.671 49.638,35.504 49.729,35.355C49.981,34.944 50.434,34.67 50.95,34.67C51.739,34.67 52.38,35.311 52.38,36.1C52.38,36.161 52.376,36.221 52.369,36.279C51.557,36.043 50.58,35.877 49.542,35.85Z" transform="matrix(2.287,0,0,3.445,-61.435,-94.344)" fill="#d4dbee"/><path d="M49.587,36.534C49.544,36.397 49.52,36.251 49.52,36.1C49.52,35.311 50.161,34.67 50.95,34.67C51.716,34.67 52.343,35.274 52.378,36.032C51.338,36.086 50.37,36.278 49.587,36.534Z" transform="matrix(-2.297,0,0,3.445,147.328,-94.933)" fill="#1d2437"/></g><g class="av-mouth"><path d="M443.949,225.733L479.149,225.733C467.415,241.733 455.682,241.733 443.949,225.733Z" transform="matrix(0.588,0,0,0.833,-233.444,-143.745)" fill="#1d2437" stroke="#1d2437" stroke-width="4.8"/></g></g>' +
  '<g class="f f-good"><g class="av-eyes"><path d="M339.336,115.283C337.806,112.633 337,109.627 337,106.567C337,96.945 344.812,89.134 354.433,89.134C364.055,89.134 371.866,96.945 371.866,106.567C371.866,109.627 371.061,112.633 369.531,115.283L339.336,115.283Z" transform="matrix(0.588,0,0,0.588,-157.779,-37.967)" fill="#1d2437"/><path d="M339.336,115.283C337.806,112.633 337,109.627 337,106.567C337,96.945 344.812,89.134 354.433,89.134C364.055,89.134 371.866,96.945 371.866,106.567C371.866,109.627 371.061,112.633 369.531,115.283L339.336,115.283Z" transform="matrix(0.588,0,0,0.588,-182.444,-37.953)" fill="#d4dbee"/><circle cx="50.95" cy="36.1" r="1.43" transform="matrix(2.287,0,0,3.445,-60.63,-102.005)" fill="#d4dbee"/><circle cx="50.95" cy="36.1" r="1.43" transform="matrix(-2.297,0,0,3.445,148.133,-102.594)" fill="#1d2437"/></g><g class="av-mouth"><path d="M30.571,27.185C35.76,36.005 44.102,35.905 49.931,27.587C49.963,27.541 49.995,27.495 50.027,27.448" transform="matrix(1.235,0,0,1.045,-11.65,17.241)" fill="none" stroke="#1d2437" stroke-width="3"/></g></g>' +
  '<g class="f f-mid"><g class="av-eyes"><circle cx="52.25" cy="37.9" r="4.2" transform="matrix(2.287,0,0,3.445,-65.658,-102.944)" fill="#1d2437"/><circle cx="52.25" cy="37.9" r="4.2" transform="matrix(-2.297,0,0,3.445,143.515,-102.944)" fill="#d4dbee"/><circle cx="50.95" cy="36.1" r="1.43" transform="matrix(2.287,0,0,3.445,-59.187,-102.356)" fill="#d4dbee"/><circle cx="50.95" cy="36.1" r="1.43" transform="matrix(-2.297,0,0,3.445,143.515,-102.944)" fill="#1d2437"/></g><g class="av-mouth"><path d="M33,33C38.333,34.333 43.667,33 49,29" transform="matrix(0.941,0,0,0.941,0.408,20.078)" fill="none" stroke="#1d2437" stroke-width="3"/></g></g>' +
  '<g class="f f-almost"><g class="av-eyes"><path d="M339.336,115.283C337.806,112.633 337,109.627 337,106.567C337,96.945 344.812,89.134 354.433,89.134C364.055,89.134 371.866,96.945 371.866,106.567C371.866,109.627 371.061,112.633 369.531,115.283L339.336,115.283Z" transform="matrix(0.588,0,0,0.588,-158.102,-35.578)" fill="#1d2437"/><path d="M339.336,115.283C337.806,112.633 337,109.627 337,106.567C337,96.945 344.812,89.134 354.433,89.134C364.055,89.134 371.866,96.945 371.866,106.567C371.866,109.627 371.061,112.633 369.531,115.283L339.336,115.283Z" transform="matrix(0.588,0,0,0.588,-182.767,-35.564)" fill="#d4dbee"/><circle cx="50.95" cy="36.1" r="1.43" transform="matrix(2.287,0,0,3.445,-60.954,-99.616)" fill="#d4dbee"/><circle cx="50.95" cy="36.1" r="1.43" transform="matrix(-2.297,0,0,3.445,147.809,-100.205)" fill="#1d2437"/></g><g class="av-mouth"><ellipse cx="283" cy="224.983" rx="16" ry="4.25" transform="matrix(0.533,0,0,1.519,-113.132,-293.777)" fill="#1d2437"/></g><path d="M20,-2L22,4L28,6L22,8L20,14L18,8L12,6L18,4L20,-2Z" transform="matrix(0.941,0,0,0.941,43.466,-16.087)" fill="#f6d44a" stroke="#1d2437" stroke-width="1.8"/></g>' +
  '<g class="f f-last"><g class="av-eyes"><path d="M401.668,158.117C401.633,158.556 401.615,159.001 401.615,159.45C401.615,163.22 402.886,166.695 404.45,168.9C399.235,168.9 395,164.666 395,159.45C395,154.235 399.235,150 404.45,150C404.063,150.546 403.694,151.169 403.358,151.855C402.897,151.757 402.406,151.704 401.896,151.704C399.241,151.704 397.085,153.142 397.085,154.912C397.085,156.632 399.118,158.037 401.668,158.117Z" transform="matrix(0,1.024,-1.024,0,188.556,-382.554)" fill="#d4dbee"/><path d="M401.628,158.781C401.62,159.003 401.615,159.226 401.615,159.45C401.615,163.22 402.886,166.695 404.45,168.9C399.235,168.9 395,164.666 395,159.45C395,154.235 399.235,150 404.45,150C403.951,150.704 403.482,151.537 403.074,152.467C402.876,152.451 402.675,152.442 402.471,152.442C399.815,152.442 397.659,153.874 397.659,155.636C397.659,157.208 399.374,158.517 401.628,158.781Z" transform="matrix(0,1.024,-1.024,0,214.094,-382.554)" fill="#1d2437"/><path d="M49.542,35.85C49.573,35.671 49.638,35.504 49.729,35.355C49.981,34.944 50.434,34.67 50.95,34.67C51.739,34.67 52.38,35.311 52.38,36.1C52.38,36.161 52.376,36.221 52.369,36.279C51.557,36.043 50.58,35.877 49.542,35.85Z" transform="matrix(2.287,0,0,3.445,-61.793,-94.817)" fill="#d4dbee"/><path d="M49.587,36.534C49.544,36.397 49.52,36.251 49.52,36.1C49.52,35.311 50.161,34.67 50.95,34.67C51.716,34.67 52.343,35.274 52.378,36.032C51.338,36.086 50.37,36.278 49.587,36.534Z" transform="matrix(-2.297,0,0,3.445,146.97,-95.405)" fill="#1d2437"/></g><g class="av-mouth"><path d="M443.949,225.733L479.149,225.733C467.415,241.733 455.682,241.733 443.949,225.733Z" transform="matrix(0.588,0,0,0.833,-233.802,-144.218)" fill="#1d2437" stroke="#1d2437" stroke-width="4.8"/></g><path d="M20,-2L22,4L28,6L22,8L20,14L18,8L12,6L18,4L20,-2Z" transform="matrix(0.941,0,0,0.941,39.123,-16.617)" fill="#f6d44a" stroke="#1d2437" stroke-width="1.8"/></g>' +
  '<g class="f f-done"><g class="av-horn"><path d="M1070.31,222C1072.899,222 1075,224.913 1075,228.5L1075,241.5C1075,245.087 1072.899,248 1070.31,248L1015.69,248C1013.101,248 1011,245.087 1011,241.5L1011,228.5C1011,224.913 1013.101,222 1015.69,222L1070.31,222Z" transform="matrix(0.533,0,0,0.385,-489.123,-37.741)" fill="none" stroke="#1d2437" stroke-width="8.86" stroke-linecap="square"/><path d="M1070.31,222C1072.899,222 1075,224.913 1075,228.5L1075,241.5C1075,245.087 1072.899,248 1070.31,248L1015.69,248C1013.101,248 1011,245.087 1011,241.5L1011,228.5C1011,224.913 1013.101,222 1015.69,222L1070.31,222Z" transform="matrix(0.533,0,0,0.385,-489.123,-37.741)" fill="none" stroke="#fbc442" stroke-width="3.8" stroke-linecap="square"/><path d="M1040.75,250C1040.888,250 1041,250.371 1041,250.827L1041,269.173C1041,269.629 1040.888,270 1040.75,270L1040.25,270C1040.112,270 1040,269.629 1040,269.173L1040,250.827C1040,250.371 1040.112,250 1040.25,250L1040.75,250Z" transform="matrix(2.628,0,0,0.794,-2673.042,-156.18)" fill="#fbc442" stroke="#1d2437" stroke-width="0.3" stroke-linecap="square"/><path d="M1040.75,250C1040.888,250 1041,250.371 1041,250.827L1041,269.173C1041,269.629 1040.888,270 1040.75,270L1040.25,270C1040.112,270 1040,269.629 1040,269.173L1040,250.827C1040,250.371 1040.112,250 1040.25,250L1040.75,250Z" transform="matrix(2.628,0,0,0.794,-2670.217,-156.199)" fill="#fbc442" stroke="#1d2437" stroke-width="0.3" stroke-linecap="square"/><path d="M1040.75,250C1040.888,250 1041,250.371 1041,250.827L1041,269.173C1041,269.629 1040.888,270 1040.75,270L1040.25,270C1040.112,270 1040,269.629 1040,269.173L1040,250.827C1040,250.371 1040.112,250 1040.25,250L1040.75,250Z" transform="matrix(2.628,0,0,0.794,-2667.22,-156.269)" fill="#fbc442" stroke="#1d2437" stroke-width="0.3" stroke-linecap="square"/><path d="M1073,215C1075.208,215 1077,217.689 1077,221C1077,224.311 1075.208,227 1073,227L998,227C995.792,227 994,224.311 994,221C994,217.689 995.792,215 998,215L1073,215Z" transform="matrix(0.588,0,0,0.392,-546.65,-39.023)" fill="#fbc442" stroke="#1d2437" stroke-width="3.53" stroke-linecap="square"/><ellipse cx="1087" cy="231" rx="11" ry="20" transform="matrix(0.588,0,0,0.588,-548.994,-88.239)" fill="#fbc442" stroke="#1d2437" stroke-width="3" stroke-linecap="square"/><ellipse cx="1087" cy="231" rx="11" ry="20" transform="matrix(0.16,0,0,0.14,-88.094,15.317)" fill="#fbc442" stroke="#1d2437" stroke-width="11.72" stroke-linecap="square"/><ellipse cx="1058.5" cy="212.5" rx="3.5" ry="2.5" transform="matrix(0.588,0,0,0.294,-561.062,-19.71)" fill="#fbc442" stroke="#1d2437" stroke-width="1.26" stroke-linecap="square"/><ellipse cx="1058.5" cy="212.5" rx="3.5" ry="2.5" transform="matrix(0.588,0,0,0.294,-558.258,-20.48)" fill="#fbc442" stroke="#1d2437" stroke-width="1.26" stroke-linecap="square"/><ellipse cx="1058.5" cy="212.5" rx="3.5" ry="2.5" transform="matrix(0.588,0,0,0.294,-555.315,-19.745)" fill="#fbc442" stroke="#1d2437" stroke-width="1.26" stroke-linecap="square"/></g><g class="av-conf"><circle cx="12" cy="8" r="2.5" transform="matrix(0.941,0,0,0.941,1.655,-23.811)" fill="#ff6961"/><circle cx="74" cy="10" r="2.5" transform="matrix(0.941,0,0,0.941,1.655,-23.811)" fill="#f6d44a"/><circle cx="3" cy="40" r="2.5" transform="matrix(0.941,0,0,0.941,1.655,-23.811)" fill="#3fbfe8"/><circle cx="77" cy="52" r="2.5" transform="matrix(0.941,0,0,0.941,1.655,-23.811)" fill="#b84cff"/><rect x="12" y="-4" width="5" height="5" transform="matrix(0.853,0.398,-0.398,0.853,2.094,-29.556)" fill="#7ed321"/></g><g class="av-eyes"><path d="M339.336,115.283C337.806,112.633 337,109.627 337,106.567C337,96.945 344.812,89.134 354.433,89.134C364.055,89.134 371.866,96.945 371.866,106.567C371.866,109.627 371.061,112.633 369.531,115.283L339.336,115.283Z" transform="matrix(0.588,0,0,0.588,-158.102,-34.89)" fill="#1d2437"/><path d="M339.336,115.283C337.806,112.633 337,109.627 337,106.567C337,96.945 344.812,89.134 354.433,89.134C364.055,89.134 371.866,96.945 371.866,106.567C371.866,109.627 371.061,112.633 369.531,115.283L339.336,115.283Z" transform="matrix(0.588,0,0,0.588,-182.767,-34.876)" fill="#d4dbee"/><circle cx="50.95" cy="36.1" r="1.43" transform="matrix(2.287,0,0,3.445,-60.954,-98.929)" fill="#d4dbee"/><circle cx="50.95" cy="36.1" r="1.43" transform="matrix(-2.297,0,0,3.445,147.809,-99.517)" fill="#1d2437"/></g><path d="M20,-2L22,4L28,6L22,8L20,14L18,8L12,6L18,4L20,-2Z" transform="matrix(0.941,0,0,0.941,40.184,-13.532)" fill="#f6d44a" stroke="#1d2437" stroke-width="1.8"/></g>' +
  '<g class="f f-point"><g class="av-point"><path d="M10,44L26,42" transform="matrix(0.941,0,0,0.941,52.577,-7.078)" fill="none" stroke="var(--gr-accent)" stroke-width="3"/><path d="M201,203C203.76,203 206,205.24 206,208C206,210.76 203.76,213 201,213L187,213C184.24,213 182,210.76 182,208C182,205.24 184.24,203 187,203L201,203Z" transform="matrix(0.491,0,0,0.491,-8.841,-69.579)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="3.6" stroke-linecap="square"/><path d="M201,203C203.76,203 206,205.24 206,208C206,210.76 203.76,213 201,213L187,213C184.24,213 182,210.76 182,208C182,205.24 184.24,203 187,203L201,203Z" transform="matrix(0.491,0,0,0.491,-11.3,-73.467)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="3.6" stroke-linecap="square"/><path d="M201,203C203.76,203 206,205.24 206,208C206,210.76 203.76,213 201,213L187,213C184.24,213 182,210.76 182,208C182,205.24 184.24,203 187,203L201,203Z" transform="matrix(0.491,0,0,0.491,-10.787,-65.269)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="3.6" stroke-linecap="square"/><circle cx="28" cy="42" r="5" transform="matrix(0.941,0,0,0.941,52.577,-7.078)" fill="var(--gr-accent)" stroke="#1d2437" stroke-width="2.5"/></g><g class="av-eyes"><path d="M401.668,158.117C401.633,158.556 401.615,159.001 401.615,159.45C401.615,163.22 402.886,166.695 404.45,168.9C399.235,168.9 395,164.666 395,159.45C395,154.235 399.235,150 404.45,150C404.063,150.546 403.694,151.169 403.358,151.855C402.897,151.757 402.406,151.704 401.896,151.704C399.241,151.704 397.085,153.142 397.085,154.912C397.085,156.632 399.118,158.037 401.668,158.117Z" transform="matrix(0,1.024,-1.024,0,190.043,-381.687)" fill="#d4dbee"/><path d="M401.628,158.781C401.62,159.003 401.615,159.226 401.615,159.45C401.615,163.22 402.886,166.695 404.45,168.9C399.235,168.9 395,164.666 395,159.45C395,154.235 399.235,150 404.45,150C403.951,150.704 403.482,151.537 403.074,152.467C402.876,152.451 402.675,152.442 402.471,152.442C399.815,152.442 397.659,153.874 397.659,155.636C397.659,157.208 399.374,158.517 401.628,158.781Z" transform="matrix(0,1.024,-1.024,0,215.581,-381.687)" fill="#1d2437"/><path d="M49.542,35.85C49.573,35.671 49.638,35.504 49.729,35.355C49.981,34.944 50.434,34.67 50.95,34.67C51.739,34.67 52.38,35.311 52.38,36.1C52.38,36.161 52.376,36.221 52.369,36.279C51.557,36.043 50.58,35.877 49.542,35.85Z" transform="matrix(2.287,0,0,3.445,-60.306,-93.95)" fill="#d4dbee"/><path d="M49.587,36.534C49.544,36.397 49.52,36.251 49.52,36.1C49.52,35.311 50.161,34.67 50.95,34.67C51.716,34.67 52.343,35.274 52.378,36.032C51.338,36.086 50.37,36.278 49.587,36.534Z" transform="matrix(-2.297,0,0,3.445,148.457,-94.538)" fill="#1d2437"/></g><g class="av-mouth"><path d="M30.571,27.185C35.76,36.005 44.102,35.905 49.931,27.587C49.963,27.541 49.995,27.495 50.027,27.448" transform="matrix(-0.479,0,0,0.897,57.376,22.768)" fill="none" stroke="#1d2437" stroke-width="3"/></g></g><g class="av-item"></g></svg>';
function bcAddGuideBuddy(box, card, arts, api){
  const SHOW_MS = [3000, 2000];
  const el = document.createElement("div");
  el.className = "gr-buddy";
  el.innerHTML = '<div class="gr-buddy-bubble"><span class="gr-buddy-text" aria-hidden="true"></span></div><div class="gr-buddy-spin"><button type="button" class="gr-buddy-face"><span aria-hidden="true"></span></button></div>';
  el.style.setProperty("--gr-accent", GR_ACCENT[box.dataset.tool] || "#3FBFE8");
  const btn = el.querySelector(".gr-buddy-face");
  const face = btn.querySelector("span");
  face.innerHTML = GR_AVATAR;
  bcDressAvatar(face.querySelector("svg"));
  const art = face.querySelector("svg");
  const text = el.querySelector(".gr-buddy-text");
  document.body.appendChild(el);
  const n = arts.length;
  const armed = new Array(n + 1).fill(true);
  const wow = [...box.querySelectorAll("figure[data-wow]")];
  const pointedAt = new Set();
  let activeFig = null;
  let sayTimer = 0;
  let mini = false, shown = false, active = -1, hideTimer = 0, queueTimer = 0, ticking = false, wasEarned = card.classList.contains("earned");
  try { mini = localStorage.getItem("bc-gr-buddy-mini") === "1"; } catch (e) {}
  const earned = () => card.classList.contains("earned");
  const LINES = {
    start:  ["Hi, ready to learn?", "Welcome! Let's start with the basics.", "Hey there! This will be quick."],
    second: ["Moving to the next one.", "Nice. On to the next guide.", "Keep going, it gets better."],
    mid:    ["This part gets interesting.", "Here comes the good stuff.", "Stay with me. This one matters."],
    almost: ["Almost there!", "Just a little more.", "You're nearly done."],
    last:   ["Last one. You've got this.", "Final stretch!", "One more and you're done."],
    done:   ["You did it! Well done.", "All done. You're ready to try it.", "Great job! You are now ready."],
    locked: ["Read every guide to unlock your reward.", "Your reward is waiting. Keep reading.", "A few guides left to unlock your reward."],
    point:  ["Look at this chart! How cool?", "Now this is worth a look!"],
    backStart: ["Are you leaving already?", "Back to the start?"],
    back:      ["Going back? Good idea.", "Back again? Take your time."],
    seen:      ["You already finished this one.", "This one is done. Nice!", "Already covered. Want a recap?"],
    unlock:    ["Guide {g} done!", "Nice, that one counts!", "Got it! {k} of {n} done."],
    allDone:   ["That's every guide! Your reward is below.", "All {n} done. Go claim your reward!", "You finished them all!"],
    left1:     ["Just guide {list} to go!", "One more: guide {list}.", "Guide {list} is all that's left."],
    leftMany:  ["Still waiting: guides {list}.", "{m} guides to go: {list}.", "Guides {list} are next."],
    intro:     ["Hi, I'm your guide! Hit the challenge button above to start.", "Hello! Press START THE CHALLENGE above and I'll cheer you on.", "Hey there! Ready for a challenge? The button is above."],
    arrived:   ["Here you go.", "Arrived!", "You're at your destination.", "Nice reading."],
    accepted:  ["Challenge accepted! Let's go.", "You're in! Take your time with each guide.", "Game on! Read every guide and I'll keep score."]
  };
  const FACE = { start:"start", second:"good", mid:"mid", almost:"almost", last:"last", done:"done", locked:"good", point:"point", backStart:"mid", back:"mid", seen:"good", unlock:"good", allDone:"done", left1:"almost", leftMany:"mid", intro:"start", accepted:"good", arrived:"good" };
  const lastLine = {};
  let dir = 1, lastY = scrollY;
  const roleFor = i => {
    if (!api.active()) return "intro";
    if (i >= n){
      if (earned()) return "done";
      const left = api.missing().length;
      if (api.count() === 0) return "locked";
      return left === 1 ? "left1" : left <= 3 ? "leftMany" : "locked";
    }
    if (dir < 0) return i === 0 ? "backStart" : "back";
    if (api.isRead(i)) return "seen";
    if (i === 0) return "start";
    if (i === n - 1) return "last";
    if (i === 1) return "second";
    if (i === n - 2) return "almost";
    return "mid";
  };
  const pick = (role, vars) => {
    const lines = LINES[role];
    let k = 0;
    if (lastLine[role] !== undefined){
      k = Math.floor(Math.random() * (lines.length - 1));
      if (k >= lastLine[role]) k++;
    }
    lastLine[role] = k;
    return bcT(lines[k], vars);
  };
  const setMini = value => {
    mini = value;
    el.classList.toggle("mini", mini);
    el.classList.toggle("talk", shown && !mini);
    const label = bcT(mini ? "Show helper" : "Minimize helper");
    btn.setAttribute("aria-label", label);
    btn.title = label;
    try { mini ? localStorage.setItem("bc-gr-buddy-mini", "1") : localStorage.removeItem("bc-gr-buddy-mini"); } catch (e) {}
  };
  const hide = () => {
    activeFig = null;
    clearTimeout(hideTimer);
    clearTimeout(sayTimer);
    shown = false;
    el.classList.remove("show", "talk");
  };
  const burst = big => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = el.querySelector(".gr-buddy-spin");
    const wrap = document.createElement("div");
    wrap.className = "gr-burst";
    const colors = big ? ["#B84CFF", "#3FBFE8", "#FF6961", "#7ED321", "#F6D44A", "#FF8A4C", "#22D3D0", "#18C98A"] : ["var(--gr-accent)", "#F6D44A"];
    const count = big ? 22 : 9;
    for (let k = 0; k < count; k++){
      const p = document.createElement("i");
      const ang = (k / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = (big ? 70 : 46) + Math.random() * (big ? 50 : 24);
      p.style.cssText = "--dx:" + Math.cos(ang) * dist + "px;--dy:" + Math.sin(ang) * dist + "px;--c:" + colors[k % colors.length] + ";--r:" + Math.round(Math.random() * 360) + "deg";
      wrap.appendChild(p);
    }
    host.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1300);
  };
  const reveal = (i, force, more, guide) => {
    active = i;
    clearTimeout(sayTimer);
    const role = force || roleFor(i);
    art.dataset.mood = FACE[role];
    const left = api.missing().map(x => x + 1);
    text.textContent = pick(role, { n, k: api.count(), g: (guide === undefined ? i : guide) + 1, list: left.length === 1 ? left[0] : bcJoinList(left), m: left.length });
    shown = true;
    el.classList.add("show");
    el.classList.toggle("talk", !mini);
    clearTimeout(hideTimer);
    onMove();
    if (force && more){
      sayTimer = setTimeout(() => {
        text.textContent = bcT(more);
        text.classList.remove("swap");
        void text.offsetWidth;
        text.classList.add("swap");
      }, 2200);
    }
    hideTimer = setTimeout(hide, role === "intro" ? 4500 : force === "accepted" || force === "arrived" ? 3000 : force === "unlock" ? 3000 : force === "allDone" ? 5000 : force ? (more ? 7000 : 3500) : i >= n ? 3000 : (SHOW_MS[i] || 2000));
  };
  const trigger = i => {
    armed[i] = false;
    clearTimeout(queueTimer);
    if (shown){
      hide();
      queueTimer = setTimeout(() => { if (cur === i) reveal(i); }, 450);
    } else reveal(i);
  };
  const pointAt = fig => {
    pointedAt.add(fig);
    clearTimeout(queueTimer);
    const go = () => { if (cur === -1) return; activeFig = fig; reveal(cur, "point", fig.dataset.wowSay); activeFig = fig; };
    if (shown){
      hide();
      queueTimer = setTimeout(go, 450);
    } else go();
  };
  let cur = -1, jumping = false, jumpTimer = 0, jumpTarget = null, quietUntil = 0;
  const arrive = () => {
    clearTimeout(jumpTimer);
    update();
    jumping = false;
    quietUntil = Date.now() + 3600;
    if (cur !== -1 && cur < n && api.active()){ armed[cur] = false; clearTimeout(queueTimer); hide(); reveal(cur, "arrived"); }
  };
  const settle = () => {
    clearTimeout(jumpTimer);
    if (jumpTarget && Math.abs(jumpTarget.getBoundingClientRect().top) < 80) return arrive();
    jumpTimer = setTimeout(arrive, 120);
  };
  document.addEventListener("bc-gr-jump", e => { jumping = true; jumpTarget = e.detail; clearTimeout(queueTimer); hide(); settle(); });
  api.onUnlock = (guide, all) => {
    if (cur === -1) return;
    clearTimeout(queueTimer);
    const go = () => { if (cur === -1) return; reveal(cur, all ? "allDone" : "unlock", null, guide); burst(all); };
    if (shown){
      hide();
      queueTimer = setTimeout(go, 450);
    } else go();
  };
  api.onStart(() => { clearTimeout(queueTimer); hide(); reveal(-1, "accepted"); });
  const update = () => {
    ticking = false;
    const dy = scrollY - lastY;
    if (Math.abs(dy) >= 4){ dir = dy > 0 ? 1 : -1; lastY = scrollY; }
    const mid = innerHeight * 0.5;
    const probe = innerHeight * 0.6;
    cur = -1;
    for (let i = 0; i < n && cur === -1; i++){
      const q = arts[i].getBoundingClientRect();
      if (q.top <= probe && q.bottom >= probe) cur = i;
    }
    if (cur === -1){
      const q = card.getBoundingClientRect();
      if (q.top <= probe && q.bottom >= probe) cur = n;
    }
    for (let i = 0; i <= n; i++) if (i !== cur) armed[i] = true;
    const nowEarned = earned();
    if (nowEarned !== wasEarned){ wasEarned = nowEarned; armed[n] = true; }
    if (shown && cur !== active) hide();
    if (shown && activeFig){
      const q = activeFig.getBoundingClientRect();
      if (mid < q.top - innerHeight * 0.25 || mid > q.bottom + innerHeight * 0.25) hide();
    }
    const live = api.active();
    if (live && !jumping && Date.now() > quietUntil && cur !== -1 && dir > 0 && pointedAt.size < 2){
      for (const fig of wow){
        if (pointedAt.has(fig)) continue;
        const q = fig.getBoundingClientRect();
        const c = q.top + q.height / 2;
        if (c >= innerHeight * 0.38 && c <= innerHeight * 0.62){ pointAt(fig); break; }
      }
    }
    if (!jumping && cur !== -1 && armed[cur] && live){
      const anchor = cur === n ? card : arts[cur].querySelector("h3");
      const q = anchor && anchor.getBoundingClientRect();
      const c = q ? q.top + q.height / 2 : -1;
      if (q && c >= innerHeight * 0.3 && c <= innerHeight * 0.6)trigger(cur);
    }
    if (!shown) return;
    const r = box.getBoundingClientRect();
    const side = r.left >= 160;
    el.classList.toggle("side", side);
    el.classList.toggle("left", side);
    el.classList.toggle("corner", !side);
    el.style.setProperty("--gr-bubble", Math.max(140, Math.min(260, side ? r.left - 32 : innerWidth - 90)) + "px");
    if (side){
      el.style.top = (mid - (el.offsetHeight - btn.offsetHeight / 2)) + "px";
      el.style.bottom = "";
      el.style.left = (r.left - 16) + "px";
    } else {
      el.style.top = "";
      el.style.bottom = "18px";
      el.style.left = "10px";
    }
  };
  const onMove = () => { if (jumping) settle(); if (!ticking){ ticking = true; requestAnimationFrame(update); } };
  addEventListener("scroll", onMove, { passive: true });
  addEventListener("resize", onMove);
  new MutationObserver(onMove).observe(card, { attributes: true, attributeFilter: ["class"] });
  btn.addEventListener("click", () => setMini(!mini));
  setMini(mini);
  update();
}
function bcSetupTocBuddy(){
  const list = document.querySelector(".gr-toc");
  if (!list || !matchMedia("(hover: hover)").matches) return;
  const tool = document.querySelector(".gr-inline[data-tool]");
  const el = document.createElement("div");
  el.className = "gr-buddy gr-toc-buddy side left";
  el.innerHTML = '<div class="gr-buddy-bubble"><span class="gr-buddy-text" aria-hidden="true"></span></div><div class="gr-buddy-spin"><div class="gr-buddy-face"><span aria-hidden="true"></span></div></div>';
  el.style.setProperty("--gr-accent", GR_ACCENT[tool && tool.dataset.tool] || "#3FBFE8");
  const face = el.querySelector(".gr-buddy-face span");
  face.innerHTML = GR_AVATAR;
  bcDressAvatar(face.querySelector("svg"));
  const art = face.querySelector("svg");
  const MOODS = ["start", "good", "mid", "almost", "last"];
  const links = [...list.querySelectorAll("a[data-tip]")];
  art.dataset.mood = "good";
  const text = el.querySelector(".gr-buddy-text");
  const faceBox = el.querySelector(".gr-buddy-face");
  document.body.appendChild(el);
  const last = new WeakMap();
  let current = null;
  const hide = () => { current = null; el.classList.remove("show", "talk"); };
  const show = a => {
    const r = list.getBoundingClientRect();
    if (r.left < 160) return;
    const tips = (a.dataset.tip || "").split("|").filter(Boolean);
    if (!tips.length) return;
    if (a === current) return;
    const wasShown = el.classList.contains("show");
    current = a;
    art.dataset.mood = MOODS[Math.max(0, links.indexOf(a)) % MOODS.length];
    let k = 0;
    if (last.has(a)){
      k = Math.floor(Math.random() * (tips.length - 1));
      if (k >= last.get(a)) k++;
    }
    last.set(a, k);
    text.textContent = bcT(tips[k]);
    if (wasShown){
      text.classList.remove("swap");
      void text.offsetWidth;
      text.classList.add("swap");
    }
    el.style.setProperty("--gr-bubble", Math.max(140, Math.min(260, r.left - 32)) + "px");
    el.style.left = (r.left - 16) + "px";
    el.classList.add("show", "talk");
    const q = a.getBoundingClientRect();
    el.style.top = (q.top + q.height / 2 - (el.offsetHeight - faceBox.offsetHeight / 2)) + "px";
  };
  list.addEventListener("mouseover", e => { const a = e.target.closest("a[data-tip]"); if (a) show(a); });
  list.addEventListener("focusin", e => { const a = e.target.closest("a[data-tip]"); if (a) show(a); });
  list.addEventListener("mouseleave", hide);
  list.addEventListener("focusout", hide);
  list.addEventListener("click", hide);
  addEventListener("scroll", () => { if (current) hide(); }, { passive: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bcSetupTocBuddy);
else bcSetupTocBuddy();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bcSetupGuides);
else bcSetupGuides();
document.addEventListener("click", (e) => {
  const link = e.target.closest(".gr-topics a");
  if (!link) return;
  e.preventDefault();
  const art = document.getElementById(link.getAttribute("href").slice(1));
  if (art){
    document.dispatchEvent(new CustomEvent("bc-gr-jump", { detail: art }));
    art.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

/* ===== GA4 click tracking ===== */
/* Any element (anywhere on the site) can opt into GA4 click tracking by
   adding data-ga-event="<event_name>" — optionally data-ga-<param>="value"
   for extra event params (e.g. data-ga-tool="convert"). One delegated
   listener covers every current and future button; no per-tool JS needed.
   gtag() itself is defined per-page (each page's own <head> snippet), so
   this only fires when it exists. */
document.addEventListener("click", (e) => {
  const footerLink = e.target.closest(".footer-dash-link");
  if (footerLink && typeof gtag === "function"){
    gtag("event", "footer_nav_click", { destination: footerLink.getAttribute("href") });
  }
  const gaEl = e.target.closest("[data-ga-event]");
  if (!gaEl || typeof gtag !== "function") return;
  const params = {};
  for (const key in gaEl.dataset){
    if (key === "gaEvent") continue;
    if (key.startsWith("ga")) params[key.slice(2).replace(/^./, c => c.toLowerCase())] = gaEl.dataset[key];
  }
  gtag("event", gaEl.dataset.gaEvent, params);
});

/* ===== downloadBlob ===== */
function downloadBlob(blob, fileName){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  bcCountDownload();
}

/* ===== Whole-banner drop target ===== Shared by every tool's own
   *-tool.js: before a file is loaded, the entire .tool-app banner (not
   just the inner dashed drop box) accepts drag/drop and click-to-pick,
   gated by isInScope() so it stops fighting the tool's own controls once
   real content is loaded. dragDepth counts nested dragenter/dragleave
   pairs fired by child elements so a "leave" only clears the active
   state once the pointer has actually left the banner, not just moved
   over a child. getEnterTarget/clearTargets let a tool split the
   "active" highlight between the whole banner and just its inner drop
   box depending on which is currently visible (most tools do; Context
   doesn't and just passes toolApp for both). */
function bcSetupBannerDropTarget(toolApp, opts){
  if (!toolApp) return;
  const isInScope = opts.isInScope;
  const getEnterTarget = opts.getEnterTarget || (() => toolApp);
  const clearTargets = opts.clearTargets || [toolApp];
  const onDrop = opts.onDrop;
  let dragDepth = 0;
  function clearActive(){
    clearTargets.forEach(el => el && el.classList.remove("active"));
  }
  toolApp.addEventListener("dragenter", e => {
    if (!isInScope(e)) return;
    e.preventDefault();
    dragDepth++;
    getEnterTarget(e).classList.add("active");
  });
  toolApp.addEventListener("dragover", e => {
    if (!isInScope(e)) return;
    e.preventDefault();
  });
  toolApp.addEventListener("dragleave", e => {
    if (!isInScope(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) clearActive();
  });
  toolApp.addEventListener("drop", e => {
    if (!isInScope(e)) return;
    e.preventDefault();
    dragDepth = 0;
    clearActive();
    onDrop(e);
  });
}

/* ===== .bc-info-btn / .bc-info-tooltip — small "i" toggle =====
   Click to reveal a short explanation, click again (or click outside,
   or open a different one) to close — same one-open-at-a-time pattern
   as bcRegisterDropdown's group above, tracked separately since these
   aren't dropdowns. */
const bcInfoTooltips = [];
/* ===== Escape closes whatever is open ===== one global listener, one
   thing per press, highest priority first (modals/overlays 100, then
   menus/tooltips 60; banners — terminal, help, cookie — deliberately never). Anything openable registers
   itself with bcRegisterEscapable(isOpen, close, priority) — a handler
   that already called preventDefault() on this same keypress (e.g. an
   input cancelling its own edit) is respected and nothing else closes. */
const bcEscapables = [];
function bcRegisterEscapable(isOpen, close, priority){
  bcEscapables.push({ isOpen, close, priority: priority || 50 });
  bcEscapables.sort((a, b) => b.priority - a.priority);
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  for (const item of bcEscapables){
    let open = false;
    try { open = item.isOpen(); } catch (err) { /* element gone — treat as closed */ }
    if (open){
      item.close();
      e.preventDefault();
      return;
    }
  }
});

function bcRegisterInfoTooltip(btn, tooltip){
  const entry = { btn, tooltip };
  bcInfoTooltips.push(entry);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willShow = tooltip.hidden;
    bcInfoTooltips.forEach(o => {
      o.tooltip.hidden = true;
      o.btn.setAttribute("aria-expanded", "false");
    });
    tooltip.hidden = !willShow;
    btn.setAttribute("aria-expanded", String(willShow));
  });
}
document.addEventListener("click", (e) => {
  bcInfoTooltips.forEach(o => {
    if (!o.tooltip.hidden && !o.tooltip.contains(e.target) && e.target !== o.btn){
      o.tooltip.hidden = true;
      o.btn.setAttribute("aria-expanded", "false");
    }
  });
});

/* ===== Step-through help banner ===== every tool's dismissible,
   step-numbered terminal-styled intro ("<TOOL>_GUIDE: STEP 1/N") —
   this was hand-copied identically into all 8 tools' own -tool.js
   files (only the element-ID prefix, tool name, and step content ever
   differed); now they all call this instead.

   toolName: lowercase tool name — drives both the localStorage key
   ("bc-help-<toolName>-dismissed") and the uppercase "<TOOLNAME>_GUIDE"
   display text.
   idPrefix: the short prefix each tool's own element IDs use (e.g.
   "gif" for Congify's #gifHelpBanner, "ct" for Context's #ctHelpBanner)
   — genuinely differs per tool, unrelated to toolName.
   steps: array of [heading, body] pairs.

   No-ops if the banner element isn't found, so tools that haven't
   added the standard markup yet don't throw. */
function bcSetupHelpBanner(toolName, idPrefix, steps){
  const banner = document.getElementById(idPrefix + "HelpBanner");
  if (!banner) return;
  const stepEl = document.getElementById(idPrefix + "HelpStep");
  const back = document.getElementById(idPrefix + "HelpBack");
  const next = document.getElementById(idPrefix + "HelpNext");
  const textEl = document.getElementById(idPrefix + "HelpText");
  const close = document.getElementById(idPrefix + "HelpClose");
  const closeMobile = document.getElementById(idPrefix + "HelpCloseMobile");
  const toggle = document.getElementById(idPrefix + "HelpToggle");
  const storageKey = "bc-help-" + toolName + "-dismissed";
  let index = 0;

  function render(){
    const [heading, text] = steps[index];
    stepEl.textContent = toolName.toUpperCase() + "_" + bcT("GUIDE") + ": " + bcT("STEP") + " " + (index + 1) + "/" + steps.length;
    textEl.textContent = bcT(heading) + " — " + bcT(text);
    back.disabled = index === 0;
    next.disabled = index === steps.length - 1;
  }

  let dismissed = false;
  try { dismissed = localStorage.getItem(storageKey) === "1"; } catch (e) { /* storage unavailable */ }

  if (!dismissed){
    banner.hidden = false;
    render();
  }

  back.addEventListener("click", () => {
    if (index > 0){ index--; render(); }
  });
  next.addEventListener("click", () => {
    if (index < steps.length - 1){ index++; render(); }
  });
  function dismiss(){
    banner.hidden = true;
    try { localStorage.setItem(storageKey, "1"); } catch (e) { /* storage unavailable */ }
  }
  close.addEventListener("click", dismiss);
  if (closeMobile) closeMobile.addEventListener("click", dismiss);
  toggle.addEventListener("click", () => {
    const collapsed = banner.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });

  /* "?" nav button (.nav-help-btn, #navHelpBtn — same id on every tool
     page) is the only way back to this guide once its own red dot has
     dismissed it. Resets to step 1 rather than reopening on whatever
     step it was last dismissed from — someone deliberately asking to
     see the guide again most likely wants the whole thing, not a
     middle step they may not remember the start of. */
  const reopenBtn = document.getElementById("navHelpBtn");
  if (reopenBtn){
    reopenBtn.addEventListener("click", () => {
      index = 0;
      try { localStorage.removeItem(storageKey); } catch (e) { /* storage unavailable */ }
      banner.classList.remove("collapsed");
      toggle.setAttribute("aria-expanded", "true");
      banner.hidden = false;
      render();
      /* Same central nav confirmation the theme/share buttons already
         use (#navTerminal) — a plain literal, same as every other
         nav-terminal string since the i18n system was removed. */
      showNavTerminal("Guide panel ready — at your service.");
    });
  }
}

/* ===== .bc-combo — shared SEARCHABLE dropdown ===== reserved for
   genuinely long option lists (Codify's Language/Theme/Template, 10+
   options each) where typing to filter actually helps. For short lists
   (5-6 options — output formats, FPS, crop ratios) use
   bcRegisterDropdown below instead; forcing a search box onto a 5-item
   list is a UX downgrade, not consistency worth having.

   Markup contract (see codify/index.html for a live example):
     <div class="bc-combo">
       <div class="bc-combo-trigger" aria-haspopup="listbox" aria-expanded="false">
         <input class="bc-combo-input" value="..." readonly aria-label="...">
         <span class="bc-combo-chevron" aria-hidden="true"></span>
       </div>
       <div class="bc-combo-menu" role="listbox" hidden>
         <button type="button" class="bc-combo-option" data-label="..." role="option">
           <span>...</span><span class="bc-combo-option-check" aria-hidden="true">✓</span>
         </button>
         ...
         <div class="bc-combo-empty" hidden>No matches</div>
       </div>
     </div>

   One open at a time across every combo registered on the page (opening
   one closes the others); Escape or an outside click closes without
   changing the selection; typing filters options by a case-insensitive
   substring match against data-label. */
const bcCombos = [];
function bcRegisterCombo(trigger, input, menu, emptyEl, onSelect){
  const combo = { trigger, input, menu, emptyEl, onSelect };
  bcCombos.push(combo);

  function activeOption(){
    return menu.querySelector(".bc-combo-option.active");
  }
  function open(){
    bcCloseAllPopups(combo);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    input.removeAttribute("readonly");
    input.value = "";
    filter("");
    input.focus();
  }
  combo.open = open;
  combo.close = () => bcCloseCombo(combo);

  function filter(query){
    const q = query.trim().toLowerCase();
    let anyVisible = false;
    menu.querySelectorAll(".bc-combo-option").forEach(opt => {
      const matches = opt.dataset.label.toLowerCase().includes(q);
      opt.hidden = !matches;
      if (matches) anyVisible = true;
    });
    if (emptyEl) emptyEl.hidden = anyVisible;
  }

  trigger.addEventListener("click", (e) => {
    if (e.target === input && !menu.hidden) return;
    if (menu.hidden) open(); else bcCloseCombo(combo);
  });
  input.addEventListener("input", () => filter(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){
      bcCloseCombo(combo);
    } else if (e.key === "Enter"){
      e.preventDefault();
      const firstVisible = [...menu.querySelectorAll(".bc-combo-option")].find(o => !o.hidden);
      if (firstVisible) selectOption(firstVisible);
    }
  });
  menu.addEventListener("mousedown", (e) => {
    const opt = e.target.closest(".bc-combo-option");
    if (opt) e.preventDefault(); // keep focus in input until click completes
  });
  menu.addEventListener("click", (e) => {
    const opt = e.target.closest(".bc-combo-option");
    if (!opt) return;
    selectOption(opt);
  });

  function selectOption(opt){
    menu.querySelectorAll(".bc-combo-option").forEach(o => {
      o.classList.toggle("active", o === opt);
      o.setAttribute("aria-selected", String(o === opt));
    });
    input.value = opt.dataset.label;
    onSelect(opt);
    bcCloseCombo(combo);
  }

  combo.select = selectOption;
  combo._activeOptionGetter = activeOption;
  return combo;
}
function bcCloseCombo(combo){
  combo.menu.hidden = true;
  combo.trigger.setAttribute("aria-expanded", "false");
  combo.input.setAttribute("readonly", "");
  const active = combo._activeOptionGetter();
  combo.input.value = active ? active.dataset.label : "";
}
const bcPopupClosers = [];
function bcRegisterPopup(closeFn){ bcPopupClosers.push(closeFn); }
function bcCloseAllPopups(exceptCombo){
  bcCombos.forEach(c => { if (c !== exceptCombo && !c.menu.hidden) bcCloseCombo(c); });
  bcCloseAllDropdowns();
  bcPopupClosers.forEach(fn => fn());
}
document.addEventListener("click", (e) => {
  bcCombos.forEach(c => {
    if (!c.menu.hidden && !c.trigger.contains(e.target) && !c.menu.contains(e.target)) bcCloseCombo(c);
  });
});
/* Updates a combo's visual state (active option + input text) without
   running its onSelect side effects — for when one control's choice
   needs to silently reflect in another (e.g. a style preset picking a
   theme) without re-firing that combo's own selection logic. */
function bcSetComboDisplay(menu, input, attr, key){
  const opt = menu.querySelector(`[data-${attr}="${key}"]`);
  if (!opt) return;
  menu.querySelectorAll(".bc-combo-option").forEach(o => {
    o.classList.toggle("active", o === opt);
    o.setAttribute("aria-selected", String(o === opt));
  });
  input.value = opt.dataset.label;
}

/* ===== .bc-dropdown — shared NON-searchable dropdown ===== a plain
   trigger button (label + chevron, no text input) opening a menu of
   buttons — for short option lists where search adds nothing (output
   formats, FPS, crop ratios, playback speed, font pickers).

   Markup contract:
     <div class="bc-dropdown">
       <button type="button" class="bc-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">
         <span class="bc-dropdown-trigger-label">...</span>
         <span class="bc-dropdown-chevron" aria-hidden="true"></span>
       </button>
       <div class="bc-dropdown-menu" role="listbox" hidden>
         <button type="button" class="bc-dropdown-option" data-xxx="..." role="option">...</button>
         ...
       </div>
     </div>

   One open at a time across every dropdown registered on the page
   (shared with every other bcRegisterDropdown instance, independent of
   bcRegisterCombo's own group above); closes on an outside click or
   after picking an option. onSelect receives the picked option button
   — read whatever data-* attribute it carries to apply the choice. */
const bcDropdowns = [];
/* Marks one .bc-dropdown-option active/selected within its menu — the
   same toggle bcRegisterDropdown's own click handler does internally,
   exported so callers can also apply it programmatically (e.g.
   restoring a saved dropdown value on page load, outside of an actual
   click). Doesn't touch the trigger label — callers set that
   themselves from opt.dataset since the label element/property isn't
   part of this markup contract the way it is in .bc-combo. */
function bcSetDropdownActive(menu, opt){
  menu.querySelectorAll(".bc-dropdown-option").forEach(o => {
    o.classList.toggle("active", o === opt);
    o.setAttribute("aria-selected", String(o === opt));
  });
}
function bcRegisterDropdown(trigger, menu, onSelect){
  const dropdown = { trigger, menu };
  bcDropdowns.push(dropdown);
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = !menu.hidden;
    bcCloseAllPopups();
    if (!wasOpen){
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    }
  });
  menu.addEventListener("click", (e) => {
    const opt = e.target.closest(".bc-dropdown-option");
    if (!opt) return;
    bcSetDropdownActive(menu, opt);
    onSelect(opt);
    bcCloseAllDropdowns();
  });
  return dropdown;
}
function bcCloseAllDropdowns(){
  bcDropdowns.forEach(d => {
    d.menu.hidden = true;
    d.trigger.setAttribute("aria-expanded", "false");
  });
}
document.addEventListener("click", bcCloseAllDropdowns);

/* ===== Color button logic — shared by any tool with a preset-swatch
   color picker (Context's text/signature color, Congify's caption
   text/stroke color, Codify's own theme-color options) =====
   These tools each independently grew the same handful of lines: paint
   a small dot to the chosen color, put its name in the trigger label,
   and (when restoring a saved value) mark the right option active in
   the menu. Kept as small, composable pieces rather than one rigid
   "the trigger must look exactly like this" component, since the
   trigger markup differs a bit per tool (Congify's dot can start
   hidden until a caption exists, Context's can't) — callers wire these
   into whatever open/close mechanism they already have (bcRegisterDropdown
   for a plain preset menu, or a tool's own hand-rolled one, as Context's
   color menu needs — its viewport-clamped positioning doesn't fit
   bcRegisterDropdown's plain trigger/menu contract). */

/* Paints dotEl (if given) with `color` and unhides it, and sets
   labelEl's (if given) text to `label`, falling back to the raw color
   value when no label is available (e.g. a custom color with no
   matching preset option) — the same fallback every hand-rolled copy
   of this had. Either element can be omitted (pass null) for a trigger
   that only has one of the two. */
function bcSetColorSwatch(dotEl, labelEl, color, label){
  if (dotEl){
    dotEl.style.background = color;
    dotEl.hidden = false;
  }
  if (labelEl) labelEl.textContent = label != null ? label : color;
}

/* Convenience for the common case: opt is a .bc-dropdown-option (or any
   element) carrying data-color/data-label — reads both off it and
   applies via bcSetColorSwatch. */
function bcApplyColorOption(dotEl, labelEl, opt){
  bcSetColorSwatch(dotEl, labelEl, opt.dataset.color, opt.dataset.label);
}

/* Full register for the plain-dropdown case (Congify's two color
   pickers): wraps bcRegisterDropdown, keeping the dot+label swatch
   sync automatic so callers only need to supply the side effect that's
   actually specific to them (writing the color onto whatever it's
   coloring). */
function bcRegisterColorDropdown(trigger, dotEl, labelEl, menu, onSelect){
  return bcRegisterDropdown(trigger, menu, (opt) => {
    bcApplyColorOption(dotEl, labelEl, opt);
    onSelect(opt);
  });
}

/* Restoring a saved/selected value into a .bc-dropdown-based color
   trigger: marks opt active in menu (bcSetDropdownActive) and syncs
   the swatch to match, in one call instead of two. */
function bcSetColorDropdownValue(menu, dotEl, labelEl, opt){
  bcSetDropdownActive(menu, opt);
  bcApplyColorOption(dotEl, labelEl, opt);
}

/* ===== .option-change-btn — single-button cycling picker =====
   For a short, ordered list of options where "click to step to the next
   one" beats opening a menu (fps steps, playback speed, anything on a
   numeric ladder). No menu markup — the button itself owns the current
   value; each click advances one step, wrapping back to the first
   option after the last.

   Markup contract:
     <button type="button" class="option-change-btn">
       <span class="option-change-btn-label">...</span>
       <span class="option-change-btn-icon" aria-hidden="true"></span>
     </button>

   options: array of {value, label} (or any shape — only .label is read
   by the default renderer, the rest is handed back to onSelect as-is).
   initialIndex defaults to 0. onSelect(option, index) fires after each
   click, once the button's already been updated. Returns
   {setIndex(i), current} so a caller can restore a saved value without
   simulating a click.

   renderOption(option, btn) is optional, for a control whose current
   value needs a custom visual instead of a text label — a line-weight
   sample, a color swatch — the same case that keeps a control on
   .bc-dropdown instead of .bc-combo (see CLAUDE.md). When given, it
   fully owns updating btn's contents each step instead of the default
   textContent-on-.option-change-btn-label behavior. */
function bcRegisterOptionChangeBtn(btn, options, onSelect, initialIndex, renderOption){
  const labelEl = btn.querySelector(".option-change-btn-label") || btn;
  let index = ((initialIndex || 0) % options.length + options.length) % options.length;
  function render(){
    if (renderOption){ renderOption(options[index], btn); return; }
    labelEl.textContent = options[index].label;
  }
  render();
  btn.addEventListener("click", () => {
    index = (index + 1) % options.length;
    render();
    onSelect(options[index], index);
  });
  return {
    setIndex(i){
      index = ((i % options.length) + options.length) % options.length;
      render();
    },
    get current(){ return options[index]; }
  };
}

/* ===== .bc-canvas-remove-btn — shared title for the "remove the loaded
   file" button on a tool's own single-file canvas (Congify's
   #gifRemoveBtn, Context's #ctRemoveBtn,
   Coudio's #cdRemoveBtn) — all three already share .bc-remove-btn for
   their visual, this centralizes their title/tooltip text too so it
   only needs to change in one place. Not applied to every
   .bc-remove-btn (any picker/palette color-remove button using
   that same visual class for a different job keeps its own
   aria-label instead). Only fills in a title when the button doesn't
   already carry a more specific one. */
document.querySelectorAll(".bc-canvas-remove-btn").forEach(btn => {
  if (!btn.title) btn.title = "Close project";
});

/* ===== Live "safe & private" check — real, not decorative: reflects
   what genuinely happened during a tool's file processing. ===== */
const PRIVACY_CHECK_ALLOWLIST = ["google-analytics.com", "googletagmanager.com", "google.com", "doubleclick.net", "googlesyndication.com"];
let privacyCheckActive = false;
let privacyCheckExternalCount = 0;
let privacyCheckExternalHosts = [];

function privacyCheckExternalHost(rawUrl){
  try {
    const url = new URL(rawUrl, location.href);
    if (url.protocol === "blob:" || url.protocol === "data:") return null;
    /* Same-origin requests aren't a privacy concern — they're the page
       fetching its own already-public static assets, not sending
       anything to a third party. Caught live: Codify's PNG export (via
       html-to-image, which fetches+inlines a snapshotted element's
       stylesheets so cross-origin fonts/CSS render in the exported
       image) requests shared/icons.css and shared/textures.css on a
       tool's first export, which without this check registered as a
       false "privacy breach" against the page's own domain. */
    if (url.hostname === location.hostname) return null;
    if (PRIVACY_CHECK_ALLOWLIST.some(host => url.hostname === host || url.hostname.endsWith("." + host))) return null;
    return url.hostname;
  } catch (err) {
    return null;
  }
}

function privacyCheckRecord(rawUrl){
  const host = privacyCheckExternalHost(rawUrl);
  if (!host) return;
  privacyCheckExternalCount++;
  if (!privacyCheckExternalHosts.includes(host)) privacyCheckExternalHosts.push(host);
}

const _privacyCheckOrigFetch = window.fetch;
window.fetch = function(...args){
  if (privacyCheckActive){
    privacyCheckRecord(args[0] instanceof Request ? args[0].url : args[0]);
  }
  return _privacyCheckOrigFetch.apply(this, args);
};

const _privacyCheckOrigXhrOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...rest){
  if (privacyCheckActive){
    privacyCheckRecord(url);
  }
  return _privacyCheckOrigXhrOpen.call(this, method, url, ...rest);
};

function startPrivacyCheck(){
  privacyCheckActive = true;
  privacyCheckExternalCount = 0;
  privacyCheckExternalHosts = [];
}

/* action defaults to "download" — pass "convert" for a tool with a
   separate convert-then-download flow (Congify: converting produces
   the result, a later, separate click actually downloads it), so the
   badge reports whichever step just finished instead of always saying
   "download" for a step that didn't download anything yet. "save" is
   for a tool with no file output at all (saving something to local
   storage is the one thing it persists, so that's the
   action worth confirming stayed local, not a download that never
   happens here). Unrecognized/missing values fall back to "download",
   same as before this list existed. */
function finishPrivacyCheck(badgeEl, action){
  privacyCheckActive = false;
  if (!badgeEl) return;
  const actionWord = action === "convert" ? "convert" : action === "save" ? "save" : "download";
  if (privacyCheckExternalCount === 0){
    badgeEl.textContent = "> BC_Tools_bot: " + actionWord + " local & private";
  } else {
    /* {action} names which step actually leaked, not just that one did
       — a tool with a separate convert-then-download flow (Congify)
       can have a breach happen during either, and just saying "privacy
       breach" without saying which wouldn't tell you where to look. */
    const template = "ATTENTION! - ({count}) privacy breach during {action} - {host}";
    const text = template.replace("{count}", privacyCheckExternalCount).replace("{action}", actionWord).replace("{host}", privacyCheckExternalHosts.join(", "));
    badgeEl.textContent = "> " + text;
  }
  badgeEl.classList.add("visible");
}

/* i18n system (translations object, applyLanguage, the language-switcher
   nav button/menu) removed from the live site on request — archived in
   full, not deleted, at shared/i18n-archive.js along with re-enable
   steps. Every string that used to be looked up in translations.en is
   now a plain literal at its own call site (nav terminal confirmations,
   the cookie-consent banner's status/button text, etc). */

/* ===== Central nav confirmation display ===== */
function showNavTerminal(text){
  const el = document.getElementById("navTerminal");
  const textEl = document.getElementById("navTerminalText");
  if (!el || !textEl) return;
  textEl.textContent = bcT(text);
  el.classList.add("show");
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ===== LIGHT/DARK THEME TOGGLE ===== */
(function(){
  /* The nav button, plus any other control marked data-theme-toggle (e.g.
     Context's fullscreen-editor header) — all drive the same logic. */
  const themeBtns = document.querySelectorAll("#navThemeBtn, [data-theme-toggle]");
  const root = document.documentElement;

  function applyTheme(theme){
    /* .theme-instant (shared/site.css) forces transition:none on every
       element for one paint, so the light/dark swap is a hard cut, not
       the ~0.2s crossfade individual components' own transitions would
       otherwise produce — removed shortly after so those same
       transitions keep working normally for hover/etc. afterward.
       setTimeout, not requestAnimationFrame — rAF callbacks can be
       throttled/skipped entirely in a backgrounded or otherwise
       inactive tab, which would leave this class stuck forever and
       silently kill every transition on the page for good; a plain
       timer doesn't have that failure mode. */
    root.classList.add("theme-instant");
    root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    setTimeout(() => { root.classList.remove("theme-instant"); }, 50);
  }

  let saved = null;
  try { saved = localStorage.getItem("bc-theme"); } catch (e) { /* storage unavailable */ }
  applyTheme(saved === "dark" ? "dark" : "light");

  themeBtns.forEach(themeBtn => {
    themeBtn.addEventListener("click", () => {
      const isLight = root.getAttribute("data-theme") === "light";
      const next = isLight ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem("bc-theme", next); } catch (e) { /* storage unavailable */ }
      showNavTerminal(next === "dark" ? "Dark mode set" : "Light mode set");
    });
  });
})();

/* ===== NAV SHARE BUTTON ===== */
(function(){
  const shareBtn = document.getElementById("navShareBtn");
  const shareMenu = document.getElementById("navShareMenu");

  /* Extra share buttons (data-share-toggle, e.g. Context's fullscreen
     header) behave like the nav one: native share sheet on phones; with
     no native sheet to fall back on they just copy the link, since the
     nav's own dropdown is hidden behind their overlay. */
  document.querySelectorAll("[data-share-toggle]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (navigator.share){
        try { await navigator.share({ title: document.title, text: "Try BC Tools for working with images.", url: window.location.href }); }
        catch (e){ /* cancelled */ }
        return;
      }
      try {
        await navigator.clipboard.writeText(window.location.href);
        showNavTerminal("URL copied to clipboard");
      } catch (e) { /* clipboard unavailable */ }
    });
  });

  if (shareBtn && shareMenu){
    shareBtn.addEventListener("click", async (e) => {
      const shareData = {
        title: document.title,
        text: "Try BC Tools for working with images.",
        url: window.location.href
      };
      if (window.innerWidth <= 768 && navigator.share){
        try { await navigator.share(shareData); }
        catch (e){ /* cancelled, or share unsupported */ }
        return;
      }
      if (e.detail === 0) shareMenu.classList.toggle("open");
      else shareMenu.classList.add("open");
    });

    const shareWrap = shareBtn.closest(".nav-share-wrap");
    if (shareWrap && window.matchMedia("(hover: hover)").matches){
      let closeTimer;
      const closeShare = () => {
        shareMenu.classList.remove("open");
        const list = document.getElementById("navShareMoreList");
        const toggle = document.getElementById("navShareMoreToggle");
        if (list){ list.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
      };
      document.addEventListener("bc-report-hover", closeShare);
      shareWrap.addEventListener("mouseenter", () => {
        clearTimeout(closeTimer);
        if (window.innerWidth > 768){ shareMenu.classList.add("open"); document.dispatchEvent(new Event("bc-nav-hover")); }
      });
      shareWrap.addEventListener("mouseleave", () => {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(closeShare, 150);
      });
    }

    const shareMoreToggle = document.getElementById("navShareMoreToggle");
    const shareMoreList = document.getElementById("navShareMoreList");
    if (shareMoreToggle && shareMoreList){
      shareMoreToggle.addEventListener("click", () => {
        const willOpen = shareMoreList.hidden;
        shareMoreList.hidden = !willOpen;
        shareMoreToggle.setAttribute("aria-expanded", String(willOpen));
      });
      if (window.matchMedia("(hover: hover)").matches){
        shareMoreToggle.addEventListener("mouseenter", () => {
          shareMoreList.hidden = false;
          shareMoreToggle.setAttribute("aria-expanded", "true");
        });
      }
    }

    shareMenu.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-share]");
      if (!btn) return;
      const pageUrl = encodeURIComponent(window.location.href);
      const pageText = encodeURIComponent("Try BC Tools for working with images.");

      if (btn.dataset.share === "copy"){
        try {
          await navigator.clipboard.writeText(window.location.href);
          showNavTerminal("URL copied to clipboard");
        }
        catch { /* clipboard unavailable */ }
      }
      if (btn.dataset.share === "whatsapp") window.open(`https://wa.me/?text=${pageText}%20${pageUrl}`, "_blank");
      if (btn.dataset.share === "facebook") window.open(`https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`, "_blank");
      if (btn.dataset.share === "x") window.open(`https://twitter.com/intent/tweet?text=${pageText}&url=${pageUrl}`, "_blank");
      if (btn.dataset.share === "linkedin") window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}`, "_blank");
      if (btn.dataset.share === "email") window.location.href = `mailto:?subject=BC Tools&body=${pageText}%0A%0A${pageUrl}`;

      shareMenu.classList.remove("open");
      if (shareMoreList){
        shareMoreList.hidden = true;
        shareMoreToggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("click", (e) => {
      if (!shareBtn.contains(e.target) && !shareMenu.contains(e.target)){
        shareMenu.classList.remove("open");
        if (shareMoreList){
          shareMoreList.hidden = true;
          shareMoreToggle.setAttribute("aria-expanded", "false");
        }
      }
    });
  }
})();

/* ===== COOKIE CONSENT BANNER =====
   Includes the "docked" panel variant for the dedicated /cookies/ page:
   on desktop, once consent has already been given, the same banner
   element re-parents into that page's #cookieBannerDock and renders
   inline (position:static) as a collapsed recap panel instead of the
   fixed floating prompt — matching the original SPA's
   bcSyncCookieBannerPlacement() behavior. First-time visitors (no saved
   consent yet) always get the plain floating prompt, on every page
   including /cookies/, so it's never missable. */
(function(){
  const banner = document.getElementById("cookieBanner");
  const analyticsToggle = document.getElementById("cookieToggleAnalytics");
  const advertisingToggle = document.getElementById("cookieToggleAdvertising");
  const acceptAllBtn = document.getElementById("cookieBannerAcceptAll");
  const saveBtn = document.getElementById("cookieBannerSave");
  if (!banner || !analyticsToggle || !advertisingToggle || !acceptAllBtn || !saveBtn) return;

  /* ===== Docked recap panel (desktop /cookies/ page only) =====
     dockContainer only exists in cookies/index.html's markup, so this
     whole block is a no-op on every other page. */
  const dockContainer = document.getElementById("cookieBannerDock");
  const dockToggle = document.getElementById("cookieDockToggle");
  const desktopQuery = window.matchMedia("(min-width: 769px)");
  const bannerHomeParent = banner.parentNode;
  const bannerHomeNext = banner.nextSibling;
  let isDocked = false;

  function applyDockPlacement(shouldDock){
    if (shouldDock){
      dockContainer.appendChild(banner);
      banner.classList.add("docked");
      banner.hidden = false;
    } else {
      banner.classList.remove("docked", "dock-revealed");
      if (dockToggle) dockToggle.setAttribute("aria-expanded", "false");
      bannerHomeParent.insertBefore(banner, bannerHomeNext);
      banner.hidden = true;
    }
    isDocked = shouldDock;
  }

  function syncDockPlacement(immediate){
    if (!dockContainer) return;
    const shouldDock = desktopQuery.matches && !!readSaved();
    if (shouldDock === isDocked) return;

    if (immediate){
      applyDockPlacement(shouldDock);
      return;
    }
    banner.classList.add("cookie-banner-fading");
    setTimeout(() => {
      applyDockPlacement(shouldDock);
      banner.classList.remove("cookie-banner-fading");
    }, 180);
  }

  /* Docked titlebar's yellow dot: same reveal logic as the classified-
     memory card — only visible/clickable while docked in the first
     place (the dot itself is display:none otherwise), so no separate
     guard needed here for the floating consent banner. One real
     exception: if this visitor hasn't actually made a consent choice
     yet (readSaved() below returns null), the categories/buttons are
     the real required controls, not a fun extra — force them visible
     regardless of the toggle rather than gating consent behind an
     easter egg. Only returning visitors who've already chosen get the
     hide-until-clicked treatment. Remembered across visits via
     localStorage, same as the consent choice itself. */
  if (dockToggle){
    let dockRevealed = false;
    try { dockRevealed = localStorage.getItem("bc-cookie-dock-revealed") === "1"; } catch (e) { /* storage unavailable */ }

    function setDockRevealed(revealed){
      dockRevealed = revealed;
      banner.classList.toggle("dock-revealed", revealed || !readSaved());
      dockToggle.setAttribute("aria-expanded", String(revealed));
      try { localStorage.setItem("bc-cookie-dock-revealed", revealed ? "1" : "0"); } catch (e) { /* storage unavailable */ }
    }
    setDockRevealed(dockRevealed);

    dockToggle.addEventListener("click", () => setDockRevealed(!dockRevealed));
  }

  desktopQuery.addEventListener("change", syncDockPlacement);

  banner.querySelectorAll(".cookie-toggle-row").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.tagName !== "INPUT") e.preventDefault();
    });
  });

  banner.querySelectorAll(".cookie-cat-arrow").forEach(arrowBtn => {
    arrowBtn.addEventListener("click", () => {
      const detail = document.getElementById(arrowBtn.getAttribute("aria-controls"));
      if (!detail) return;
      const willOpen = detail.hidden;
      detail.hidden = !willOpen;
      arrowBtn.setAttribute("aria-expanded", String(willOpen));
      const cat = arrowBtn.closest(".cookie-cat");
      if (cat) cat.classList.toggle("open", willOpen);
    });
  });

  function readSaved(){
    try {
      const raw = localStorage.getItem("bc-cookie-consent");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function applyConsent(prefs){
    gtag("consent", "update", {
      analytics_storage: prefs.analytics ? "granted" : "denied",
      ad_storage: prefs.advertising ? "granted" : "denied",
      ad_user_data: prefs.advertising ? "granted" : "denied",
      ad_personalization: prefs.advertising ? "granted" : "denied"
    });
  }

  function refreshConsentState(){
    banner.classList.toggle("needs-consent", !readSaved());
  }

  function savePrefs(prefs){
    applyConsent(prefs);
    try { localStorage.setItem("bc-cookie-consent", JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ }
    refreshConsentState();
    /* The docked recap panel (desktop /cookies/ page) stays exactly as
       it is — expanded or collapsed — after Accept All/Disable all or a
       direct checkbox toggle; only the still-floating first-visit
       prompt actually dismisses itself once a choice is made. */
    if (!isDocked) banner.hidden = true;
    syncDockPlacement();
  }

  const analyticsStatus = document.getElementById("cookieStatusAnalytics");
  const advertisingStatus = document.getElementById("cookieStatusAdvertising");

  function statusText(allowed){
    return bcT(allowed ? "...enabled & tracking safely" : "...disabled & fully anonymous");
  }

  function renderActionButton(){
    const allOn = analyticsToggle.checked && advertisingToggle.checked;
    acceptAllBtn.textContent = bcT(allOn ? "Disable all" : "Accept All");
    acceptAllBtn.classList.toggle("is-disable-all", allOn);
  }

  function renderStatuses(){
    [[analyticsStatus, analyticsToggle], [advertisingStatus, advertisingToggle]].forEach(([out, input]) => {
      if (!out) return;
      out.textContent = statusText(input.checked);
      out.classList.toggle("is-allowed", input.checked);
    });
    renderActionButton();
  }

  function syncTogglesFromSaved(){
    const current = readSaved() || { analytics: false, advertising: false };
    analyticsToggle.checked = !!current.analytics;
    advertisingToggle.checked = !!current.advertising;
    renderStatuses();
  }

  const saved = readSaved();
  if (saved){
    applyConsent(saved);
    syncTogglesFromSaved();
  } else {
    banner.hidden = false;
  }
  renderStatuses();
  refreshConsentState();
  syncDockPlacement(true);

  acceptAllBtn.addEventListener("click", () => {
    const turnOn = !(analyticsToggle.checked && advertisingToggle.checked);
    analyticsToggle.checked = turnOn;
    advertisingToggle.checked = turnOn;
    renderStatuses();
    savePrefs({ analytics: turnOn, advertising: turnOn });
  });

  saveBtn.addEventListener("click", () => {
    savePrefs({ analytics: analyticsToggle.checked, advertising: advertisingToggle.checked });
  });

  /* On the docked recap panel, a category checkbox auto-saves
     immediately on click, same as Accept All/Confirm choices — no
     separate confirm step needed for a single-category flip. The
     floating first-visit prompt is excluded on purpose: docking only
     ever happens once consent already exists (see syncDockPlacement
     above), so gating on isDocked already means this never fires for
     someone who hasn't made a real choice yet. */
  [analyticsToggle, advertisingToggle].forEach(toggle => {
    toggle.addEventListener("change", () => {
      renderStatuses();
      if (!isDocked) return;
      savePrefs({ analytics: analyticsToggle.checked, advertising: advertisingToggle.checked });
    });
  });

  const settingsBtn = document.getElementById("cookieMobileSettingsBtn");
  if (settingsBtn){
    settingsBtn.addEventListener("click", () => {
      syncTogglesFromSaved();
      banner.hidden = false;
    });
  }
})();

const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ===== SHARED FILE-SIZE FORMATTING =====
   Any tool displaying a file's size (original, converted, compressed,
   estimated — whatever) calls this rather than hand-rolling its own KB/MB
   math. Before this, six tools had independently written four subtly
   different versions of the same formula (Cleanly/Combine: byte-identical
   copies of each other; Compress and Coudio each their own,
   different KB/MB threshold and rounding) — the exact kind of duplication
   this file's own header says to promote to shared the moment it shows up
   twice. Threshold is a true 1024KB (1MiB), one decimal on the MB side,
   and a Math.max(1, ...) floor so a very small file reads "1 KB" rather
   than "0 KB". */
function bcFormatFileSize(bytes){
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ===== Editable output file name (per file row) =====
   Coudio's pattern, shared: the row shows an input holding the output's
   base name (no extension — that comes from the output format); the tool
   keeps the value per file and builds the download name from it. */
function bcCreateRowNameInput(initial, onChange){
  const input = document.createElement("input");
  input.type = "text";
  input.className = "bc-row-name";
  input.value = initial;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", bcT("Output file name"));
  input.title = bcT("Output file name");
  input.addEventListener("input", () => onChange(input.value));
  ["click", "pointerdown", "dragstart"].forEach(type => input.addEventListener(type, e => e.stopPropagation()));
  input.draggable = false;
  return input;
}
function bcSafeBaseName(value, fallback){
  const cleaned = (value || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
  return cleaned || fallback;
}
/* Names collide once files can be renamed (two files both called "scan");
   a ZIP would silently keep only the last, so suffix " (2)", " (3)"... */
function bcUniqueName(name, used){
  if (!used.has(name)){
    used.add(name);
    return name;
  }
  const m = name.match(/^(.*?)(\.[^.]+)?$/);
  for (let i = 2; ; i++){
    const candidate = `${m[1]} (${i})${m[2] || ""}`;
    if (!used.has(candidate)){
      used.add(candidate);
      return candidate;
    }
  }
}

/* ===== SHARED "CONTINUE WHERE YOU LEFT OFF" PERSISTENCE =====
   IndexedDB helpers shared by every tool that offers a Continue button
   (Convert/Compress/Combine/Cleanly — Context has its own, older,
   single-file copy of this same pattern). One object store per tool
   under a single "current" key — a tool only ever needs to remember its
   own most-recent session, not a history of them. localStorage isn't
   used here since file bytes can comfortably exceed its ~5MB quota. */
function openBcDb(dbName, storeName){
  const opened = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(storeName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    /* Fires if another tab/connection still has an older-version
       connection open — the request then waits indefinitely for that
       connection to close rather than erroring, which would hang every
       persistence call forever. Racing a timeout below is the safety
       net. */
    req.onblocked = () => {};
  });
  return Promise.race([
    opened,
    new Promise((_, reject) => setTimeout(() => reject(new Error("IndexedDB open timed out")), 1500))
  ]);
}

async function bcDbPut(dbName, storeName, value){
  let db;
  try {
    db = await openBcDb(dbName, storeName);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value, "current");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { /* storage unavailable (private browsing etc.) — skip */
  } finally { if (db) db.close(); }
}

async function bcDbGet(dbName, storeName){
  let db;
  try {
    db = await openBcDb(dbName, storeName);
    return await new Promise((resolve, reject) => {
      const req = db.transaction(storeName, "readonly").objectStore(storeName).get("current");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null;
  } finally { if (db) db.close(); }
}

async function bcDbClear(dbName, storeName){
  let db;
  try {
    db = await openBcDb(dbName, storeName);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete("current");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { /* ignore */
  } finally { if (db) db.close(); }
}

/* Single-letter keyboard shortcut for an on-banner button (Context/Congify's
   Add text/Bold/Italic/Underline pills) — just forwards to btn.click(), so
   it automatically respects a disabled button and stays in sync with
   whatever the click handler already does (no separate shortcut logic to
   keep in sync with the button's own behavior). Skips while focus is in a
   text input/textarea/contenteditable (typing a caption/text-box's actual
   content shouldn't fire "b"/"i"/"u"/"t" as shortcuts) and while a
   modifier key is held (so it doesn't fight browser/OS shortcuts). */
/* "Continue where you left off" — D clicks it while it's showing, ahead of
   (and instead of) the tool's own D/Download shortcut, which has nothing to
   do until a file is loaded. Congify's post-conversion "Continue working"
   (id contains "Done") is a different button and keeps D for Download. */
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "d") return;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
  const btn = document.querySelector('.tool-continue-btn[id$="ContinueBtn"]:not([id*="Done"])');
  if (!btn || btn.hidden || btn.disabled || !btn.offsetParent) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  btn.click();
});

/* A — opens the file picker through whichever add control is showing: the "+" tile, the add-more pill, or the intro drop zone. */
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "a") return;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
  const target = [...document.querySelectorAll(".bc-add-tile, .tool-drop")].find(el => !el.hidden && !el.disabled && el.offsetParent);
  if (!target) return;
  e.preventDefault();
  target.click();
});

/* ON/OFF button (an .option-change-btn with aria-pressed + a label) that
   behaves like a checkbox for code written against `.checked` / "change":
   `checked` reads/writes the pressed state and label, `addEventListener
   ("change")` / `dispatchEvent` reach whoever listens, and a click flips
   it and fires "change". Originated as Codify's Background ON/OFF button;
   now also drives Mac nav and Shadow. */
function bcOnOffButton(btn){
  if (!btn) return null;
  const label = btn.querySelector(".option-change-btn-label");
  const listeners = [];
  const api = {
    get checked(){ return btn.getAttribute("aria-pressed") === "true"; },
    set checked(v){
      btn.setAttribute("aria-pressed", String(!!v));
      if (label) label.textContent = v ? "ON" : "OFF";
    },
    addEventListener(type, fn){ if (type === "change") listeners.push(fn); },
    dispatchEvent(){ listeners.forEach(fn => fn({ target: api })); return true; },
    el: btn
  };
  btn.addEventListener("click", () => { api.checked = !api.checked; api.dispatchEvent(); });
  return api;
}

function bcRegisterKeyShortcut(key, btn){
  if (!btn) return;
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() !== key.toLowerCase()) return;
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
    e.preventDefault();
    btn.click();
  });
}

/* Shared "click cycles a value instantly, a fast second click undoes that
   and opens the fuller control instead" gesture — originated as two
   hand-copied near-duplicates in Codify's click handler (the background-
   color zone and the Shadow zone each tracked their own
   lastClickTime/valueBeforeClick pair and ran the same undo-then-open
   branch). Pulled out once both were doing the exact same thing on
   different state, same reasoning as every other shared bcRegister-/
   bcCreate-prefixed helper in this file: one real implementation instead
   of a copy that can drift.

   `thresholdMs` — how close together (ms) two clicks need to land to
   count as the "double" gesture; much tighter than the browser's own
   native dblclick threshold (300-500ms, tuned for double-clicking small
   icons) is deliberate here, so a quick single click never feels delayed
   waiting to see if a second one follows.
   `getState()` — reads the current value, called right before `cycle()`
   so the gesture can hand it back to `revert()` if a second click follows.
   `cycle(e)` — runs on every single click (the common case): advance to
   the next value.
   `revert(prevState, e)` — runs only on the double-click: undo whatever
   `cycle` just did, putting the value back to what `getState()` last saw.
   `open(e)` — runs right after `revert`, on the double-click only: hand
   off to the fuller control (a color panel, an options panel, ...).
   `e.stopPropagation()` is called here, before `open()`, on every
   consumer's behalf — without it, this same click bubbles up to whatever
   outside-click listener closes that fuller control (a common pattern
   site-wide for dropdown/panel components), which sees the click as
   "outside" the panel `open()` just opened and closes it in the same
   tick. This is exactly the bug Codify's own background-color zone had
   (missing this one line, while the Shadow zone next to it already had
   it) — folding it into the shared helper means no future caller of this
   gesture can reintroduce that same bug by forgetting it once more.

   Returns a click-event handler — attach it directly:
   `zone.addEventListener("click", bcCreateQuickCycleGesture({...}))`. */
function bcCreateQuickCycleGesture({ thresholdMs = 200, getState, cycle, revert, open }){
  let lastClickTime = 0;
  let stateBeforeClick = null;
  return function(e){
    const now = performance.now();
    if (now - lastClickTime < thresholdMs){
      if (stateBeforeClick !== null) revert(stateBeforeClick, e);
      e.stopPropagation();
      open(e);
      lastClickTime = 0;
      return;
    }
    lastClickTime = now;
    stateBeforeClick = getState();
    cycle(e);
  };
}

/* ===== Shift+click on any "beta remove btn" (.bc-file-remove-btn) clears
   every OTHER row in the tool, keeping just the one clicked — a single
   delegated listener here, so every current and future adopter (Cleanly/
   Combine's file rows, Convert/Compress/Coudio's per-file remove, ...) gets this for free with zero
   per-tool wiring, the same "add the shared class, done" deal the rest
   of .bc-file-remove-btn already is.

   Deliberately index-based, not DOM-reference-based: every adopter's own
   click handler re-renders its list from scratch on removal (`innerHTML
   = ""` + rebuild), so the exact button element a visitor shift-clicked
   stops being attached to the document after the very first other row is
   removed. Position in reading order survives a rebuild (removing item
   never reorders the rest), so tracking "the Nth remove button" and
   re-querying live buttons before every step is what actually holds up
   across every adopter's own render pattern, not "the same node twice."

   Capture-phase on `document` so this runs before the target's own
   bubble-phase click handler — `stopPropagation()` here is what stops
   that handler from also firing and removing the very row a shift-click
   means to keep. Every subsequent removal is a plain, unmodified
   `.click()` on some *other* button, which has no shiftKey set, so it
   sails through this same listener untouched and hits each tool's own
   real remove logic normally — no shared "remove one item" API needed,
   this only ever drives the buttons that already exist. */
document.addEventListener("click", (e) => {
  if (!e.shiftKey) return;
  const keepBtn = e.target.closest(".bc-file-remove-btn");
  if (!keepBtn) return;
  e.preventDefault();
  e.stopPropagation();
  const initial = Array.from(document.querySelectorAll(".bc-file-remove-btn"));
  let keepIndex = initial.indexOf(keepBtn);
  if (keepIndex === -1 || initial.length <= 1) return;
  let guard = 0;
  while (guard++ < 1000){
    const btns = Array.from(document.querySelectorAll(".bc-file-remove-btn"));
    if (btns.length <= 1) break;
    if (keepIndex >= btns.length) keepIndex = btns.length - 1;
    const targetIndex = keepIndex === 0 ? 1 : 0;
    if (targetIndex < keepIndex) keepIndex--;
    btns[targetIndex].click();
  }
}, true);

/* ===== Shared free-form color picker panel (swatches + saturation/value
   square + hue strip + hex field) — the same palette Codify's Background
   control uses, built here so a second tool (Context's signature ink)
   doesn't hand-copy that markup/HSV math. Fills `container` and returns
   { setValue(hex) }; onChange(hex) fires on every swatch/drag/hex edit.
   (Codify still runs its own older inline copy of this — fold it onto
   this when that file's next touched.) */
function bcHsvToHex(h, s, v){
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const table = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
  const [r, g, b] = table[i].map(x => Math.round(x * 255));
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}
function bcHexToHsv(hex){
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0){
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
const BC_COLOR_PANEL_SWATCHES = ["#E5E7EB", "#7C3AED", "#2563EB", "#22C55E", "#F97316", "#1E1E1E"];
function bcCreateColorPanel(container, { value = "#2563EB", swatches = BC_COLOR_PANEL_SWATCHES, onChange } = {}){
  container.classList.add("bc-color-panel");
  container.innerHTML = `
    <div class="bc-cp-swatches">${swatches.map(c => `<button type="button" class="bc-cp-swatch" data-color="${c}" style="background:${c};" aria-label="${c}"></button>`).join("")}</div>
    <div class="bc-cp-sv" role="slider" tabindex="0" aria-label="Saturation and brightness"><div class="bc-cp-sv-thumb"></div></div>
    <input type="range" class="bc-cp-hue" min="0" max="359" step="1" value="0" aria-label="Hue">
    <label class="bc-cp-hex-row"><span class="bc-cp-hex-label">Hex</span><input type="text" class="bc-cp-hex-input" maxlength="7" spellcheck="false" aria-label="Custom hex color"></label>`;
  const sv = container.querySelector(".bc-cp-sv");
  const thumb = container.querySelector(".bc-cp-sv-thumb");
  const hueInput = container.querySelector(".bc-cp-hue");
  const hexInput = container.querySelector(".bc-cp-hex-input");
  let hue = 0, sat = 0, val = 0;

  function paint(hex, fromHex){
    sv.style.backgroundColor = bcHsvToHex(hue, 1, 1);
    thumb.style.left = (sat * 100) + "%";
    thumb.style.top = ((1 - val) * 100) + "%";
    hueInput.value = Math.round(hue) % 360;
    if (!fromHex) hexInput.value = hex.toUpperCase();
    container.querySelectorAll(".bc-cp-swatch").forEach(b => b.classList.toggle("active", b.dataset.color.toLowerCase() === hex.toLowerCase()));
  }
  function emit(){
    const hex = bcHsvToHex(hue, sat, val);
    paint(hex);
    if (onChange) onChange(hex);
  }
  function setValue(hex){
    [hue, sat, val] = bcHexToHsv(hex);
    paint(hex);
  }
  function pick(clientX, clientY){
    const r = sv.getBoundingClientRect();
    sat = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    val = Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height));
    emit();
  }
  let dragging = false;
  sv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    try { sv.setPointerCapture(e.pointerId); } catch (err) {}
    pick(e.clientX, e.clientY);
  });
  sv.addEventListener("pointermove", (e) => { if (dragging) pick(e.clientX, e.clientY); });
  const endDrag = (e) => { dragging = false; try { sv.releasePointerCapture(e.pointerId); } catch (err) {} };
  sv.addEventListener("pointerup", endDrag);
  sv.addEventListener("pointercancel", endDrag);
  hueInput.addEventListener("input", () => { hue = Number(hueInput.value); emit(); });
  container.querySelectorAll(".bc-cp-swatch").forEach(b => b.addEventListener("click", () => {
    const hex = b.dataset.color;
    setValue(hex);
    if (onChange) onChange(hex.toLowerCase());
  }));
  function commitHex(){
    let v = hexInput.value.trim();
    if (/^[0-9a-f]{6}$/i.test(v)) v = "#" + v;
    if (/^#[0-9a-f]{6}$/i.test(v)){
      setValue(v);
      if (onChange) onChange(v.toLowerCase());
    } else {
      hexInput.value = bcHsvToHex(hue, sat, val).toUpperCase();
    }
  }
  hexInput.addEventListener("change", commitHex);
  hexInput.addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); commitHex(); } });
  setValue(value);
  return { setValue };
}

/* Floating color picker anchored to a button: a bc-color-panel in a fixed
   popover that opens above the anchor (below when there's no room), clamps
   on-screen, and closes on outside press, Esc, or any other popup opening.
   open(hex) shows it preset to hex; onChange(hex) fires while dragging. */
function bcCreateColorPopover(anchor, { value = "#2563EB", onChange } = {}){
  const pop = document.createElement("div");
  pop.className = "bc-color-popover";
  pop.hidden = true;
  document.body.appendChild(pop);
  const panel = bcCreateColorPanel(pop, { value, onChange });
  const close = () => { pop.hidden = true; };
  function open(hex){
    panel.setValue(hex || value);
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + "px";
    pop.style.top = Math.round(r.top > h + 16 ? r.top - h - 8 : r.bottom + 8) + "px";
  }
  bcRegisterPopup(close);
  document.addEventListener("pointerdown", (e) => {
    if (pop.hidden || pop.contains(e.target) || anchor.contains(e.target)) return;
    close();
  }, true);
  bcRegisterEscapable(() => !pop.hidden, close, 105);
  return { open, close, setValue: panel.setValue, isOpen: () => !pop.hidden };
}

/* Built-in menus/tooltips: any open dropdown, combo or info tooltip. */
bcRegisterEscapable(
  () => bcDropdowns.some(d => !d.menu.hidden) || bcCombos.some(c => !c.menu.hidden) || bcInfoTooltips.some(o => !o.tooltip.hidden),
  () => {
    bcCloseAllDropdowns();
    bcCombos.forEach(c => { if (!c.menu.hidden) bcCloseCombo(c); });
    bcInfoTooltips.forEach(o => { o.tooltip.hidden = true; o.btn.setAttribute("aria-expanded", "false"); });
  },
  60
);

/* ===== Language switch =====
   A page lists its translations as <link rel="alternate" hreflang="..">
   (the build script writes them). This adds one nav button that links to
   the other language's copy of the same page; it never redirects on its
   own and just remembers the last choice. */
(function(){
  const FLAGS = {
      en: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#012169"/><path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0l60 40M60 0L0 40" stroke="#C8102E" stroke-width="3"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="13"/><path d="M30 0v40M0 20h60" stroke="#C8102E" stroke-width="8"/></svg>',
      de: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#FFCE00"/><rect width="60" height="26.7" fill="#DD0000"/><rect width="60" height="13.3" fill="#000"/></svg>',
      nl: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#21468B"/><rect width="60" height="26.7" fill="#fff"/><rect width="60" height="13.3" fill="#AE1C28"/></svg>',
      fr: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#fff"/><rect width="20" height="40" fill="#0055A4"/><rect x="40" width="20" height="40" fill="#EF4135"/></svg>',
      ro: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#FCD116"/><rect width="20" height="40" fill="#002B7F"/><rect x="40" width="20" height="40" fill="#CE1126"/></svg>',
      it: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#fff"/><rect width="20" height="40" fill="#009246"/><rect x="40" width="20" height="40" fill="#CE2B37"/></svg>',
      pt: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#009C3B"/><polygon points="30,5 55,20 30,35 5,20" fill="#FFDF00"/><circle cx="30" cy="20" r="8" fill="#002776"/></svg>',
      ja: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#fff"/><circle cx="30" cy="20" r="12" fill="#BC002D"/></svg>',
      ko: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#fff"/><g transform="rotate(-33.7 30 20)"><path d="M20 20A10 10 0 0 1 40 20A5 5 0 0 1 30 20A5 5 0 0 0 20 20z" fill="#CD2E3A"/><path d="M20 20A5 5 0 0 1 30 20A5 5 0 0 0 40 20A10 10 0 0 1 20 20z" fill="#0047A0"/></g><g fill="#000"><g transform="translate(10 8) rotate(-57)"><rect x="-5.5" y="-4.5" width="11" height="1.8"/><rect x="-5.5" y="-0.9" width="11" height="1.8"/><rect x="-5.5" y="2.7" width="11" height="1.8"/></g><g transform="translate(50 8) rotate(57)"><rect x="-5.5" y="-4.5" width="4.6" height="1.8"/><rect x="0.9" y="-4.5" width="4.6" height="1.8"/><rect x="-5.5" y="-0.9" width="11" height="1.8"/><rect x="-5.5" y="2.7" width="4.6" height="1.8"/><rect x="0.9" y="2.7" width="4.6" height="1.8"/></g><g transform="translate(10 32) rotate(-123)"><rect x="-5.5" y="-4.5" width="11" height="1.8"/><rect x="-5.5" y="-0.9" width="4.6" height="1.8"/><rect x="0.9" y="-0.9" width="4.6" height="1.8"/><rect x="-5.5" y="2.7" width="11" height="1.8"/></g><g transform="translate(50 32) rotate(123)"><rect x="-5.5" y="-4.5" width="4.6" height="1.8"/><rect x="0.9" y="-4.5" width="4.6" height="1.8"/><rect x="-5.5" y="-0.9" width="4.6" height="1.8"/><rect x="0.9" y="-0.9" width="4.6" height="1.8"/><rect x="-5.5" y="2.7" width="4.6" height="1.8"/><rect x="0.9" y="2.7" width="4.6" height="1.8"/></g></g></svg>',
      cs: '<svg viewBox="0 0 60 40"><rect width="60" height="20" fill="#fff"/><rect y="20" width="60" height="20" fill="#D7141A"/><path d="M0 0l30 20L0 40z" fill="#11457E"/></svg>',
      es: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#AA151B"/><rect y="10" width="60" height="20" fill="#F1BF00"/></svg>',
      id: '<svg viewBox="0 0 60 40"><rect width="60" height="20" fill="#E70011"/><rect y="20" width="60" height="20" fill="#fff"/></svg>',
      pl: '<svg viewBox="0 0 60 40"><rect width="60" height="20" fill="#fff"/><rect y="20" width="60" height="20" fill="#DC143C"/></svg>'
    };
  function applySavedLang(){
    let saved = null;
    try { saved = localStorage.getItem("bc-lang"); } catch (e) { /* storage unavailable */ }
    const current = document.documentElement.lang || "en";
    if (!saved || saved === current) return;
    const target = document.querySelector('link[rel="alternate"][hreflang="' + saved + '"]');
    if (!target) return;
    const internal = document.referrer && new URL(document.referrer).origin === location.origin;
    if (current !== "en" && !internal) return;
    location.replace(new URL(target.href, location.href).pathname + location.search + location.hash);
  }
  applySavedLang();
  function addLangButton(){
    const nav = document.querySelector(".nav-right");
    if (!nav || nav.querySelector(".nav-lang-wrap")) return;
    const current = document.documentElement.lang || "en";
    const ORDER = ["en", "nl", "de", "es", "fr", "it", "pl", "pt", "ro", "cs", "id", "ja", "ko"];
    const alts = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].filter(l => l.hreflang !== "x-default").sort((a, b) => ORDER.indexOf(a.hreflang) - ORDER.indexOf(b.hreflang));
    if (alts.length < 2) return;
    const NAMES = { en: "English", cs: "Česky", pl: "Polski", id: "Indonesia", es: "Español", de: "Deutsch", nl: "Nederlands", fr: "Français", it: "Italiano", pt: "Português", ro: "Română", ja: "日本語", ko: "한국어" };
    const wrap = document.createElement("div");
    wrap.className = "nav-lang-wrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-theme-btn nav-lang-btn";
    btn.innerHTML = FLAGS[current] || current.toUpperCase();
    btn.title = NAMES[current] || current;
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "nav-lang-menu";
    alts.forEach(l => {
      const a = document.createElement("a");
      a.href = new URL(l.href, location.href).pathname + location.search;
      a.hreflang = l.hreflang;
      a.innerHTML = (FLAGS[l.hreflang] || "") + "<span>" + (NAMES[l.hreflang] || l.hreflang) + "</span>";
      if (l.hreflang === current) a.setAttribute("aria-current", "true");
      a.addEventListener("click", () => { try { localStorage.setItem("bc-lang", l.hreflang); } catch (e) { /* storage unavailable */ } });
      menu.appendChild(a);
    });
    const setOpen = open => { menu.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); };
    document.addEventListener("bc-report-hover", () => setOpen(false));
    btn.addEventListener("click", e => { e.stopPropagation(); setOpen(e.detail > 0 && window.matchMedia("(hover: hover)").matches && window.innerWidth > 768 ? true : !menu.classList.contains("open")); });
    document.addEventListener("click", e => { if (!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
    if (window.matchMedia("(hover: hover)").matches){
      let closeTimer;
      wrap.addEventListener("mouseenter", () => { clearTimeout(closeTimer); if (window.innerWidth > 768){ setOpen(true); document.dispatchEvent(new Event("bc-nav-hover")); } });
      wrap.addEventListener("mouseleave", () => { clearTimeout(closeTimer); closeTimer = setTimeout(() => setOpen(false), 150); });
    }
    wrap.append(btn, menu);
    nav.insertBefore(wrap, nav.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLangButton);
  else addLangButton();
})();
