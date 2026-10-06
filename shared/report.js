/* Bug report button (header, next to the theme toggle) — sends a short
   description and up to three optional screenshots to the support channel on Discord. */
(function(){
  /* The Cloudflare Worker that forwards reports to Discord (workers/report.js).
     */
  const ENDPOINT = "https://bc-report.lukasbrzlinekbusiness.workers.dev";
  const MAX_CHARS = 100;
  const MAX_SHOTS = 3;
  const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
  const COOLDOWN_MS = 60000;
  const LAST_KEY = "bc-report-last";

  const themeBtn = document.getElementById("navThemeBtn");
  if (!themeBtn || document.getElementById("navReportBtn")) return;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/shared/report.css?v=6";
  document.head.appendChild(css);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "navReportBtn";
  btn.className = "nav-theme-btn nav-report-btn";
  btn.setAttribute("aria-label", "Report a bug");
  btn.title = "Report a bug";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7.5a3 3 0 0 1 6 0"/><path d="M8 11a4 4 0 0 1 8 0v4a4 4 0 0 1-8 0z"/><path d="M12 11v8"/><path d="M8 13H4M16 13h4M8.5 8.5 5.5 6.5M15.5 8.5l3-2M8.5 17.5l-3 2M15.5 17.5l3 2"/></svg>';
  themeBtn.insertAdjacentElement("afterend", btn);

  const box = document.createElement("div");
  box.className = "bc-report";
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Report a bug");
  box.innerHTML =
    '<div class="bc-report-title">Report a bug</div>' +
    '<textarea class="bc-report-text" maxlength="' + MAX_CHARS + '" placeholder="What went wrong? (max ' + MAX_CHARS + ' characters)" aria-label="Describe the bug"></textarea>' +
    '<div class="bc-report-count">0/' + MAX_CHARS + '</div>' +
    '<div class="bc-report-shot">' +
      '<button type="button" class="bc-report-attach">Add screenshot</button>' +
      '<input type="file" accept="image/*" multiple hidden>' +
      '<div class="bc-report-thumbs"></div>' +
    '</div>' +
    '<p class="bc-report-note"><span class="bc-report-prompt" aria-hidden="true">&gt;</span> Your report (browser &amp; device details incl.) will be sent to our Discord server for further processing. <b>Thank you for your help!</b></p>' +
    '<div class="bc-report-actions"><button type="button" class="bc-report-send" title="Send (Enter)" disabled>Send</button></div>' +
    '<div class="tool-status bc-report-status" role="status"></div>';
  document.body.appendChild(box);

  const text = box.querySelector(".bc-report-text");
  const count = box.querySelector(".bc-report-count");
  const attach = box.querySelector(".bc-report-attach");
  const fileInput = box.querySelector("input[type=file]");
  const thumbs = box.querySelector(".bc-report-thumbs");
  const send = box.querySelector(".bc-report-send");
  const status = box.querySelector(".bc-report-status");
  let shots = [];
  let busy = false;

  function isOpen(){ return !box.hidden; }
  function open(){
    box.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    text.focus();
  }
  function close(){
    box.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }
  function refresh(){
    count.textContent = text.value.length + "/" + MAX_CHARS;
    send.disabled = busy || !text.value.trim();
  }
  function renderShots(){
    thumbs.innerHTML = "";
    shots.forEach((item, i) => {
      const wrap = document.createElement("div");
      wrap.className = "bc-report-preview";
      const img = document.createElement("img");
      img.alt = "Screenshot " + (i + 1);
      img.src = item.url;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "bc-report-remove";
      rm.setAttribute("aria-label", "Remove screenshot " + (i + 1));
      rm.title = "Remove screenshot";
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
    attach.textContent = shots.length ? "Add more (" + shots.length + "/" + MAX_SHOTS + ")" : "Add screenshot";
  }
  function addShots(files){
    let skipped = "";
    for (const file of files){
      if (!/^image\//.test(file.type)){ skipped = "Only images can be attached."; continue; }
      if (shots.length >= MAX_SHOTS){ skipped = "You can attach up to " + MAX_SHOTS + " screenshots."; break; }
      const total = shots.reduce((n, s) => n + s.file.size, 0) + file.size;
      if (total > MAX_TOTAL_BYTES){ skipped = "Screenshots can be 8 MB in total."; continue; }
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
  text.addEventListener("input", refresh);
  text.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    if (!send.disabled) send.click();
  });
  attach.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { addShots([...fileInput.files]); fileInput.value = ""; });
  box.addEventListener("paste", (e) => {
    const pasted = [...(e.clipboardData ? e.clipboardData.items : [])].filter(i => i.type.indexOf("image/") === 0).map(i => i.getAsFile()).filter(Boolean);
    if (pasted.length){ e.preventDefault(); addShots(pasted); }
  });
  document.addEventListener("mousedown", (e) => {
    if (isOpen() && !box.contains(e.target) && !btn.contains(e.target)) close();
  });
  if (typeof bcRegisterEscapable === "function") bcRegisterEscapable(isOpen, close, 60);
  else document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) close(); });

  send.addEventListener("click", async () => {
    const message = text.value.trim();
    if (!message || busy) return;
    if (!ENDPOINT){ status.textContent = "Reporting isn't set up yet."; return; }
    let last = 0;
    try { last = +localStorage.getItem(LAST_KEY) || 0; } catch (err) { /* storage unavailable */ }
    const wait = COOLDOWN_MS - (Date.now() - last);
    if (wait > 0){ status.textContent = "Please wait " + Math.ceil(wait / 1000) + "s before sending another report."; return; }

    busy = true;
    refresh();
    status.textContent = "Sending...";
    const theme = document.documentElement.getAttribute("data-theme") || "light";
    const form = new FormData();
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
      clearShots();
      status.textContent = "Thanks, your report was sent.";
    } catch (err){
      console.error(err);
      status.textContent = "Couldn't send the report. Please try again.";
    } finally {
      busy = false;
      refresh();
    }
  });
})();
