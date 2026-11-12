   compensation rule — none of the alien-mode overrides do, since they
   were built assuming the normal dark (unfiltered) state. Entering
   alien mode while light theme is active scrambles the colors (black
   card backgrounds invert to white, etc). Since the theme toggle is
   hidden in alien mode anyway, force dark for the duration and restore
   whatever was saved on exit, rather than trying to retrofit every
   alien rule with its own compensation. */
function forceDarkForAlien(){
  document.documentElement.removeAttribute("data-theme");
}
function restoreThemeAfterAlien(){
  let saved = null;
  try { saved = localStorage.getItem("bc-theme"); } catch (e) { /* storage unavailable */ }
  if (saved !== "dark") document.documentElement.setAttribute("data-theme", "light");
}

/* Alien mode is desktop-only for now — not just because its own entry
   point (the mission log card) is already hidden below 769px like the
   site's other terminal banners, but because someone who unlocked it
   on desktop and later opens/resizes the same browser to mobile width
   should NOT see it there. Every place that would otherwise add the
   class calls this instead of doing it directly, and a resize listener
   keeps it in sync live if the viewport crosses the breakpoint mid-
   session (in either direction) without needing a reload. */
const alienDesktopQuery = window.matchMedia("(min-width:769px)");
function applyAlienModeClass(){
  document.documentElement.classList.toggle("alien-1979-mode", alienDesktopQuery.matches);
}
alienDesktopQuery.addEventListener("change", () => {
  let unlocked = false;
  try { unlocked = localStorage.getItem("bc-alien-1979-mode") === "1"; } catch (e) { /* storage unavailable */ }
  if (unlocked) applyAlienModeClass();
  if (typeof syncAlienTitle === "function") syncAlienTitle();
  if (typeof syncAlienHeroText === "function") syncAlienHeroText();
});

/* The mission log's own title swaps to "MU/TH/UR 6000" only while the
   alien look is active, reverting to the normal title the moment it's
   exited — called from every place that toggles .alien-1979-mode below,
   plus on language switches so a mid-session translation doesn't
   clobber it back to the normal title while still in alien mode. */
function syncAlienTitle(){
  const el = document.getElementById("engineStatusTitle");
  if (!el) return;
  if (document.documentElement.classList.contains("alien-1979-mode")){
    el.textContent = "MU/TH/UR 6000";
  } else {
    let dict = null;
    try { dict = translations[currentLang] || translations.en; } catch (e) { dict = null; }
    el.textContent = (dict && dict.engine_status_title) || "BC-TOOLS_CLASSIFIED_MEMORY: LEAKED";
  }
}
document.addEventListener("bc:langchange", syncAlienTitle);

/* Same swap for the mainpage hero heading + second paragraph — full
   text replacement (not an addition), so this goes through
   .textContent like syncAlienTitle() above rather than a CSS ::after,
   which can only append content, never remove the original string it
   sits next to. */
function syncAlienHeroText(){
  const titleEl = document.querySelector('h1[data-i18n="mp_hero_title"]');
  const p1bEl = document.querySelector('.hero-p1-desktop[data-i18n="mp_hero_p1b"]');
  const alien = document.documentElement.classList.contains("alien-1979-mode");
  let dict = null;
  try { dict = translations[currentLang] || translations.en; } catch (e) { dict = null; }
  if (titleEl){
    titleEl.textContent = alien ? "You have found our Easter Egg!" : ((dict && dict.mp_hero_title) || "Setting a new standard for creators!");
  }
  if (p1bEl){
    p1bEl.textContent = alien ? ((dict && dict.mp_hero_p1_alien) || "> This Easter Egg is only for your devoted users, be sure to share your findings on our discord! Try using our tools with this interface and feel the old school vibes!") : ((dict && dict.mp_hero_p1b) || "A growing collection of browser-based tools for images, video, audio, and code.");
  }
}
document.addEventListener("bc:langchange", syncAlienHeroText);

/* Once earned, the "alien 1979" look applies to every terminal banner
   on every page (About's fake email banner included) — but the click-
   through logic below only runs on the mainpage, where the mission log
   actually lives. Re-applying the class here on every page load keeps
   other pages in the look too, without needing that container. */
(function(){
  try {
    if (localStorage.getItem("bc-alien-1979-mode") === "1" && alienDesktopQuery.matches){
      applyAlienModeClass();
      forceDarkForAlien();
    }
  } catch (e) { /* storage unavailable */ }
  syncAlienTitle();
  syncAlienHeroText();
})();

/* Cookie-gated easter egg: "Anomaly accessed" unlocks once every
   cookie category is accepted (see savePrefs() below). Three clicks
   (each wiggling for feedback) reveals a download line; clicking that
   runs a fake download from 1% to 100%, which permanently switches
   this card into its "alien 1979" retro-green look. Every stage
   persists to localStorage so a returning visitor picks up wherever
   they left off. */
(function(){
  const container = document.getElementById("engineStatusAnomaly");
  if (!container) return;

  const KEY_UNLOCKED = "bc-anomaly-unlocked";
  const KEY_CLICKS = "bc-anomaly-clicks";
  const KEY_STAGE2 = "bc-anomaly-stage2";
  const KEY_ALIEN = "bc-alien-1979-mode";

  function getFlag(key){
    try { return localStorage.getItem(key) === "1"; } catch (e) { return false; }
  }
  function getInt(key){
    try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { return 0; }
  }
  function setItem(key, value){
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function slashWrap(text, count){
    const slashes = "/".repeat(count);
    return slashes + text + slashes;
  }

  function buildAnomalyBtn(){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "engine-status-row engine-status-row-btn";
    btn.id = "anomalyBtn";
    btn.textContent = slashWrap("Anomaly detected", getInt(KEY_CLICKS));
    btn.addEventListener("click", () => {
      const clicks = getInt(KEY_CLICKS);
      if (clicks >= 3) return;
      const next = clicks + 1;
      setItem(KEY_CLICKS, String(next));
      btn.textContent = slashWrap("Anomaly detected", next);
      if (next >= 3 && !getFlag(KEY_STAGE2)){
        setItem(KEY_STAGE2, "1");
        container.appendChild(buildDownloadBtn());
      }
    });
    return btn;
  }

  function buildDownloadBtn(){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "engine-status-row engine-status-row-btn";
    btn.id = "alienDownloadBtn";
    btn.textContent = "///Download Alien_1979_Interface.file///";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      container.appendChild(buildLoadingRow());
    });
    return btn;
  }

  function buildExitBtn(){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "engine-status-row engine-status-row-btn";
    btn.id = "alienExitBtn";
    btn.textContent = "//exit interface//";
    btn.addEventListener("click", () => {
      setItem(KEY_ALIEN, "0");
      document.documentElement.classList.remove("alien-1979-mode");
      restoreThemeAfterAlien();
      syncAlienTitle();
      syncAlienHeroText();
      render();
    });
    return btn;
  }

  function buildLoadingRow(pctStart){
    const row = document.createElement("div");
    row.className = "engine-status-row";
    row.innerHTML = "&gt; ... <span class=\"engine-status-value\" id=\"alienLoadingPct\"></span>";
    const pctEl = row.querySelector("#alienLoadingPct");
    let pct = pctStart || 1;
    pctEl.textContent = pct + "%";
    if (pct >= 100) return row;
    const timer = setInterval(() => {
      pct = Math.min(100, pct + Math.ceil(Math.random() * 8));
      pctEl.textContent = pct + "%";
      if (pct >= 100){
        clearInterval(timer);
        setItem(KEY_ALIEN, "1");
        if (alienDesktopQuery.matches){
          applyAlienModeClass();
          forceDarkForAlien();
        }
        syncAlienTitle();
        syncAlienHeroText();
        container.appendChild(buildExitBtn());
      }
    }, 220);
    return row;
  }

  function render(){
    if (!getFlag(KEY_UNLOCKED)){
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.innerHTML = "";
    container.appendChild(buildAnomalyBtn());
    if (getInt(KEY_CLICKS) >= 3 || getFlag(KEY_STAGE2)){
      container.appendChild(buildDownloadBtn());
    }
    if (getFlag(KEY_ALIEN)){
      const downloadBtn = document.getElementById("alienDownloadBtn");
      if (downloadBtn) downloadBtn.disabled = true;
      container.appendChild(buildLoadingRow(100));
      container.appendChild(buildExitBtn());
      if (alienDesktopQuery.matches){
        applyAlienModeClass();
        forceDarkForAlien();
      }
    } else {
      document.documentElement.classList.remove("alien-1979-mode");
    }
    syncAlienTitle();
    syncAlienHeroText();
  }

  /* Catches visitors who already had "accept all" saved from before
     this feature existed — savePrefs() only unlocks on a fresh save,
     so a returning visitor with old consent needs this checked here too. */
  if (!getFlag(KEY_UNLOCKED)){
    try {
      const raw = localStorage.getItem("bc-cookie-consent");
      const prefs = raw ? JSON.parse(raw) : null;
      if (prefs && prefs.analytics && prefs.advertising) setItem(KEY_UNLOCKED, "1");
    } catch (e) { /* storage unavailable */ }
  }

  render();
  document.addEventListener("bc:anomaly-unlock", render);
})();

/* Mission log's "Launch protocol" easter egg — desktop normal-mode
   only (hidden in alien mode and on mobile via .launch-protocol-
