/* Codify — code-to-screenshot generator (MVP). Textarea for input, a
   separate Prism-highlighted preview beside/below it that re-renders on
   every keystroke, and PNG export via html-to-image snapshotting the
   live preview DOM (gradient, window chrome, dots, code — whatever's
   actually on screen is what gets exported). */
(function(){
  // Pure helpers live in codify-pure.js so they're unit-testable.
  const { escapeXml, hsvToHex, hexToHsv } = window.CodifyPure;
  const codeInput = document.getElementById("cfCodeInput");
  const codeOutput = document.getElementById("cfCodeOutput");
  const afterInput = document.getElementById("cfAfterInput");
  const previewWrap = document.getElementById("cfPreviewWrap");
  const cfWindow = document.getElementById("cfWindow");
  const cfWindowWrap = document.getElementById("cfWindowWrap");
  const themeLink = document.getElementById("cfThemeLink");
  const downloadBtn = document.getElementById("cfDownloadBtn");
  const copyBtn = document.getElementById("cfCopyBtn");
  bcRegisterKeyShortcut("d", downloadBtn);
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

  const styleBtn = document.getElementById("cfStyleBtn");

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
     unselectable) whenever the editor is empty and no template preview
     is active, so the window never renders as a blank rectangle. */
  const GHOST_CODE = `function example() {
  return "your code here";
}`;
  /* Picking a template no longer types its code into the real editor
     (that used to silently overwrite anything the visitor had already
     started, and made "the editor" and "what you're about to screenshot"
     the same thing even when you just wanted to preview a template) —
     instead it drives the preview panel only, same slot GHOST_CODE fills
     otherwise. Cleared back to null the moment the visitor types for
     real, so the editor's own content takes back over. */
  let templatePreviewCode = null;

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
      if (styleControl) styleControl.setIndex(0);
    }
  });

  registerCombo(languageTrigger, languageInput, languageMenu, languageEmpty, (opt) => {
    currentLang = opt.dataset.lang;
    renderPreview();
  });

  registerCombo(templateTrigger, templateInput, templateMenu, templateEmpty, (opt) => {
    const code = TEMPLATES[opt.dataset.template];
    if (code == null) return;
    /* Preview-only, not a real editor fill-in — picking a template
       clears out whatever's currently typed instead of inserting the
       template's own code over it, so "editor" and "template preview"
       never get conflated. Only the code text resets here (language,
       filename, theme, etc. are untouched — this isn't the full
       "Remove all" reset). */
    codeInput.value = "";
    templatePreviewCode = code;
    if (removeBtn) removeBtn.hidden = true;
    autoFitCodeInput();
    renderPreview();
    schedulePersist();
    if (continueBtn) continueBtn.hidden = true;
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
      setPreviewBackground(bgColorInput.value);
      previewWrap.style.padding = "";
      return;
    }
    const preset = STYLE_PRESETS[styleKey];
    if (!preset) return;
    themeLink.href = preset.themeHref;
    cfWindow.dataset.theme = preset.theme;
    setComboDisplay(themeMenu, themeInput, "theme", preset.theme);
    setPreviewBackground(preset.background);
    previewWrap.style.padding = preset.padding;
    bgColorSwatch.style.background = preset.background;
  }

  /* Presets used to be a .bc-combo dropdown; now a plain click-to-cycle
     .option-change-btn (see CLAUDE.md's dropdown-vs-option-change note)
     — 7 options is short enough that a menu's search box wasn't earning
     its keep, and a single button matches Congify's own FPS/Playback
     controls. styleControl.setIndex(0) below is how the Theme-combo and
     Background-color handlers already reset the display back to
     "Presets" when a hand-picked value overrides the active preset. */
  const STYLE_OPTIONS = [
    { value: "custom", label: "Presets" },
    { value: "pinkSunset", label: "Pink Sunset" },
    { value: "nordDark", label: "Nord Dark" },
    { value: "oceanBreeze", label: "Ocean Breeze" },
    { value: "forestGreen", label: "Forest Green" },
    { value: "midnightPurple", label: "Midnight Purple" },
    { value: "cottonCandy", label: "Cotton Candy" }
  ];
  const styleControl = styleBtn ? bcRegisterOptionChangeBtn(styleBtn, STYLE_OPTIONS, (opt) => {
    applyStyle(opt.value);
  }) : null;

  /* ===== Traffic lights on/off ===== */
  const trafficLightsToggle = document.getElementById("cfTrafficLightsToggle");
  if (trafficLightsToggle){
    trafficLightsToggle.addEventListener("change", () => {
      cfWindow.classList.toggle("cf-hide-titlebar", !trafficLightsToggle.checked);
    });
  }

  /* ===== Shadow control (opacity/distance/direction/on-off) =====
     Used to be a plain on/off .cf-toggle-switch — now a trigger button
     that opens a small popover panel (.cf-shadow-panel) with three
     sliders plus the same on/off switch inside it. getShadowValues()
     is the one place distance+direction get turned into an actual
     dx/dy/blur — both applyShadow() (live CSS box-shadow) and
     buildSvgString()'s SVG export feDropShadow read from it, so the
     download always matches what's on screen instead of the export
     hardcoding the shadow separately (which is exactly what it used to
     do, back when there was only ever one fixed shadow to hardcode). */
  const shadowControl = document.getElementById("cfShadowControl");
  const shadowTrigger = document.getElementById("cfShadowTrigger");
  const shadowPanel = document.getElementById("cfShadowPanel");
  const shadowToggle = document.getElementById("cfShadowToggle");
  const shadowOpacityInput = document.getElementById("cfShadowOpacity");
  const shadowDistanceInput = document.getElementById("cfShadowDistance");
  const shadowDirectionInput = document.getElementById("cfShadowDirection");
  const shadowOpacityValue = document.getElementById("cfShadowOpacityValue");
  const shadowDistanceValue = document.getElementById("cfShadowDistanceValue");
  const shadowDirectionValue = document.getElementById("cfShadowDirectionValue");

  /* Direction 0° = straight down (matches the shadow's original fixed
     dx:0/dy:30 look), increasing clockwise like a clock face. Blur
     stays proportional to distance at the same 30:60 ratio the fixed
     shadow always used, rather than exposing a 4th slider for it. */
  function getShadowValues(){
    const opacity = shadowOpacityInput ? shadowOpacityInput.value / 100 : 0.35;
    const distance = shadowDistanceInput ? Number(shadowDistanceInput.value) : 30;
    const angle = shadowDirectionInput ? Number(shadowDirectionInput.value) : 0;
    const rad = angle * Math.PI / 180;
    const dx = Math.round(distance * Math.sin(rad));
    const dy = Math.round(distance * Math.cos(rad));
    const blur = Math.round(distance * 2);
    return { dx, dy, blur, opacity };
  }
  function applyShadow(){
    const on = !shadowToggle || shadowToggle.checked;
    cfWindow.classList.toggle("cf-no-shadow", !on);
    if (!on){
      cfWindow.style.boxShadow = "none";
      return;
    }
    const { dx, dy, blur, opacity } = getShadowValues();
    cfWindow.style.boxShadow = `${dx}px ${dy}px ${blur}px rgba(0,0,0,${opacity})`;
  }
  function renderShadowReadouts(){
    if (shadowOpacityValue && shadowOpacityInput) shadowOpacityValue.textContent = shadowOpacityInput.value + "%";
    if (shadowDistanceValue && shadowDistanceInput) shadowDistanceValue.textContent = shadowDistanceInput.value + "px";
    if (shadowDirectionValue && shadowDirectionInput) shadowDirectionValue.textContent = shadowDirectionInput.value + "°";
  }
  /* Persisted as part of the same IndexedDB session record "Continue
     where you left off" already writes (see CF_DB_NAME/CF_DB_STORE
     further down — schedulePersist/persistNow are function declarations,
     hoisted, so calling them from up here is fine) rather than a second
     separate localStorage key: one write covers code+lang+fileName+shadow
     together instead of two independent storage round-trips on every
     change. Unlike code/lang/fileName, though, shadow settings apply the
     moment the page loads regardless of whether there's a saved session
     to "Continue" — see the restore IIFE below, which reads saved.shadow
     unconditionally instead of gating it behind that button. */
  renderShadowReadouts();
  applyShadow();
  if (shadowToggle) shadowToggle.addEventListener("change", () => {
    applyShadow();
    schedulePersist();
  });
  [shadowOpacityInput, shadowDistanceInput, shadowDirectionInput].forEach(input => {
    if (!input) return;
    input.addEventListener("input", () => {
      renderShadowReadouts();
      applyShadow();
      schedulePersist();
    });
  });
  /* Declared here (not inside the `if` below) so the double-click zone
     on the preview's bottom strip, further down, can open the same
     panel the trigger button does — same reasoning as showAllZones
     being hoisted out of its own `if` earlier in this file. No-ops when
     the panel doesn't exist. */
  function closeShadowPanel(){
    if (!shadowPanel || !shadowTrigger) return;
    shadowPanel.hidden = true;
    shadowTrigger.setAttribute("aria-expanded", "false");
  }
  function openShadowPanel(){
    if (!shadowPanel || !shadowTrigger) return;
    shadowPanel.hidden = false;
    shadowTrigger.setAttribute("aria-expanded", "true");
  }
  if (shadowTrigger && shadowPanel && shadowControl){
    shadowTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !shadowPanel.hidden;
      closeShadowPanel();
      if (!isOpen) openShadowPanel();
    });
    document.addEventListener("click", (e) => {
      if (!shadowPanel.hidden && !shadowControl.contains(e.target)) closeShadowPanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !shadowPanel.hidden){
        closeShadowPanel();
        shadowTrigger.focus();
      }
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
     bubbles up from something inside .cf-window. The backdrop itself
     splits three ways: the strip above the window toggles Mac nav (the
     titlebar dots that live right below it), the strip directly below
     toggles Shadow (its own drop-shadow lands there), and left/right
     are what's left for cycling the background color — each one a
     "click the thing you're looking at" shortcut to a setting the
     pills above already expose. */
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
  /* Sets the real checkbox and fires its own "change" event rather than
     duplicating the cf-no-shadow class toggle here — same delegation
     pattern pickBgColor uses for the real <input type=color>. */
  function toggleShadowClick(){
    if (!shadowToggle) return;
    shadowToggle.checked = !shadowToggle.checked;
    shadowToggle.dispatchEvent(new Event("change", { bubbles: true }));
  }
  /* Same delegation pattern as toggleShadowClick, for the strip above
     the window instead of below it. */
  function toggleMacNavClick(){
    if (!trafficLightsToggle) return;
    trafficLightsToggle.checked = !trafficLightsToggle.checked;
    trafficLightsToggle.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* Background-color and Shadow zones share one gesture: a single click
     cycles the value instantly, a fast second click (under 200ms — much
     tighter than the browser's own native dblclick threshold, tuned for
     double-clicking small icons, not this) undoes that and opens the
     fuller control instead (the custom color panel / the Shadow options
     panel). bcCreateQuickCycleGesture (shared/site.js) is the one real
     implementation of that dance — this used to be two hand-copied
     near-duplicates, each tracking its own lastClickTime/valueBeforeClick
     pair, which is exactly how the background-color copy ended up
     missing the e.stopPropagation() call the Shadow copy already had
     (the shared helper now calls it on every caller's behalf, so that
     particular bug can't recur per-zone). */
  const shadowZoneGesture = bcCreateQuickCycleGesture({
    getState: () => shadowToggle ? shadowToggle.checked : null,
    cycle: () => toggleShadowClick(),
    revert: (wasOn) => {
      if (wasOn !== null && shadowToggle) shadowToggle.checked = wasOn;
      applyShadow();
      schedulePersist();
    },
    open: () => openShadowPanel()
  });
  const bgZoneGesture = bcCreateQuickCycleGesture({
    getState: () => bgColorInput.value,
    cycle: () => cycleBgColor(),
    revert: (prevColor) => pickBgColor(prevColor),
    /* Used to be bgColorInput.click(), which opened the OS's own native
       color-picker dialog straight off the backdrop — now opens the same
       custom panel the Background pill's trigger does, since the native
       input is just hidden internal state these days (see the
       Background control's own comment). */
    open: () => openBgPanel()
  });
  if (previewWrap && templateMenu && themeMenu && bgColorInput){
    previewWrap.addEventListener("click", (e) => {
      if (e.target === previewWrap){
        const winRect = cfWindow.getBoundingClientRect();
        if (e.clientY >= winRect.bottom){
          shadowZoneGesture(e);
          return;
        }
        if (e.clientY < winRect.top){
          toggleMacNavClick();
          return;
        }
        /* Still runs while the Background ON/OFF toggle is off — updates
           pendingBgValue (see setPreviewBackground further down), just
           doesn't touch the live preview until ON is pressed again. HOD
           shows this zone the same regardless of the toggle's state
           (a click here always does something, even if not visibly). */
        bgZoneGesture(e);
        return;
      }
      const rect = previewWrap.getBoundingClientRect();
      const clickedLeftHalf = (e.clientX - rect.left) < rect.width / 2;
      cycleComboOption(clickedLeftHalf ? templateMenu : themeMenu);
    });
  }

  /* ===== HOD inspector overlay =====
     Same five zones the click handler above already recognizes (Mac nav /
     Shadow / Background / Template / Theme), drawn as a DevTools-style
     highlight map — press-and-hold HOD to see all of them at once,
     each its own color, instead of only discovering what's clickable by
     clicking it. Recomputes real getBoundingClientRect() coordinates
     rather than tracking zone boundaries separately, so it can never
     drift out of sync with the actual click logic above (resizes,
     scrolls, and zoom all just fall out of that for free). */
  const hoverOverlay = document.getElementById("cfHoverOverlay");
  /* [class, data-zone, label text] — built fresh into brand-new DOM
     nodes on every press rather than kept as static markup; see
     showAllZones' own comment for why. */
  const HOVER_ZONE_DEFS = [
    ["cf-hover-zone-macnav", "top", "Mac nav — click to toggle"],
    ["cf-hover-zone-shadow", "bottom", "Shadow — click to toggle"],
    ["cf-hover-zone-bg", "left", "Background"],
    ["cf-hover-zone-bg", "right", "Background"],
    ["cf-hover-zone-template", "template", "Template"],
    ["cf-hover-zone-theme", "theme", "Theme"]
  ];
  function makeBox(cls, x, y, w, h, label){
    const el = document.createElement("div");
    el.className = "cf-hover-zone " + cls;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = Math.max(0, w) + "px";
    el.style.height = Math.max(0, h) + "px";
    const span = document.createElement("span");
    span.className = "cf-hover-zone-label";
    span.textContent = label;
    el.appendChild(span);
    return el;
  }
  /* "HOD" (Hover Overlay Display) — press-and-hold. A frozen snapshot,
     not a live-tracking overlay: computed once right when the button is
     pressed, untouched for the rest of the hold, cleared on release.
     Every version that recomputed continuously while held (a tracked
     cursor position, then all-zones-at-once with mousemove/
     ResizeObserver/scroll listeners, then the same recompute deferred to
     requestAnimationFrame) kept testing perfectly correct in isolation —
     49 rapid edits, a real scroll gesture, frame-by-frame samples
     through a big paste, all zero mismatches — yet still visibly
     mis-rendered in real use, confirmed live and repeatedly, as two
     different-sized sets of zones superimposed. Even after removing the
     recompute-while-held loop entirely (one write on press, nothing
     else), it *still* happened — which rules out timing/staleness as the
     cause altogether, since there was nothing left to recompute late.
     That only makes sense as the browser's compositor occasionally
     painting a stale cached layer for the *same, reused* position:fixed
     DOM nodes alongside the fresh paint. So instead of repositioning six
     persistent elements, every press now builds six brand new ones from
     scratch (makeBox above) and every release throws them away — a
     stale composited layer can't bleed through if the element that
     would-be-stale layer belonged to no longer exists. */
  const hodToggle = document.getElementById("cfHodToggle");
  let hodHeld = false;
  function setHodHeld(held){
    hodHeld = held;
    if (hodToggle) hodToggle.setAttribute("aria-pressed", held ? "true" : "false");
  }
  let showAllZones = () => {};
  if (previewWrap && cfWindow && hoverOverlay){
    showAllZones = () => {
      const wrapRect = previewWrap.getBoundingClientRect();
      const winRect = cfWindow.getBoundingClientRect();
      const frag = document.createDocumentFragment();
      frag.appendChild(makeBox(HOVER_ZONE_DEFS[0][0], wrapRect.left, wrapRect.top, wrapRect.width, winRect.top - wrapRect.top, HOVER_ZONE_DEFS[0][2]));
      frag.appendChild(makeBox(HOVER_ZONE_DEFS[1][0], wrapRect.left, winRect.bottom, wrapRect.width, wrapRect.bottom - winRect.bottom, HOVER_ZONE_DEFS[1][2]));
      frag.appendChild(makeBox(HOVER_ZONE_DEFS[2][0], wrapRect.left, winRect.top, winRect.left - wrapRect.left, winRect.height, HOVER_ZONE_DEFS[2][2]));
      frag.appendChild(makeBox(HOVER_ZONE_DEFS[3][0], winRect.right, winRect.top, wrapRect.right - winRect.right, winRect.height, HOVER_ZONE_DEFS[3][2]));
      frag.appendChild(makeBox(HOVER_ZONE_DEFS[4][0], winRect.left, winRect.top, winRect.width / 2, winRect.height, HOVER_ZONE_DEFS[4][2]));
      frag.appendChild(makeBox(HOVER_ZONE_DEFS[5][0], winRect.left + winRect.width / 2, winRect.top, winRect.width / 2, winRect.height, HOVER_ZONE_DEFS[5][2]));
      hoverOverlay.textContent = "";
      hoverOverlay.appendChild(frag);
      hoverOverlay.hidden = false;
    };
  }
  if (hodToggle){
    hodToggle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      setHodHeld(true);
      showAllZones();
    });
    hodToggle.addEventListener("touchstart", (e) => {
      e.preventDefault();
      setHodHeld(true);
      showAllZones();
    }, { passive: false });
    const endHold = () => {
      if (!hodHeld) return;
      setHodHeld(false);
      if (hoverOverlay){
        hoverOverlay.hidden = true;
        hoverOverlay.textContent = "";
      }
    };
    /* mouseup, not pointerup — confirmed live that pointerup doesn't
       reliably fire for every release, leaving checked stuck true with
       the overlay hidden under it (pressed but permanently "off"-looking
       until the next accidental mouseup landed somewhere). mouseup is
       the one guaranteed to pair with the mousedown above. */
    document.addEventListener("mouseup", endHold);
    document.addEventListener("touchend", endHold);
    document.addEventListener("touchcancel", endHold);
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
    templatePreviewCode = null;
    setComboDisplay(templateMenu, templateInput, "template", "hello");
    /* Tool options stay revealed (see the init call below) rather than
       reverting to the pre-typing hidden state — only the editor itself
       goes back to genuinely empty. */
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
      if (shadowOpacityInput) shadowOpacityInput.value = 35;
      if (shadowDistanceInput) shadowDistanceInput.value = 30;
      if (shadowDirectionInput) shadowDirectionInput.value = 0;
      renderShadowReadouts();
      applyShadow();
    }
    setHodHeld(false);
    if (hoverOverlay) hoverOverlay.hidden = true;
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
    downloadBtn.disabled = isEmpty;
    if (copyBtn) copyBtn.disabled = isEmpty;
    codeOutput.className = "language-" + currentLang;
    codeOutput.classList.toggle("cf-ghost", isEmpty);
    codeOutput.textContent = isEmpty ? (templatePreviewCode || GHOST_CODE) : codeInput.value;
    if (window.Prism) Prism.highlightElement(codeOutput);
    /* #cfWindow sizes itself to codeOutput's content, so this line can
       (and usually does) resize it — if HOD's frozen snapshot is showing
       when that happens, it's now definitely stale (see showAllZones'
       own comment for why it's a one-shot snapshot, not a live-tracking
       overlay), so just hide it rather than leave a wrong one showing.
       Reappears correctly positioned on the next press. */
    if (hodHeld && hoverOverlay){ hoverOverlay.hidden = true; hoverOverlay.textContent = ""; }
  }
  codeInput.addEventListener("input", () => {
    templatePreviewCode = null;
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
    /* Shadow settings ride along in this same record (see the Shadow
       control setup above) rather than clearing it out when there's no
       code — bcDbPut always writes the whole object (it's a plain
       IndexedDB put, not a partial merge), so wiping the record on
       empty code would also throw away the shadow prefs a visitor set
       before ever typing anything. "Continue where you left off"
       staying hidden for an empty saved.code (checked below) already
       covers the one thing clearing used to be for. */
    await bcDbPut(CF_DB_NAME, CF_DB_STORE, {
      code: codeInput.value,
      lang: currentLang,
      fileName: fileNameInput.value,
      shadow: {
        on: shadowToggle ? shadowToggle.checked : true,
        opacity: shadowOpacityInput ? shadowOpacityInput.value : 35,
        distance: shadowDistanceInput ? shadowDistanceInput.value : 30,
        direction: shadowDirectionInput ? shadowDirectionInput.value : 0
      },
      bgImage: currentBgImageDataUrl,
      bgEnabled
    });
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
    /* Applied immediately, unlike code/lang/fileName just below — those
       only take effect once the visitor explicitly clicks "Continue
       where you left off" (typed content shouldn't reappear without
       asking), but a shadow preference isn't "session data" someone
       needs to opt back into, it's closer to HOD/Background's own
       always-on restore. Runs regardless of which branch (Continue
       button shown, or the first-time Hello-world fallback) follows. */
    if (saved && saved.shadow){
      const sh = saved.shadow;
      if (shadowToggle && typeof sh.on === "boolean") shadowToggle.checked = sh.on;
      if (shadowOpacityInput && sh.opacity != null) shadowOpacityInput.value = sh.opacity;
      if (shadowDistanceInput && sh.distance != null) shadowDistanceInput.value = sh.distance;
      if (shadowDirectionInput && sh.direction != null) shadowDirectionInput.value = sh.direction;
      renderShadowReadouts();
      applyShadow();
    }
    /* Same immediate-restore treatment as shadow just above — a custom
       background image is a visual preference, not session content. */
    if (saved && saved.bgImage) applyBgImage(saved.bgImage);
    /* Same immediate-restore treatment as shadow/bgImage above.
       pendingBgValue is already correct from whichever applier just
       ran (color restore or bgImage restore, above) — just needs the
       live preview switched to transparent and the button's own state
       brought back in sync. */
    if (saved && saved.bgEnabled === false){
      previewWrap.style.background = "transparent";
      updateBgEnableUi(false);
    }
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
    /* No saved session — a genuinely first-time visitor. Used to
       silently pre-fill the editor with the Hello-world template so
       the tool opened showing a real screenshot instead of an empty
       box — now the editor stays genuinely empty (native placeholder
       text only) while the settings/preview/download section still
       reveals right away, so a first-time visitor sees what the tool
       offers without having to type anything first. */
    if (codeInput.value.length === 0) afterInput.classList.add("cf-started");
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
    if (copyBtn) copyBtn.title = fmt === "png" ? "Copy PNG to clipboard" : "Copy SVG to clipboard";
  }
  if (formatPngBtn && formatSvgBtn){
    formatPngBtn.addEventListener("click", () => setExportFormat("png"));
    formatSvgBtn.addEventListener("click", () => setExportFormat("svg"));
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
    /* A custom background image (see cfBgImageInput below) sets
       previewWrap.style.background to url("data:...") ... — matched
       here the same way the gradient case already is, rather than the
       export silently falling back to whatever flat color happens to
       be in bgFill and dropping the image entirely. */
    const bgImageMatch = /^url\("?(data:[^")]+)"?\)/i.exec(bgValue);
    let bgFill, bgImageSvg = "", defs = "";
    if (bgImageMatch){
      /* preserveAspectRatio="xMidYMid slice" is SVG's own equivalent of
         CSS background-size:cover — fills the whole W×H box, cropping
         whichever axis overflows, centered — matching how the same
         image actually renders live (see the CSS `cover` value set
         alongside this url() below). */
      defs += `<clipPath id="cfBgImageClip"><rect width="${W}" height="${H}" rx="20"/></clipPath>`;
      bgImageSvg = `<image href="${bgImageMatch[1]}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cfBgImageClip)"/>`;
      bgFill = "none";
    } else if (gradientMatch){
      /* Paren-aware split — same fix as paintPreviewBackground's PNG
         path below: a hex color round-trips through .style.background
         as rgb(r, g, b), and a plain split(",") breaks on that color's
         own internal commas. */
      const stops = gradientMatch[1].split(/,(?![^(]*\))/).map(s => s.trim()).map(stop => {
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
      /* stdDeviation isn't the same unit as a CSS blur radius — keeping
         the same ~1:3 ratio the original fixed shadow used (blur 60,
         stdDeviation 20) rather than passing the blur value straight
         through, so the exported SVG's shadow still reads as roughly
         the same softness as the live CSS one at any distance. */
      const { dx, dy, blur, opacity } = getShadowValues();
      defs += `<filter id="cfWinShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${Math.round(blur / 3)}" flood-color="#000000" flood-opacity="${opacity}"/>
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
${bgImageSvg}
<g filter="${shadowVisible ? "url(#cfWinShadow)" : "none"}">
<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="12" fill="${winBg}"/>
</g>
${titlebarSvg}
<text font-family="${fontFamily}" font-size="${fontSize}" xml:space="preserve">${tspans.join("")}</text>
</svg>`;
  }

  /* ===== PNG/SVG export =====
     One shared renderer behind both Download and Copy, so "Copy" is
     genuinely connected to the download button — same PNG/SVG choice
     (the format toggle above), same rendered output, not a second,
     independently-drifting export path. Only what happens to the
     result differs: Download saves the blob to disk, Copy puts it (or,
     for SVG, its markup as text — see the click handler below for why)
     on the clipboard instead. */
  function loadImage(src){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image-load-failed"));
      img.src = src;
    });
  }

  /* Paints #cfPreviewWrap's own background directly, instead of asking
     html-to-image to rasterize it — confirmed live (sampling raw pixel
     alpha down the vertical center of a background-only capture, well
     away from any corner) that html-to-image leaves a solid transparent
     band across the *entire* top of this element, roughly 10% of its
     height, background color or not, gradient or not. Not corner
     rounding (that's a separate, narrower effect right at the edges,
     fixed by the canvas clip in renderPreviewPng below) and not
     specific to one background type — a plain solid fill on this exact
     box reproduces it too. Whatever's actually causing it lives inside
     html-to-image itself; every background this tool can ever produce
     is one of exactly three CSS values codify-tool.js itself sets
     (a solid color, `url(...) center / cover no-repeat`, or one of the
     presets' `linear-gradient(Adeg, stop, stop, ...)`), so painting all
     three ourselves is a short, fully-covered list — not the kind of
     "reimplement half of CSS" shortcut that's usually a bad trade. */
  async function paintPreviewBackground(ctx, canvasWidth, canvasHeight){
    const bg = (previewWrap.style.background || getComputedStyle(previewWrap).backgroundColor || "#E5E7EB").trim();

    const gradientMatch = /^linear-gradient\(\s*([\d.]+)deg\s*,\s*(.+)\)$/i.exec(bg);
    if (gradientMatch){
      const angleDeg = parseFloat(gradientMatch[1]);
      /* Not a plain split(",") — the browser normalizes hex colors in
         a gradient string to rgb(r, g, b) the moment it round-trips
         through .style.background, and those commas would otherwise
         get split too (confirmed live: "rgb(255" alone reached
         addColorStop and threw). Only split on a comma that isn't
         still inside an open paren. */
      const stops = gradientMatch[2].split(/,(?![^(]*\))/).map(s => s.trim()).map(s => {
        const m = /^(.+?)\s+([\d.]+)%$/.exec(s);
        return m ? { color: m[1], pos: parseFloat(m[2]) / 100 } : { color: s, pos: 0 };
      });
      /* Standard CSS-angle-to-canvas-gradient-line conversion: the
         gradient line's length is whatever makes it span corner-to-
         corner of the box at this angle, centered on the box. */
      const angleRad = (angleDeg * Math.PI) / 180;
      const length = Math.abs(canvasWidth * Math.sin(angleRad)) + Math.abs(canvasHeight * Math.cos(angleRad));
      const half = length / 2;
      const cx = canvasWidth / 2, cy = canvasHeight / 2;
      const dx = Math.sin(angleRad) * half, dy = -Math.cos(angleRad) * half;
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      stops.forEach(s => grad.addColorStop(Math.min(1, Math.max(0, s.pos)), s.color));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      return;
    }

    const urlMatch = /^url\((["']?)(.*?)\1\)/i.exec(bg);
    if (urlMatch){
      const img = await loadImage(urlMatch[2]);
      /* `cover` fit — matches this tool's own `center / cover no-repeat`
         background shorthand for an imported image. */
      const scale = Math.max(canvasWidth / img.naturalWidth, canvasHeight / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, (canvasWidth - w) / 2, (canvasHeight - h) / 2, w, h);
      return;
    }

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  /* htmlToImage.toPng, asked to capture #cfPreviewWrap whole (background
     + the window sitting inside it via flex-centering + padding),
     doesn't reproduce that centering — confirmed live: the window comes
     out pinned near the top with barely any of the real ~56px padding
     above it, while a roughly-correct gap survives below, and the same
     thing happens whether #cfPreviewWrap is flex or a plain block with
     margin:auto centering, so it isn't specifically a flex bug. Tried
     explicit width/height, overflow:hidden, and a style override first
     (see the corner-rounding fix below, which hit the same "third-party
     rasterizer being weird about this element" wall) — not worth more
     time chasing inside html-to-image itself.

     Sidesteps it by never asking html-to-image to render the background
     at all (see paintPreviewBackground above) or the window *together*
     with it: the background is painted ourselves, and #cfWindowWrap is
     captured alone (a plain block box with no surrounding flex parent
     to mis-center it — renders correctly on its own) for the window
     layer, then composited onto the painted background using the
     window's *actual* live position within the wrap
     (getBoundingClientRect on both) — real DOM layout numbers, not
     anything html-to-image had to infer. */
  async function renderPreviewPng(pixelRatio){
    const rect = previewWrap.getBoundingClientRect();
    const winRect = cfWindowWrap.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(previewWrap).borderRadius) || 0;

    /* .cf-window's own box-shadow (0 30px 60px, so up to ~90px of bleed
       below it, ~60px on the other three sides) doesn't affect layout
       size, so capturing #cfWindowWrap at its own natural
       getBoundingClientRect bounds gives html-to-image a canvas sized
       to exactly the window's box and nothing more — the shadow still
       tries to paint into that same canvas, but anything past the
       window's own edge has nowhere to go and gets hard-clipped right
       at the box boundary. Confirmed live/reported: a small dark smudge
       sitting right at the window's corner in the export, instead of
       the soft blurred shadow the live preview shows fading gradually
       into the background around it — that smudge is the one sliver of
       blur that happened to still be inside the tight capture box.
       Padding #cfWindowWrap out by more than the shadow's max reach
       before capturing gives it room to render in full; the extra
       padding shifts the window's own content inward within that
       bigger image by exactly `bleed` px, so drawImage below shifts the
       draw position back by the same amount to land it at the correct
       spot again — net effect on the final composite is zero, it's
       purely a capture-time accommodation.

       #cfWindowWrap is box-sizing:border-box with max-width:640px, so
       padding alone doesn't grow the box the way it would with the
       default content-box — border-box means max-width caps the
       padding-INCLUSIVE box, so adding padding without also widening it
       just shrinks the content (the window itself) to make room for
       the padding inside the same unchanged 640px total. Reported and
       confirmed live: the actual rendered window came out narrower than
       the real one, and — since drawImage below still assumed the
       original (now wrong) width when positioning it — visibly
       off-center in the final composite, not just wrong-sized. Setting
       an explicit `width` alongside the padding compensates: border-box
       makes `width` the total box size, so width = (original content
       width) + 2*bleed leaves exactly the original width for the
       content once the bleed padding is carved out of it, the same
       result padding-only gives on a content-box element. */
    const bleed = 100;
    const origPadding = cfWindowWrap.style.padding;
    const origWidth = cfWindowWrap.style.width;
    const origMaxWidth = cfWindowWrap.style.maxWidth;
    /* max-width:640px (from the stylesheet, not overridden by the
       inline width below on its own) still clamps an explicit inline
       width to 640 regardless — max-width always wins over width,
       that's its entire job — so the widened `width` above alone
       silently did nothing and this exact bug reproduced again with
       the fix in place. Has to be raised too. */
    cfWindowWrap.style.maxWidth = "none";
    cfWindowWrap.style.width = (winRect.width + bleed * 2) + "px";
    cfWindowWrap.style.padding = bleed + "px";
    const winDataUrl = await htmlToImage.toPng(cfWindowWrap, { pixelRatio });
    cfWindowWrap.style.padding = origPadding;
    cfWindowWrap.style.width = origWidth;
    cfWindowWrap.style.maxWidth = origMaxWidth;
    const winImg = await loadImage(winDataUrl);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);
    const ctx = canvas.getContext("2d");
    const clipRadius = Math.min(radius * pixelRatio, canvas.width / 2, canvas.height / 2);
    ctx.beginPath();
    ctx.moveTo(clipRadius, 0);
    ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, clipRadius);
    ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, clipRadius);
    ctx.arcTo(0, canvas.height, 0, 0, clipRadius);
    ctx.arcTo(0, 0, canvas.width, 0, clipRadius);
    ctx.closePath();
    ctx.clip();
    await paintPreviewBackground(ctx, canvas.width, canvas.height);
    const winX = Math.round((winRect.left - rect.left - bleed) * pixelRatio);
    const winY = Math.round((winRect.top - rect.top - bleed) * pixelRatio);
    ctx.drawImage(winImg, winX, winY, winImg.naturalWidth, winImg.naturalHeight);

    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  }

  async function renderCodifyExport(){
    if (exportFormat === "svg"){
      const svgString = buildSvgString();
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      return { blob, svgString, ext: "svg" };
    }
    if (!window.htmlToImage){
      throw new Error("not-ready");
    }
    /* Both resize handles live inside #cfPreviewWrap (the window one
       nested in #cfWindowWrap, the panel one a direct child) — exactly
       what renderPreviewPng snapshots below — so without hiding them
       first they get baked into the actual exported image as two
       solid blue circles sitting on top of the code. Confirmed live: a
       real PNG download had both handles rendered right into it.
       Restored in `finally` so a thrown export error can't leave them
       hidden in the live UI. */
    if (windowResizeHandle) windowResizeHandle.style.visibility = "hidden";
    if (resizeHandle) resizeHandle.style.visibility = "hidden";
    try {
      const blob = await renderPreviewPng(2);
      return { blob, svgString: null, ext: "png" };
    } finally {
      if (windowResizeHandle) windowResizeHandle.style.visibility = "";
      if (resizeHandle) resizeHandle.style.visibility = "";
    }
  }

  function setExportBtnsDisabled(disabled){
    downloadBtn.disabled = disabled;
    if (copyBtn) copyBtn.disabled = disabled;
  }

  downloadBtn.addEventListener("click", async () => {
    setExportBtnsDisabled(true);
    statusEl.textContent = exportFormat === "svg" ? "Rendering SVG..." : "Rendering PNG...";
    startPrivacyCheck();
    try {
      const { blob, ext } = await renderCodifyExport();
      const outName = (fileNameInput.value.trim() || "codify-snippet") + "." + ext;
      downloadBlob(blob, outName);
      statusEl.textContent = "Done.";
    } catch (err){
      console.error(err);
      statusEl.textContent = err && err.message === "not-ready"
        ? "Export isn't ready yet — try again in a moment."
        : "Something went wrong generating the " + (exportFormat === "svg" ? "SVG" : "image") + ".";
    } finally {
      setExportBtnsDisabled(codeInput.value.length === 0);
      finishPrivacyCheck(document.getElementById("cfPrivacyBadge"));
    }
  });

  /* ===== Copy to clipboard =====
     PNG copies as a real image (navigator.clipboard.write + an
     image/png ClipboardItem — pasteable straight into Slack, Docs, an
     image editor, wherever). SVG can't do that the same way: the
     Async Clipboard API's ClipboardItem support for arbitrary image
     MIME types like image/svg+xml is inconsistent across browsers, so
     instead it copies the raw SVG markup as text — pasteable into code,
     which is the actually-useful thing to do with an SVG anyway. */
  if (copyBtn){
    copyBtn.addEventListener("click", async () => {
      setExportBtnsDisabled(true);
      statusEl.textContent = exportFormat === "svg" ? "Rendering SVG..." : "Rendering PNG...";
      try {
        const { blob, svgString, ext } = await renderCodifyExport();
        if (ext === "svg"){
          await navigator.clipboard.writeText(svgString);
          statusEl.textContent = "SVG markup copied to clipboard.";
        } else {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          statusEl.textContent = "PNG copied to clipboard.";
        }
      } catch (err){
        console.error(err);
        statusEl.textContent = err && err.message === "not-ready"
          ? "Export isn't ready yet — try again in a moment."
          : "Couldn't copy — your browser may not allow clipboard access here.";
      } finally {
        setExportBtnsDisabled(codeInput.value.length === 0);
      }
    });
  }

  /* ===== Screenshot background color =====
     Trigger + custom popover panel (swatches, a hex field, Import
     image) — same shape as the Shadow control. The real
     <input type=color> (#cfBgColorInput) still exists as internal
     state (cycleBgColor/pickBgColor elsewhere in this file read/write
     its .value the same way they always have), it's just hidden now
     and never the thing a click opens — used to be a <label> wrapping
     a full-size invisible version of this same input, which popped
     open the browser/OS's own native color-picker dialog on click.
     That collided visually with the pill next to it (confirmed live)
     and looked inconsistent with every other control on the page,
     which is what this custom panel replaces it with. */
  const BG_COLOR_STORAGE_KEY = "bc-codify-bg-color";
  const DEFAULT_BG_COLOR = "#E5E7EB";
  const bgControl = document.getElementById("cfBgControl");
  const bgTrigger = document.getElementById("cfBgTrigger");
  const bgPanel = document.getElementById("cfBgPanel");
  const bgSwatchEls = [...document.querySelectorAll(".cf-bg-swatch")];
  const bgHexInput = document.getElementById("cfBgHexInput");
  const bgSv = document.getElementById("cfBgSv");
  const bgSvThumb = document.getElementById("cfBgSvThumb");
  const bgHueInput = document.getElementById("cfBgHue");

  function closeBgPanel(){
    if (!bgPanel || !bgTrigger) return;
    bgPanel.hidden = true;
    bgTrigger.setAttribute("aria-expanded", "false");
  }
  function openBgPanel(){
    if (!bgPanel || !bgTrigger) return;
    bgPanel.hidden = false;
    bgTrigger.setAttribute("aria-expanded", "true");
  }
  if (bgTrigger && bgPanel && bgControl){
    bgTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !bgPanel.hidden;
      closeBgPanel();
      if (!isOpen) openBgPanel();
    });
    document.addEventListener("click", (e) => {
      if (!bgPanel.hidden && !bgControl.contains(e.target)) closeBgPanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !bgPanel.hidden){
        closeBgPanel();
        bgTrigger.focus();
      }
    });
  }

  /* ===== Free-form SV square + hue slider =====
     The 6 swatches only ever offer 6 exact colors — this is what lets a
     visitor land on anything else without already knowing a hex code.
     Plain HSV math (no canvas): the square's x/y maps to saturation/value
     at a fixed hue, the slider picks that hue. Both ends funnel through
     bgColorInput's own "input" event same as swatches/hex do, so
     applyBgColor/localStorage/preset-reset stay the single source of
     truth — this only ever produces a hex and hands it off.
     hsvToHex/hexToHsv themselves live in codify-pure.js (destructured at
     the top of this file) — see that file's own comment. */
  let currentHue = 0, currentSat = 0, currentVal = 0;
  function updateSvBackground(){
    if (bgSv) bgSv.style.backgroundColor = hsvToHex(currentHue, 1, 1);
  }
  function setSvThumbVisual(s, v){
    if (!bgSvThumb) return;
    bgSvThumb.style.left = (s * 100) + "%";
    bgSvThumb.style.top = ((1 - v) * 100) + "%";
  }
  function pickFromSv(clientX, clientY){
    const rect = bgSv.getBoundingClientRect();
    currentSat = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    currentVal = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
    setSvThumbVisual(currentSat, currentVal);
    bgColorInput.value = hsvToHex(currentHue, currentSat, currentVal);
    bgColorInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (bgSv){
    let svDragging = false;
    bgSv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      svDragging = true;
      try { bgSv.setPointerCapture(e.pointerId); } catch (err) {}
      pickFromSv(e.clientX, e.clientY);
    });
    bgSv.addEventListener("pointermove", (e) => {
      if (svDragging) pickFromSv(e.clientX, e.clientY);
    });
    function endSvDrag(e){
      svDragging = false;
      try { bgSv.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    bgSv.addEventListener("pointerup", endSvDrag);
    bgSv.addEventListener("pointercancel", endSvDrag);
  }
  if (bgHueInput){
    bgHueInput.addEventListener("input", () => {
      currentHue = Number(bgHueInput.value);
      updateSvBackground();
      bgColorInput.value = hsvToHex(currentHue, currentSat, currentVal);
      bgColorInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  /* ===== Background on/off =====
     "OFF" doesn't stop the color/image from being picked, just from
     rendering: previewWrap.style.background stays "transparent" (which
     the PNG export's paintPreviewBackground and the SVG export's
     bgFill fallback both already read directly, so a transparent
     export falls straight out of that with no separate export-side
     flag needed) no matter what gets picked while off — a swatch click,
     the preview's own click-to-cycle zone, typing a hex, all of it
     keeps working and keeps updating pendingBgValue, it just doesn't
     touch the live preview until ON is pressed again. pendingBgValue is
     the one thing every "set the background" path below (applyBgColor,
     applyBgImage, applyStyle) writes to, and the only thing ON reads
     from — so whichever was picked most recently, even while off, is
     what shows up the moment it's re-enabled. */
  const bgEnableBtn = document.getElementById("cfBgEnableBtn");
  const bgEnableBtnLabel = document.getElementById("cfBgEnableBtnLabel");
  let bgEnabled = true;
  let pendingBgValue = DEFAULT_BG_COLOR;
  function updateBgEnableUi(enabled){
    bgEnabled = enabled;
    if (bgEnableBtn) bgEnableBtn.setAttribute("aria-pressed", String(enabled));
    if (bgEnableBtnLabel) bgEnableBtnLabel.textContent = enabled ? "ON" : "OFF";
    previewWrap.classList.toggle("cf-bg-transparent", !enabled);
  }
  /* The only place that writes previewWrap.style.background for a real
     (non-"transparent") value — every applier below calls this instead
     of setting it directly, so "only render when enabled" only has to
     be handled in one spot. */
  function setPreviewBackground(value){
    pendingBgValue = value;
    if (bgEnabled) previewWrap.style.background = value;
  }
  if (bgEnableBtn){
    bgEnableBtn.addEventListener("click", () => {
      if (bgEnabled){
        previewWrap.style.background = "transparent";
        updateBgEnableUi(false);
      } else {
        previewWrap.style.background = pendingBgValue || DEFAULT_BG_COLOR;
        updateBgEnableUi(true);
      }
      schedulePersist();
    });
  }

  function applyBgColor(hex){
    setPreviewBackground(hex);
    bgColorSwatch.style.background = hex;
    bgColorInput.value = hex;
    if (bgHexInput && document.activeElement !== bgHexInput) bgHexInput.value = hex.toUpperCase();
    const upper = hex.toUpperCase();
    bgSwatchEls.forEach(el => el.classList.toggle("active", el.dataset.color.toUpperCase() === upper));
    /* Keep the SV square/hue slider in sync with whatever set the color
       (a swatch click, a typed hex, this same picker) — hue is left
       alone when saturation is near zero (grays/white/black), since hue
       is meaningless there and re-deriving it would otherwise snap the
       slider back to red every time a near-gray gets applied. */
    const [h, s, v] = hexToHsv(hex);
    if (s > 0.02) currentHue = h;
    currentSat = s;
    currentVal = v;
    if (bgHueInput) bgHueInput.value = Math.round(currentHue);
    updateSvBackground();
    setSvThumbVisual(currentSat, currentVal);
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
        if (styleControl) styleControl.setIndex(0);
      }
    });
  }

  /* Swatches and the hex field both just drive the same real
     <input type=color> + its "input" event, same delegation pattern
     pickBgColor already uses elsewhere in this file — applyBgColor,
     the localStorage save, and the "picking overrides a preset" reset
     above all then happen automatically from that one listener. */
  bgSwatchEls.forEach(el => {
    el.addEventListener("click", () => {
      bgColorInput.value = el.dataset.color;
      bgColorInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  if (bgHexInput){
    function commitBgHex(){
      const val = bgHexInput.value.trim();
      if (!/^#[0-9a-f]{6}$/i.test(val)){
        bgHexInput.value = bgColorInput.value.toUpperCase();
        return;
      }
      bgColorInput.value = val;
      bgColorInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    bgHexInput.addEventListener("change", commitBgHex);
    bgHexInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commitBgHex();
    });
  }

  /* ===== Custom background image =====
     Sits inside the Background panel above, next to the swatches/hex
     field — a plain file picker (hidden <input type=file>, triggered
     by a visible button, same pattern every other tool's upload zone
     uses) rather than a drag target, since this is one small accent
     image, not the tool's primary input. Reads the file as a data URL
     and sets it as previewWrap's own CSS background — same property
     Background/Presets already write to (applyBgColor, applyStyle
     above), so whichever one was picked last simply wins; no separate
     "clear image" control needed since picking a solid color or a
     Style preset overwrites it the same way switching between those
     two already does today. */
  const bgImageTrigger = document.getElementById("cfBgImageTrigger");
  const bgImageInput = document.getElementById("cfBgImageInput");
  let currentBgImageDataUrl = null;
  function applyBgImage(dataUrl){
    currentBgImageDataUrl = dataUrl;
    setPreviewBackground(`url("${dataUrl}") center / cover no-repeat`);
    bgColorSwatch.style.background = `url("${dataUrl}") center / cover no-repeat`;
    bgSwatchEls.forEach(el => el.classList.remove("active"));
    if (currentStyle !== "custom"){
      currentStyle = "custom";
      previewWrap.style.padding = "";
      if (styleControl) styleControl.setIndex(0);
    }
    schedulePersist();
  }
  if (bgImageTrigger && bgImageInput){
    bgImageTrigger.addEventListener("click", () => bgImageInput.click());
    bgImageInput.addEventListener("change", () => {
      const file = bgImageInput.files && bgImageInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        applyBgImage(reader.result);
        closeBgPanel();
      };
      reader.readAsDataURL(file);
      /* Lets picking the exact same file again re-fire "change" (it
         wouldn't otherwise, since the input's value hasn't changed) —
         minor, but matches every other file-input pattern on this
         site. */
      bgImageInput.value = "";
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

  /* ===== drag-to-resize #cfWindow (display size only) — same
     incremental-delta pattern as Colorfy's/Congify's own handle: track
     a virtual width across the whole drag rather than re-deriving it
     from the window's current rendered width each move, so repeated
     small movements don't drift from rounding. Handle itself sits on
     #cfPreviewWrap's own corner (see the CSS), not #cfWindow's — but
     the width it changes is #cfWindow's. */
  /* Shared drag/keyboard wiring for both panel-resize handles below —
     they differ only in which element's width they read/write and
     their own min/max, so one generic setup avoids maintaining two
     near-identical copies of the same pointer-capture/virtual-width
     dance. */
  function setupPanelResizeHandle(handle, getWidth, setWidth, getMin, getMax){
    let resizing = false;
    let lastX = 0;
    let virtualWidth = 0;
    /* previewWrap's own click handler (above) cycles the template/theme
       based on which half of the preview a click landed on — pointerdown's
       stopPropagation below doesn't stop that, since it's the browser's
       own synthesized "click" event that fires after pointerup, a
       separate event entirely. Without this, dragging (or even just
       clicking) either handle also cycled the theme underneath it, since
       neither handle is previewWrap itself so it fell through to the
       left/right-half cycling branch. */
    handle.addEventListener("click", (e) => e.stopPropagation());
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      lastX = e.clientX;
      virtualWidth = getWidth();
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    });
    handle.addEventListener("pointermove", (e) => {
      if (!resizing) return;
      virtualWidth = Math.min(getMax(), Math.max(getMin(), virtualWidth + (e.clientX - lastX)));
      lastX = e.clientX;
      setWidth(Math.round(virtualWidth));
      if (hodHeld && hoverOverlay){ hoverOverlay.hidden = true; hoverOverlay.textContent = ""; }
    });
    function endResize(e){
      resizing = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    handle.addEventListener("pointerup", endResize);
    handle.addEventListener("pointercancel", endResize);

    /* Keyboard equivalent — role="slider", left/right resize by 20px a
       step (same convention as Colorfy's own handle). */
    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const current = getWidth();
      const next = e.key === "ArrowRight" ? current + 20 : current - 20;
      setWidth(Math.round(Math.min(getMax(), Math.max(getMin(), next))));
      if (hodHeld && hoverOverlay){ hoverOverlay.hidden = true; hoverOverlay.textContent = ""; }
    });
  }

  const windowResizeHandle = document.getElementById("cfWindowResizeHandle");
  const resizeHandle = document.getElementById("cfResizeHandle");
  if (toolApp){
    const WINDOW_WIDTH_MIN = 320;
    const WINDOW_WIDTH_MAX = 640;
    /* #cfPreviewWrap's own horizontal padding is NOT a stable 56px the
       way it reads at a glance — Style presets set it to 48px
       (STYLE_PRESETS above), and the max-width:768px media query drops
       it to 24px, both of which used to be silently ignored here (every
       width calc below hardcoded "56 * 2"), overestimating how much
       room the window actually has once a preset was active or the
       viewport got narrow — confirmed live: with a preset applied
       (48px padding), the panel would let the window grow slightly
       wider than it could actually fit, right back into the same
       overflow this whole resize-clamping exists to prevent. Reading
       the real computed padding fixes it for presets, mobile, and any
       future padding change at once instead of chasing each one. */
    function previewWrapPaddingX(){
      const cs = getComputedStyle(previewWrap);
      return parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
    }
    function windowWidthMax(){
      /* Measured against the banner itself (stable), not the window's
         own current width — 36px is .tool-app's own padding on each
         side. */
      const containerMax = toolApp.getBoundingClientRect().width - (36 * 2) - previewWrapPaddingX();
      return Math.min(WINDOW_WIDTH_MAX, containerMax);
    }
    /* The background panel's own min/max: never smaller than the
       window it's wrapping around plus its own padding (recomputed
       live, not a fixed constant, so shrinking the window first
       genuinely lowers how far the panel can shrink too), never wider
       than the banner itself allows. Defined before the window handle
       below, which also needs bgWidthMax/bgWidthMin to keep the panel
       from stranding the window past its own edge. */
    function bgWidthMax(){
      return toolApp.getBoundingClientRect().width - (36 * 2);
    }
    function bgWidthMin(){
      return cfWindow.getBoundingClientRect().width + previewWrapPaddingX();
    }

    if (windowResizeHandle && cfWindowWrap){
      /* Resizes #cfWindowWrap, not #cfWindow itself — #cfWindow is
         width:100% of the wrap (see .cf-window in index.html's own
         <style>), and the handle is anchored to the wrap's corner, not
         the window's. Setting the width on #cfWindow directly left the
         wrap (and the handle sitting on its corner) at its old size
         while only the window inside it visibly shrank, so the handle
         stayed put instead of tracking the corner it's supposed to be
         on — confirmed live: dragging it narrowed the code window but
         the handle itself never moved. */
      setupPanelResizeHandle(
        windowResizeHandle,
        () => cfWindowWrap.getBoundingClientRect().width,
        (px) => {
          cfWindowWrap.style.width = px + "px";
          /* #cfPreviewWrap has no overflow:hidden (its rounded corners
             are meant to frame the window, not crop it), so growing the
             window past a background panel that was previously shrunk
             down (via #cfResizeHandle, below) would otherwise let the
             window visibly spill past the panel's own edge onto the
             page behind it — confirmed live: shrink the panel to its
             minimum, then grow the window, and the code window pokes
             out past the panel onto the pink banner. Only touches the
             panel when it's already been given an explicit width (i.e.
             someone's actually resized it); otherwise it's still just
             filling the row and is already wide enough. */
          if (previewWrap.style.width){
            const neededWrapWidth = px + previewWrapPaddingX();
            if (previewWrap.getBoundingClientRect().width < neededWrapWidth){
              previewWrap.style.width = Math.min(bgWidthMax(), neededWrapWidth) + "px";
            }
          }
        },
        () => WINDOW_WIDTH_MIN,
        windowWidthMax
      );
    }
    if (resizeHandle){
      setupPanelResizeHandle(
        resizeHandle,
        () => previewWrap.getBoundingClientRect().width,
        (px) => { previewWrap.style.width = px + "px"; },
        bgWidthMin,
        bgWidthMax
      );
    }
  }
})();
