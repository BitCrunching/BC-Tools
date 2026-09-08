/* ===== CONTEXT TOOL (click-to-place text on a PDF, then embed it) =====
   Text boxes are stored in PDF point space (not screen px) so the
   canvas can be re-rendered at a different scale (page change, resize)
   without needing to convert existing boxes' positions. */
(function(){
  const drop = document.getElementById("ctDrop");
  const continueBtn = document.getElementById("ctContinueBtn");
  const input = document.getElementById("ctInput");
  const editor = document.getElementById("ctEditor");
  const toolApp = document.querySelector(".tool-app");

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("context", "ct", [
    ["WELCOME_TO_CONTEXT", "Context lets you type text or drop in a signature anywhere on a PDF, no account or upload required. Click or drop a PDF below to get started."],
    ["CLICK_TO_PLACE_TEXT", "Once a PDF's in, hit Add text (or just click on the page) to drop a text box wherever you need it."],
    ["STYLE_IT_YOUR_WAY", "Pick a color, size, and bold/italic/underline from the toolbar — or add a signature instead of typed text."],
    ["MULTI_PAGE_SUPPORT", "Use the page arrows to move between pages — text boxes stay exactly where you placed them."],
    ["YOU_ARE_SET", "Hit Download when you're done. Close this with the red dot and we won't show it again."]
  ]);

  /* Just a fun double-click easter egg — skips buttons/selects/etc. so
     it never fires from a legitimate double-click on a toolbar control,
     and only while no PDF is loaded (editor stays the real surface for
     interaction once one is). */
  if (toolApp){
    toolApp.addEventListener("dblclick", e => {
      if (!editor.hidden) return;
      if (e.target.closest("button, select, a, label, input")) return;
      toolApp.classList.remove("wobble");
      void toolApp.offsetWidth;
      toolApp.classList.add("wobble");
    });
  }
  const canvas = document.getElementById("ctCanvas");
  const overlay = document.getElementById("ctOverlay");
  const canvasWrap = document.getElementById("ctCanvasWrap");
  const addTextBtn = document.getElementById("ctAddTextBtn");
  const fontSizeTrigger = document.getElementById("ctFontSizeTrigger");
  const fontSizeInput = document.getElementById("ctFontSizeInput");
  const fontSizeMenu = document.getElementById("ctFontSizeMenu");
  const fontSizeEmpty = document.getElementById("ctFontSizeEmpty");
  const colorDropdown = document.getElementById("ctColorDropdown");
  const colorTrigger = document.getElementById("ctColorTrigger");
  const colorTriggerDot = document.getElementById("ctColorTriggerDot");
  const colorTriggerLabel = document.getElementById("ctColorTriggerLabel");
  const colorMenu = document.getElementById("ctColorMenu");
  const boldBtn = document.getElementById("ctBoldBtn");
  const italicBtn = document.getElementById("ctItalicBtn");
  const underlineBtn = document.getElementById("ctUnderlineBtn");
  const pageNav = document.getElementById("ctPageNav");
  const pageNavDesktopSlot = document.getElementById("ctPageNavDesktopSlot");
  const prevPageBtn = document.getElementById("ctPrevPage");
  const nextPageBtn = document.getElementById("ctNextPage");
  const pageLabel = document.getElementById("ctPageLabel");
  const downloadBtn = document.getElementById("ctDownloadBtn");
  const removePdfBtn = document.getElementById("ctRemoveBtn");
  const fullscreenOverlay = document.getElementById("ctFullscreenOverlay");
  const fullscreenCanvasArea = document.getElementById("ctFullscreenCanvasArea");
  const fullscreenBar = document.getElementById("ctFullscreenBar");
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  const toolbarEl = document.querySelector("#page-context .context-toolbar");
  const previewPanel = document.querySelector("#page-context .context-preview-panel");
  const filenameInput = document.getElementById("ctFilenameInput");
  const filenameDropdown = document.getElementById("ctFilenameDropdown");
  const filenameTrigger = document.getElementById("ctFilenameTrigger");
  const filenameTriggerLabel = document.getElementById("ctFilenameTriggerLabel");
  const filenamePopup = document.getElementById("ctFilenamePopup");
  const filenameClear = document.getElementById("ctFilenameClear");
  const status = document.getElementById("ctStatus");
  if (!drop || !input || !editor || !canvas || !overlay || !downloadBtn) return;

  if (window.pdfjsLib){
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
  }

  let currentFile = null;
  let pdfjsDoc = null;
  let pageCount = 1;
  let currentPage = 1;
  let currentRenderTask = null;
  let scale = 1;
  let isFullscreen = false;
  let lastKnownWidth = window.innerWidth;
  let fsZoom = 1;
  let fsPanX = 0;
  let fsPanY = 0;
  let activeColor = "#000000";
  let activeSize = 16;
  let activeBold = false;
  let activeItalic = false;
  let activeUnderline = false;
  /* { page, xPt, yPt, widthPt (approx), sizePt, color, text, bold,
     italic, underline } — yPt is measured from the BOTTOM of the page
     (pdf-lib convention). */
  let textBoxes = [];
  let boxIdSeq = 0;
  let selectedBoxId = null;
  /* { id, page, xPt, topPt, widthPt, heightPt, dataUrl } — a signature
     placed on the page, positioned the same way as a text box (topPt
     measured from the top, converted to pdf-lib's bottom-origin space
     only at download time). */
  let signatureBoxes = [];
  let sigBoxIdSeq = 0;
  let currentFileBytes = null;

  function isPdfFile(f){
    return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  }

  /* ===== Session persistence (IndexedDB) — so a reload/tab-close
     doesn't lose the loaded PDF and its edits. localStorage was ruled
     out: it's a ~5-10MB string-only quota, and a base64'd PDF would eat
     into that fast. IndexedDB has no such practical limit and stores
     the raw bytes directly — still entirely client-side, nothing ever
     leaves the browser. */
  const CTX_DB_NAME = "bctools-context";
  const CTX_DB_STORE = "session";

  function openCtxDb(){
    const opened = new Promise((resolve, reject) => {
      const req = indexedDB.open(CTX_DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(CTX_DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      /* Fires if another tab/connection still has an older-version
         connection open — the request then waits indefinitely for that
         connection to close rather than erroring, which would hang
         every persistence call forever. Racing against a timeout below
         is the safety net; there's nothing meaningful to do here on its
         own since we don't control other tabs' connections. */
      req.onblocked = () => {};
    });
    return Promise.race([
      opened,
      new Promise((_, reject) => setTimeout(() => reject(new Error("IndexedDB open timed out")), 1500))
    ]);
  }

  async function ctxDbPut(value){
    let db;
    try {
      db = await openCtxDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(CTX_DB_STORE, "readwrite");
        tx.objectStore(CTX_DB_STORE).put(value, "current");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* storage unavailable (private browsing etc.) — skip */
    } finally { if (db) db.close(); }
  }

  async function ctxDbGet(){
    let db;
    try {
      db = await openCtxDb();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(CTX_DB_STORE, "readonly").objectStore(CTX_DB_STORE).get("current");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return null;
    } finally { if (db) db.close(); }
  }

  async function ctxDbClear(){
    let db;
    try {
      db = await openCtxDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(CTX_DB_STORE, "readwrite");
        tx.objectStore(CTX_DB_STORE).delete("current");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* ignore */
    } finally { if (db) db.close(); }
  }

  let persistTimer = null;
  function schedulePersist(){
    if (!currentFileBytes) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }

  function persistNow(){
    if (!currentFileBytes) return;
    ctxDbPut({
      fileName: currentFile ? currentFile.name : "document.pdf",
      pdfBytes: currentFileBytes,
      textBoxes,
      signatureBoxes,
      boxIdSeq,
      sigBoxIdSeq,
      currentPage,
      filenameValue: filenameInput.value
    });
  }

  /* Catches anything the targeted schedulePersist() calls elsewhere
     might miss (style/color toggles, font-size changes) without having
     to thread a save call through every single toolbar control. */
  setInterval(() => { if (currentFileBytes) persistNow(); }, 4000);

  /* loadFile() has several `await` points (arrayBuffer, pdf.js parse,
     renderPage's own canvas render) — without a guard, two overlapping
     calls (e.g. the startup session-restore below racing a real user
     upload that happens to land in that same window) can interleave
     and both end up calling page.render() on the same canvas at once,
     which pdf.js rejects outright and was observed to leave the editor
     stuck on "Preparing..." forever. Whichever call arrives first wins
     the lock; a second one arriving mid-load is simply ignored rather
     than allowed to race. */
  let loadFileBusy = false;
  async function loadFile(file, restoreState){
    if (loadFileBusy) return;
    loadFileBusy = true;
    try {
      await loadFileInner(file, restoreState);
    } finally {
      loadFileBusy = false;
    }
  }

  /* restoreState (optional) carries saved boxes/page from a previous
     session — passed in and applied BEFORE the one renderPage() call
     below runs, rather than the old approach of loading normally (one
     render with boxes reset empty) and then re-assigning boxes and
     calling renderPage() a second time. That second call was racing
     other renderPage() callers (window resize, fullscreen open) that
     don't coordinate with each other — both mutating the shared
     `scale` variable and populating the box overlay — and whichever
     finished last won, unpredictably. This way there's only ever one
     render for either a fresh upload or a restore, so there's nothing
     for it to race against. */
  async function loadFileInner(file, restoreState){
    if (!isPdfFile(file)){
      status.textContent = "Context only works with PDF files — \"" + file.name + "\" isn't one.";
      return;
    }
    if (!window.pdfjsLib){
      status.textContent = "PDF engine failed to load.";
      return;
    }
    status.textContent = "Preparing \"" + file.name + "\"...";
    currentFile = file;
    textBoxes = restoreState ? (restoreState.textBoxes || []) : [];
    signatureBoxes = restoreState ? (restoreState.signatureBoxes || []) : [];
    boxIdSeq = restoreState ? (restoreState.boxIdSeq || 0) : 0;
    sigBoxIdSeq = restoreState ? (restoreState.sigBoxIdSeq || 0) : 0;

    /* Reading/parsing a large PDF blocks the main thread hard enough
       that the browser can skip painting the status text above unless
       we explicitly force a frame first — a promise microtask (like the
       arrayBuffer() await right below) isn't enough on its own. */
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    let bytes, doc;
    try {
      bytes = await file.arrayBuffer();
      /* pdf.js can take ownership of/detach the buffer it's given, so
         keep a separate copy for persistence rather than reusing
         `bytes` after handing it off below. */
      currentFileBytes = bytes.slice(0);
      doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    } catch (err){
      console.error(err);
      status.textContent = "Couldn't read that PDF — it may be corrupted or password-protected.";
      return;
    }
    pdfjsDoc = doc;
    pageCount = pdfjsDoc.numPages;
    currentPage = restoreState ? Math.min(Math.max(1, restoreState.currentPage || 1), pageCount) : 1;
    pageNav.hidden = pageCount <= 1;
    downloadBtn.disabled = false;
    filenameInput.value = restoreState && restoreState.filenameValue
      ? restoreState.filenameValue
      : file.name.replace(/\.pdf$/i, "") + "-context";
    updateFilenameTriggerLabel();

    /* Render into the canvas while it's still hidden (off-screen canvas
       drawing works fine) so the preview panel only ever appears with
       the finished page already painted — never as an empty white box
       that fills in a beat later. */
    await renderPage();
    drop.hidden = true;
    editor.hidden = false;
    status.textContent = "";

    /* Mobile: skip the plain in-page editor entirely and go straight to
       the fixed-toolbar fullscreen view — a loaded PDF is tall enough
       that the toolbar would otherwise scroll out of reach and the
       site footer would show up underneath it, which is exactly the
       "too long, hard to manipulate" complaint this replaces. */
    if (mobileMql.matches) await openFullscreen();
    persistNow();
  }

  async function renderPage(){
    /* Rapid page-nav clicks can fire a new renderPage() before the
       previous page.render() on this same canvas has finished, and
       pdf.js throws ("Cannot use the same canvas during multiple
       render() operations") rather than queueing — cancel any
       in-flight render first so the canvas is free for the new one. */
    if (currentRenderTask){
      currentRenderTask.cancel();
      currentRenderTask = null;
    }
    const page = await pdfjsDoc.getPage(currentPage);
    const baseViewport = page.getViewport({ scale: 1 });

    /* Derive the canvas's actual available width from .tool-app's live
       clientWidth (always accurate — unlike .context-preview-panel,
       .tool-app is never itself hidden) minus BOTH .tool-app's own
       padding and .context-preview-panel's padding, read via
       getComputedStyle rather than measured live — padding is a fixed
       CSS length, so that's correct even while the panel's ancestor
       (#ctEditor) is still hidden during the initial render. Previously
       this only subtracted .tool-app's padding, ignoring the panel's,
       so the canvas rendered wider than it had room to display and got
       silently downscaled (blurry, smaller than intended) by the
       wrap's max-width:100%. */
    let availableWidth;
    if (isFullscreen){
      /* Fullscreen's whole point is escaping the card's width cap, so
         measure the actual full-viewport overlay area instead of
         .tool-app (which is still only ~94vw at best). */
      const areaStyle = getComputedStyle(fullscreenCanvasArea);
      availableWidth = fullscreenCanvasArea.clientWidth
        - parseFloat(areaStyle.paddingLeft) - parseFloat(areaStyle.paddingRight);
    } else {
      /* Derive the canvas's actual available width from .tool-app's live
         clientWidth (always accurate — unlike .context-preview-panel,
         .tool-app is never itself hidden) minus BOTH .tool-app's own
         padding and .context-preview-panel's padding, read via
         getComputedStyle rather than measured live — padding is a fixed
         CSS length, so that's correct even while the panel's ancestor
         (#ctEditor) is still hidden during the initial render. Previously
         this only subtracted .tool-app's padding, ignoring the panel's,
         so the canvas rendered wider than it had room to display and got
         silently downscaled (blurry, smaller than intended) by the
         wrap's max-width:100%. */
      const toolApp = canvas.closest(".tool-app");
      const toolAppStyle = getComputedStyle(toolApp);
      const panelStyle = getComputedStyle(canvas.closest(".context-preview-panel"));
      availableWidth = toolApp.clientWidth
        - parseFloat(toolAppStyle.paddingLeft) - parseFloat(toolAppStyle.paddingRight)
        - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight);
    }
    const wrapMaxWidth = Math.min(760, availableWidth);
    scale = Math.min(wrapMaxWidth / baseViewport.width, 1.4);
    const viewport = page.getViewport({ scale });

    /* Canvas backing resolution was previously 1 device pixel per CSS
       pixel — soft even at rest on any retina screen, and pinch-zoom
       in fullscreen only makes it worse since that just CSS-stretches
       the same bitmap further. Render into a backing store scaled up
       by devicePixelRatio (plus extra headroom in fullscreen, where
       pinching in past 1x is the whole point) while keeping the
       on-screen CSS size exactly the same via explicit style.width/
       height, so this is purely a resolution bump, not a layout
       change — text-box math below still uses the un-multiplied
       `scale`/`viewport`. */
    const dpr = window.devicePixelRatio || 1;
    /* Capped at 3x total — dpr alone hits 3 on some iPhones, and
       stacking the extra fullscreen headroom on top uncapped could
       otherwise produce a canvas several thousand pixels per side,
       which is real memory/perf risk on a phone for diminishing
       sharpness gains. */
    const pixelRatio = Math.min(isFullscreen ? dpr * 2 : dpr, 3);
    const renderViewport = page.getViewport({ scale: scale * pixelRatio });

    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";
    overlay.style.width = viewport.width + "px";
    overlay.style.height = viewport.height + "px";

    const renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport: renderViewport });
    currentRenderTask = renderTask;
    try {
      await renderTask.promise;
    } catch (err){
      if (err && err.name === "RenderingCancelledException") return;
      throw err;
    }
    if (currentRenderTask === renderTask) currentRenderTask = null;

    pageLabel.textContent = currentPage + " / " + pageCount;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= pageCount;

    renderTextBoxes();
  }

  /* Drag bounds for text/signature boxes, in the same PDF-point space
     box.xPt/topPt are stored in. The boundary is the dark workspace
     panel around the page, not the page itself — a box's top-left can
     be dragged anywhere into the padding around the page, just never
     past the panel's own edges. canvas.getBoundingClientRect() already
     reflects the page's current real on-screen size (including
     fullscreen zoom), so diffing it against the panel's rect and
     dividing by scale*zoom converts screen px straight to PDF points,
     consistent with how the drag delta itself is converted below.

     box.xPt/topPt mark the box's own top-left corner, not its center —
     so the min side (top/left) only needs the corner itself kept inside
     the panel, but the max side has to leave room for the box's own
     rendered width/height too, or the corner could sit right at the
     panel's far edge while the rest of the box (text, remove button)
     spills past it into whatever's behind the panel entirely. */
  function getDragBoundsPt(zoom, el){
    const canvasRect = canvas.getBoundingClientRect();
    const panelRect = previewPanel.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return {
      minXPt: (panelRect.left - canvasRect.left) / scale / zoom,
      maxXPt: (panelRect.right - canvasRect.left - elRect.width) / scale / zoom,
      minTopPt: (panelRect.top - canvasRect.top) / scale / zoom,
      maxTopPt: (panelRect.bottom - canvasRect.top - elRect.height) / scale / zoom
    };
  }

  function renderTextBoxes(){
    overlay.innerHTML = "";
    textBoxes
      .filter(b => b.page === currentPage)
      .forEach(box => overlay.appendChild(buildBoxEl(box)));
    signatureBoxes
      .filter(b => b.page === currentPage)
      .forEach(box => overlay.appendChild(buildSignatureBoxEl(box)));
    schedulePersist();
  }

  function findBoxById(id){
    return textBoxes.find(b => b.id === id);
  }

  /* Selecting a box syncs the toolbar's size/color controls to show
     that box's own values, so changing them edits the box directly
     instead of just setting the default for the next new box. */
  function selectBox(id){
    selectedBoxId = id;
    const box = findBoxById(id);
    if (box){
      bcSetComboDisplay(fontSizeMenu, fontSizeInput, "size", String(Math.round(box.sizePt)));
      activeColor = box.color;
      const opt = colorMenu.querySelector('[data-color="' + box.color + '"]');
      /* shared/site.js's bcSetColorSwatch — falls back to the raw color
         value when there's no matching preset option (opt.dataset.label
         undefined), same as this always did. */
      bcSetColorSwatch(colorTriggerDot, colorTriggerLabel, box.color, opt ? opt.dataset.label : null);
      colorMenu.querySelectorAll(".context-color-option").forEach(o => {
        o.classList.toggle("active", o === opt);
        o.setAttribute("aria-selected", String(o === opt));
      });
      activeBold = !!box.bold;
      activeItalic = !!box.italic;
      activeUnderline = !!box.underline;
      boldBtn.setAttribute("aria-pressed", String(activeBold));
      italicBtn.setAttribute("aria-pressed", String(activeItalic));
      underlineBtn.setAttribute("aria-pressed", String(activeUnderline));
    }
    overlay.querySelectorAll(".context-text-box").forEach(elx => {
      elx.classList.toggle("selected", elx.dataset.boxId === String(id));
    });
  }

  function deselectBox(){
    selectedBoxId = null;
    overlay.querySelectorAll(".context-text-box.selected").forEach(elx => elx.classList.remove("selected"));
  }

  function buildBoxEl(box){
    const el = document.createElement("div");
    el.className = "context-text-box";
    el.dataset.boxId = box.id;
    el.style.left = (box.xPt * scale) + "px";
    el.style.top = (box.topPt * scale) + "px";

    const handle = document.createElement("span");
    handle.className = "context-text-drag-handle bc-obj-drag-handle";
    handle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
    el.appendChild(handle);

    const inner = document.createElement("span");
    inner.className = "context-text-inner";
    inner.contentEditable = "true";
    inner.spellcheck = false;
    inner.style.fontSize = (box.sizePt * scale) + "px";
    inner.style.color = box.color;
    inner.style.fontWeight = box.bold ? "bold" : "normal";
    inner.style.fontStyle = box.italic ? "italic" : "normal";
    inner.style.textDecoration = box.underline ? "underline" : "none";
    inner.textContent = box.text;
    inner.addEventListener("input", () => {
      box.text = inner.textContent;
      schedulePersist();
    });
    inner.addEventListener("keydown", (e) => {
      if (e.key === "Enter"){
        e.preventDefault();
        inner.blur();
      }
    });
    inner.addEventListener("focus", () => selectBox(box.id));
    el.appendChild(inner);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "context-text-remove bc-obj-remove-btn";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      textBoxes = textBoxes.filter(b => b.id !== box.id);
      if (selectedBoxId === box.id) selectedBoxId = null;
      renderTextBoxes();
    });
    el.appendChild(removeBtn);

    /* Pointer Events cover mouse, touch, and pen with one code path —
       the previous mousedown/mousemove/mouseup version never fired on
       touch devices at all, so dragging a box to move it silently
       didn't work on mobile. Reusing the same pattern for the new
       resize handle gets touch support for free. */
    function startDrag(handleEl, onMove){
      handleEl.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        /* Best-effort — capture keeps events coming even if the pointer
           slides off this small handle mid-drag, but a handful of edge
           cases (or a synthetic pointer) can make it throw. The document
           listeners below are the real safety net either way, matching
           how the original mouse-only version worked. */
        try { handleEl.setPointerCapture(e.pointerId); } catch (err) {}
        const startX = e.clientX;
        const startY = e.clientY;
        const start = { xPt: box.xPt, topPt: box.topPt, sizePt: box.sizePt };
        function onPointerMove(ev){
          onMove(ev.clientX - startX, ev.clientY - startY, start);
        }
        function onPointerUp(){
          document.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointerup", onPointerUp);
          document.removeEventListener("pointercancel", onPointerUp);
          schedulePersist();
        }
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("pointercancel", onPointerUp);
      });
    }

    startDrag(handle, (dx, dy, start) => {
      /* Pointer coordinates are always real screen pixels, even inside
         a pinch-zoomed canvas — a 10px finger movement at 2x fullscreen
         zoom only covers 5px of actual PDF-space, so the zoom factor
         has to come out before converting to points, same as `scale`
         (the PDF render scale) already does. */
      const zoom = isFullscreen ? fsZoom : 1;
      /* Clamped to the dark workspace panel's bounds, not the page's —
         .context-canvas-wrap no longer clips overflow (that was cutting
         off drag/resize handles near any edge), so without a limit here
         a box could be dragged arbitrarily far off the page entirely. */
      const bounds = getDragBoundsPt(zoom, el);
      box.xPt = bounds.maxXPt < bounds.minXPt
        ? (bounds.minXPt + bounds.maxXPt) / 2
        : Math.min(bounds.maxXPt, Math.max(bounds.minXPt, start.xPt + dx / zoom / scale));
      box.topPt = bounds.maxTopPt < bounds.minTopPt
        ? (bounds.minTopPt + bounds.maxTopPt) / 2
        : Math.min(bounds.maxTopPt, Math.max(bounds.minTopPt, start.topPt + dy / zoom / scale));
      el.style.left = (box.xPt * scale) + "px";
      el.style.top = (box.topPt * scale) + "px";
    });

    /* Mobile-only stand-in for the desktop font-size dropdown — drag
       the corner grip instead of picking a size from a menu. Moving it
       down/right grows the text, up/left shrinks it, 1:1 with the drag
       distance in PDF points so the box visibly tracks your finger. */
    const resizeHandle = document.createElement("span");
    resizeHandle.className = "context-text-resize-handle bc-obj-resize-handle";
    resizeHandle.setAttribute("aria-hidden", "true");
    resizeHandle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7 17 17"/><path d="M17 10v7h-7"/></svg>';
    el.appendChild(resizeHandle);

    startDrag(resizeHandle, (dx, dy, start) => {
      const zoom = isFullscreen ? fsZoom : 1;
      const delta = (dx + dy) / 2;
      box.sizePt = Math.max(6, Math.min(120, start.sizePt + delta / zoom / scale));
      inner.style.fontSize = (box.sizePt * scale) + "px";
      /* Dragging a box's own handle is the mobile equivalent of the
         desktop font-size dropdown — remember it the same way, so the
         next "New" text box starts at the size you just landed on
         instead of resetting to 16px each time. */
      activeSize = Math.round(box.sizePt);
      if (selectedBoxId === box.id) bcSetComboDisplay(fontSizeMenu, fontSizeInput, "size", String(activeSize));
    });

    return el;
  }

  function findSignatureBoxById(id){
    return signatureBoxes.find(b => b.id === id);
  }

  function deselectSignatureBox(){
    overlay.querySelectorAll(".context-signature-box.selected").forEach(elx => elx.classList.remove("selected"));
  }

  /* Reuses the same visual drag/resize handles as buildBoxEl's text
     boxes, but resizing here scales the whole image uniformly (keeping
     its aspect ratio) instead of just bumping a font size. */
  function buildSignatureBoxEl(box){
    const el = document.createElement("div");
    el.className = "context-signature-box";
    el.dataset.boxId = box.id;
    el.style.left = (box.xPt * scale) + "px";
    el.style.top = (box.topPt * scale) + "px";
    el.style.width = (box.widthPt * scale) + "px";
    el.style.height = (box.heightPt * scale) + "px";

    const img = document.createElement("img");
    img.src = box.dataUrl;
    img.alt = "Signature";
    el.appendChild(img);

    const handle = document.createElement("span");
    handle.className = "context-text-drag-handle bc-obj-drag-handle";
    handle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
    el.appendChild(handle);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "context-text-remove bc-obj-remove-btn";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      signatureBoxes = signatureBoxes.filter(b => b.id !== box.id);
      renderTextBoxes();
    });
    el.appendChild(removeBtn);

    function startDrag(handleEl, onMove){
      handleEl.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { handleEl.setPointerCapture(e.pointerId); } catch (err) {}
        const startX = e.clientX;
        const startY = e.clientY;
        const start = { xPt: box.xPt, topPt: box.topPt, widthPt: box.widthPt, heightPt: box.heightPt };
        function onPointerMove(ev){
          onMove(ev.clientX - startX, ev.clientY - startY, start);
        }
        function onPointerUp(){
          document.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointerup", onPointerUp);
          document.removeEventListener("pointercancel", onPointerUp);
          schedulePersist();
        }
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("pointercancel", onPointerUp);
      });
    }

    el.addEventListener("pointerdown", () => {
      deselectBox();
      deselectSignatureBox();
      el.classList.add("selected");
    });

    startDrag(handle, (dx, dy, start) => {
      const zoom = isFullscreen ? fsZoom : 1;
      /* Same workspace-panel clamp as text boxes — see the comment on
         getDragBoundsPt(). */
      const bounds = getDragBoundsPt(zoom, el);
      box.xPt = bounds.maxXPt < bounds.minXPt
        ? (bounds.minXPt + bounds.maxXPt) / 2
        : Math.min(bounds.maxXPt, Math.max(bounds.minXPt, start.xPt + dx / zoom / scale));
      box.topPt = bounds.maxTopPt < bounds.minTopPt
        ? (bounds.minTopPt + bounds.maxTopPt) / 2
        : Math.min(bounds.maxTopPt, Math.max(bounds.minTopPt, start.topPt + dy / zoom / scale));
      el.style.left = (box.xPt * scale) + "px";
      el.style.top = (box.topPt * scale) + "px";
    });

    const resizeHandle = document.createElement("span");
    resizeHandle.className = "context-text-resize-handle bc-obj-resize-handle";
    resizeHandle.setAttribute("aria-hidden", "true");
    resizeHandle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7 17 17"/><path d="M17 10v7h-7"/></svg>';
    el.appendChild(resizeHandle);

    startDrag(resizeHandle, (dx, dy, start) => {
      const zoom = isFullscreen ? fsZoom : 1;
      const ratio = start.widthPt / start.heightPt;
      const growth = (dx + dy) / 2 / zoom / scale;
      box.widthPt = Math.max(20, start.widthPt + growth);
      box.heightPt = box.widthPt / ratio;
      el.style.width = (box.widthPt * scale) + "px";
      el.style.height = (box.heightPt * scale) + "px";
    });

    return el;
  }

  function dataUrlToBytes(dataUrl){
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function addSignatureBox(dataUrl, naturalWidth, naturalHeight){
    /* Land it at a sensible fixed width (144pt ≈ 2in on a US Letter
       page) instead of the image's raw pixel size, which could be
       anywhere from tiny to huge depending on the source photo. */
    const widthPt = 144;
    const heightPt = widthPt * (naturalHeight / naturalWidth);
    const box = {
      id: ++sigBoxIdSeq,
      page: currentPage,
      xPt: (overlay.clientWidth / scale / 2) - (widthPt / 2),
      topPt: (overlay.clientHeight / scale / 2) - (heightPt / 2),
      widthPt,
      heightPt,
      dataUrl
    };
    signatureBoxes.push(box);
    renderTextBoxes();
  }

  function addTextBox(){
    const sizePt = activeSize;
    const box = {
      id: ++boxIdSeq,
      page: currentPage,
      xPt: (overlay.clientWidth / scale / 2) - 40,
      topPt: (overlay.clientHeight / scale / 2) - (sizePt / 2),
      sizePt,
      color: activeColor,
      bold: activeBold,
      italic: activeItalic,
      underline: activeUnderline,
      text: "Lorem Ipsum"
    };
    textBoxes.push(box);
    renderTextBoxes();
    const el = overlay.lastChild;
    const inner = el && el.querySelector(".context-text-inner");
    if (inner){
      inner.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(inner);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  input.addEventListener("change", (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
    input.value = "";
  });

  /* Before a PDF is loaded, the whole banner acts as the drop zone —
     not just the dashed box. Once a file lands, #ctEditor takes over
     the whole card and drop is hidden entirely, so this delegation is
     scoped to only fire while editor is still hidden. */
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (!editor.hidden) return;
      if (e.target.closest("button, select, a, label, input")) return;
      input.click();
    });
  }

  function isDragEventInScope(){
    return editor.hidden;
  }
  bcSetupBannerDropTarget(toolApp, {
    isInScope: isDragEventInScope,
    onDrop: e => { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); }
  });

  addTextBtn.addEventListener("click", addTextBox);

  /* Shared by the "remove file" (×) button and by closing fullscreen on
     mobile — since fullscreen is a mobile-only feature (the expand
     button that opens it never shows on desktop), exiting it always
     means leaving the editor entirely, not returning to some in-page
     "normal" view that mobile no longer uses. */
  function resetEditor(){
    currentFile = null;
    currentFileBytes = null;
    pdfjsDoc = null;
    textBoxes = [];
    signatureBoxes = [];
    selectedBoxId = null;
    drop.hidden = false;
    editor.hidden = true;
    downloadBtn.disabled = true;
    filenameInput.value = "";
    updateFilenameTriggerLabel();
    status.textContent = "";
    ctxDbClear();
  }

  removePdfBtn.addEventListener("click", () => {
    if (isFullscreen){
      closeFullscreen();
    } else {
      resetEditor();
    }
  });

  /* Fullscreen reuses the real toolbar and preview panel by moving
     them into the overlay rather than duplicating markup/state — every
     button keeps the exact same listeners and closures either way, so
     there's nothing to keep in sync between the two layouts. */
  function applyFsTransform(){
    canvasWrap.style.transform = "translate(" + fsPanX + "px, " + fsPanY + "px) scale(" + fsZoom + ")";
  }

  function resetFsZoom(){
    fsZoom = 1;
    fsPanX = 0;
    fsPanY = 0;
    canvasWrap.style.transform = "";
  }

  /* Desktop keeps page-nav in the toolbar (its original spot, before
     ctFilenameDropdown); mobile moves the same element below the canvas
     instead, where it's easier to reach and doesn't crowd the single-row
     toolbar. One element, relocated by viewport rather than duplicated. */
  const mobileMql = window.matchMedia("(max-width:768px)");
  function positionPageNav(){
    if (mobileMql.matches){
      previewPanel.appendChild(pageNav);
    } else {
      pageNavDesktopSlot.parentNode.insertBefore(pageNav, pageNavDesktopSlot);
    }
  }
  positionPageNav();
  mobileMql.addEventListener("change", positionPageNav);

  async function openFullscreen(){
    if (isFullscreen) return;
    isFullscreen = true;
    /* Moves the entire overlay out from under #app-shell's light-theme
       invert filter — the reliable fix for saturated colors (yellow
       toolbar, red remove button) that don't survive that filter's
       round-trip math intact; see the CSS comments on
       .context-fullscreen-overlay and .context-fullscreen-bar
       .context-toolbar for the full reasoning. Moved back to its
       original spot (as #ctEditor's last child, matching source order)
       in closeFullscreen. */
    document.body.appendChild(fullscreenOverlay);
    fullscreenCanvasArea.appendChild(previewPanel);
    fullscreenBar.appendChild(toolbarEl);
    /* The rename popup is pinned (position:fixed) to the top of the
       screen — keeping it as a direct child of the overlay (rather
       than nested inside the toolbar) means its own position:fixed
       resolves against this overlay's box, not wherever inside the
       toolbar it happened to sit; moved back on close so its home DOM
       position is unchanged outside fullscreen. */
    fullscreenOverlay.appendChild(filenamePopup);
    fullscreenOverlay.hidden = false;
    /* Belt-and-suspenders: force the critical positioning inline so a
       stale cached stylesheet (a real, previously-seen failure mode on
       iOS Safari) can't leave this rendering as normal in-page content
       instead of a true fullscreen layer — that's exactly what makes
       the toolbar appear to "duplicate" further down the page. */
    fullscreenOverlay.style.position = "fixed";
    fullscreenOverlay.style.top = "0";
    fullscreenOverlay.style.left = "0";
    fullscreenOverlay.style.zIndex = "2000";
    /* In light theme, #app-shell's own invert filter makes every
       position:fixed descendant (this overlay, its close button, the
       rename bar pinned to the top) behave like position:absolute
       relative to #app-shell instead — a real CSS spec side effect of
       `filter`, not a bug we can opt out of. Locking scroll below
       stops it from drifting any further once open, but whatever
       scroll offset happened to exist at THIS exact moment becomes its
       permanent "zero" — if the page wasn't already at the very top
       (e.g. mid-scroll when the file finished loading), everything
       pinned to "the top of the screen" would silently render that
       many pixels too low, up to appearing near the bottom instead.
       Scrolling to a known 0 first removes that variable entirely. */
    window.scrollTo(0, 0);
    document.documentElement.style.overflow = "hidden";
    /* iOS Safari auto-zooms the whole page on focus for any input/
       contentEditable rendered under 16px — text boxes here render at
       PDF-scale, often well under that, so tapping one to type used to
       trigger the browser's own native zoom on top of our custom
       pinch/pan transform, leaving the page zoomed in with the fixed
       toolbar pushed out of view and no way back without pinching out.
       Locking the viewport's max-scale while fullscreen is open (same
       lifetime as the scroll lock above) removes the trigger entirely
       without having to keep every text box artificially >=16px. */
    if (viewportMeta){
      viewportMeta.dataset.prevContent = viewportMeta.getAttribute("content");
      viewportMeta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    }
    resetFsZoom();
    /* Was previously fire-and-forget (not awaited) — that let this
       render race a caller's own subsequent renderPage() call (e.g.
       the session-restore flow re-rendering once the real saved boxes
       are back in memory). Both mutate the shared `scale` variable and
       both populate the overlay; whichever happened to finish last won,
       unpredictably — observed as the canvas coming out at the wrong
       (pre-fullscreen) scale with boxes positioned against a different
       one. Awaiting here, and at the one call site below, makes
       fullscreen's own render fully finish before anything after it
       (including a caller's re-render) can start. */
    if (pdfjsDoc) await renderPage();
    /* Layout-independent safety net: if any viewport/layout quirk ever
       hides the close button again, the phone's native back gesture or
       button still closes this — it doesn't depend on anything on
       screen being reachable. */
    history.pushState({ ctFullscreen: true }, "");
  }

  function closeFullscreen(fromPopstate){
    if (!isFullscreen) return;
    isFullscreen = false;
    resetFsZoom();
    editor.insertBefore(toolbarEl, editor.firstChild);
    editor.appendChild(previewPanel);
    filenameDropdown.appendChild(filenamePopup);
    filenamePopup.hidden = true;
    filenameTrigger.setAttribute("aria-expanded", "false");
    /* Restores original source order: toolbar, then panel, then the
       overlay last — matching the markup this was moved out of in
       openFullscreen. */
    editor.appendChild(fullscreenOverlay);
    fullscreenOverlay.hidden = true;
    fullscreenOverlay.style.position = "";
    fullscreenOverlay.style.top = "";
    fullscreenOverlay.style.left = "";
    fullscreenOverlay.style.zIndex = "";
    document.documentElement.style.overflow = "";
    if (viewportMeta && viewportMeta.dataset.prevContent){
      viewportMeta.setAttribute("content", viewportMeta.dataset.prevContent);
      delete viewportMeta.dataset.prevContent;
    }
    /* Fullscreen only ever opens on mobile, and mobile no longer has a
       plain in-page editor to fall back to — closing it (via the × or
       the back gesture) means leaving the editor, same as removing the
       file. */
    resetEditor();
    if (!fromPopstate && history.state && history.state.ctFullscreen){
      history.back();
    }
  }

  window.addEventListener("popstate", () => {
    if (isFullscreen) closeFullscreen(true);
  });

  /* Safety net for the case the two preventScroll fixes above can't
     cover: tapping an *existing* text box to edit it focuses it
     natively (no .focus() call of ours to attach preventScroll to),
     and iOS Safari can still scroll the real document to reveal it —
     dragging the footer into view from underneath the fixed overlay.
     Snapping window scroll back to 0 right after any focus inside the
     overlay undoes that scroll regardless of what triggered it. */
  fullscreenOverlay.addEventListener("focusin", () => {
    if (!isFullscreen) return;
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    });
  });

  /* Pinch-to-zoom and pan, scoped to the canvas only — this is the
     actual point of fullscreen: magnify the PDF content itself while
     the toolbar around it stays fixed-size and fully usable, unlike
     the browser's native pinch-zoom which scales literally everything
     (buttons included) and is awkward inside a bordered box anyway.
     Text-box handles call e.stopPropagation() on their own
     pointerdown, so a drag/resize on a box never reaches this — only
     genuine gestures on the empty canvas background do. */
  (function setupFullscreenPinchZoom(){
    const activePointers = new Map();
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let panPointerId = null;
    let panStartX = 0;
    let panStartY = 0;
    let panStartPanX = 0;
    let panStartPanY = 0;
    let lastTapTime = 0;

    function dist(a, b){
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function mid(a, b){
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    fullscreenCanvasArea.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".context-text-box")) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 2){
        panPointerId = null;
        const pts = [...activePointers.values()];
        pinchStartDist = dist(pts[0], pts[1]);
        pinchStartZoom = fsZoom;
      } else if (activePointers.size === 1 && fsZoom > 1.02){
        const now = Date.now();
        if (now - lastTapTime < 300){
          resetFsZoom();
          lastTapTime = 0;
          return;
        }
        lastTapTime = now;
        panPointerId = e.pointerId;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartPanX = fsPanX;
        panStartPanY = fsPanY;
      }
    });

    fullscreenCanvasArea.addEventListener("pointermove", (e) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 2){
        const pts = [...activePointers.values()];
        const newDist = dist(pts[0], pts[1]);
        const m = mid(pts[0], pts[1]);
        if (pinchStartDist > 0){
          const newZoom = Math.max(1, Math.min(4, pinchStartZoom * (newDist / pinchStartDist)));
          /* Zoom (and any drift from the fingers moving together)
             pivots around wherever the two fingers currently are, not
             canvasWrap's fixed transform-origin corner — recomputed
             fresh every frame from its live on-screen rect so the same
             PDF point stays pinned under the fingers as you pinch,
             instead of the page sliding toward the top-left corner. */
          const rect = canvasWrap.getBoundingClientRect();
          const localX = (m.x - rect.left) / fsZoom;
          const localY = (m.y - rect.top) / fsZoom;
          fsPanX += localX * (fsZoom - newZoom);
          fsPanY += localY * (fsZoom - newZoom);
          fsZoom = newZoom;
        }
        if (fsZoom <= 1.001){ fsPanX = 0; fsPanY = 0; }
        applyFsTransform();
      } else if (panPointerId === e.pointerId){
        fsPanX = panStartPanX + (e.clientX - panStartX);
        fsPanY = panStartPanY + (e.clientY - panStartY);
        applyFsTransform();
      }
    });

    function endPointer(e){
      activePointers.delete(e.pointerId);
      if (panPointerId === e.pointerId) panPointerId = null;
      pinchStartDist = 0;
    }
    fullscreenCanvasArea.addEventListener("pointerup", endPointer);
    fullscreenCanvasArea.addEventListener("pointercancel", endPointer);
  })();

  window.addEventListener("resize", () => {
    /* iOS Safari fires "resize" constantly while scrolling — its
       address bar collapses/expands, changing the visual viewport
       HEIGHT — which used to re-trigger a full async re-render on
       every scroll tick, flashing the canvas blank mid-render. Our
       canvas sizing is width-driven only, so a height-only change
       (the common case on mobile) has nothing to actually resize for. */
    if (window.innerWidth === lastKnownWidth) return;
    lastKnownWidth = window.innerWidth;
    if (isFullscreen && pdfjsDoc) renderPage();
  });

  /* Keyboard shortcuts: "T" adds a text box, "R" opens the rename-file
     popup (desktop only — no on-screen keyboard to conflict with).
     Ignored while typing anywhere editable, with a modifier held, or off
     the Context page. */
  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key !== "t" && key !== "r") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (editor.hidden) return;
    if (!document.getElementById("page-context").classList.contains("active")) return;

    const target = e.target;
    const isEditable = target.isContentEditable
      || target.tagName === "INPUT"
      || target.tagName === "SELECT"
      || target.tagName === "TEXTAREA";
    if (isEditable) return;

    e.preventDefault();
    if (key === "t") addTextBox();
    else filenameTrigger.click();
  });

  /* Same overflow risk as the filename popup, worse on mobile: once the
     trigger goes icon-only (34px) its own dropdown container shrinks to
     match, but the menu's row of 5 color swatches doesn't — left:0;
     right:0 ties the menu's box to that narrow container while its
     flex:1 children spill out past it onto whatever toolbar buttons
     happen to sit to the right. Clamp it on-screen explicitly, same as
     the filename popup. */
  function clampColorMenu(){
    colorMenu.style.left = "";
    colorMenu.style.right = "";
    const margin = 12;
    const containerRect = colorDropdown.getBoundingClientRect();
    const menuWidth = colorMenu.offsetWidth;
    const naturalLeft = containerRect.right - menuWidth;
    const clampedLeft = Math.max(margin, Math.min(naturalLeft, window.innerWidth - menuWidth - margin));
    if (clampedLeft !== naturalLeft){
      colorMenu.style.left = (clampedLeft - containerRect.left) + "px";
      colorMenu.style.right = "auto";
    }
  }

  colorTrigger.addEventListener("click", () => {
    const willOpen = colorMenu.hidden;
    colorMenu.hidden = !willOpen;
    colorTrigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) clampColorMenu();
  });

  window.addEventListener("resize", () => {
    if (!colorMenu.hidden) clampColorMenu();
  });

  colorMenu.addEventListener("click", (e) => {
    const opt = e.target.closest(".context-color-option");
    if (!opt) return;
    activeColor = opt.dataset.color;
    bcApplyColorOption(colorTriggerDot, colorTriggerLabel, opt);
    colorMenu.querySelectorAll(".context-color-option").forEach(o => {
      o.classList.toggle("active", o === opt);
      o.setAttribute("aria-selected", String(o === opt));
    });
    colorMenu.hidden = true;
    colorTrigger.setAttribute("aria-expanded", "false");

    if (selectedBoxId){
      const box = findBoxById(selectedBoxId);
      if (box && box.page === currentPage){
        box.color = activeColor;
        const boxEl = overlay.querySelector('[data-box-id="' + selectedBoxId + '"]');
        const innerEl = boxEl && boxEl.querySelector(".context-text-inner");
        if (innerEl) innerEl.style.color = activeColor;
      }
    }
  });

  bcRegisterCombo(fontSizeTrigger, fontSizeInput, fontSizeMenu, fontSizeEmpty, (opt) => {
    /* Remembered as the default for the *next* new text box regardless
       of whether one is currently selected — same continuity idea as
       the resize-handle drag below. */
    activeSize = parseInt(opt.dataset.size, 10) || activeSize;
    if (!selectedBoxId) return;
    const box = findBoxById(selectedBoxId);
    if (!box || box.page !== currentPage) return;
    box.sizePt = activeSize;
    const boxEl = overlay.querySelector('[data-box-id="' + selectedBoxId + '"]');
    const innerEl = boxEl && boxEl.querySelector(".context-text-inner");
    if (innerEl) innerEl.style.fontSize = (box.sizePt * scale) + "px";
  });

  function toggleStyleProp(btn, propName, cssProp, onValue, offValue){
    btn.addEventListener("click", () => {
      const nowActive = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(nowActive));

      if (selectedBoxId){
        const box = findBoxById(selectedBoxId);
        if (box && box.page === currentPage){
          box[propName] = nowActive;
          const boxEl = overlay.querySelector('[data-box-id="' + selectedBoxId + '"]');
          const innerEl = boxEl && boxEl.querySelector(".context-text-inner");
          if (innerEl) innerEl.style[cssProp] = nowActive ? onValue : offValue;
        }
      }

      if (propName === "bold") activeBold = nowActive;
      if (propName === "italic") activeItalic = nowActive;
      if (propName === "underline") activeUnderline = nowActive;
    });
  }

  toggleStyleProp(boldBtn, "bold", "fontWeight", "bold", "normal");
  toggleStyleProp(italicBtn, "italic", "fontStyle", "italic", "normal");
  toggleStyleProp(underlineBtn, "underline", "textDecoration", "underline", "none");

  document.addEventListener("click", (e) => {
    if (!colorDropdown.contains(e.target)){
      colorMenu.hidden = true;
      colorTrigger.setAttribute("aria-expanded", "false");
    }
    if (!filenameDropdown.contains(e.target)){
      filenamePopup.hidden = true;
      filenameTrigger.setAttribute("aria-expanded", "false");
    }
  });

  /* Trigger always reads "Rename file" — the actual current name shows
     inside the popup itself once opened, not on the button. */
  function updateFilenameTriggerLabel(){
    filenameTriggerLabel.textContent = "Rename file";
  }

  /* The trigger's own visible label is plain JS-set text (not
     data-i18n — that would blindly reset it to whatever the "Black"
     default option translates to, discarding the user's actual
     selection). data-i18n-cell-label on each option already refreshes
     option.dataset.label to the new language by the time bc:langchange
     fires below it just needs re-reading for the CURRENTLY selected
     color. */
  document.addEventListener("bc:langchange", () => {
    const opt = colorMenu.querySelector('[data-color="' + activeColor + '"]');
    if (opt) colorTriggerLabel.textContent = opt.dataset.label;
  });

  /* The popup defaults to right:0 on its dropdown container, which only
     sits flush with the viewport's right edge on wide screens. On
     narrow viewports the container can be anywhere in the flex-wrapped
     toolbar, so a near-full-width popup can run off the LEFT edge of
     the screen. Clamp it on-screen explicitly, and keep it clamped if
     the viewport resizes (e.g. a phone rotating) while it's open. */
  function clampFilenamePopup(){
    /* In fullscreen the popup is pinned to the top of the screen via
       CSS (position:fixed, left/right:16px) instead of being anchored
       relative to the trigger button — this trigger-relative math
       would fight that and misplace it, so skip it entirely there. */
    if (isFullscreen) return;
    filenamePopup.style.left = "";
    filenamePopup.style.right = "";
    const margin = 12;
    const containerRect = filenameDropdown.getBoundingClientRect();
    const popupWidth = filenamePopup.offsetWidth;
    const naturalLeft = containerRect.right - popupWidth;
    const clampedLeft = Math.max(margin, Math.min(naturalLeft, window.innerWidth - popupWidth - margin));
    if (clampedLeft !== naturalLeft){
      filenamePopup.style.left = (clampedLeft - containerRect.left) + "px";
      filenamePopup.style.right = "auto";
    }
  }

  filenameTrigger.addEventListener("click", () => {
    const willOpen = filenamePopup.hidden;
    filenamePopup.hidden = !willOpen;
    filenameTrigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen){
      clampFilenamePopup();
      /* preventScroll stops iOS Safari's native "scroll the focused
         input above the keyboard" behavior — inside fullscreen that
         scroll drags the whole real document (including the footer
         sitting below the fixed overlay) into view, since it isn't
         blocked by the documentElement overflow:hidden lock used
         everywhere else here. */
      filenameInput.focus({ preventScroll: true });
      filenameInput.select();
    }
  });

  window.addEventListener("resize", () => {
    if (!filenamePopup.hidden) clampFilenamePopup();
  });

  filenameInput.addEventListener("input", updateFilenameTriggerLabel);

  filenameClear.addEventListener("click", () => {
    filenameInput.value = "";
    updateFilenameTriggerLabel();
    filenameInput.focus({ preventScroll: true });
  });

  filenameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      filenamePopup.hidden = true;
      filenameTrigger.setAttribute("aria-expanded", "false");
    }
  });

  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1){
      currentPage--;
      selectedBoxId = null;
      renderPage();
    }
  });
  nextPageBtn.addEventListener("click", () => {
    if (currentPage < pageCount){
      currentPage++;
      selectedBoxId = null;
      renderPage();
    }
  });

  downloadBtn.addEventListener("click", async () => {
    if (!currentFile) return;
    downloadBtn.disabled = true;
    status.textContent = "Preparing your PDF...";
    startPrivacyCheck();

    try {
      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const bytes = await currentFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes);

      /* Bold/italic aren't a style flag on Helvetica — pdf-lib's base 14
         fonts include separate bold/oblique/bold-oblique variants, so
         pick the matching embedded font per box instead. */
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
      const pages = pdfDoc.getPages();

      textBoxes.forEach(box => {
        const page = pages[box.page - 1];
        if (!page || !box.text) return;
        const pageHeight = page.getHeight();
        const r = parseInt(box.color.slice(1, 3), 16) / 255;
        const g = parseInt(box.color.slice(3, 5), 16) / 255;
        const b = parseInt(box.color.slice(5, 7), 16) / 255;
        const color = rgb(r, g, b);
        const font = box.bold && box.italic ? fontBoldItalic
          : box.bold ? fontBold
          : box.italic ? fontItalic
          : fontRegular;
        const x = box.xPt + 18;
        const y = pageHeight - box.topPt - box.sizePt;

        page.drawText(box.text, { x, y, size: box.sizePt, font, color });

        if (box.underline){
          const textWidth = font.widthOfTextAtSize(box.text, box.sizePt);
          page.drawLine({
            start: { x, y: y - box.sizePt * 0.1 },
            end: { x: x + textWidth, y: y - box.sizePt * 0.1 },
            thickness: Math.max(1, box.sizePt * 0.05),
            color
          });
        }
      });

      for (const box of signatureBoxes){
        const page = pages[box.page - 1];
        if (!page) continue;
        const pageHeight = page.getHeight();
        /* Decoding the data URL directly (base64 -> bytes) instead of
           routing it through fetch()'s Response/stream machinery saves
           real time here — on iOS Safari, navigator.share() below only
           works within a short window after the tap that triggered
           this handler, and every bit of avoidable delay in this loop
           eats into that budget. */
        const pngBytes = dataUrlToBytes(box.dataUrl);
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const x = box.xPt;
        const y = pageHeight - box.topPt - box.heightPt;
        page.drawImage(pngImage, { x, y, width: box.widthPt, height: box.heightPt });
      }

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes], { type: "application/pdf" });
      const chosenName = filenameInput.value.trim() || currentFile.name.replace(/\.pdf$/i, "") + "-context";
      const fileName = chosenName.replace(/\.pdf$/i, "") + ".pdf";
      const outFile = new File([blob], fileName, { type: "application/pdf" });

      function anchorDownload(){
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = "Done. Downloaded your edited PDF.";
      }

      /* iOS Safari doesn't reliably honor <a download> for PDFs — it
         just opens the file straight in its own built-in viewer
         instead of saving it, with no real "downloaded" moment to
         report (which is exactly what was happening: the status said
         "Downloaded" while nothing had actually saved anywhere). The
         Web Share API opens the native Share sheet directly, where
         "Save to Files" is one tap away — the normal, expected way to
         get a file out of Safari on iPhone. Gated on viewport width,
         not just feature support — Windows Chrome/Edge also implement
         canShare({files}) via the OS share flyout, so relying on
         feature-detection alone (as this once did) hijacked the
         desktop download into an unwanted share popup there too. The
         width check matches the pattern already used by the page's
         other share button. */
      if (window.innerWidth <= 768 && navigator.canShare && navigator.canShare({ files: [outFile] })){
        try {
          await navigator.share({ files: [outFile], title: fileName });
          status.textContent = "";
        } catch (shareErr){
          /* AbortError = the user themself dismissed the share sheet —
             respect that, don't force a second download on them. Any
             other error (observed on a real iPhone: the sheet just
             never opens, no visible error at all) most likely means
             Safari silently refused the share call because too much
             time passed between the tap and getting here — PDF
             generation above (embedding fonts, drawing every text box)
             can eat through Safari's "this came from a real tap"
             activation window. Rather than leave the user stuck with
             no feedback and no file, fall back to the plain download,
             which has no such timing requirement. */
          if (shareErr.name !== "AbortError") anchorDownload();
        }
      } else {
        anchorDownload();
      }
    } catch (err){
      console.error(err);
      status.textContent = "Something went wrong — please try again.";
    } finally {
      downloadBtn.disabled = false;
      finishPrivacyCheck(document.getElementById("ctPrivacyBadge"));
    }
  });

  window.addEventListener("resize", () => {
    /* Same iOS scroll-triggers-resize issue as the fullscreen listener
       above — only re-render on an actual width change. */
    if (window.innerWidth === lastKnownWidth) return;
    lastKnownWidth = window.innerWidth;
    if (pdfjsDoc) renderPage();
  });

  /* ===== Signature capture: photo -> crop -> background removal ->
     optional touch-up eraser -> saved as a PNG data URL in
     localStorage. Everything below runs entirely in the browser —
     no upload, no server, no ML model. Background removal is plain
     pixel math: blur the photo to approximate its own lighting, divide
     it out to flatten shadows/vignetting, then threshold what's left
     (ink is dark relative to its local surroundings even under bad
     lighting; paper isn't). */
  const SIG_STORAGE_KEY = "bctools_ctx_signature_v1";
  const sigBtn = document.getElementById("ctSignatureBtn");
  const sigOverlay = document.getElementById("ctSigOverlay");
  const sigClose = document.getElementById("ctSigClose");
  const sigStepChoose = document.getElementById("ctSigStepChoose");
  const sigSavedWrap = document.getElementById("ctSigSavedWrap");
  const sigSavedPreview = document.getElementById("ctSigSavedPreview");
  const sigPlaceSavedBtn = document.getElementById("ctSigPlaceSaved");
  const sigReplaceBtn = document.getElementById("ctSigReplace");
  const sigChoiceWrap = document.getElementById("ctSigChoiceWrap");
  const sigUploadBtn = document.getElementById("ctSigUploadBtn");
  const sigDrawBtn = document.getElementById("ctSigDrawBtn");
  const sigFileInput = document.getElementById("ctSigFileInput");
  const sigCameraBtn = document.getElementById("ctSigCameraBtn");
  const sigStepCamera = document.getElementById("ctSigStepCamera");
  const sigVideo = document.getElementById("ctSigVideo");
  const sigCameraGuides = document.getElementById("ctSigCameraGuides");
  const sigBadgeLight = document.getElementById("ctSigBadgeLight");
  const sigBadgeBlur = document.getElementById("ctSigBadgeBlur");
  const sigCameraError = document.getElementById("ctSigCameraError");
  const sigCameraCaptureBtn = document.getElementById("ctSigCameraCapture");
  const sigCameraCancelBtn = document.getElementById("ctSigCameraCancel");
  const sigStepCrop = document.getElementById("ctSigStepCrop");
  const sigCropWrap = document.getElementById("ctSigCropWrap");
  const sigCropImg = document.getElementById("ctSigCropImg");
  const sigCropBox = document.getElementById("ctSigCropBox");
  const sigCropNextBtn = document.getElementById("ctSigCropNext");
  const sigStepDraw = document.getElementById("ctSigStepDraw");
  const sigDrawCanvas = document.getElementById("ctSigDrawCanvas");
  const sigDrawClearBtn = document.getElementById("ctSigDrawClear");
  const sigDrawNextBtn = document.getElementById("ctSigDrawNext");
  const sigStepClean = document.getElementById("ctSigStepClean");
  const sigCleanCanvas = document.getElementById("ctSigCleanCanvas");
  const sigColorRow = document.getElementById("ctSigColorRow");
  const sigSaveBtn = document.getElementById("ctSigSave");

  if (sigBtn && sigOverlay){
    /* Historical note: this reparenting to <body> was originally required
       because #app-shell used to carry a light-theme filter, and a CSS
       filter on an ancestor creates a new containing block for
       position:fixed descendants — this modal would render "fixed"
       relative to #app-shell instead of the real viewport and could end
       up off-screen. #app-shell no longer has any filter (real light/
       dark tokens replaced it), so this specific bug no longer applies —
       left in place since it's harmless and removing it isn't verified
       against the live editor yet. */
    document.body.appendChild(sigOverlay);

    let sigSourceCanvas = null; // full-resolution cropped source, before cleanup
    let sigCleanBaseImageData = null; // result of illumination-normalize + threshold, before erasing
    let sigCleanCtx = null;

    function getSavedSignature(){
      try { return localStorage.getItem(SIG_STORAGE_KEY); } catch (e) { return null; }
    }
    function setSavedSignature(dataUrl){
      try { localStorage.setItem(SIG_STORAGE_KEY, dataUrl); } catch (e) { /* storage unavailable */ }
    }

    function showSigStep(step){
      [sigStepChoose, sigStepCamera, sigStepCrop, sigStepDraw, sigStepClean].forEach(s => { s.hidden = (s !== step); });
      if (step !== sigStepCamera) stopCamera();
    }

    function openSigModal(){
      const saved = getSavedSignature();
      if (saved){
        sigSavedPreview.src = saved;
        sigSavedWrap.hidden = false;
        sigChoiceWrap.hidden = true;
      } else {
        sigSavedWrap.hidden = true;
        sigChoiceWrap.hidden = false;
      }
      showSigStep(sigStepChoose);
      sigOverlay.hidden = false;
    }

    function closeSigModal(){
      sigOverlay.hidden = true;
      stopCamera();
    }

    sigBtn.addEventListener("click", openSigModal);
    sigClose.addEventListener("click", closeSigModal);
    sigOverlay.addEventListener("click", (e) => { if (e.target === sigOverlay) closeSigModal(); });

    sigPlaceSavedBtn.addEventListener("click", () => {
      const saved = getSavedSignature();
      if (!saved) return;
      const img = new Image();
      img.onload = () => {
        addSignatureBox(saved, img.naturalWidth, img.naturalHeight);
        closeSigModal();
      };
      img.src = saved;
    });

    sigReplaceBtn.addEventListener("click", () => {
      sigSavedWrap.hidden = true;
      sigChoiceWrap.hidden = false;
    });

    /* ===== Upload + crop ===== */
    /* Shared by the "Upload a photo" file path and the "Take a photo"
       camera-capture path below — both end up with a plain image data
       URL and need the exact same crop-step setup. */
    function beginCropFromDataUrl(dataUrl){
      sigCropImg.src = dataUrl;
      sigCropImg.onload = () => {
        /* Step must be visible (not display:none) before reading
           sigCropWrap.clientWidth below — a hidden element always
           measures 0, which previously collapsed the crop box to
           0x0px at the top-left corner instead of its intended 70%
           starting size. */
        showSigStep(sigStepCrop);
        /* Start the crop box covering the middle 70% — close enough
           for a typical signature photo that the corner-drag handles
           below only need small adjustments, not a full redraw.
           sigCropWrap.clientHeight is already the right coordinate
           space on its own (the crop box is positioned absolute inside
           it, and its max-height:60vh + overflow:hidden already caps
           it to whatever's actually visible) — multiplying it by the
           image's aspect ratio, as this used to do, produced a
           meaningless number and put the box nowhere near the visible
           photo on portrait-oriented shots. */
        const w = sigCropWrap.clientWidth, h = sigCropWrap.clientHeight;
        sigCropBox.style.left = (w * 0.15) + "px";
        sigCropBox.style.top = (h * 0.15) + "px";
        sigCropBox.style.width = (w * 0.7) + "px";
        sigCropBox.style.height = (h * 0.7) + "px";
      };
    }

    sigUploadBtn.addEventListener("click", () => sigFileInput.click());
    sigFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      sigFileInput.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => beginCropFromDataUrl(reader.result);
      reader.readAsDataURL(file);
    });

    /* ===== Camera capture — live guidance for lighting/sharpness =====
       No AI: the same plain pixel math used everywhere else in this
       feature. Lighting is the average luminance of a downsampled
       frame; sharpness is a Laplacian-variance estimate (blurry frames
       have low local-contrast variance, since blur is literally a
       smoothing filter) — both are cheap enough to run every frame. */
    let sigCameraStream = null;
    let sigCameraRaf = null;

    function stopCamera(){
      if (sigCameraRaf) cancelAnimationFrame(sigCameraRaf);
      sigCameraRaf = null;
      if (sigCameraStream){
        sigCameraStream.getTracks().forEach(t => t.stop());
        sigCameraStream = null;
      }
      sigVideo.srcObject = null;
    }

    function setBadge(el, ok, okText, warnText){
      el.textContent = ok ? okText : warnText;
      el.classList.toggle("ok", ok);
      el.classList.toggle("warn", !ok);
    }

    function analyzeCameraFrame(){
      if (!sigVideo.videoWidth){
        sigCameraRaf = requestAnimationFrame(analyzeCameraFrame);
        return;
      }
      const sampleW = 80;
      const sampleH = Math.max(1, Math.round(sampleW * (sigVideo.videoHeight / sigVideo.videoWidth)));
      const sampleCanvas = analyzeCameraFrame._canvas || (analyzeCameraFrame._canvas = document.createElement("canvas"));
      sampleCanvas.width = sampleW;
      sampleCanvas.height = sampleH;
      const ctx = sampleCanvas.getContext("2d");
      ctx.drawImage(sigVideo, 0, 0, sampleW, sampleH);
      const frame = ctx.getImageData(0, 0, sampleW, sampleH);

      const gray = new Float32Array(sampleW * sampleH);
      let sumLum = 0;
      for (let p = 0, i = 0; i < frame.data.length; i += 4, p++){
        const l = 0.299 * frame.data[i] + 0.587 * frame.data[i + 1] + 0.114 * frame.data[i + 2];
        gray[p] = l;
        sumLum += l;
      }
      const avgLum = sumLum / gray.length;

      /* Laplacian variance: how much local pixel-to-pixel contrast
         exists. Compare each interior pixel to its 4 neighbors — sharp
         edges (real ink strokes) produce large differences; a blurry
         photo smooths those differences away. */
      let sumSq = 0, sumL = 0, n = 0;
      for (let y = 1; y < sampleH - 1; y++){
        for (let x = 1; x < sampleW - 1; x++){
          const idx = y * sampleW + x;
          const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - sampleW] - gray[idx + sampleW];
          sumSq += lap * lap;
          sumL += lap;
          n++;
        }
      }
      const variance = n ? (sumSq / n) - Math.pow(sumL / n, 2) : 0;

      setBadge(sigBadgeLight, avgLum > 70 && avgLum < 235, "Lighting good", avgLum <= 70 ? "Too dark" : "Too bright");
      setBadge(sigBadgeBlur, variance > 90, "Sharp", "Hold steady / move closer");

      sigCameraRaf = requestAnimationFrame(analyzeCameraFrame);
    }

    sigCameraBtn.addEventListener("click", async () => {
      sigCameraError.hidden = true;
      showSigStep(sigStepCamera);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
        sigCameraError.textContent = "Camera access isn't available in this browser — try Upload instead.";
        sigCameraError.hidden = false;
        return;
      }
      try {
        sigCameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        sigVideo.srcObject = sigCameraStream;
        sigCameraRaf = requestAnimationFrame(analyzeCameraFrame);
      } catch (err){
        sigCameraError.textContent = "Couldn't access the camera — check permissions, or use Upload instead.";
        sigCameraError.hidden = false;
      }
    });

    sigCameraCancelBtn.addEventListener("click", () => {
      showSigStep(sigStepChoose);
    });

    sigCameraCaptureBtn.addEventListener("click", () => {
      if (!sigVideo.videoWidth) return;
      const shot = document.createElement("canvas");
      shot.width = sigVideo.videoWidth;
      shot.height = sigVideo.videoHeight;
      shot.getContext("2d").drawImage(sigVideo, 0, 0);
      beginCropFromDataUrl(shot.toDataURL("image/png"));
    });

    /* Drag any corner handle to resize the crop rectangle; clamped to
       the wrap's own bounds so it can never crop outside the photo. */
    sigCropBox.querySelectorAll(".context-signature-crop-handle").forEach(handle => {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        const dir = handle.dataset.h;
        const startX = e.clientX, startY = e.clientY;
        const start = {
          left: sigCropBox.offsetLeft, top: sigCropBox.offsetTop,
          width: sigCropBox.offsetWidth, height: sigCropBox.offsetHeight
        };
        const boundW = sigCropWrap.clientWidth, boundH = sigCropWrap.clientHeight;
        function onMove(ev){
          const dx = ev.clientX - startX, dy = ev.clientY - startY;
          let { left, top, width, height } = start;
          if (dir.includes("e")) width = Math.max(30, start.width + dx);
          if (dir.includes("s")) height = Math.max(30, start.height + dy);
          if (dir.includes("w")){ width = Math.max(30, start.width - dx); left = start.left + start.width - width; }
          if (dir.includes("n")){ height = Math.max(30, start.height - dy); top = start.top + start.height - height; }
          left = Math.max(0, left);
          top = Math.max(0, top);
          width = Math.min(width, boundW - left);
          height = Math.min(height, boundH - top);
          sigCropBox.style.left = left + "px";
          sigCropBox.style.top = top + "px";
          sigCropBox.style.width = width + "px";
          sigCropBox.style.height = height + "px";
        }
        function onUp(){
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    });

    sigCropNextBtn.addEventListener("click", () => {
      /* Map the on-screen crop box (CSS px within sigCropWrap) back to
         the image's native pixel space before drawing it out — the
         displayed <img> is scaled to fit the modal, but the crop needs
         to read full-resolution source pixels. */
      const displayScale = sigCropImg.naturalWidth / sigCropImg.clientWidth;
      const sx = sigCropBox.offsetLeft * displayScale;
      const sy = sigCropBox.offsetTop * displayScale;
      const sw = sigCropBox.offsetWidth * displayScale;
      const sh = sigCropBox.offsetHeight * displayScale;

      const cropped = document.createElement("canvas");
      cropped.width = sw;
      cropped.height = sh;
      cropped.getContext("2d").drawImage(sigCropImg, sx, sy, sw, sh, 0, 0, sw, sh);
      sigSourceCanvas = cropped;
      runCleanup();
      showSigStep(sigStepClean);
    });

    /* ===== Draw pad (alternative to a photo) ===== */
    let drawCtx = null;
    function setupDrawCanvas(){
      const rect = sigDrawCanvas.getBoundingClientRect();
      sigDrawCanvas.width = rect.width;
      sigDrawCanvas.height = rect.height;
      drawCtx = sigDrawCanvas.getContext("2d");
      drawCtx.fillStyle = "#ffffff";
      drawCtx.fillRect(0, 0, sigDrawCanvas.width, sigDrawCanvas.height);
      drawCtx.strokeStyle = "#000000";
      drawCtx.lineWidth = 3;
      drawCtx.lineCap = "round";
      drawCtx.lineJoin = "round";
    }

    sigDrawBtn.addEventListener("click", () => {
      showSigStep(sigStepDraw);
      setupDrawCanvas();
    });

    (function(){
      let drawing = false;
      let lastX = 0, lastY = 0;
      function pos(e){
        const rect = sigDrawCanvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
      sigDrawCanvas.addEventListener("pointerdown", (e) => {
        drawing = true;
        try { sigDrawCanvas.setPointerCapture(e.pointerId); } catch (err) {}
        const p = pos(e);
        lastX = p.x; lastY = p.y;
      });
      sigDrawCanvas.addEventListener("pointermove", (e) => {
        if (!drawing || !drawCtx) return;
        const p = pos(e);
        drawCtx.beginPath();
        drawCtx.moveTo(lastX, lastY);
        drawCtx.lineTo(p.x, p.y);
        drawCtx.stroke();
        lastX = p.x; lastY = p.y;
      });
      ["pointerup", "pointercancel"].forEach(evt => sigDrawCanvas.addEventListener(evt, () => { drawing = false; }));
    })();

    sigDrawClearBtn.addEventListener("click", setupDrawCanvas);

    sigDrawNextBtn.addEventListener("click", () => {
      const copy = document.createElement("canvas");
      copy.width = sigDrawCanvas.width;
      copy.height = sigDrawCanvas.height;
      copy.getContext("2d").drawImage(sigDrawCanvas, 0, 0);
      sigSourceCanvas = copy;
      runCleanup();
      showSigStep(sigStepClean);
    });

    /* ===== Cleanup: illumination-normalize, then threshold ===== */
    function computeCleanedImageData(sourceCanvas, sensitivity){
      const w = sourceCanvas.width, h = sourceCanvas.height;
      const srcCtx = sourceCanvas.getContext("2d");
      const src = srcCtx.getImageData(0, 0, w, h);

      /* Sauvola local thresholding — the standard algorithm real document
         -scanner apps (Adobe Scan, CamScanner, etc.) use to binarize
         photographed ink against uneven paper lighting, rather than a
         hand-rolled blur-and-divide ratio. For every pixel it derives a
         threshold from that pixel's own local mean and standard
         deviation (via an integral image, so this stays O(1) per pixel
         instead of re-scanning a window every time): T = mean * (1 + k *
         (std/R - 1)). Ink shows up as a strong local deviation from its
         neighborhood regardless of whether the paper nearby is bright or
         shadowed; smooth paper — even shadowed paper — has low local
         variance and doesn't get pulled in as false ink. This is what
         actually fixed the two failure modes the old ratio approach kept
         trading off against each other (gray halo around every stroke
         vs. strokes fragmenting into disconnected blobs): those were
         symptoms of the ratio method, not of any one constant being
         mistuned. */
      const lum = new Float64Array(w * h);
      for (let p = 0; p < w * h; p++){
        const i = p * 4;
        lum[p] = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
      }

      const ii = new Float64Array((w + 1) * (h + 1));
      const ii2 = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++){
        let rowSum = 0, rowSum2 = 0;
        for (let x = 0; x < w; x++){
          const v = lum[y * w + x];
          rowSum += v;
          rowSum2 += v * v;
          const idx = (y + 1) * (w + 1) + (x + 1);
          ii[idx] = ii[idx - (w + 1)] + rowSum;
          ii2[idx] = ii2[idx - (w + 1)] + rowSum2;
        }
      }

      /* Window scales with the crop's own size rather than a fixed pixel
         count, so a tightly-cropped signature and a loosely-cropped one
         get a proportionally similar-sized neighborhood to sample. */
      const half = Math.max(6, Math.round(Math.min(w, h) * 0.04));
      const R = 128;
      /* sensitivity 0-100 nudges k (Sauvola's sensitivity constant) a
         modest ±15% around its textbook default of 0.34 — high
         sensitivity lowers k, which raises the threshold and picks up
         fainter marks; low sensitivity does the opposite. */
      const k = 0.34 * (1 + (50 - sensitivity) / 333);

      /* Sauvola alone assumes every local window contains a genuine mix
         of ink and paper — true for thin pen strokes, but a thick
         solid-filled mark (wider than the window) has nothing but ink
         inside its own window once you're deep in its interior, so
         local contrast collapses toward zero and those pixels read as
         "no local contrast, therefore background" even though they're
         unambiguously dark. A global fallback catches that case: any
         pixel meaningfully darker than the WHOLE crop's own average
         (still dominated by paper even with a large mark in frame)
         counts as ink regardless of what its immediate neighborhood
         looks like. */
      const totalCount = w * h;
      const globalMean = ii[h * (w + 1) + w] / totalCount;
      const globalVar = Math.max(0, ii2[h * (w + 1) + w] / totalCount - globalMean * globalMean);
      const globalCutoff = globalMean - Math.sqrt(globalVar) * 0.6;

      const out = srcCtx.createImageData(w, h);
      const feather = 6; // luminance units the soft edge ramps over

      for (let y = 0; y < h; y++){
        const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
        for (let x = 0; x < w; x++){
          const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
          const area = (y1 - y0) * (x1 - x0);
          const A = y0 * (w + 1) + x0, B = y0 * (w + 1) + x1, C = y1 * (w + 1) + x0, D = y1 * (w + 1) + x1;
          const sum = ii[D] - ii[B] - ii[C] + ii[A];
          const sum2 = ii2[D] - ii2[B] - ii2[C] + ii2[A];
          const mean = sum / area;
          const variance = Math.max(0, sum2 / area - mean * mean);
          const std = Math.sqrt(variance);
          const T = mean * (1 + k * (std / R - 1));

          const p = y * w + x;
          const diffLocal = T - lum[p]; // > 0 means darker than its local threshold, i.e. ink
          const diffGlobal = globalCutoff - lum[p]; // catches thick fills Sauvola's local window sees no contrast in
          const diff = Math.max(diffLocal, diffGlobal);
          const i = p * 4;
          /* Mostly-opaque core, only feathering right at the edge — a
             flat ramp from 0 all the way to T made even solidly dark ink
             partially transparent unless it was pure black. Letting the
             core itself vary a little (0.85-1) instead of clipping it
             flat keeps the real photo's subtle pen-pressure texture. */
          const alpha = diff <= 0 ? 0
            : diff >= feather ? Math.max(0.92, 1 - (lum[p] / 255) * 0.15)
            : diff / feather;
          out.data[i] = src.data[i];
          out.data[i + 1] = src.data[i + 1];
          out.data[i + 2] = src.data[i + 2];
          out.data[i + 3] = Math.round(alpha * 255);
        }
      }

      /* Real pen strokes often have a highlight/sheen running through
         them (the ink catching light) — a lighter streak that's still
         visually part of the stroke, surrounded by dark ink on all
         sides, not an actual gap to paper. Per-pixel luminance alone
         can't tell "highlight inside a stroke" from "background", so
         it was punching real holes through strokes wherever one of
         these streaks appeared. This is a morphological "close" pass:
         any weak/background pixel with mostly-ink neighbors in a small
         window gets filled back in with the surrounding ink's own
         color, closing the hole without touching real edges/background
         (which don't have ink surrounding them on most sides). */
      const alphaCopy = new Uint8ClampedArray(w * h);
      for (let p = 0; p < w * h; p++) alphaCopy[p] = out.data[p * 4 + 3];
      const radius = 2;
      for (let y = 0; y < h; y++){
        for (let x = 0; x < w; x++){
          const idx = y * w + x;
          if (alphaCopy[idx] >= 180) continue;
          let inkCount = 0, total = 0, sumR = 0, sumG = 0, sumB = 0;
          for (let dy = -radius; dy <= radius; dy++){
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -radius; dx <= radius; dx++){
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              if (nx < 0 || nx >= w) continue;
              total++;
              const nIdx = ny * w + nx;
              if (alphaCopy[nIdx] >= 180){
                inkCount++;
                const base = nIdx * 4;
                sumR += out.data[base];
                sumG += out.data[base + 1];
                sumB += out.data[base + 2];
              }
            }
          }
          if (total > 0 && inkCount / total >= 0.6){
            const base = idx * 4;
            out.data[base] = Math.round(sumR / inkCount);
            out.data[base + 1] = Math.round(sumG / inkCount);
            out.data[base + 2] = Math.round(sumB / inkCount);
            out.data[base + 3] = 230;
          }
        }
      }

      /* The global fallback above (for thick fills the local Sauvola
         window can't judge) has no local-contrast requirement at all,
         so it will happily flag a shadowed patch of paper or a bit of
         camera noise as ink too, wherever that happens to be darker
         than the crop's overall average — real strokes are elongated
         and densely connected, while this kind of false positive shows
         up as small isolated speckles. This pass removes exactly that:
         any ink pixel without enough OTHER ink nearby gets cleared,
         which a true stroke (surrounded by more of itself along its
         length) never triggers. */
      const closedAlpha = new Uint8ClampedArray(w * h);
      for (let p = 0; p < w * h; p++) closedAlpha[p] = out.data[p * 4 + 3];
      const denoiseRadius = 2;
      for (let y = 0; y < h; y++){
        for (let x = 0; x < w; x++){
          const idx = y * w + x;
          if (closedAlpha[idx] < 180) continue;
          let inkNeighbors = 0;
          for (let dy = -denoiseRadius; dy <= denoiseRadius; dy++){
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -denoiseRadius; dx <= denoiseRadius; dx++){
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              if (nx < 0 || nx >= w) continue;
              if (closedAlpha[ny * w + nx] >= 180) inkNeighbors++;
            }
          }
          if (inkNeighbors < 3) out.data[idx * 4 + 3] = 0;
        }
      }

      return out;
    }

    /* A hard-edged cutout reads as a vector sticker rather than real
       ink on paper — real strokes feather slightly into the paper
       fiber. Draw the computed pixels through a very light blur (both
       color and alpha together, which is what an actual soft edge
       looks like) instead of putImageData'ing them directly. If canvas
       filter isn't supported, this just draws unblurred — a graceful,
       purely cosmetic fallback, unlike relying on this same API for
       the illumination estimate earlier. */
    function drawSoftened(imageData){
      const rawCanvas = document.createElement("canvas");
      rawCanvas.width = sigCleanCanvas.width;
      rawCanvas.height = sigCleanCanvas.height;
      rawCanvas.getContext("2d").putImageData(imageData, 0, 0);
      sigCleanCtx.clearRect(0, 0, sigCleanCanvas.width, sigCleanCanvas.height);
      sigCleanCtx.filter = "blur(0.6px)";
      sigCleanCtx.drawImage(rawCanvas, 0, 0);
      sigCleanCtx.filter = "none";
    }

    /* Fixed sensitivity — matches the old slider's default. The
       Sauvola threshold plus its global fallback (see
       computeCleanedImageData) turned out not to need per-photo manual
       tuning the way the old ratio-based cutoff did. */
    const SIG_SENSITIVITY = 55;

    let sigInkColor = "original";

    function runCleanup(){
      if (!sigSourceCanvas) return;
      sigCleanCanvas.width = sigSourceCanvas.width;
      sigCleanCanvas.height = sigSourceCanvas.height;
      sigCleanCtx = sigCleanCanvas.getContext("2d");
      sigCleanBaseImageData = computeCleanedImageData(sigSourceCanvas, SIG_SENSITIVITY);
      drawSoftened(sigCleanBaseImageData);
      /* Fresh source photo — reset any color override from a previous
         attempt rather than silently carrying it over. */
      sigInkColor = "original";
      if (sigColorRow){
        sigColorRow.querySelectorAll(".context-signature-color-swatch").forEach(btn => {
          const active = btn.dataset.color === "original";
          btn.classList.toggle("active", active);
          btn.setAttribute("aria-pressed", String(active));
        });
      }
    }

    function hexToRgb(hex){
      return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    }

    /* Shades a base color lighter (amt > 0) or darker (amt < 0) by
       lerping each channel toward 255 or 0. */
    function shadeRgb([r, g, b], amt){
      const target = amt > 0 ? 255 : 0;
      const t = Math.abs(amt);
      return [r + (target - r) * t, g + (target - g) * t, b + (target - b) * t];
    }

    /* Smooth, low-frequency 2D value noise (a coarse random grid,
       bilinear-interpolated) — a flat solid fill reads as printed
       plastic, not ink, but per-pixel randomness would look like TV
       static. Sampling a coarse grid gives soft, blotchy tonal drift
       instead, closer to how real ink actually varies with pressure
       and paper texture. */
    function makeSmoothNoise(w, h, cell){
      const cols = Math.max(2, Math.round(w / cell) + 1);
      const rows = Math.max(2, Math.round(h / cell) + 1);
      const grid = new Float32Array(cols * rows);
      for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
      return function sample(x, y){
        const gx = (x / w) * (cols - 1), gy = (y / h) * (rows - 1);
        const gx0 = Math.min(cols - 2, Math.floor(gx)), gy0 = Math.min(rows - 2, Math.floor(gy));
        const fx = gx - gx0, fy = gy - gy0;
        const v00 = grid[gy0 * cols + gx0], v10 = grid[gy0 * cols + gx0 + 1];
        const v01 = grid[(gy0 + 1) * cols + gx0], v11 = grid[(gy0 + 1) * cols + gx0 + 1];
        const vx0 = v00 + (v10 - v00) * fx, vx1 = v01 + (v11 - v01) * fx;
        return vx0 + (vx1 - vx0) * fy;
      };
    }

    /* Recolors whatever's currently ink (alpha > 0) without disturbing
       any erasing the user's already done — reads the live canvas for
       its current alpha channel, but pulls RGB either from the fixed
       swatch color (optionally shade-mixed for a less flat, more ink
       -like look) or, for "original", from the untouched base image's
       own per-pixel color (so switching back after trying a swatch
       restores the real photographed texture, not a flattened guess). */
    function applyInkColor(color, shademix){
      if (!sigCleanBaseImageData) return;
      const w = sigCleanCanvas.width, h = sigCleanCanvas.height;
      const current = sigCleanCtx.getImageData(0, 0, w, h);
      const base = sigCleanBaseImageData;
      const baseRgb = color !== "original" ? hexToRgb(color) : null;
      const noise = shademix && color !== "original" ? makeSmoothNoise(w, h, 24) : null;

      for (let p = 0; p < current.data.length; p += 4){
        if (current.data[p + 3] === 0) continue;
        if (color === "original"){
          current.data[p] = base.data[p];
          current.data[p + 1] = base.data[p + 1];
          current.data[p + 2] = base.data[p + 2];
          continue;
        }
        let rgb = baseRgb;
        if (noise){
          const pix = p / 4;
          const x = pix % w, y = Math.floor(pix / w);
          // maps [0,1) noise to a ±18% shade offset around the base color
          rgb = shadeRgb(baseRgb, (noise(x, y) - 0.5) * 0.36);
        }
        current.data[p] = Math.round(rgb[0]);
        current.data[p + 1] = Math.round(rgb[1]);
        current.data[p + 2] = Math.round(rgb[2]);
      }
      sigCleanCtx.putImageData(current, 0, 0);
    }

    if (sigColorRow){
      sigColorRow.querySelectorAll(".context-signature-color-swatch").forEach(btn => {
        btn.addEventListener("click", () => {
          sigInkColor = btn.dataset.color;
          sigColorRow.querySelectorAll(".context-signature-color-swatch").forEach(b => {
            const active = b === btn;
            b.classList.toggle("active", active);
            b.setAttribute("aria-pressed", String(active));
          });
          applyInkColor(sigInkColor, btn.dataset.shademix === "true");
        });
      });
    }

    /* Touch-up eraser — drag over the preview to punch alpha=0 into a
       small radius under the pointer, for any shadow/smudge the
       automatic cleanup above didn't fully catch. */
    (function(){
      let erasing = false;
      function eraseAt(clientX, clientY){
        const rect = sigCleanCanvas.getBoundingClientRect();
        const scaleX = sigCleanCanvas.width / rect.width;
        const scaleY = sigCleanCanvas.height / rect.height;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        sigCleanCtx.save();
        sigCleanCtx.globalCompositeOperation = "destination-out";
        sigCleanCtx.beginPath();
        sigCleanCtx.arc(x, y, Math.max(6, sigCleanCanvas.width * 0.02), 0, Math.PI * 2);
        sigCleanCtx.fill();
        sigCleanCtx.restore();
      }
      sigCleanCanvas.addEventListener("pointerdown", (e) => {
        erasing = true;
        try { sigCleanCanvas.setPointerCapture(e.pointerId); } catch (err) {}
        eraseAt(e.clientX, e.clientY);
      });
      sigCleanCanvas.addEventListener("pointermove", (e) => { if (erasing) eraseAt(e.clientX, e.clientY); });
      ["pointerup", "pointercancel"].forEach(evt => sigCleanCanvas.addEventListener(evt, () => { erasing = false; }));
    })();

    sigSaveBtn.addEventListener("click", () => {
      const dataUrl = sigCleanCanvas.toDataURL("image/png");
      setSavedSignature(dataUrl);
      const img = new Image();
      img.onload = () => {
        addSignatureBox(dataUrl, img.naturalWidth, img.naturalHeight);
        closeSigModal();
      };
      img.src = dataUrl;
    });
  }

  /* Offer to restore a previously-saved PDF (with its text/signature
     boxes) instead of auto-loading it. Auto-loading on page load kept
     hitting layout-timing bugs (canvas measured/rendered before the
     browser had finished settling — fonts still swapping in, etc.)
     that a normal upload never hits, because a normal upload only ever
     starts from a real click, by which point layout is long since
     stable. Requiring a click here too sidesteps that whole class of
     bug rather than trying to out-guess every way layout can still be
     unsettled — the load path is byte-for-byte the same loadFile()
     call a fresh upload uses, just fed saved bytes instead of a
     just-picked File. */
  (async () => {
    const saved = await ctxDbGet();
    /* Signals shared/site.js's scroll restore that this async check (and
       the "Continue where you left off" button it may just have revealed
       — a real, measurable layout-height change) is done, so it can
       re-apply the remembered scroll position one more time instead of
       leaving it wherever it landed before this resolved. Dispatched
       unconditionally, before the early returns below, so it always
       fires exactly once regardless of which branch runs. */
    document.dispatchEvent(new Event("bc:session-check-done"));
    if (!saved || !saved.pdfBytes) return;
    if (currentFile) return; // user already picked a file before this resolved
    continueBtn.hidden = false;
    continueBtn.addEventListener("click", async () => {
      continueBtn.hidden = true;
      try {
        const restoredFile = new File([saved.pdfBytes], saved.fileName || "document.pdf", { type: "application/pdf" });
        await loadFile(restoredFile, saved);
        persistNow();
      } catch (err){
        console.error(err);
        continueBtn.hidden = false;
      }
    });
  })();
})();

