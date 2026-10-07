/* Report button (header, next to the theme toggle) — three tabs (bug, translation,
   feedback); each sends a short message and up to three optional screenshots to its
   own Discord channel through the Worker. */
(function(){
  /* The Cloudflare Worker that forwards reports to Discord (workers/report.js).
     */
  const ENDPOINT = "https://bc-report.lukasbrzlinekbusiness.workers.dev";
  const TABS = {
    bug: { label: () => bcT("Bug"), title: () => bcT("Report a bug"), max: 100, ph: () => bcT("What went wrong? (max {n} characters)", { n: 100 }), aria: () => bcT("Describe the bug"), done: () => bcT("Thank you for your help!") },
    translation: { label: () => bcT("Translation"), title: () => bcT("Suggest a translation"), max: 200, ph: () => bcT("Which wording is wrong, and what should it say? (max {n} characters)", { n: 200 }), aria: () => bcT("Describe the translation issue"), done: () => bcT("Thank you for your help!") },
    feedback: { label: () => bcT("Feedback"), title: () => bcT("Send feedback"), max: 100, ph: () => bcT("Your idea or feedback (max {n} characters)", { n: 100 }), aria: () => bcT("Your feedback"), done: () => bcT("Thank you for your help!") }
  };
  const MAX_SHOTS = 3;
  const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
  const COOLDOWN_MS = 60000;
  const LAST_KEY = "bc-report-last";

  const bcT = (s, vars) => {
    const dict = window.BC_I18N;
    let out = (dict && dict[s]) || s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  };

  const themeBtn = document.getElementById("navThemeBtn");
  if (!themeBtn || document.getElementById("navReportBtn")) return;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/shared/report.css?v=15";
  document.head.appendChild(css);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "navReportBtn";
  btn.className = "nav-theme-btn nav-report-btn";
  btn.setAttribute("aria-label", bcT("Report a bug"));
  btn.title = bcT("Report a bug");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7.5a3 3 0 0 1 6 0"/><path d="M8 11a4 4 0 0 1 8 0v4a4 4 0 0 1-8 0z"/><path d="M12 11v8"/><path d="M8 13H4M16 13h4M8.5 8.5 5.5 6.5M15.5 8.5l3-2M8.5 17.5l-3 2M15.5 17.5l3 2"/></svg>';
  themeBtn.insertAdjacentElement("afterend", btn);

  const box = document.createElement("div");
  box.className = "bc-report";
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", bcT("Report a bug"));
  box.innerHTML =
    '<div class="bc-report-tabs" role="group" aria-label="' + bcT("Report type") + '">' +
      Object.keys(TABS).map(k => '<button type="button" data-tab="' + k + '" aria-pressed="false">' + TABS[k].label() + '</button>').join("") +
    '</div>' +
    '<div class="bc-report-title"></div>' +
    '<textarea class="bc-report-text"></textarea>' +
    '<div class="bc-report-count"></div>' +
    '<div class="bc-report-shot">' +
      '<button type="button" class="bc-report-attach">' + bcT("Add screenshot") + '</button>' +
      '<input type="file" accept="image/*" multiple hidden>' +
      '<div class="bc-report-thumbs"></div>' +
    '</div>' +
    '<label class="bc-report-consent"><input type="checkbox"><div><p>' + bcT("I understand that sending this report is {anon}, browser, device and other details will be shared. (read more in {privacy})", { anon: "<b>" + bcT("not anonymous") + "</b>", privacy: '<a href="' + (typeof bcLangPath === "function" ? bcLangPath("/privacy/") : "/privacy/") + '" target="_blank" rel="noopener">' + bcT("Privacy Policy") + '</a>' }) + '</p></div></label>' +
    '<div class="bc-report-actions"><button type="button" class="bc-report-close">' + bcT("Close") + '</button><button type="button" class="bc-report-send" title="' + bcT("Send (Enter)") + '" disabled>' + bcT("Send") + '</button></div>' +
    '<div class="tool-status bc-report-status" role="status"></div>';
  document.body.appendChild(box);

  const text = box.querySelector(".bc-report-text");
  const count = box.querySelector(".bc-report-count");
  const attach = box.querySelector(".bc-report-attach");
  const fileInput = box.querySelector("input[type=file]");
  const thumbs = box.querySelector(".bc-report-thumbs");
  const consent = box.querySelector(".bc-report-consent input");
  const send = box.querySelector(".bc-report-send");
  const status = box.querySelector(".bc-report-status");
  const title = box.querySelector(".bc-report-title");
  const tabBtns = [...box.querySelectorAll(".bc-report-tabs button")];
  const drafts = {};
  let tab = "bug";
  let shots = [];
  let busy = false;

  function setTab(next){
    drafts[tab] = text.value;
    tab = next;
    const t = TABS[tab];
    tabBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
    title.textContent = t.title();
    box.setAttribute("aria-label", t.title());
    text.maxLength = t.max;
    text.placeholder = t.ph();
    text.setAttribute("aria-label", t.aria());
    text.value = (drafts[tab] || "").slice(0, t.max);
    status.textContent = "";
    refresh();
  }

  function isOpen(){ return !box.hidden; }
  function open(which){
    if (which && which !== tab) setTab(which);
    box.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    text.focus();
  }
  function close(){
    box.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (document.activeElement === btn) btn.blur();
  }
  function refresh(){
    count.textContent = text.value.length + "/" + TABS[tab].max;
    send.disabled = busy || !text.value.trim() || !consent.checked;
  }
  function renderShots(){
    thumbs.innerHTML = "";
    shots.forEach((item, i) => {
      const wrap = document.createElement("div");
      wrap.className = "bc-report-preview";
      const img = document.createElement("img");
      img.alt = bcT("Screenshot {n}", { n: i + 1 });
      img.src = item.url;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "bc-report-remove";
      rm.setAttribute("aria-label", bcT("Remove screenshot {n}", { n: i + 1 }));
      rm.title = bcT("Remove screenshot");
      rm.textContent = "\u00D7";
      rm.addEventListener("click", () => {
        URL.revokeObjectURL(item.url);
        shots.splice(i, 1);
        renderShots();
      });
      wrap.append(img, rm);
      thumbs.appendChild(wrap);
    });
    attach.disabled = shots.length >= MAX_SHOTS;
    attach.textContent = shots.length ? bcT("Add more ({n}/{max})", { n: shots.length, max: MAX_SHOTS }) : bcT("Add screenshot");
  }
  function addShots(files){
    let skipped = "";
    for (const file of files){
      if (!/^image\//.test(file.type)){ skipped = bcT("Only images can be attached."); continue; }
      if (shots.length >= MAX_SHOTS){ skipped = bcT("You can attach up to {max} screenshots.", { max: MAX_SHOTS }); break; }
      const total = shots.reduce((n, s) => n + s.file.size, 0) + file.size;
      if (total > MAX_TOTAL_BYTES){ skipped = bcT("Screenshots can be 8 MB in total."); continue; }
      shots.push({ file, url: URL.createObjectURL(file) });
    }
    status.textContent = skipped;
    renderShots();
  }
  function clearShots(){
    shots.forEach(item => URL.revokeObjectURL(item.url));
    shots = [];
    fileInput.value = "";
    renderShots();
  }

  btn.addEventListener("click", () => { isOpen() ? close() : open(); });
  tabBtns.forEach(b => b.addEventListener("click", () => { setTab(b.dataset.tab); text.focus(); }));

  const footerContact = document.getElementById("footerContactSection");
  let footerBtn = null;
  if (footerContact){
    const footerWrap = document.createElement("span");
    footerWrap.className = "footer-dash-text";
    footerBtn = document.createElement("a");
    footerBtn.href = "#";
    footerBtn.setAttribute("role", "button");
    footerBtn.title = btn.title;
    footerBtn.innerHTML = '<span class="footer-link-fun">' + bcT("Squash a Bug") + '</span><span class="footer-link-plain">' + bcT("Report a bug") + '</span>';
    footerBtn.addEventListener("click", (e) => { e.preventDefault(); open("bug"); });
    footerWrap.appendChild(footerBtn);
    footerContact.appendChild(footerWrap);
  }
  text.addEventListener("input", refresh);
  consent.addEventListener("change", refresh);
  text.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    if (!send.disabled) send.click();
  });
  box.querySelector(".bc-report-close").addEventListener("click", close);
  attach.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { addShots([...fileInput.files]); fileInput.value = ""; });
  box.addEventListener("paste", (e) => {
    const pasted = [...(e.clipboardData ? e.clipboardData.items : [])].filter(i => i.type.indexOf("image/") === 0).map(i => i.getAsFile()).filter(Boolean);
    if (pasted.length){ e.preventDefault(); addShots(pasted); }
  });
  document.addEventListener("mousedown", (e) => {
    if (isOpen() && !box.contains(e.target) && !btn.contains(e.target) && !(footerBtn && footerBtn.contains(e.target))) close();
  });
  if (typeof bcRegisterEscapable === "function") bcRegisterEscapable(isOpen, close, 60);
  else document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) close(); });

  setTab("bug");

  send.addEventListener("click", async () => {
    const message = text.value.trim();
    if (!message || busy || !consent.checked) return;
    if (!ENDPOINT){ status.textContent = bcT("Reporting isn't set up yet."); return; }
    let last = 0;
    try { last = +localStorage.getItem(LAST_KEY) || 0; } catch (err) { /* storage unavailable */ }
    const wait = COOLDOWN_MS - (Date.now() - last);
    if (wait > 0){ status.textContent = bcT("Please wait {n}s before sending another report.", { n: Math.ceil(wait / 1000) }); return; }

    busy = true;
    refresh();
    status.textContent = bcT("Sending...");
    const theme = document.documentElement.getAttribute("data-theme") || "light";
    const form = new FormData();
    form.append("type", tab);
    form.append("lang", document.documentElement.lang || "en");
    form.append("message", message);
    form.append("page", location.pathname || "/");
    form.append("screen", innerWidth + "x" + innerHeight + " · " + theme);
    form.append("browser", navigator.userAgent.slice(0, 200));
    shots.forEach((item, i) => form.append("screenshot", item.file, item.file.name || "screenshot-" + (i + 1) + ".png"));
    try {
      /* A report is the visitor's own action, not a tool processing a file,
         so it goes around the tool privacy badge's request counter. */
      const doFetch = typeof _privacyCheckOrigFetch === "function" ? _privacyCheckOrigFetch : window.fetch;
      const res = await doFetch.call(window, ENDPOINT, { method: "POST", body: form });
      if (!res.ok) throw new Error("HTTP " + res.status);
      try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (err) { /* storage unavailable */ }
      text.value = "";
      drafts[tab] = "";
      clearShots();
      consent.checked = false;
      status.textContent = TABS[tab].done();
    } catch (err){
      console.error(err);
      status.textContent = bcT("Couldn't send the report. Please try again.");
    } finally {
      busy = false;
      refresh();
    }
  });
})();
