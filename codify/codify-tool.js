/* Codify — code-to-screenshot generator (MVP). Textarea for input, a
   separate Prism-highlighted preview beside/below it that re-renders on
   every keystroke, and PNG export via html-to-image snapshotting the
   live preview DOM (gradient, window chrome, dots, code — whatever's
   actually on screen is what gets exported). */
(function(){
  const codeInput = document.getElementById("cfCodeInput");
  const codeOutput = document.getElementById("cfCodeOutput");
  const afterInput = document.getElementById("cfAfterInput");
  const previewWrap = document.getElementById("cfPreviewWrap");
  const cfWindow = document.getElementById("cfWindow");
  const themeLink = document.getElementById("cfThemeLink");
  const downloadBtn = document.getElementById("cfDownloadBtn");
  const statusEl = document.getElementById("cfStatus");
  const pasteBtn = document.getElementById("cfPasteBtn");
  const bgColorInput = document.getElementById("cfBgColorInput");
  const bgColorSwatch = document.getElementById("cfBgColorSwatch");
  const fileNameInput = document.getElementById("cfFileNameInput");
  const removeBtn = document.getElementById("cfRemoveBtn");
  const formatPngBtn = document.getElementById("cfFormatPngBtn");
  const formatSvgBtn = document.getElementById("cfFormatSvgBtn");

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("codify", "cf", [
    ["WELCOME_TO_CODIFY", "Paste or type your code on the left — the styled screenshot on the right updates live as you type."],
    ["PICK_A_LANGUAGE", "Codify highlights JavaScript, Python, Rust, and a dozen more — pick yours from the Language dropdown, or just start typing and it'll still render."],
    ["TRY_A_THEME_OR_TEMPLATE", "Switch between Dracula, VS Code Dark, Monokai, and GitHub Light from Theme — or pick a ready-made snippet from Template to see it in action."],
    ["YOU_ARE_SET", "Hit Download PNG to save the screenshot. Close this with the red dot and we won't show it again."]
  ]);

  const themeInput = document.getElementById("cfThemeInput");
  const themeTrigger = document.getElementById("cfThemeTrigger");
  const themeMenu = document.getElementById("cfThemeMenu");
  const themeEmpty = document.getElementById("cfThemeEmpty");

  const languageInput = document.getElementById("cfLanguageInput");
  const languageTrigger = document.getElementById("cfLanguageTrigger");
  const languageMenu = document.getElementById("cfLanguageMenu");
  const languageEmpty = document.getElementById("cfLanguageEmpty");

  const templateInput = document.getElementById("cfTemplateInput");
  const templateTrigger = document.getElementById("cfTemplateTrigger");
  const templateMenu = document.getElementById("cfTemplateMenu");
  const templateEmpty = document.getElementById("cfTemplateEmpty");

  const styleInput = document.getElementById("cfStyleInput");
  const styleTrigger = document.getElementById("cfStyleTrigger");
  const styleMenu = document.getElementById("cfStyleMenu");
  const styleEmpty = document.getElementById("cfStyleEmpty");

  /* Every template is deliberately exactly 10 lines (see the line-count
     assertion right below) — picking a different one from the preview's
     own left-half click-through (codify-tool.js, further down) shouldn't
     make the box visibly jump in height each time, the way the old
     4-to-18-line spread did. Trimmed or padded with a genuinely relevant
     extra line (another call, another chain step) rather than blank
     filler, so each still reads as a real, complete example. */
  const TEMPLATES = {
    hello: `function greet(name) {
  return \`Hello, \${name}!\`;
}

const audience = ["world", "Codify", "friend"];

audience.forEach(name => {
  console.log(greet(name));
});
console.log("done");`,
    fibonacci: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

for (let i = 0; i < 8; i++) {
  console.log(fibonacci(i));
}

console.log("done");`,
    fetch: `async function getUser(id) {
  const res = await fetch(\`/api/users/\${id}\`);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

getUser(42)
  .then(user => console.log(user))
  .catch(err => console.error(err))
  .finally(() => console.log("done"));`,
    class: `class Counter {
  #count = 0;

  increment() {
    this.#count += 1;
    return this.#count;
  }
}

console.log(new Counter().increment());`,
    sort: `function bubbleSort(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    for (let j = 0; j < arr.length - 1 - i; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}`,
    binarySearch: `function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
    debounce: `function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const onResize = debounce(() => console.log("resized"), 200);
window.addEventListener("resize", onResize);`,
    promise: `function loadUserFeed(id) {
  return fetchUser(id)
    .then(user => fetchPosts(user.id))
    .then(posts => posts.filter(p => p.published))
    .then(posts => posts.map(p => p.title))
    .catch(err => console.error("Failed:", err))
    .finally(() => console.log("done"));
}

loadUserFeed(42);`,
    array: `const users = [
  { name: "Ada", age: 28 },
  { name: "Grace", age: 34 },
  { name: "Linus", age: 40 }
];

const names = users
  .filter(u => u.age > 30)
  .map(u => u.name)
  .join(", ");`,
    linkedList: `class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

const a = new Node(1);
a.next = new Node(2);
console.log(a.next.value);`
  };

  /* Shown in the preview window (styled with .cf-ghost — dimmed,
     unselectable) whenever the editor is empty, so the window never
     renders as a blank rectangle. Not one of the real TEMPLATES —
     picking a template or typing anything real replaces it immediately
     via renderPreview(), same as the textarea's own placeholder. */
  const GHOST_CODE = `function example() {
  return "your code here";
}`;

  let currentLang = "javascript";

  /* ===== .bc-combo — shared searchable dropdown (see shared/site.css
     for the markup contract). One instance per dropdown: opening it
     focuses the input and reveals every option; typing filters the
     visible options by a case-insensitive substring match against
     data-label; picking an option (click or Enter) sets the input back
     to its label and closes the menu; Escape reverts the input to the
     active option's label and closes without changing the selection. */
  /* registerCombo/setComboDisplay are now shared/site.js's
     bcRegisterCombo/bcSetComboDisplay — kept as local aliases so the
     rest of this file (and its inline comments below) didn't need
     touching beyond this line. */
  const registerCombo = bcRegisterCombo;
  const setComboDisplay = bcSetComboDisplay;

  registerCombo(themeTrigger, themeInput, themeMenu, themeEmpty, (opt) => {
    themeLink.href = opt.dataset.href;
    cfWindow.dataset.theme = opt.dataset.theme;
    /* Picking a theme by hand while a style preset is active means the
       user is now customizing it — fall back to "Custom" rather than
       showing a preset name next to a theme that preset didn't choose. */
    if (currentStyle !== "custom"){
      currentStyle = "custom";
      setComboDisplay(styleMenu, styleInput, "style", "custom");
    }
  });

  registerCombo(languageTrigger, languageInput, languageMenu, languageEmpty, (opt) => {
    currentLang = opt.dataset.lang;
    renderPreview();
  });

  registerCombo(templateTrigger, templateInput, templateMenu, templateEmpty, (opt) => {
    const code = TEMPLATES[opt.dataset.template];
    if (code == null) return;
    codeInput.value = code;
    markStarted();
    autoFitCodeInput();
    renderPreview();
    schedulePersist();
  });

  /* ===== Style presets ===== bundle a theme + a gradient backdrop +
     generous padding into one pick, matching the "signature look"
     treatment popular code-screenshot tools ship (Carbon, Ray.so, etc).
     Window controls and the drop shadow are already always-on (see
     .cf-titlebar / .cf-window box-shadow), so a preset only needs to
     touch theme/background/padding. "Presets" (data-style="custom") hands
     control back to the Theme and Background pills — same internal key
     as before, just relabeled since it reads as the dropdown's own
     neutral default rather than an active "you're customizing" choice. */
  const STYLE_PRESETS = {
    pinkSunset: {
      theme: "onedark",
      themeHref: "/vendor/prism-onedark.css",
      background: "linear-gradient(135deg, #ff6ec4 0%, #a855f7 55%, #7c3aed 100%)",
      padding: "48px"
    },
    nordDark: {
      theme: "onedark",
      themeHref: "/vendor/prism-onedark.css",
      background: "linear-gradient(135deg, #2e3440 0%, #3b4252 50%, #4c566a 100%)",
      padding: "48px"
    },
    oceanBreeze: {
      theme: "vscdark",
      themeHref: "/vendor/prism-vscdark.css",
      background: "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 50%, #0891b2 100%)",
      padding: "48px"
    },
    forestGreen: {
      theme: "okaidia",
      themeHref: "/vendor/prism-okaidia.css",
      background: "linear-gradient(135deg, #14532d 0%, #15803d 50%, #4ade80 100%)",
      padding: "48px"
    },
    midnightPurple: {
      theme: "dracula",
      themeHref: "/vendor/prism-dracula.css",
      background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
      padding: "48px"
    },
    cottonCandy: {
      theme: "ghlight",
      themeHref: "/vendor/prism-ghlight.css",
      background: "linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)",
      padding: "48px"
    }
  };
  let currentStyle = "custom";

  function applyStyle(styleKey){
    currentStyle = styleKey;
    if (styleKey === "custom"){
      previewWrap.style.background = bgColorInput.value;
      previewWrap.style.padding = "";
      return;
    }
    const preset = STYLE_PRESETS[styleKey];
    if (!preset) return;
    themeLink.href = preset.themeHref;
    cfWindow.dataset.theme = preset.theme;
    setComboDisplay(themeMenu, themeInput, "theme", preset.theme);
    previewWrap.style.background = preset.background;
    previewWrap.style.padding = preset.padding;
    bgColorSwatch.style.background = preset.background;
  }

  registerCombo(styleTrigger, styleInput, styleMenu, styleEmpty, (opt) => {
    applyStyle(opt.dataset.style);
  });

  /* ===== Traffic lights on/off ===== */
  const trafficLightsToggle = document.getElementById("cfTrafficLightsToggle");
  if (trafficLightsToggle){
    trafficLightsToggle.addEventListener("change", () => {
      cfWindow.classList.toggle("cf-hide-titlebar", !trafficLightsToggle.checked);
    });
  }

  /* ===== Shadow on/off ===== */
  const shadowToggle = document.getElementById("cfShadowToggle");
  if (shadowToggle){
    shadowToggle.addEventListener("change", () => {
      cfWindow.classList.toggle("cf-no-shadow", !shadowToggle.checked);
    });
  }

  /* ===== Preview click-through (prototype) =====
     The whole preview splits into a left half / right half click zone
     — left cycles to the next Template ("Hello world" etc, the code
     itself), right cycles to the next Theme ("Dracula" etc, the
     window's color scheme) — rather than only reachable through the
     labeled pills above. Both pills stay as the primary, discoverable
     controls; this is a shortcut layered on top, not a replacement.
     Cycles straight to the next option instead of opening the dropdown
     menu — a click on the preview is a "change it" gesture, not a
     "show me the list" one, so this skips the extra step of then
     having to pick from a menu that popped up somewhere else on screen.
     The traffic lights aren't a separate click zone of their own — they
     fall under whichever half they happen to sit in (the left one),
     same as any other pixel of the preview; turning them off is the
     switch's job alone. */
  function cycleComboOption(menu){
    const options = [...menu.querySelectorAll(".bc-combo-option")];
    if (options.length === 0) return;
    const activeIndex = options.findIndex(o => o.classList.contains("active"));
    const next = options[(activeIndex + 1) % options.length];
    /* A real click, not a direct call to onSelect — .bc-combo-option's
       click is handled by a listener delegated on the menu itself
       (shared/site.js's bcRegisterCombo), and dispatching it this way
       works whether or not the menu is actually open/visible, so the
       menu never has to open at all for this to take effect. */
    next.click();
  }
  /* The window (code + chrome) and the backdrop around it are two
     genuinely different things to click on — the window's own left/
     right-half cycling above, the backdrop below for its color — so
     both handlers gate on e.target === previewWrap: a click lands there
     directly only when it hits the bare padding ring, not when it
     bubbles up from something inside .cf-window. */
  const BG_SWATCHES = ["#E5E7EB", "#7C3AED", "#2563EB", "#22C55E", "#F97316", "#1E1E1E"];
  function pickBgColor(hex){
    /* Sets the real <input type=color> and fires its own "input" event
       rather than duplicating applyBgColor/localStorage/reset-to-custom
       logic here — that listener already does exactly what a swatch
       pick should trigger. */
    bgColorInput.value = hex;
    bgColorInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function cycleBgColor(){
    /* No menu, no choosing — same "click = change it" gesture as the
       window's own left/right halves, just cycling the 6 presets
       directly instead of opening anything. Finds the current color's
       position in the list (falling back to -1, i.e. "start from the
       first preset") rather than tracking a separate index, so this
       stays in sync even if the color was last set some other way
       (the Background pill's own picker, a restored session, etc). */
    const current = bgColorInput.value.toUpperCase();
    const currentIndex = BG_SWATCHES.indexOf(current);
    const next = BG_SWATCHES[(currentIndex + 1) % BG_SWATCHES.length];
    pickBgColor(next);
  }

  /* A "double-click" here means two clicks under 100ms apart — much
     tighter than the browser's own native dblclick threshold (which
     runs 300-500ms depending on OS/browser, tuned for double-clicking
     small icons, not this). Tracked by hand off each click's own
     timestamp instead of listening for "dblclick" at all, so the two
     definitions don't fight each other or leave a dead zone between
     them. */
  const BG_DOUBLE_CLICK_MS = 200;
  if (previewWrap && templateMenu && themeMenu && bgColorInput){
    /* Cycles the instant the click happens — no held-back timer waiting
       to see if a second click follows, which used to add a visible
       delay to every single click (the common case) just to leave room
       for the rare double-click. Resolved the other way around instead:
       a second click landing inside the 100ms window just undoes the
       first click's color change (back to whatever it was a moment ago)
       before opening the full picker — a one-frame revert nobody
       notices, in exchange for a single click that's genuinely
       instant. */
    let bgColorBeforeClick = null;
    let lastBgClickTime = 0;
    previewWrap.addEventListener("click", (e) => {
      if (e.target === previewWrap){
        const now = performance.now();
        if (now - lastBgClickTime < BG_DOUBLE_CLICK_MS){
          if (bgColorBeforeClick !== null) pickBgColor(bgColorBeforeClick);
          bgColorInput.click();
          lastBgClickTime = 0;
          return;
        }
        lastBgClickTime = now;
        bgColorBeforeClick = bgColorInput.value;
        cycleBgColor();
        return;
      }
      const rect = previewWrap.getBoundingClientRect();
      const clickedLeftHalf = (e.clientX - rect.left) < rect.width / 2;
      cycleComboOption(clickedLeftHalf ? templateMenu : themeMenu);
    });
  }

  /* ===== Hover inspector overlay =====
     Same three zones the click handler above already recognizes
     (background / left half / right half), just drawn as a DevTools-
     style highlight on hover instead of only reacting on click — lets
     someone see what a click would do before committing to it. Recomputes
     real getBoundingClientRect() coordinates on every mousemove rather
     than tracking zone boundaries separately, so it can never drift out
     of sync with the actual click logic above (resizes, scrolls, and
     zoom all just fall out of that for free). */
  const hoverOverlay = document.getElementById("cfHoverOverlay");
  const hoverRect = document.getElementById("cfHoverRect");
  const hoverLabel = document.getElementById("cfHoverLabel");
  const hoverBands = hoverOverlay ? {
    top: hoverOverlay.querySelector('[data-band="top"]'),
    bottom: hoverOverlay.querySelector('[data-band="bottom"]'),
    left: hoverOverlay.querySelector('[data-band="left"]'),
    right: hoverOverlay.querySelector('[data-band="right"]')
  } : null;
  function positionBox(el, x, y, w, h){
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = Math.max(0, w) + "px";
    el.style.height = Math.max(0, h) + "px";
  }
  function positionLabel(x, y, text){
    hoverLabel.textContent = text;
    /* Sits just above the highlighted zone; flips below it near the top
       of the viewport so it never renders off-screen, same rule
       DevTools' own tag uses. Clamped horizontally too — the "Right
       half" zone's label starts at the preview's own midpoint, which on
       a narrow viewport can sit close enough to the edge that a longer
       label (its width not known until the browser lays it out) would
       otherwise run off-screen. */
    const labelHeight = 26;
    hoverLabel.style.top = (y - labelHeight >= 0 ? y - labelHeight : y) + "px";
    hoverLabel.style.left = x + "px";
    const labelRect = hoverLabel.getBoundingClientRect();
    if (labelRect.right > window.innerWidth){
      hoverLabel.style.left = Math.max(0, x - (labelRect.right - window.innerWidth)) + "px";
    }
  }
  /* "HOD" (Hover Overlay Display) toggle — turns the whole inspector
     layer above off, for anyone who finds it more distracting than
     helpful once they already know the three zones. */
  const hodToggle = document.getElementById("cfHodToggle");
  if (previewWrap && cfWindow && hoverOverlay && hoverRect && hoverLabel && hoverBands){
    previewWrap.addEventListener("mousemove", (e) => {
      if (hodToggle && !hodToggle.checked){
        hoverOverlay.hidden = true;
        return;
      }
      const wrapRect = previewWrap.getBoundingClientRect();
      const winRect = cfWindow.getBoundingClientRect();
      hoverOverlay.hidden = false;
      if (e.target === previewWrap){
        /* The ring around the window — four bands rather than one box
           covering the whole wrap, so the highlight doesn't paint over
           the window itself while you're hovering its backdrop. */
        hoverRect.style.width = "0px";
        hoverRect.style.height = "0px";
        positionBox(hoverBands.top, wrapRect.left, wrapRect.top, wrapRect.width, winRect.top - wrapRect.top);
        positionBox(hoverBands.bottom, wrapRect.left, winRect.bottom, wrapRect.width, wrapRect.bottom - winRect.bottom);
        positionBox(hoverBands.left, wrapRect.left, winRect.top, winRect.left - wrapRect.left, winRect.height);
        positionBox(hoverBands.right, winRect.right, winRect.top, wrapRect.right - winRect.right, winRect.height);
        positionLabel(wrapRect.left, wrapRect.top, "Background — click to change color");
        return;
      }
      Object.values(hoverBands).forEach(band => { band.style.width = "0px"; band.style.height = "0px"; });
      const hoveredLeftHalf = (e.clientX - wrapRect.left) < wrapRect.width / 2;
      if (hoveredLeftHalf){
        positionBox(hoverRect, winRect.left, winRect.top, winRect.width / 2, winRect.height);
        positionLabel(winRect.left, winRect.top, "Left half — click to change template");
      } else {
        positionBox(hoverRect, winRect.left + winRect.width / 2, winRect.top, winRect.width / 2, winRect.height);
        positionLabel(winRect.left + winRect.width / 2, winRect.top, "Right half — click to change theme");
      }
    });
    previewWrap.addEventListener("mouseleave", () => {
      hoverOverlay.hidden = true;
    });
    if (hodToggle){
      hodToggle.addEventListener("change", () => {
        if (!hodToggle.checked) hoverOverlay.hidden = true;
      });
    }
  }

  /* ===== "started" state — sticky once reached =====
     The pickers/preview/download section reveals the first time
     there's real code in the editor, and then stays revealed even if
     that's later deleted back down to empty — clearing the box while
     experimenting shouldn't dump you back to the pre-typing empty
     state. */
  function markStarted(){
    if (codeInput.value.length > 0){
      afterInput.classList.add("cf-started");
      if (removeBtn) removeBtn.hidden = false;
    }
  }

  /* ===== "Remove all" reset — clears the editor and returns to the
     pre-typing intro state. Mirrors Convert/Coudio/Cleanly/Combine's
     own remove-all button, adapted for Codify's own state shape (no
     loaded files — just the code text, plus the language/traffic-lights/
     filename settings that only make sense alongside real code). Theme,
     style preset, and background color are left as-is on purpose —
     those are screenshot-look preferences that outlive any one snippet
     (Background is even saved to localStorage across visits), not
     content tied to what's currently typed. */
  function resetTool(){
    codeInput.value = "";
    afterInput.classList.remove("cf-started");
    if (removeBtn) removeBtn.hidden = true;
    currentLang = "javascript";
    setComboDisplay(languageMenu, languageInput, "lang", "javascript");
    fileNameInput.value = "codify-snippet";
    if (trafficLightsToggle){
      trafficLightsToggle.checked = true;
      cfWindow.classList.remove("cf-hide-titlebar");
    }
    if (shadowToggle){
      shadowToggle.checked = true;
      cfWindow.classList.remove("cf-no-shadow");
    }
    if (continueBtn) continueBtn.hidden = true;
    if (formatPngBtn && formatSvgBtn) setExportFormat("png");
    autoFitCodeInput();
    renderPreview();
    bcDbClear(CF_DB_NAME, CF_DB_STORE);
  }
  if (removeBtn) removeBtn.addEventListener("click", resetTool);

  /* ===== editor height: auto-fits to content, drag handle overrides ===
     Typing/pasting/picking a template grows or shrinks the box to fit
     what's actually in it (like a chat input, not a fixed textarea) —
     no more scrolling inside a half-empty or too-small box by default.
     The handle is still there for a manual override on top of that
     (pre-allocate room before pasting, or just pin a size you like);
     the next keystroke re-fits from scratch, so a manual size is a
     one-off nudge, not a sticky preference. */
  const CODE_INPUT_MIN_HEIGHT = 80;
  const CODE_INPUT_MAX_HEIGHT = () => Math.round(window.innerHeight * 0.8);
  function autoFitCodeInput(){
    codeInput.style.height = "auto";
    const target = Math.min(CODE_INPUT_MAX_HEIGHT(), Math.max(CODE_INPUT_MIN_HEIGHT, codeInput.scrollHeight));
    codeInput.style.height = target + "px";
  }

  /* ===== live highlight ===== */
  function renderPreview(){
    const isEmpty = codeInput.value.length === 0;
    codeOutput.className = "language-" + currentLang;
    codeOutput.classList.toggle("cf-ghost", isEmpty);
    codeOutput.textContent = isEmpty ? GHOST_CODE : codeInput.value;
    if (window.Prism) Prism.highlightElement(codeOutput);
  }
  codeInput.addEventListener("input", () => {
    markStarted();
    autoFitCodeInput();
    renderPreview();
    schedulePersist();
    /* The user is now editing by hand — "Continue where you left off"
       no longer applies to whatever's in the box (it may not even be
       the saved session anymore), so hide it the moment real typing
       happens rather than leaving it sitting there stale until the
       next reload. */
    if (continueBtn) continueBtn.hidden = true;
  });

  /* Starts empty on purpose — the rest of the tool (pickers, live
     preview, download) is hidden via CSS until :placeholder-shown
     stops matching, so there's nothing to render until then. */
  renderPreview();

  /* ===== "Continue where you left off" persistence =====
     Same shared IndexedDB pattern every other tool uses
     (bcDbPut/bcDbGet/bcDbClear from shared/site.js) — Codify never grew
     one, so typed/pasted code was lost on refresh with no way back.
     Persists the code text plus the picked language, so restoring
     doesn't silently fall back to JavaScript highlighting for a
     snippet written in something else. */
  const CF_DB_NAME = "bctools-codify";
  const CF_DB_STORE = "session";
  const continueBtn = document.getElementById("cfContinueBtn");

  let persistTimer = null;
  function schedulePersist(){
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }

  async function persistNow(){
    if (codeInput.value.length === 0){
      bcDbClear(CF_DB_NAME, CF_DB_STORE);
      return;
    }
    await bcDbPut(CF_DB_NAME, CF_DB_STORE, { code: codeInput.value, lang: currentLang, fileName: fileNameInput.value });
  }
  fileNameInput.addEventListener("input", schedulePersist);

  /* The 400ms debounce means a reload/tab-close within that window loses
     whatever hasn't been written yet — flushing immediately on the tab
     actually going away (not just "input" stopping) closes that gap
     without making every keystroke pay for a synchronous write. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden"){
      clearTimeout(persistTimer);
      persistNow();
    }
  });

  (async () => {
    const saved = await bcDbGet(CF_DB_NAME, CF_DB_STORE);
    /* Signals shared/site.js's scroll restore that this async check (and
       the "Continue where you left off" button it may just have revealed
       — a real, measurable layout-height change) is done, so it can
       re-apply the remembered scroll position one more time instead of
       leaving it wherever it landed before this resolved. Dispatched
       unconditionally, before the early returns below, so it always
       fires exactly once regardless of which branch runs. Same pattern
       as Convert/Compress/Combine/Cleanly's own restore IIFEs. */
    document.dispatchEvent(new Event("bc:session-check-done"));
    if (saved && saved.code){
      if (codeInput.value.length) return;
      continueBtn.hidden = false;
      continueBtn.addEventListener("click", () => {
        continueBtn.hidden = true;
        codeInput.value = saved.code;
        if (saved.lang){
          currentLang = saved.lang;
          setComboDisplay(languageMenu, languageInput, "lang", saved.lang);
        }
        if (saved.fileName) fileNameInput.value = saved.fileName;
        markStarted();
        autoFitCodeInput();
        renderPreview();
      });
      return;
    }
    /* No saved session — a genuinely first-time visitor. Pre-fill the
       Hello world template (already the default active Template/Theme/
       Language/Traffic-lights everywhere else on the page) so the tool
       opens showing a real screenshot instead of an empty box, rather
       than making that first impression wait on someone picking a
       template themselves. Never overwrites real typed content — only
       runs while the editor is still genuinely empty. */
    if (codeInput.value.length === 0){
      codeInput.value = TEMPLATES.hello;
      markStarted();
      autoFitCodeInput();
      renderPreview();
    }
  })();

  /* Mobile-only (see .cf-paste-btn CSS). Reads the clipboard straight
     into the field and runs the same steps the "input" listener above
     would for real typing, since setting .value programmatically
     doesn't fire one. */
  if (pasteBtn){
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text){
          codeInput.value = text;
          markStarted();
          autoFitCodeInput();
          renderPreview();
          schedulePersist();
          if (continueBtn) continueBtn.hidden = true;
        }
      } catch (err){
        /* clipboard read denied/unsupported — fall through to focus */
      }
      codeInput.focus();
    });
  }

  /* ===== PNG/SVG format toggle =====
     PNG by default. Swaps the Download button's own label too, so it
     always reads as exactly what clicking it will produce rather than
     a generic "Download" that only makes sense next to the toggle. */
  let exportFormat = "png";
  function setExportFormat(fmt){
    exportFormat = fmt;
    formatPngBtn.setAttribute("aria-pressed", String(fmt === "png"));
    formatSvgBtn.setAttribute("aria-pressed", String(fmt === "svg"));
    downloadBtn.textContent = fmt === "png" ? "Download PNG" : "Download SVG";
  }
  if (formatPngBtn && formatSvgBtn){
    formatPngBtn.addEventListener("click", () => setExportFormat("png"));
    formatSvgBtn.addEventListener("click", () => setExportFormat("svg"));
  }

  function escapeXml(str){
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ===== True vector SVG export =====
     Not a snapshot-wrapped-in-SVG-tags trick (the kind html-to-image's
     own toSvg() produces, embedding the live HTML/CSS in a
     <foreignObject>) — every piece here is a real SVG primitive: <rect>
     for the backdrop/window/titlebar, <circle> for the traffic lights,
     a real <linearGradient> for a gradient backdrop, and <tspan> runs
     for the code text, one per Prism-highlighted token with its own
     fill color read straight off the live, rendered DOM. The result is
     genuinely resolution-independent and has real, selectable/
     recolorable text if opened in a vector editor — trade-off is it
     depends on the *viewer's* fonts for the code text (same as any SVG
     text), unlike the PNG export which bakes in whatever font rendered
     here at export time. Reads every color/position straight from
     getBoundingClientRect()/getComputedStyle() on the live preview
     rather than re-deriving them from CSS source, so it can never drift
     out of sync with whatever's actually on screen (a new theme, a
     custom background, Mac nav / Shadow toggled off — all just fall
     out of that for free). */
  function buildCodeLines(){
    const lines = [[]];
    function walk(node, color){
      if (node.nodeType === Node.TEXT_NODE){
        const parts = node.textContent.split("\n");
        parts.forEach((part, i) => {
          if (i > 0) lines.push([]);
          if (part.length) lines[lines.length - 1].push({ text: part, color });
        });
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE){
        const ownColor = getComputedStyle(node).color;
        node.childNodes.forEach(child => walk(child, ownColor));
      }
    }
    const baseColor = getComputedStyle(codeOutput).color;
    codeOutput.childNodes.forEach(node => walk(node, baseColor));
    return lines;
  }

  function buildSvgString(){
    const wrapRect = previewWrap.getBoundingClientRect();
    const winRect = cfWindow.getBoundingClientRect();
    const preEl = cfWindow.querySelector("pre");
    const codeRect = codeOutput.getBoundingClientRect();
    const titlebarEl = cfWindow.querySelector(".cf-titlebar");
    const titlebarVisible = !cfWindow.classList.contains("cf-hide-titlebar");
    const shadowVisible = !cfWindow.classList.contains("cf-no-shadow");

    const W = Math.round(wrapRect.width);
    const H = Math.round(wrapRect.height);
    const winX = winRect.left - wrapRect.left;
    const winY = winRect.top - wrapRect.top;
    const winW = winRect.width;
    const winH = winRect.height;

    /* Background — every gradient this tool ever generates (the Style
       presets) is a plain "linear-gradient(135deg, c1 x%, c2 y%, ...)",
       so rather than a general CSS-angle-to-SVG-vector formula, this
       just recognizes that one exact shape (135deg = corner-to-corner,
       x1/y1 0%,0% to x2/y2 100%,100%) and falls back to a flat fill —
       covers a plain hex/rgb Background color and any future angle.
       The angle is actually checked (not just captured and ignored) —
       a future preset at some other angle would otherwise silently
       render corner-to-corner regardless of what it actually asked for. */
    const bgValue = (previewWrap.style.background || getComputedStyle(previewWrap).backgroundColor).trim();
    const gradientMatch = /^linear-gradient\(\s*135deg\s*,(.+)\)$/i.exec(bgValue);
    let bgFill, defs = "";
    if (gradientMatch){
      const stops = gradientMatch[1].split(",").map(s => s.trim()).map(stop => {
        const [, color, offset] = /^(\S+)\s+([\d.]+%)$/.exec(stop) || [, stop, null];
        return { color, offset };
      });
      const stopEls = stops.map((s, i) => {
        const offset = s.offset || (i / Math.max(1, stops.length - 1) * 100 + "%");
        return `<stop offset="${offset}" stop-color="${s.color}"/>`;
      }).join("");
      defs += `<linearGradient id="cfBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">${stopEls}</linearGradient>`;
      bgFill = "url(#cfBgGrad)";
    } else {
      bgFill = bgValue;
    }

    const winBg = getComputedStyle(cfWindow).backgroundColor;

    if (shadowVisible){
      defs += `<filter id="cfWinShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="30" stdDeviation="20" flood-color="#000000" flood-opacity="0.35"/>
      </filter>`;
    }
    defs += `<clipPath id="cfWinClip"><rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="12"/></clipPath>`;

    let titlebarSvg = "";
    if (titlebarVisible && titlebarEl){
      const titlebarRect = titlebarEl.getBoundingClientRect();
      const titlebarBg = getComputedStyle(titlebarEl).backgroundColor;
      const titlebarH = titlebarRect.height;
      const dotColors = ["#ff5f56", "#ffbd2e", "#27c93f"];
      const dotR = 6;
      const dotCY = winY + titlebarH / 2;
      const dotGap = 20; /* 12px dot + 8px gap, matches .cf-titlebar's own gap:8px */
      const dots = dotColors.map((color, i) =>
        `<circle cx="${winX + 16 + dotR + i * dotGap}" cy="${dotCY}" r="${dotR}" fill="${color}"/>`
      ).join("");
      titlebarSvg = `<rect x="${winX}" y="${winY}" width="${winW}" height="${titlebarH}" fill="${titlebarBg}" clip-path="url(#cfWinClip)"/>${dots}`;
    }

    /* Code text — one <tspan> per highlighted run, continuing inline
       (no x/y) within a line and only resetting x + advancing a full
       line-height on an actual newline, so multi-colored tokens on the
       same source line render as one continuous baseline exactly like
       the live preview, not as separately-positioned fragments. */
    /* getComputedStyle's own font-family string keeps the literal double
       quotes around multi-word family names ("SF Mono", ...) — fine
       inside a CSS declaration, but fatal inside an XML attribute
       that's itself delimited by double quotes. Swapped for single
       quotes, which SVG/CSS accept equally well for a quoted family
       name. */
    const fontFamily = getComputedStyle(codeOutput).fontFamily.replace(/"/g, "'");
    const fontSize = parseFloat(getComputedStyle(codeOutput).fontSize);
    const lineHeight = parseFloat(getComputedStyle(codeOutput).lineHeight) || fontSize * 1.6;
    const x0 = codeRect.left - wrapRect.left;
    const y0 = codeRect.top - wrapRect.top + fontSize * 0.85;
    const lines = buildCodeLines();
    const tspans = [];
    lines.forEach((runs, lineIndex) => {
      if (runs.length === 0) runs = [{ text: " ", color: getComputedStyle(codeOutput).color }];
      runs.forEach((run, runIndex) => {
        if (runIndex === 0){
          const posAttr = lineIndex === 0
            ? `x="${x0.toFixed(2)}" y="${y0.toFixed(2)}"`
            : `x="${x0.toFixed(2)}" dy="${lineHeight.toFixed(2)}"`;
          tspans.push(`<tspan ${posAttr} fill="${run.color}">${escapeXml(run.text)}</tspan>`);
        } else {
          tspans.push(`<tspan fill="${run.color}">${escapeXml(run.text)}</tspan>`);
        }
      });
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${defs}</defs>
<rect width="${W}" height="${H}" rx="20" fill="${bgFill}"/>
<g filter="${shadowVisible ? "url(#cfWinShadow)" : "none"}">
<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="12" fill="${winBg}"/>
</g>
${titlebarSvg}
<text font-family="${fontFamily}" font-size="${fontSize}" xml:space="preserve">${tspans.join("")}</text>
</svg>`;
  }

  /* ===== PNG/SVG export ===== */
  downloadBtn.addEventListener("click", async () => {
    if (exportFormat === "svg"){
      downloadBtn.disabled = true;
      statusEl.textContent = "Rendering SVG...";
      try {
        const svgString = buildSvgString();
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const outName = (fileNameInput.value.trim() || "codify-snippet") + ".svg";
        downloadBlob(blob, outName);
        statusEl.textContent = "Done.";
      } catch (err){
        console.error(err);
        statusEl.textContent = "Something went wrong generating the SVG.";
      } finally {
        downloadBtn.disabled = false;
      }
      return;
    }
    if (!window.htmlToImage){
      statusEl.textContent = "Export isn't ready yet — try again in a moment.";
      return;
    }
    downloadBtn.disabled = true;
    statusEl.textContent = "Rendering PNG...";
    try {
      const dataUrl = await htmlToImage.toPng(previewWrap, { pixelRatio: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const outName = (fileNameInput.value.trim() || "codify-snippet") + ".png";
      downloadBlob(blob, outName);
      statusEl.textContent = "Done.";
    } catch (err){
      console.error(err);
      statusEl.textContent = "Something went wrong generating the image.";
    } finally {
      downloadBtn.disabled = false;
    }
  });

  /* ===== Screenshot background color ===== */
  const BG_COLOR_STORAGE_KEY = "bc-codify-bg-color";
  const DEFAULT_BG_COLOR = "#E5E7EB";

  function applyBgColor(hex){
    previewWrap.style.background = hex;
    bgColorSwatch.style.background = hex;
    bgColorInput.value = hex;
  }

  let savedBgColor = null;
  try { savedBgColor = localStorage.getItem(BG_COLOR_STORAGE_KEY); } catch(e){ /* storage unavailable */ }
  applyBgColor(savedBgColor || DEFAULT_BG_COLOR);

  if (bgColorInput){
    bgColorInput.addEventListener("input", () => {
      applyBgColor(bgColorInput.value);
      try { localStorage.setItem(BG_COLOR_STORAGE_KEY, bgColorInput.value); } catch(e){ /* storage unavailable */ }
      /* Same "hand-picking overrides a preset" rule as the Theme combo
         above — picking a color while Pink Sunset/Nord Dark is active
         means Custom is what's actually showing now, so also drop the
         preset's padding override back to the CSS default. */
      if (currentStyle !== "custom"){
        currentStyle = "custom";
        previewWrap.style.padding = "";
        setComboDisplay(styleMenu, styleInput, "style", "custom");
      }
    });
  }

  /* Just a fun double-click easter egg — skips buttons/selects/etc. so
     it never fires from a legitimate double-click on a toolbar control.
     Wobbles the banner any time, same as Combine's — except inside the
     preview (the window/panel itself, or its backdrop), where a real
     double-click now does something else entirely (opens the
     background color picker), so wobbling there too would fire both at
     once. */
  const toolApp = document.querySelector(".tool-app");
  if (toolApp){
    toolApp.addEventListener("dblclick", e => {
      if (e.target.closest("button, select, a, label, input, textarea")) return;
      if (e.target.closest("#cfPreviewWrap")) return;
      toolApp.classList.remove("wobble");
      void toolApp.offsetWidth;
      toolApp.classList.add("wobble");
    });
  }
})();
