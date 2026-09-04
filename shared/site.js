/* shared/site.js — theme toggle, language switch, cookie consent, nav
   share menu, privacy-check helpers, and downloadBlob(), shared by every
   standalone (MPA) page. Ported from index.html's inline scripts — same
   localStorage keys ("bc-theme", "bc-lang", "bc-cookie-consent") so
   choices made here stay in sync with the SPA pages. Load with `defer`
   so the DOM (nav/footer/cookie markup) exists before this runs.

   Not a 1:1 copy of the SPA's version: the Cookies-page "docked" panel
   variant and its mobile-reopen button are dropped (that page still
   lives in the SPA), and only nav/footer/cookie copy is translated here
   — tool-specific copy is written directly in each standalone page's
   markup, in English only for now. */

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
   rather than keeping half-working. */
function bcRestoreScroll(){
  try {
    const y = sessionStorage.getItem("bc-scrollY");
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
  try { sessionStorage.setItem("bc-scrollY", String(window.scrollY)); } catch(e){ /* unavailable */ }
});

/* ===== data-goto -> real navigation (no SPA gotoPage() here) ===== */
const SITE_PATH_MAP = {
  mainpage: "/",
  about: "/about/",
  faq: "/faq/",
  terms: "/terms/",
  privacy: "/privacy/",
  cookies: "/cookies/",
  "golden-rules": "/golden-rules/",
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
    const target = SITE_PATH_MAP[gotoEl.dataset.goto] || "/";
    location.href = target;
    return;
  }
  const golden = e.target.closest(".go-to-golden-rules");
  if (golden){
    e.preventDefault();
    location.href = "/golden-rules/";
  }
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

/* ===== Step-through help banner ===== every tool's dismissible,
   step-numbered terminal-styled intro ("<TOOL>_GUIDE: STEP 1/N") —
   this was hand-copied identically into all 9 tools' own -tool.js
   files (only the element-ID prefix, tool name, and step content ever
   differed); now they all call this instead.

   toolName: lowercase tool name — drives both the localStorage key
   ("bc-help-<toolName>-dismissed") and the uppercase "<TOOLNAME>_GUIDE"
   display text.
   idPrefix: the short prefix each tool's own element IDs use (e.g.
   "cy" for Colorfy's #cyHelpBanner, "gif" for Congify's #gifHelpBanner)
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
    stepEl.textContent = toolName.toUpperCase() + "_GUIDE: STEP " + (index + 1) + "/" + steps.length;
    textEl.textContent = heading + " — " + text;
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
    bcCombos.forEach(c => { if (c !== combo) bcCloseCombo(c); });
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
    bcCloseAllDropdowns();
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

function finishPrivacyCheck(badgeEl){
  privacyCheckActive = false;
  if (!badgeEl) return;
  const dict = translations[currentLang] || translations.en;
  if (privacyCheckExternalCount === 0){
    const label = dict.privacy_check_ok || "download local & private";
    badgeEl.textContent = "> BC_Tools_bot: " + label;
  } else {
    const template = dict.privacy_check_warn || "ATTENTION! - ({count}) privacy breach - {host}";
    const text = template.replace("{count}", privacyCheckExternalCount).replace("{host}", privacyCheckExternalHosts.join(", "));
    badgeEl.textContent = "> " + text;
  }
  badgeEl.classList.add("visible");
}

/* ===== Minimal translations — nav/footer/cookie/share copy only.
   Tool-specific strings live directly in each standalone page's markup. ===== */
const translations = {
  en: {
    nav_lang: "Change language",
    nav_theme: "Toggle light and dark mode",
    nav_share: "Share",
    nav_back: "Back to Creative Hub",
    nav_terminal_dark: "Dark mode set",
    nav_terminal_light: "Light mode set",
    nav_terminal_lang: "Language set to {lang}",
    share_copy: "Copy link / URL",
    share_copied: "URL copied to clipboard",
    share_more: "More options",
    share_email: "Email",
    footer_company_heading: "Serious matters",
    footer_getting_started_heading: "Getting started with",
    footer_contact_heading: "Get in touch with us",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Join our discord</a>",
    nav_about: "Our Universe",
    nav_about_title: "About Us",
    nav_faq: "Already Answered",
    nav_faq_title: "FAQ",
    mp_footer_terms: "Galactic Handbook",
    mp_footer_terms_title: "Terms of Use",
    mp_footer_privacy: "Alien Privacy Protocol",
    mp_footer_privacy_title: "Privacy Policy",
    mp_footer_cookies: "Cookie Registry",
    mp_footer_cookies_title: "Cookie Policy",
    cookie_banner_text: "We use cookies. Choose which categories to allow below — see our <a data-goto=\"cookies\">Cookie Registry</a> for details.",
    cookie_banner_text_docked: "Choose which cookies to allow",
    cookie_banner_text_mobile: "Choose which cookies to allow",
    cookie_cat_necessary: "Necessary (always on)",
    cookie_cat_necessary_detail: "These keep the essentials working — remembering your cookie choice, your language, and your light/dark theme. They can't be turned off, and like everything else on this site, they never leave your device.",
    cookie_cat_analytics: "Analytics (Google Analytics)",
    cookie_cat_analytics_detail: "Lets us see how many people visit and which tools get used, via Google Analytics. This never includes your files or their contents — those never leave your browser, regardless of this setting.",
    cookie_cat_advertising: "Advertising (Google AdSense)",
    cookie_cat_advertising_detail: "Used by Google AdSense to show ads. Currently switched off site-wide while we wait on AdSense approval, so this toggle has no effect yet.",
    cookie_status_allowed: "...allowed",
    cookie_status_disabled: "...disabled",
    cookie_banner_accept_all: "Accept All",
    cookie_banner_disable_all: "Disable all",
    cookie_banner_save: "Confirm choices",
    cookie_banner_saved: "> preferences_saved",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    privacy_check_ok: "download local & private",
    privacy_check_warn: "ATTENTION! - ({count}) privacy breach - {host}"
  },
  cs: {
    nav_lang: "Změnit jazyk",
    nav_theme: "Přepnout světlý a tmavý režim",
    nav_share: "Sdílet",
    nav_back: "Zpět na Creative Hub",
    nav_terminal_dark: "Tmavý režim zapnut",
    nav_terminal_light: "Světlý režim zapnut",
    nav_terminal_lang: "Jazyk nastaven na {lang}",
    share_copy: "Kopírovat odkaz",
    share_copied: "Odkaz zkopírován",
    share_more: "Další možnosti",
    share_email: "E-mail",
    footer_company_heading: "Vážné záležitosti",
    footer_getting_started_heading: "Začínáme s",
    footer_contact_heading: "Ozvěte se nám",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Připojte se k našemu discordu</a>",
    nav_about: "Náš vesmír",
    nav_about_title: "O nás",
    nav_faq: "Máme odpovědi",
    nav_faq_title: "FAQ",
    mp_footer_terms: "Galaktická příručka",
    mp_footer_terms_title: "Podmínky použití",
    mp_footer_privacy: "Mimozemský protokol soukromí",
    mp_footer_privacy_title: "Zásady ochrany osobních údajů",
    mp_footer_cookies: "Registr cookies",
    mp_footer_cookies_title: "Zásady používání cookies",
    cookie_banner_text: "Používáme cookies. Níže si můžete vybrat, které kategorie povolíte — podrobnosti najdete v našem <a data-goto=\"cookies\">Registru cookies</a>.",
    cookie_banner_text_docked: "Vyberte, které cookies povolit",
    cookie_banner_text_mobile: "Vyberte, které cookies povolit",
    cookie_cat_necessary: "Nezbytné (vždy zapnuto)",
    cookie_cat_necessary_detail: "These keep the essentials working — remembering your cookie choice, your language, and your light/dark theme. They can't be turned off, and like everything else on this site, they never leave your device.",
    cookie_cat_analytics: "Analytické (Google Analytics)",
    cookie_cat_analytics_detail: "Lets us see how many people visit and which tools get used, via Google Analytics. This never includes your files or their contents — those never leave your browser, regardless of this setting.",
    cookie_cat_advertising: "Reklamní (Google AdSense)",
    cookie_cat_advertising_detail: "Used by Google AdSense to show ads. Currently switched off site-wide while we wait on AdSense approval, so this toggle has no effect yet.",
    cookie_status_allowed: "...povoleno",
    cookie_status_disabled: "...zakázáno",
    cookie_banner_accept_all: "Přijmout vše",
    cookie_banner_disable_all: "Zakázat vše",
    cookie_banner_save: "Potvrdit volby",
    cookie_banner_saved: "> předvolby_uloženy",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    privacy_check_ok: "stažení lokální a soukromé",
    privacy_check_warn: "POZOR! - ({count}) narušení soukromí - {host}"
  },
  pl: {
    nav_lang: "Zmień język",
    nav_theme: "Przełącz tryb jasny i ciemny",
    nav_share: "Udostępnij",
    nav_back: "Powrót do Creative Hub",
    nav_terminal_dark: "Tryb ciemny włączony",
    nav_terminal_light: "Tryb jasny włączony",
    nav_terminal_lang: "Ustawiono język: {lang}",
    share_copy: "Kopiuj link",
    share_copied: "Link skopiowany",
    share_more: "Więcej opcji",
    share_email: "E-mail",
    footer_company_heading: "Poważne sprawy",
    footer_getting_started_heading: "Pierwsze kroki z",
    footer_contact_heading: "Skontaktuj się z nami",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Dołącz do naszego discorda</a>",
    nav_about: "Nasz wszechświat",
    nav_about_title: "O nas",
    nav_faq: "Mamy odpowiedzi",
    nav_faq_title: "FAQ",
    mp_footer_terms: "Galaktyczny podręcznik",
    mp_footer_terms_title: "Warunki użytkowania",
    mp_footer_privacy: "Kosmiczny protokół prywatności",
    mp_footer_privacy_title: "Polityka prywatności",
    mp_footer_cookies: "Rejestr plików cookie",
    mp_footer_cookies_title: "Polityka plików cookie",
    cookie_banner_text: "Używamy plików cookie. Poniżej możesz wybrać, które kategorie zezwolić — szczegóły znajdziesz w naszym <a data-goto=\"cookies\">Rejestrze plików cookie</a>.",
    cookie_banner_text_docked: "Wybierz, które pliki cookie zezwolić",
    cookie_banner_text_mobile: "Wybierz, które pliki cookie zezwolić",
    cookie_cat_necessary: "Niezbędne (zawsze włączone)",
    cookie_cat_necessary_detail: "These keep the essentials working — remembering your cookie choice, your language, and your light/dark theme. They can't be turned off, and like everything else on this site, they never leave your device.",
    cookie_cat_analytics: "Analityczne (Google Analytics)",
    cookie_cat_analytics_detail: "Lets us see how many people visit and which tools get used, via Google Analytics. This never includes your files or their contents — those never leave your browser, regardless of this setting.",
    cookie_cat_advertising: "Reklamowe (Google AdSense)",
    cookie_cat_advertising_detail: "Used by Google AdSense to show ads. Currently switched off site-wide while we wait on AdSense approval, so this toggle has no effect yet.",
    cookie_status_allowed: "...dozwolone",
    cookie_status_disabled: "...wyłączone",
    cookie_banner_accept_all: "Zaakceptuj wszystkie",
    cookie_banner_disable_all: "Wyłącz wszystkie",
    cookie_banner_save: "Potwierdź wybór",
    cookie_banner_saved: "> preferencje_zapisane",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    privacy_check_ok: "pobieranie lokalne i prywatne",
    privacy_check_warn: "UWAGA! - ({count}) naruszenie prywatności - {host}"
  }
};

let currentLang = "en";

function applyLanguage(lang){
  const dict = translations[lang] || translations.en;
  currentLang = translations[lang] ? lang : "en";

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.innerHTML = dict[key];
  });

  document.querySelectorAll("[data-i18n-label]").forEach(el => {
    const key = el.dataset.i18nLabel;
    if (dict[key] !== undefined){
      el.setAttribute("aria-label", dict[key]);
      el.setAttribute("title", dict[key]);
    }
  });

  document.documentElement.lang = currentLang;

  document.querySelectorAll("#navLangMenu button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });

  try { localStorage.setItem("bc-lang", currentLang); } catch (e) { /* storage unavailable */ }

  document.dispatchEvent(new CustomEvent("bc:langchange"));
}

/* ===== Central nav confirmation display ===== */
function showNavTerminal(text){
  const el = document.getElementById("navTerminal");
  const textEl = document.getElementById("navTerminalText");
  if (!el || !textEl) return;
  textEl.textContent = text;
  el.classList.add("show");
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ===== LIGHT/DARK THEME TOGGLE ===== */
(function(){
  const themeBtn = document.getElementById("navThemeBtn");
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

  if (themeBtn){
    themeBtn.addEventListener("click", () => {
      const isLight = root.getAttribute("data-theme") === "light";
      const next = isLight ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem("bc-theme", next); } catch (e) { /* storage unavailable */ }
      const dict = translations[currentLang] || translations.en;
      showNavTerminal(next === "dark" ? dict.nav_terminal_dark : dict.nav_terminal_light);
    });
  }
})();

/* ===== LANGUAGE SWITCHER ===== */
(function(){
  let savedLang = null;
  try { savedLang = localStorage.getItem("bc-lang"); } catch (e) { /* storage unavailable */ }
  applyLanguage(savedLang && translations[savedLang] ? savedLang : "en");

  const langBtn = document.getElementById("navLangBtn");
  const langMenu = document.getElementById("navLangMenu");
  if (langBtn && langMenu){
    langBtn.addEventListener("click", () => {
      langMenu.classList.toggle("open");
    });
    langMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-lang]");
      if (!btn || !translations[btn.dataset.lang]) return;
      applyLanguage(btn.dataset.lang);
      langMenu.classList.remove("open");
      const dict = translations[btn.dataset.lang] || translations.en;
      const template = dict.nav_terminal_lang || translations.en.nav_terminal_lang;
      showNavTerminal(template.replace("{lang}", btn.textContent));
    });
    document.addEventListener("click", (e) => {
      if (!langBtn.contains(e.target) && !langMenu.contains(e.target)){
        langMenu.classList.remove("open");
      }
    });
  }
})();

/* ===== NAV SHARE BUTTON ===== */
(function(){
  const shareBtn = document.getElementById("navShareBtn");
  const shareMenu = document.getElementById("navShareMenu");

  if (shareBtn && shareMenu){
    shareBtn.addEventListener("click", async () => {
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
      shareMenu.classList.toggle("open");
    });

    const shareMoreToggle = document.getElementById("navShareMoreToggle");
    const shareMoreList = document.getElementById("navShareMoreList");
    if (shareMoreToggle && shareMoreList){
      shareMoreToggle.addEventListener("click", () => {
        const willOpen = shareMoreList.hidden;
        shareMoreList.hidden = !willOpen;
        shareMoreToggle.setAttribute("aria-expanded", String(willOpen));
      });
    }

    shareMenu.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-share]");
      if (!btn) return;
      const pageUrl = encodeURIComponent(window.location.href);
      const pageText = encodeURIComponent("Try BC Tools for working with images.");

      if (btn.dataset.share === "copy"){
        try {
          await navigator.clipboard.writeText(window.location.href);
          const dict = translations[currentLang] || translations.en;
          showNavTerminal(dict.share_copied);
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

  if (dockToggle){
    dockToggle.addEventListener("click", () => {
      const revealed = banner.classList.toggle("dock-revealed");
      dockToggle.setAttribute("aria-expanded", String(revealed));
    });
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
    if (isDocked){
      /* Recap panel stays visible on the page — just collapse it back
         to the title bar instead of hiding it like a dismissed prompt. */
      banner.classList.remove("dock-revealed");
      if (dockToggle) dockToggle.setAttribute("aria-expanded", "false");
    } else {
      banner.hidden = true;
    }
    syncDockPlacement();
  }

  const analyticsStatus = document.getElementById("cookieStatusAnalytics");
  const advertisingStatus = document.getElementById("cookieStatusAdvertising");

  function statusText(allowed){
    const dict = translations[currentLang] || translations.en;
    const key = allowed ? "cookie_status_allowed" : "cookie_status_disabled";
    const fallback = allowed ? "...allowed" : "...disabled";
    return dict[key] || fallback;
  }

  function renderActionButton(){
    const allOn = analyticsToggle.checked && advertisingToggle.checked;
    const dict = translations[currentLang] || translations.en;
    const key = allOn ? "cookie_banner_disable_all" : "cookie_banner_accept_all";
    const fallback = allOn ? "Disable all" : "Accept All";
    acceptAllBtn.textContent = dict[key] || fallback;
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

  document.addEventListener("bc:langchange", renderStatuses);

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
