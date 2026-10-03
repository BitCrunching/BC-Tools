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
   through to, say, Colorfy restored that same deep offset there,
   landing on Colorfy's own "New to picking colors from images?"
   article instead of its top. Namespacing by path keeps this purely a
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
    if (typeof gtag === "function") gtag("event", "nav_click", { destination: gotoEl.dataset.goto });
    const target = bcLangPath(SITE_PATH_MAP[gotoEl.dataset.goto] || "/");
    location.href = target;
    return;
  }
  const golden = e.target.closest(".go-to-golden-rules");
  if (golden){
    e.preventDefault();
    /* Every one of these already carries data-tool (convert/compress/
       combine/exif/context/gif/coudio/codify — the same values
       golden-rules-tool.js's selectGoldenRulesTool() expects), but this
       always ignored it and sent everyone to the page's default
       ("convert") tab regardless of which tool's link was actually
       clicked. Forward it as a query param so golden-rules/index.html
       can open the right tab on load. */
    const tool = golden.dataset.tool;
    location.href = tool ? `/golden-rules/?tool=${encodeURIComponent(tool)}` : "/golden-rules/";
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
    stepEl.textContent = toolName.toUpperCase() + "_GUIDE: " + bcT("STEP") + " " + (index + 1) + "/" + steps.length;
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

/* ===== .bc-canvas-remove-btn — shared title for the "remove the loaded
   file" button on a tool's own single-file canvas (Congify's
   #gifRemoveBtn, Context's #ctRemoveBtn, Colorfy's #cyRemoveBtn,
   Coudio's #cdRemoveBtn) — all four already share .bc-remove-btn for
   their visual, this centralizes their title/tooltip text too so it
   only needs to change in one place. Not applied to every
   .bc-remove-btn (Colorfy's picker/palette color-remove buttons use
   that same visual class for a different job, so they keep their own
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
   for a tool with no file output at all (Colorfy: saving a color to
   the palette is the one thing it actually persists, so that's the
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
   copies of each other; Compress, Coudio, and Codoc each their own,
   different KB/MB threshold and rounding) — the exact kind of duplication
   this file's own header says to promote to shared the moment it shows up
   twice. Threshold is a true 1024KB (1MiB), one decimal on the MB side,
   and a Math.max(1, ...) floor so a very small file reads "1 KB" rather
   than "0 KB". */
function bcFormatFileSize(bytes){
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
   Combine's file rows, Convert/Compress/Coudio's per-file remove,
   Colorfy's saved-color chips, ...) gets this for free with zero
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
  function addLangButton(){
    const nav = document.querySelector(".nav-right");
    if (!nav || nav.querySelector(".nav-lang-btn")) return;
    const current = document.documentElement.lang || "en";
    const other = [...document.querySelectorAll('link[rel="alternate"][hreflang]')]
      .find(l => l.hreflang !== current && l.hreflang !== "x-default");
    if (!other) return;
    const link = document.createElement("a");
    link.className = "nav-theme-btn nav-lang-btn";
    link.href = new URL(other.href, location.href).pathname + location.search;
    link.hreflang = other.hreflang;
    link.textContent = other.hreflang.toUpperCase();
    link.title = other.hreflang === "cs" ? "Česky" : "English";
    link.setAttribute("aria-label", link.title);
    link.addEventListener("click", () => { try { localStorage.setItem("bc-lang", other.hreflang); } catch (e) { /* storage unavailable */ } });
    nav.insertBefore(link, nav.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLangButton);
  else addLangButton();
})();
