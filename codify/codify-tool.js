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

  const TEMPLATES = {
    hello: `function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("world"));`,
    fibonacci: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));`,
    fetch: `async function getUser(id) {
  const res = await fetch(\`/api/users/\${id}\`);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}`,
    class: `class Counter {
  #count = 0;

  increment() {
    this.#count += 1;
    return this.#count;
  }
}`,
    sort: `function bubbleSort(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    for (let j = 0; j < arr.length - 1 - i; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}

console.log(bubbleSort([5, 3, 8, 1, 2]));`,
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

const onResize = debounce(() => console.log("resized"), 200);`,
    promise: `fetchUser(id)
  .then(user => fetchPosts(user.id))
  .then(posts => posts.filter(p => p.published))
  .catch(err => console.error("Failed:", err));`,
    array: `const users = [
  { name: "Ada", age: 28 },
  { name: "Grace", age: 34 }
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

class LinkedList {
  #head = null;

  push(value) {
    const node = new Node(value);
    if (!this.#head) { this.#head = node; return; }
    let cur = this.#head;
    while (cur.next) cur = cur.next;
    cur.next = node;
  }
}`
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
  });

  /* ===== Style presets ===== bundle a theme + a gradient backdrop +
     generous padding into one pick, matching the "signature look"
     treatment popular code-screenshot tools ship (Carbon, Ray.so, etc).
     Window controls and the drop shadow are already always-on (see
     .cf-titlebar / .cf-window box-shadow), so a preset only needs to
     touch theme/background/padding. "Custom" hands control back to the
     Theme and Background pills. */
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

  /* ===== "started" state — sticky once reached =====
     The pickers/preview/download section reveals the first time
     there's real code in the editor, and then stays revealed even if
     that's later deleted back down to empty — clearing the box while
     experimenting shouldn't dump you back to the pre-typing empty
     state. */
  function markStarted(){
    if (codeInput.value.length > 0) afterInput.classList.add("cf-started");
  }

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
  });

  /* Starts empty on purpose — the rest of the tool (pickers, live
     preview, download) is hidden via CSS until :placeholder-shown
     stops matching, so there's nothing to render until then. */
  renderPreview();

  /* ===== drag-to-resize the editor's height (manual override) ===== */
  const resizeHandle = document.getElementById("cfResizeHandle");
  if (resizeHandle){
    let resizing = false;
    let resizeLastY = 0;
    let resizeVirtualHeight = 0;

    resizeHandle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      resizing = true;
      resizeLastY = e.clientY;
      resizeVirtualHeight = codeInput.getBoundingClientRect().height;
      try { resizeHandle.setPointerCapture(e.pointerId); } catch (err) {}
    });
    resizeHandle.addEventListener("pointermove", (e) => {
      if (!resizing) return;
      resizeVirtualHeight = Math.min(CODE_INPUT_MAX_HEIGHT(), Math.max(CODE_INPUT_MIN_HEIGHT, resizeVirtualHeight + (e.clientY - resizeLastY)));
      resizeLastY = e.clientY;
      codeInput.style.height = Math.round(resizeVirtualHeight) + "px";
    });
    function endResize(e){
      resizing = false;
      try { resizeHandle.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    resizeHandle.addEventListener("pointerup", endResize);
    resizeHandle.addEventListener("pointercancel", endResize);

    /* Keyboard equivalent for the same handle (it's a role="slider") —
       ↑/↓ nudge the height by 20px a step. */
    resizeHandle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const current = codeInput.getBoundingClientRect().height;
      const next = e.key === "ArrowUp" ? current - 20 : current + 20;
      codeInput.style.height = Math.min(CODE_INPUT_MAX_HEIGHT(), Math.max(CODE_INPUT_MIN_HEIGHT, next)) + "px";
    });
  }

  /* Mobile-only (see .cf-paste-btn CSS) — replaces the drag-to-resize
     handle in the same corner, since dragging for precise height isn't
     a great touch gesture. Reads the clipboard straight into the field
     and runs the same steps the "input" listener above would for real
     typing, since setting .value programmatically doesn't fire one. */
  if (pasteBtn){
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text){
          codeInput.value = text;
          markStarted();
          autoFitCodeInput();
          renderPreview();
        }
      } catch (err){
        /* clipboard read denied/unsupported — fall through to focus */
      }
      codeInput.focus();
    });
  }

  /* ===== PNG export ===== */
  downloadBtn.addEventListener("click", async () => {
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
      downloadBlob(blob, "codify-snippet.png");
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
  const DEFAULT_BG_COLOR = "#FF4FD8";

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
     Wobbles the banner any time, same as Combine's. */
  const toolApp = document.querySelector(".tool-app");
  if (toolApp){
    toolApp.addEventListener("dblclick", e => {
      if (e.target.closest("button, select, a, label, input, textarea")) return;
      toolApp.classList.remove("wobble");
      void toolApp.offsetWidth;
      toolApp.classList.add("wobble");
    });
  }
})();
