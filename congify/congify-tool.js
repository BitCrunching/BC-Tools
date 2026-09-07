/* GIF tool — Video to GIF conversion pipeline. Frame extraction via
   <video> + <canvas> (native decode, no ffmpeg.wasm), encoding via
   gif.js (lazy-loaded on first use, mirroring the SPA's loadHeic2any()
   pattern) so most visitors who never open this page never fetch it. */
(function(){
  const drop = document.getElementById("gifDrop");
  const input = document.getElementById("gifInput");
  const videoWrap = document.getElementById("gifVideoWrap");
  const editorControls = document.getElementById("gifEditorControls");
  const doneActions = document.getElementById("gifDoneActions");
  const downloadBtn = document.getElementById("gifDownloadBtn");
  const doneContinueBtn = document.getElementById("gifDoneContinueBtn");
  const removeBtn = document.getElementById("gifRemoveBtn");
  const video = document.getElementById("gifVideo");
  const scrubber = document.getElementById("gifFilmstrip");
  const filmstripCanvas = document.getElementById("gifFilmstripCanvas");
  const maskLeft = document.getElementById("gifMaskLeft");
  const maskRight = document.getElementById("gifMaskRight");
  const handleStart = document.getElementById("gifScrubberStart");
  const handleEnd = document.getElementById("gifScrubberEnd");
  const scrubberLabel = document.getElementById("gifScrubberLabel");
  const scrubberLabelToggle = document.getElementById("gifScrubberLabelToggle");
  const scrubberFileName = document.getElementById("gifScrubberFileName");
  const fpsBtn = document.getElementById("gifFpsBtn");
  const fpsInfoBtn = document.getElementById("gifFpsInfoBtn");
  const fpsInfoTooltip = document.getElementById("gifFpsInfoTooltip");
  bcRegisterInfoTooltip(fpsInfoBtn, fpsInfoTooltip);
  const previewFrame = document.getElementById("gifPreviewFrame");
  const previewPanel = document.getElementById("gifPreviewPanel");
  const resizeHandle = document.getElementById("gifResizeHandle");
  const resolutionTrigger = document.getElementById("gifResolutionTrigger");
  const resolutionTriggerLabel = document.getElementById("gifResolutionTriggerLabel");
  const resolutionMenu = document.getElementById("gifResolutionMenu");

  /* Last resolution an actual successful download used, in localStorage
     (not the per-file IndexedDB session) so it carries over into a
     brand new project with a different video, not just "Continue
     where you left off" on the same one. */
  const RECENT_WIDTH_KEY = "congify-recent-width";
  let recentWidth = null;
  try {
    const saved = parseInt(localStorage.getItem(RECENT_WIDTH_KEY), 10);
    if (!isNaN(saved)) recentWidth = saved;
  } catch (err) { /* localStorage unavailable — skip */ }

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("congify", "gif", [
    ["WELCOME_TO_CONGIFY", "Congify turns a video clip into a GIF — trim it, add captions, pick the frame rate and size. Click or drop a video below to get started."],
    ["TRIM_YOUR_CLIP", "Once a video's in, drag the two handles on the filmstrip to pick exactly which part becomes the GIF."],
    ["ADD_TEXT_IF_YOU_WANT", "Hit Add text to drop a caption on the frame — style it, drag it around, resize it right from its own corner handle."],
    ["PICK_FRAME_RATE_AND_SIZE", "Frame rate trades smoothness for file size; pick the Resolution dropdown to set the actual export size — the corner handle only resizes the preview on screen."],
    ["YOU_ARE_SET", "Hit Convert to GIF, then Download once you see the result. Close this with the red dot and we won't show it again."]
  ]);

  const convertBtn = document.getElementById("gifConvertBtn");
  const captionSliders = document.getElementById("gifCaptionSliders");
  const outputSliders = document.getElementById("gifOutputSliders");
  const modeBasicBtn = document.getElementById("gifModeBasicBtn");
  const modeAdvancedBtn = document.getElementById("gifModeAdvancedBtn");
  /* Basic (text/stroke controls) and Advanced (resolution/fps/speed/
     playback) are mutually exclusive views onto the same settings —
     switching modes only changes which group is visible, nothing about
     the settings themselves. Basic is the default. Each segment styles
     itself off its own [aria-pressed] state (shared/site.css-adjacent
     .gif-mode-toggle button rules in congify/index.html). */
  function setGifMode(mode){
    const isBasic = mode === "basic";
    captionSliders.hidden = !isBasic;
    outputSliders.hidden = isBasic;
    modeBasicBtn.setAttribute("aria-pressed", String(isBasic));
    modeAdvancedBtn.setAttribute("aria-pressed", String(!isBasic));
  }
  modeBasicBtn.addEventListener("click", () => setGifMode("basic"));
  modeAdvancedBtn.addEventListener("click", () => setGifMode("advanced"));
  const statusEl = document.getElementById("gifStatus");
  const resultsEl = document.getElementById("gifResults");
  const resultsHeader = document.getElementById("gifResultsHeader");
  const resultsToggle = document.getElementById("gifResultsToggle");
  const resultsDownloadBtn = document.getElementById("gifResultsDownloadBtn");
  const previewCanvas = document.getElementById("gifPreviewCanvas");
  const previewPlayBtn = document.getElementById("gifPreviewPlayBtn");
  const addTextBtn = document.getElementById("gifAddTextBtn");
  const captionBoldBtn = document.getElementById("gifCaptionBoldBtn");
  const captionItalicBtn = document.getElementById("gifCaptionItalicBtn");
  const captionUnderlineBtn = document.getElementById("gifCaptionUnderlineBtn");

  const captionFontTrigger = document.getElementById("gifCaptionFontTrigger");
  const captionFontTriggerLabel = document.getElementById("gifCaptionFontTriggerLabel");
  const captionFontMenu = document.getElementById("gifCaptionFontMenu");
  const captionColorTrigger = document.getElementById("gifCaptionColorTrigger");
  const captionColorTriggerDot = document.getElementById("gifCaptionColorTriggerDot");
  const captionColorTriggerLabel = document.getElementById("gifCaptionColorTriggerLabel");
  const captionColorMenu = document.getElementById("gifCaptionColorMenu");
  const captionStrokeBtn = document.getElementById("gifCaptionStrokeBtn");
  const captionStrokeColorTrigger = document.getElementById("gifCaptionStrokeColorTrigger");
  const captionStrokeColorTriggerDot = document.getElementById("gifCaptionStrokeColorTriggerDot");
  const captionStrokeColorTriggerLabel = document.getElementById("gifCaptionStrokeColorTriggerLabel");
  const captionStrokeColorMenu = document.getElementById("gifCaptionStrokeColorMenu");
  const captionStrokeWidthBtn = document.getElementById("gifCaptionStrokeWidthBtn");
  const captionStrokeWidthBtnLine = document.getElementById("gifCaptionStrokeWidthBtnLine");
  const cropBtn = document.getElementById("gifCropBtn");
  const cropFreeIconNumber = document.getElementById("gifCropFreeIconNumber");
  const orderBtn = document.getElementById("gifOrderBtn");
  const orderInfoBtn = document.getElementById("gifOrderInfoBtn");
  const orderInfoTooltip = document.getElementById("gifOrderInfoTooltip");
  bcRegisterInfoTooltip(orderInfoBtn, orderInfoTooltip);
  const speedTrigger = document.getElementById("gifSpeedTrigger");
  const speedTriggerLabel = document.getElementById("gifSpeedTriggerLabel");
  const speedMenu = document.getElementById("gifSpeedMenu");
  const continueBtn = document.getElementById("gifContinueBtn");

  /* "Continue where you left off" persistence — same IndexedDB pattern
     as Convert/Compress/Combine/Cleanly (see bcDbPut/bcDbGet/bcDbClear
     in shared/site.js), one object store per tool, single "current"
     session key. */
  const GIF_DB_NAME = "bctools-congify";
  const GIF_DB_STORE = "session";

  let duration = 0;
  /* True only while a "Continue where you left off" restore is in
     flight — see the loadedmetadata listener below and restoreTrim. */
  let isRestoringSession = false;
  let trimStart = 0;
  let trimEnd = 0;
  let objectUrl = null;
  /* Up to MAX_CAPTIONS independent text bubbles — same shape as
     Context's textBoxes, just capped since a GIF caption is meant to be
     a quick label, not a full page of text boxes. Each has its own
     position/size/font/color/bold; the Caption size/Font/Color & style/
     Bold controls always edit whichever one is currently selected
     (last added, or last clicked/focused), mirroring Context's
     selectBox() behavior. */
  let captions = [];
  let nextCaptionId = 1;
  let selectedCaptionId = null;
  let lastCaptionSize = 28;
  const MAX_CAPTIONS = 5;
  const CAPTION_DEFAULT_X = 0.5, CAPTION_DEFAULT_Y = 0.12;
  const CAPTION_SIZE_MIN = 10, CAPTION_SIZE_MAX = 120;
  let fps = 10;
  let cropMode = "free"; // matches a CROP_OPTIONS[].crop key — see its own declaration for the ratio each maps to
  let cropRatio = null; // width/height for the currently selected cropMode (null = no forced crop), kept in sync by the CROP_OPTIONS click handler
  let orderMode = "normal"; // "normal" | "reverse" | "boomerang"
  let playbackSpeed = 1; // 0.25 | 0.5 | 1 | 2 | 4
  let previewPlaying = false;
  let previewRafId = null;
  let lastResultBytes = null;
  let lastResultType = null;
  /* frameWidth is purely cosmetic — it's the on-screen CSS width of the
     editor frame (#gifPreviewFrame), set by dragging its corner handle,
     so captions are easier to see/place on a small clip or a small
     window. Named apart from renderPreview()'s own local previewWidth
     (below) — that one's the small live-preview canvas's fixed internal
     render resolution, a completely different, unrelated 320. frameWidth
     used to double as the real export width too, which was the actual
     bug behind "the GIF looks low-res" reports: dragging the handle
     bigger didn't add any real pixels, and its old 640px ceiling meant
     even a maxed-out drag was still a 5x+ downscale of a Retina screen
     recording. outputWidth (below) is the only thing that sets the real
     export resolution now, via the Resolution dropdown — fully
     independent of how big the preview happens to be on screen. */
  /* Workspace ceiling is 1028px: .tool-app's shared 1100px banner leaves
     a 1028px content box (1100 minus its own 36px×2 padding) for
     #gifEditorControls, and .gif-preview-frame's max-width:100% resolves
     against .gif-preview-panel — which has no horizontal padding of its
     own anymore, so the frame can use the workspace's full width (see
     containerMax in the pointermove handler below, which reads that
     width directly with no offset). The preview's own max is dialed
     down slightly below that ceiling, to 1006px, for a bit of breathing
     room between the frame and the workspace edge rather than running
     the frame flush to it. Going past 1028 would mean widening the
     shared banner itself (kept at 1100px on purpose). */
  let frameWidth = 1006; // px — cosmetic, drag-handle-controlled
  const PREVIEW_WIDTH_MAX = 1006;
  /* 140 used to be the floor here — small enough to be useless (the
     preview was barely bigger than the corner buttons sitting on it).
     360 is the real usable minimum on desktop; mobile gets its own
     lower floor (265) since the workspace itself is narrower there,
     same 768px breakpoint as the rest of this page's mobile rules. */
  function getPreviewWidthMin(){
    return window.matchMedia("(max-width:768px)").matches ? 265 : 360;
  }
  /* outputWidth is the actual export resolution, picked from the fixed
     preset options on #gifResolutionMenu (see the dropdown registration
     below). Restored from the last successful download's choice
     (recentWidth) so it carries over into a new project, same idea as
     before. */
  let outputWidth = (recentWidth && recentWidth >= 140) ? recentWidth : 320;

  /* ===== lazy-load gif.js (mirrors loadHeic2any() in the SPA) ===== */
  let gifJsLoadPromise = null;
  function loadGifJs(){
    if (window.GIF) return Promise.resolve();
    if (!gifJsLoadPromise){
      gifJsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/vendor/gif.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load gif.js"));
        document.head.appendChild(script);
      });
    }
    return gifJsLoadPromise;
  }

  /* Shows only the downloaded GIF + a "Continue where you left off"
     button once conversion finishes, hiding the whole editor (video,
     preview, filmstrip, caption controls, sliders, convert button)
     rather than leaving it sitting there behind the result. Continue
     just un-hides the same editor state — nothing was actually reset,
     so there's no need to reload from IndexedDB the way the page-load
     Continue button does. The result itself stays in its one natural
     spot (full width, below the editor) the whole time — done view or
     back to editing — just collapsible via the header's minimize
     button since it's secondary once you're restyling. */
  function showDoneView(){
    editorControls.hidden = true;
    doneActions.hidden = false;
    /* Also doubles as the start of a new project: the drop zone comes
       back so dropping/picking a different video works right from this
       screen, same as setFile() would do at any other point. */
    drop.hidden = false;
    /* Minimize only makes sense once you're back editing alongside the
       result (see hideDoneView) — collapsing it here, while it's the
       one thing this screen exists to show you, does nothing useful. */
    resultsHeader.hidden = true;
  }
  function hideDoneView(){
    editorControls.hidden = false;
    doneActions.hidden = true;
    drop.hidden = true;
    resultsHeader.hidden = false;
  }
  doneContinueBtn.addEventListener("click", hideDoneView);

  /* Download button in the done view — conversion itself no longer
     downloads automatically (see the "finished" handler below), this is
     the only thing that does. Re-wraps the already-held result bytes
     rather than needing the original blob in scope. */
  function downloadGifResult(){
    if (!lastResultBytes) return;
    const outName = (scrubberFileName.value.trim() || "converted") + ".gif";
    downloadBlob(new Blob([lastResultBytes], { type: lastResultType || "image/gif" }), outName);
  }
  downloadBtn.addEventListener("click", downloadGifResult);
  /* Same download, reachable from back in the editor too — clicking
     "Continue working" hides gifDoneActions (and its own Download
     button) but keeps lastResultBytes around; without this, getting
     the already-converted file back out meant re-running Convert. */
  resultsDownloadBtn.addEventListener("click", downloadGifResult);

  resultsToggle.addEventListener("click", () => {
    const collapsed = resultsEl.hidden = !resultsEl.hidden;
    resultsToggle.textContent = collapsed ? "+" : "−";
    resultsToggle.setAttribute("aria-expanded", String(!collapsed));
    resultsToggle.setAttribute("aria-label", collapsed ? "Expand result" : "Minimize result");
    resultsToggle.title = collapsed ? "Expand result" : "Minimize result";
  });

  /* Renders a finished GIF blob into the results panel — used both
     right after conversion and when restoring a previously saved
     result via "Continue where you left off". Doesn't touch
     resultsHeader's visibility itself — showDoneView()/hideDoneView()
     own that, since whether minimizing makes sense depends on which of
     those two views this render is happening into (see their own
     comments), not on the render itself. */
  function renderResult(blob){
    const url = URL.createObjectURL(blob);
    const result = document.createElement("div");
    result.className = "result";
    const img = document.createElement("img");
    img.src = url;
    result.appendChild(img);
    resultsEl.innerHTML = "";
    resultsEl.appendChild(result);
    resultsEl.hidden = false;
    resultsToggle.textContent = "−";
    resultsToggle.setAttribute("aria-expanded", "true");
    resultsToggle.setAttribute("aria-label", "Minimize result");
    resultsToggle.title = "Minimize result";
  }

  /* ===== file loading ===== */
  let currentFile = null;
  function setFile(file){
    if (!file || !file.type.startsWith("video/")) return;
    stopPreviewPlayback();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    currentFile = file;
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    videoWrap.classList.remove("active");
    scrubberFileName.value = file.name.replace(/\.[^.]+$/, "");
    convertBtn.disabled = true;
    resultsEl.innerHTML = "";
    resultsEl.hidden = false;
    resultsHeader.hidden = true;
    lastResultBytes = null;
    lastResultType = null;
    statusEl.textContent = "";
    previewCanvas.width = previewCanvas.width; // clears the old clip's frame
    hideDoneView();
    /* hideDoneView() always shows resultsHeader (it owns showing it once
       back in the editor alongside a result) — but a freshly loaded file
       has no result yet, so re-hide it until the user actually converts. */
    resultsHeader.hidden = true;
    continueBtn.hidden = true;
    /* Captions are tied to the clip they were placed on — without this,
       swapping in a different video (drop a new file while one's
       already loaded, or Remove then pick another) left the old
       captions' boxes rendered over the new footage and baked into its
       output frames at convert time. The restore flow (see the bottom
       of this file) calls setFile() too, then repopulates captions
       from the saved session right after — this reset runs first and
       doesn't fight that. */
    captions = [];
    selectedCaptionId = null;
    nextCaptionId = 1;
    renderCaptionBoxes();
    updateAddTextBtnState();
  }

  /* Seeks the (hidden) video element and resolves once the frame at
     that time has actually decoded — used both by the filmstrip build
     and by the real per-frame extraction at convert time. */
  function seekTo(t){
    return new Promise((resolve) => {
      function onSeeked(){
        video.removeEventListener("seeked", onSeeked);
        resolve();
      }
      video.addEventListener("seeked", onSeeked);
      video.currentTime = t;
    });
  }

  /* Draws the video's current frame into a cell of the filmstrip canvas,
     cropping (not squashing) to fill the cell — same idea as CSS
     object-fit:cover. */
  function drawCoverFrame(ctx, cellX, cellWidth, cellHeight){
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const cellAspect = cellWidth / cellHeight;
    const videoAspect = vw / vh;
    let sx, sy, sw, sh;
    if (videoAspect > cellAspect){
      sh = vh;
      sw = vh * cellAspect;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      sw = vw;
      sh = vw / cellAspect;
      sx = 0;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, cellX, 0, cellWidth, cellHeight);
  }

  /* Crop presets, computed in the video's native pixel space and shared
     by both the live preview and the real conversion pipeline so they
     always agree on exactly what gets cut. Centered crops rather than
     freeform drag-resize — covers the common cases (squaring off a
     phone video, cropping to a vertical GIF) without the extra UI/edge
     cases a fully custom crop box would need.
     One formula for every ratio (16:9, 1:1, 2:3, ...) instead of a
     square/portrait/full special case each — a 1:1 crop and a 2:3 crop
     are both just "fit this aspect centered", the same shape of
     problem the old "portrait" branch already solved generically; only
     the target number was hardcoded to 9/16. CROP_OPTIONS' own .ratio
     supplies that number now — null (the default "Free" option) means
     no forced crop at all, so it's handled separately, before this
     formula rather than as a ratio value of its own. */
  function getCropRect(){
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return { sx:0, sy:0, sw:0, sh:0 };
    if (!cropRatio) return { sx:0, sy:0, sw:vw, sh:vh };
    const targetAspect = cropRatio;
    if (vw / vh > targetAspect){
      const sh = vh, sw = vh * targetAspect;
      return { sx:(vw - sw) / 2, sy:0, sw, sh };
    }
    const sw = vw, sh = vw / targetAspect;
    return { sx:0, sy:(vh - sh) / 2, sw, sh };
  }

  /* Caption rendering, shared by the preview and the real output frames
     so what you see is what you get. cap.x/cap.y are fractions (0-1) of
     the canvas, marking the CENTER of the text — freely positioned by
     dragging on the preview, same "grab it and move it" interaction
     Context uses for its text boxes. cap.size is a literal pixel font
     size, but only meaningful relative to frameWidth — that's the
     CSS width the live caption box was actually typed/sized against.
     Since frameWidth (screen comfort) and outputWidth (real export
     resolution) are now independent, the export pass has to rescale:
     scale = outputWidth / frameWidth keeps a caption the same
     PROPORTION of the frame in the output as it looked while editing,
     rather than rendering literally cap.size px onto a canvas that may
     be a very different resolution. Live on-screen calls don't pass a
     scale (default 1) since applyCaptionElStyle() sets the DOM box's
     real CSS font-size directly — no rescaling needed there, only for
     the canvas draw at convert time. The outline is optional —
     cap.strokeEnabled toggles it, with cap.strokeColor/strokeWidth
     fully user-chosen instead of an automatic white/black flip. */
  function drawCaption(ctx, w, h, cap, scale = 1){
    if (!cap.text) return;
    const fontSize = Math.max(10, Math.round(cap.size * scale));
    const weight = cap.bold ? 700 : 400;
    const style = cap.italic ? "italic" : "normal";
    ctx.font = `${style} ${weight} ${fontSize}px ${cap.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const x = cap.x * w;
    const y = cap.y * h;
    if (cap.strokeEnabled){
      ctx.lineWidth = cap.strokeWidth * scale;
      ctx.strokeStyle = cap.strokeColor;
      ctx.strokeText(cap.text, x, y);
    }
    ctx.fillStyle = cap.color;
    ctx.fillText(cap.text, x, y);
    if (cap.underline){
      const textWidth = ctx.measureText(cap.text).width;
      const underlineY = y + fontSize * 0.38;
      ctx.beginPath();
      ctx.moveTo(x - textWidth / 2, underlineY);
      ctx.lineTo(x + textWidth / 2, underlineY);
      ctx.lineWidth = Math.max(1, Math.round(fontSize / 14));
      ctx.strokeStyle = cap.color;
      ctx.stroke();
    }
  }
  function drawAllCaptions(ctx, w, h, scale = 1){
    captions.forEach(cap => drawCaption(ctx, w, h, cap, scale));
  }

  function findCaptionById(id){
    return captions.find(c => c.id === id);
  }

  /* Positions and styles a live caption box's DOM element to match what
     drawCaption() actually bakes into the output — same font/size/
     color/stroke math, just applied as real CSS text instead of canvas
     pixels, so typing is a direct WYSIWYG edit rather than round-
     tripping through a separate input + redraw. cap.x/y mark the CENTER
     of the box, positioned as percentages of the preview frame — whose
     CSS width always equals the real output width (the resize handle
     sets both together), so this scale matches the real export 1:1
     regardless of the canvas's own internal resolution. */
  function updateCaptionElPosition(cap, boxEl){
    boxEl.style.left = (cap.x * 100) + "%";
    boxEl.style.top = (cap.y * 100) + "%";
  }
  /* Caption boxes are centered on cap.x/y, so clamping just that center
     point (the old behavior) still let a wide/large box's rendered
     edges spill past the boundary — nothing may cross it, not just its
     own center. The boundary is the dark workspace panel on all four
     sides, not the video frame itself — a box can be dragged anywhere
     into the padding around the frame but never past the panel's own
     edges. cap.x/y stay expressed as fractions of the FRAME (that's the
     coordinate space drawCaption() bakes into the real export); the
     panel's edges are converted into that same frame-relative fraction
     space, coming out <0 or >1 since the panel is larger than the
     frame. */
  function clampCaptionToFrame(cap, boxEl){
    const frameRect = previewFrame.getBoundingClientRect();
    const panelRect = previewPanel.getBoundingClientRect();
    if (!frameRect.width || !frameRect.height) return;
    const halfWFrac = (boxEl.offsetWidth / 2) / frameRect.width;
    const halfHFrac = (boxEl.offsetHeight / 2) / frameRect.height;
    const minXFrac = (panelRect.left - frameRect.left) / frameRect.width;
    const minYFrac = (panelRect.top - frameRect.top) / frameRect.height;
    const maxXFrac = (panelRect.right - frameRect.left) / frameRect.width;
    const maxYFrac = (panelRect.bottom - frameRect.top) / frameRect.height;
    cap.x = (maxXFrac - minXFrac) <= halfWFrac * 2
      ? (minXFrac + maxXFrac) / 2
      : Math.min(maxXFrac - halfWFrac, Math.max(minXFrac + halfWFrac, cap.x));
    cap.y = (maxYFrac - minYFrac) <= halfHFrac * 2
      ? (minYFrac + maxYFrac) / 2
      : Math.min(maxYFrac - halfHFrac, Math.max(minYFrac + halfHFrac, cap.y));
    updateCaptionElPosition(cap, boxEl);
  }
  function applyCaptionElStyle(cap, innerEl){
    const fontSize = Math.max(10, Math.round(cap.size));
    innerEl.style.fontFamily = cap.font;
    innerEl.style.fontSize = fontSize + "px";
    innerEl.style.fontWeight = cap.bold ? "700" : "400";
    innerEl.style.fontStyle = cap.italic ? "italic" : "normal";
    innerEl.style.textDecoration = cap.underline ? "underline" : "none";
    innerEl.style.color = cap.color;
    /* CSS -webkit-text-stroke reads visually much heavier than a canvas
       strokeText() of the same numeric width (it isn't antialiased down
       the way canvas's stroke+fill blend is), so this is halved from
       the real export's cap.strokeWidth — a live-editing approximation
       of the real look, not a pixel-exact match; the real per-frame
       export still uses drawCaption()'s own canvas stroke directly. */
    innerEl.style.webkitTextStroke = cap.strokeEnabled
      ? Math.max(1, Math.round(cap.strokeWidth / 2)) + "px " + cap.strokeColor
      : "0 transparent";
  }

  /* Reflects the currently selected caption's properties into the
     Caption size/Font/Color & style/Bold controls — same idea as
     Context's selectBox(), so those controls always edit "whichever
     bubble you're working on" rather than a single global caption. */
  function syncCaptionControlsToSelection(){
    const cap = findCaptionById(selectedCaptionId);
    if (!cap) return;
    const fontOpt = findByDataset(captionFontMenu, "font", cap.font);
    if (fontOpt){
      bcSetDropdownActive(captionFontMenu, fontOpt);
      captionFontTriggerLabel.textContent = fontOpt.dataset.label;
      captionFontTrigger.style.fontFamily = cap.font;
    }
    const colorOpt = findByDataset(captionColorMenu, "color", cap.color);
    if (colorOpt) bcSetColorDropdownValue(captionColorMenu, captionColorTriggerDot, captionColorTriggerLabel, colorOpt);
    captionBoldBtn.classList.toggle("active", cap.bold);
    captionBoldBtn.setAttribute("aria-pressed", String(cap.bold));
    captionItalicBtn.classList.toggle("active", cap.italic);
    captionItalicBtn.setAttribute("aria-pressed", String(cap.italic));
    captionUnderlineBtn.classList.toggle("active", cap.underline);
    captionUnderlineBtn.setAttribute("aria-pressed", String(cap.underline));
    captionStrokeBtn.classList.toggle("active", cap.strokeEnabled);
    captionStrokeBtn.setAttribute("aria-pressed", String(cap.strokeEnabled));
    const strokeColorOpt = findByDataset(captionStrokeColorMenu, "color", cap.strokeColor);
    if (strokeColorOpt) bcSetColorDropdownValue(captionStrokeColorMenu, captionStrokeColorTriggerDot, captionStrokeColorTriggerLabel, strokeColorOpt);
    const strokeWidthIdx = STROKE_WIDTH_OPTIONS.findIndex(o => o.width === cap.strokeWidth);
    if (strokeWidthIdx !== -1) strokeWidthControl.setIndex(strokeWidthIdx);
  }

  function selectCaption(id){
    selectedCaptionId = id;
    const cap = findCaptionById(id);
    if (cap) lastCaptionSize = cap.size;
    syncCaptionControlsToSelection();
  }

  /* Rebuilds every caption bubble's DOM element from the captions array
     — cheap given the MAX_CAPTIONS=5 cap, so a full rebuild on add/
     remove/restore is simpler than surgical DOM patching. Drag/edit/
     remove handlers are wired per-element here, closing over the cap
     object directly rather than re-looking it up by id on every event. */
  function renderCaptionBoxes(){
    previewFrame.querySelectorAll(".gif-caption-box").forEach(el => el.remove());
    captions.forEach(cap => {
      const boxEl = document.createElement("div");
      boxEl.className = "gif-caption-box";
      boxEl.dataset.captionId = cap.id;

      const handle = document.createElement("span");
      handle.className = "gif-caption-drag-handle bc-obj-drag-handle";
      handle.setAttribute("role", "slider");
      handle.setAttribute("aria-label", "Caption position");
      handle.tabIndex = 0;
      handle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
      boxEl.appendChild(handle);

      const inner = document.createElement("span");
      inner.className = "gif-caption-inner";
      inner.contentEditable = "true";
      inner.spellcheck = false;
      inner.textContent = cap.text;
      boxEl.appendChild(inner);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "gif-caption-remove bc-obj-remove-btn";
      removeBtn.setAttribute("aria-label", "Remove caption");
      removeBtn.textContent = "×";
      boxEl.appendChild(removeBtn);

      const sizeHandle = document.createElement("span");
      sizeHandle.className = "gif-caption-resize-handle bc-obj-resize-handle";
      sizeHandle.setAttribute("role", "slider");
      sizeHandle.setAttribute("aria-label", "Caption text size");
      sizeHandle.tabIndex = 0;
      boxEl.appendChild(sizeHandle);

      const sizeBadgeEl = document.createElement("span");
      sizeBadgeEl.className = "gif-caption-size-badge";
      sizeBadgeEl.hidden = true;
      boxEl.appendChild(sizeBadgeEl);

      updateCaptionElPosition(cap, boxEl);
      applyCaptionElStyle(cap, inner);

      inner.addEventListener("input", () => {
        cap.text = inner.textContent;
        schedulePersist();
      });
      inner.addEventListener("keydown", (e) => {
        if (e.key === "Enter"){
          e.preventDefault();
          inner.blur();
        }
      });
      inner.addEventListener("focus", () => {
        selectCaption(cap.id);
        stopPreviewPlayback();
      });

      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        captions = captions.filter(c => c.id !== cap.id);
        if (selectedCaptionId === cap.id) selectedCaptionId = captions.length ? captions[captions.length - 1].id : null;
        renderCaptionBoxes();
        updateAddTextBtnState();
        schedulePersist();
      });

      /* Relative drag — track the pointer's movement delta from where it
         first grabbed the handle, rather than snapping cap.x/y straight
         to the cursor's position. The box is centered on cap.x/y (its
         handle+text+remove row, not just the text), so a direct
         cursor-to-position snap would jump the caption's center to
         wherever the handle happened to be clicked instead of moving it
         by how far you actually dragged — a leftover from when the
         whole caption itself (no separate handle) was the drag target
         and a direct snap was correct. */
      let dragging = false;
      let dragStartClientX = 0, dragStartClientY = 0;
      let dragStartCapX = 0, dragStartCapY = 0;
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        dragging = true;
        dragStartClientX = e.clientX;
        dragStartClientY = e.clientY;
        dragStartCapX = cap.x;
        dragStartCapY = cap.y;
        selectCaption(cap.id);
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        stopPreviewPlayback();
      });
      handle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const frameRect = previewFrame.getBoundingClientRect();
        const dxFrac = (e.clientX - dragStartClientX) / frameRect.width;
        const dyFrac = (e.clientY - dragStartClientY) / frameRect.height;
        cap.x = Math.min(1, Math.max(0, dragStartCapX + dxFrac));
        cap.y = Math.min(1, Math.max(0, dragStartCapY + dyFrac));
        clampCaptionToFrame(cap, boxEl);
      });
      handle.addEventListener("pointerup", (e) => {
        dragging = false;
        try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
        schedulePersist();
      });

      /* Text-size resize handle — same incremental-delta + snap algorithm
         as the preview frame's corner handle (RESIZE_SNAP/
         RESIZE_SNAP_SHIFT), just applied to cap.size instead of frameWidth. */
      let resizingText = false;
      let textResizeLastX = 0;
      let textResizeVirtual = cap.size;
      sizeHandle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        resizingText = true;
        textResizeLastX = e.clientX;
        textResizeVirtual = cap.size;
        selectCaption(cap.id);
        try { sizeHandle.setPointerCapture(e.pointerId); } catch (err) {}
        sizeBadgeEl.hidden = false;
        sizeBadgeEl.textContent = cap.size + " px";
        stopPreviewPlayback();
      });
      sizeHandle.addEventListener("pointermove", (e) => {
        if (!resizingText) return;
        textResizeVirtual = Math.min(CAPTION_SIZE_MAX, Math.max(CAPTION_SIZE_MIN, textResizeVirtual + (e.clientX - textResizeLastX)));
        textResizeLastX = e.clientX;
        const snap = e.shiftKey ? RESIZE_SNAP_SHIFT : RESIZE_SNAP;
        const next = Math.round(textResizeVirtual / snap) * snap;
        cap.size = next;
        applyCaptionElStyle(cap, inner);
        clampCaptionToFrame(cap, boxEl);
        sizeBadgeEl.textContent = next + " px";
      });
      sizeHandle.addEventListener("pointerup", (e) => {
        resizingText = false;
        try { sizeHandle.releasePointerCapture(e.pointerId); } catch (err) {}
        sizeBadgeEl.hidden = true;
        lastCaptionSize = cap.size;
        schedulePersist();
      });

      previewFrame.appendChild(boxEl);
      clampCaptionToFrame(cap, boxEl);
    });
  }

  function updateAddTextBtnState(){
    addTextBtn.disabled = captions.length >= MAX_CAPTIONS;
  }

  /* Redraws the preview canvas showing the exact crop (not the full
     source frame) that will be baked into the output — the captions
     themselves are the separate HTML boxes above, not drawn onto the
     canvas here. Reuses whatever frame the (hidden) video is currently
     seeked to rather than triggering a fresh seek, so it can be called
     cheaply from crop control changes; callers that need a specific
     frame (trim drag release, initial load) seek first. */
  function renderPreview(){
    const rect = getCropRect();
    if (!rect.sw || !rect.sh) return;
    /* Rendered at the crop's native source resolution (rect.sw/sh, in
       original video pixels), not the frame's CSS-displayed width — the
       canvas is then downscaled by CSS to fit the frame, which keeps it
       sharp; rasterizing at the smaller display width instead throws
       away real source detail before the browser ever gets to draw it. */
    const previewWidth = rect.sw;
    const previewHeight = rect.sh;
    previewCanvas.width = previewWidth;
    previewCanvas.height = previewHeight;
    const ctx = previewCanvas.getContext("2d");
    ctx.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, previewWidth, previewHeight);
  }

  /* Draws an already-cropped, already-sized cached frame (see the frame
     cache below) rather than pulling live from the video. */
  function drawCachedFrame(bitmap){
    const w = bitmap.width, h = bitmap.height;
    previewCanvas.width = w;
    previewCanvas.height = h;
    previewCanvas.getContext("2d").drawImage(bitmap, 0, 0);
  }

  /* ===== playable preview (loops across the trim range, redrawing the
     crop+caption every frame, matching whatever Playback mode is
     selected) =====
     Normal mode uses native video.play() + rAF — smoothest option, and
     fine since forward playback is all it needs to show. Reverse and
     Boomerang can't use native playback (browsers don't support
     reliable negative playbackRate), so those play back a pre-built
     frame cache instead of re-seeking the video on every step (seeking
     per frame meant a real decode round-trip each time, which stacked
     up against the fps pacing and made playback visibly lag behind real
     time). The cache is built with a single continuous forward
     playthrough — one smooth pass, not N seeks — capturing a cropped
     snapshot each time playback crosses an fps-interval boundary, then
     Reverse/Boomerang just index back and forth through that array with
     plain rAF, exactly as smooth as Normal mode. */
  let previewLastStepAt = 0;

  function stepPreview(){
    if (!previewPlaying) return;
    if (video.currentTime >= trimEnd || video.ended){
      video.currentTime = trimStart;
    }
    renderPreview();
    previewRafId = requestAnimationFrame(stepPreview);
  }

  let frameCache = [];
  let frameCacheKey = "";
  let cacheBuildToken = 0;

  function cacheKeyFor(){
    return [trimStart.toFixed(2), trimEnd.toFixed(2), fps, cropMode].join("|");
  }

  /* One continuous forward playthrough of the trim range, snapshotting
     a cropped/sized frame each time real playback crosses the next
     fps-interval boundary. Capped at a sane frame count as a safeguard
     against pathological trim+fps combinations. Cancellable via
     cacheBuildToken so a rapid trim/fps/crop change while a build is
     still running doesn't race a stale one into place. */
  function buildFrameCache(){
    const myToken = ++cacheBuildToken;
    const rect = getCropRect();
    if (!rect.sw || !rect.sh) return Promise.resolve();
    const step = 1 / Math.max(1, fps);
    /* Matches renderPreview's own resolution (see its comment) — the
       cache exists purely to play back smoothly, not to be a lower-res
       copy, so it should look identical to the live-drawn preview. */
    const previewWidth = rect.sw;
    const previewHeight = rect.sh;
    const MAX_CACHE_FRAMES = 300;
    const wasTime = video.currentTime;
    const wasPlaybackRate = video.playbackRate;

    return new Promise((resolve) => {
      const captured = [];
      let nextCaptureAt = trimStart;

      function finish(){
        video.pause();
        video.playbackRate = wasPlaybackRate;
        seekTo(wasTime).then(() => {
          if (myToken !== cacheBuildToken) return resolve();
          frameCache = captured;
          frameCacheKey = cacheKeyFor();
          resolve();
        });
      }

      function tick(){
        if (myToken !== cacheBuildToken) return resolve();
        if (video.currentTime >= trimEnd || video.ended || captured.length >= MAX_CACHE_FRAMES){
          finish();
          return;
        }
        if (video.currentTime >= nextCaptureAt){
          const cell = document.createElement("canvas");
          cell.width = previewWidth;
          cell.height = previewHeight;
          cell.getContext("2d").drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, previewWidth, previewHeight);
          captured.push(cell);
          nextCaptureAt += step;
        }
        requestAnimationFrame(tick);
      }

      seekTo(trimStart).then(() => {
        if (myToken !== cacheBuildToken) return resolve();
        video.playbackRate = 1;
        video.play().then(() => requestAnimationFrame(tick)).catch(() => resolve());
      });
    });
  }

  let cacheIndex = 0;
  let cacheDirection = 1;

  function stepCachedPreview(now){
    if (!previewPlaying || !frameCache.length) return;
    const step = 1000 / Math.max(1, fps) / playbackSpeed;
    const t = now || performance.now();
    if (t - previewLastStepAt >= step){
      previewLastStepAt = t;
      drawCachedFrame(frameCache[cacheIndex]);
      const lastIndex = frameCache.length - 1;
      if (orderMode === "reverse"){
        cacheIndex--;
        if (cacheIndex < 0) cacheIndex = lastIndex;
      } else { // boomerang
        cacheIndex += cacheDirection;
        if (cacheIndex >= lastIndex){ cacheIndex = lastIndex; cacheDirection = -1; }
        else if (cacheIndex <= 0){ cacheIndex = 0; cacheDirection = 1; }
      }
    }
    previewRafId = requestAnimationFrame(stepCachedPreview);
  }

  async function startPreviewPlayback(){
    if (!video.src || duration <= 0) return;
    previewPlaying = true;
    previewPlayBtn.textContent = "❚❚";
    previewPlayBtn.setAttribute("aria-label", "Pause preview");
    if (orderMode === "normal"){
      if (video.currentTime < trimStart || video.currentTime >= trimEnd){
        video.currentTime = trimStart;
      }
      video.playbackRate = playbackSpeed;
      video.play().catch(() => {});
      previewRafId = requestAnimationFrame(stepPreview);
    } else {
      if (frameCacheKey !== cacheKeyFor()) await buildFrameCache();
      if (!previewPlaying || !frameCache.length) return;
      cacheIndex = orderMode === "reverse" ? frameCache.length - 1 : 0;
      cacheDirection = 1;
      previewLastStepAt = 0;
      previewRafId = requestAnimationFrame(stepCachedPreview);
    }
  }

  function stopPreviewPlayback(){
    previewPlaying = false;
    cacheBuildToken++; // cancels an in-flight cache build, if any
    if (previewRafId) cancelAnimationFrame(previewRafId);
    previewRafId = null;
    video.pause();
    previewPlayBtn.textContent = "▶";
    previewPlayBtn.setAttribute("aria-label", "Play preview");
  }

  previewPlayBtn.addEventListener("click", () => {
    if (previewPlaying) stopPreviewPlayback();
    else startPreviewPlayback();
  });

  /* Spacebar toggles preview play/pause, same as the play button —
     ignored while typing anywhere editable or while a button/link/menu
     option has focus (Space already activates those natively; toggling
     playback on top of that would double-fire). No video loaded is a
     no-op either way, since startPreviewPlayback() itself bails on
     that. */
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.key !== " ") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    const isEditable = target.isContentEditable
      || target.tagName === "INPUT"
      || target.tagName === "SELECT"
      || target.tagName === "TEXTAREA"
      || target.tagName === "BUTTON"
      || target.tagName === "A";
    if (isEditable) return;
    if (!video.src) return;
    e.preventDefault();
    if (previewPlaying) stopPreviewPlayback();
    else startPreviewPlayback();
  });

  /* "Add text" adds a new caption bubble (same idea as Context's Add
     text button), focused and ready to type into directly — no separate
     input field. Capped at MAX_CAPTIONS; the button disables once that
     many exist. Each new one starts a little lower than the last so
     they don't all land stacked exactly on top of each other — still
     freely draggable afterward. */
  addTextBtn.addEventListener("click", () => {
    if (captions.length >= MAX_CAPTIONS) return;
    const cap = {
      id: nextCaptionId++,
      text: "Lorem Ipsum",
      x: CAPTION_DEFAULT_X,
      y: Math.min(0.85, CAPTION_DEFAULT_Y + captions.length * 0.1),
      size: lastCaptionSize,
      font: "Arial, sans-serif",
      color: "#ffffff",
      bold: false,
      italic: false,
      underline: false,
      strokeEnabled: false,
      strokeColor: "#000000",
      strokeWidth: 2
    };
    captions.push(cap);
    selectCaption(cap.id);
    renderCaptionBoxes();
    updateAddTextBtnState();
    const inner = previewFrame.querySelector('.gif-caption-box[data-caption-id="' + cap.id + '"] .gif-caption-inner');
    if (inner){
      inner.focus();
      const range = document.createRange();
      range.selectNodeContents(inner);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    schedulePersist();
  });

  /* Drag-to-resize the PREVIEW frame directly from its corner — purely
     a screen-comfort control (bigger frame = easier to see/place
     captions), same as zooming in on any editor canvas. Does not touch
     outputWidth/the real export resolution at all — that's the
     Resolution dropdown's job now (see registerDropdown(resolutionTrigger...)
     below). Height for the real export is computed with the same
     outputHeightFor() helper, just fed outputWidth instead of
     frameWidth at convert time. */
  let resizingPreview = false;
  let resizeLastX = 0;
  let resizeVirtualWidth = 320; // unrounded accumulator — see pointermove below

  function outputHeightFor(width){
    const rect = getCropRect();
    if (!rect.sw || !rect.sh) return width;
    return Math.round(width * (rect.sh / rect.sw));
  }

  resizeHandle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    resizingPreview = true;
    resizeLastX = e.clientX;
    resizeVirtualWidth = frameWidth;
    resizeHandle.setPointerCapture(e.pointerId);
  });
  const RESIZE_SNAP = 5;
  const RESIZE_SNAP_SHIFT = 10;
  resizeHandle.addEventListener("pointermove", (e) => {
    if (!resizingPreview) return;
    /* Bounded by the stable editor column, not previewFrame's own
       .gif-preview-panel parent — that panel shrink-wraps the frame
       (width:fit-content), so using it directly here would cap growth
       at whatever size the frame already is. .gif-preview-panel no
       longer has horizontal padding (removed to open up more preview
       room), so there's nothing left to subtract here — this used to
       subtract its old 74px×2 padding, which silently re-capped drags
       at the old, smaller ceiling even after the padding itself was
       already gone. */
    const containerMax = editorControls.getBoundingClientRect().width;
    const max = Math.min(PREVIEW_WIDTH_MAX, containerMax);
    resizeVirtualWidth = Math.min(max, Math.max(getPreviewWidthMin(), resizeVirtualWidth + (e.clientX - resizeLastX)));
    resizeLastX = e.clientX;
    /* Skips the "useless" in-between sizes (142, 143, 144...) by
       snapping to the nearest multiple of 5 by default, or 10 with
       Shift held for even bigger, faster jumps (140 -> 150 -> 160) —
       fast to land on a round, intentional-looking size instead of
       nudging pixel by pixel to find one. Snapping the already-tracked
       exact position (rather than moving in fixed steps outright) keeps
       it exact the moment Shift is pressed/released mid-drag, instead
       of leaving it wherever the last snapped step happened to be. */
    const snap = e.shiftKey ? RESIZE_SNAP_SHIFT : RESIZE_SNAP;
    const next = Math.round(resizeVirtualWidth / snap) * snap;
    frameWidth = next;
    previewFrame.style.width = next + "px";
    /* Shrinking the frame can push already-positioned captions' edges
       back past its new, smaller bounds even though their x/y fraction
       didn't change — re-clamp all of them against the new size. */
    previewFrame.querySelectorAll(".gif-caption-box").forEach(boxEl => {
      const cap = findCaptionById(boxEl.dataset.captionId ? Number(boxEl.dataset.captionId) : null);
      if (cap) clampCaptionToFrame(cap, boxEl);
    });
  });
  function endPreviewResize(e){
    if (!resizingPreview) return;
    resizingPreview = false;
    resizeHandle.releasePointerCapture(e.pointerId);
    /* The canvas keeps its pre-drag raster resolution throughout the
       drag itself (re-rendering every pointermove would be wasteful) —
       redraw once at the new frameWidth now that dragging has settled,
       so the frame doesn't stay a blurry, CSS-stretched leftover of
       whatever size it used to be. */
    if (!previewPlaying) renderPreview();
    schedulePersist();
  }
  resizeHandle.addEventListener("pointerup", endPreviewResize);
  resizeHandle.addEventListener("pointercancel", endPreviewResize);

  /* Bold/Italic/Underline all toggle the same way — one shared handler
     for the trio instead of three near-identical listeners. */
  function registerCaptionStyleToggle(btn, prop){
    btn.addEventListener("click", () => {
      const cap = findCaptionById(selectedCaptionId);
      if (!cap) return;
      cap[prop] = !cap[prop];
      btn.classList.toggle("active", cap[prop]);
      btn.setAttribute("aria-pressed", String(cap[prop]));
      const inner = previewFrame.querySelector('.gif-caption-box[data-caption-id="' + cap.id + '"] .gif-caption-inner');
      if (inner) applyCaptionElStyle(cap, inner);
      schedulePersist();
    });
  }
  registerCaptionStyleToggle(captionBoldBtn, "bold");
  registerCaptionStyleToggle(captionItalicBtn, "italic");
  registerCaptionStyleToggle(captionUnderlineBtn, "underline");
  registerCaptionStyleToggle(captionStrokeBtn, "strokeEnabled");

  /* ===== Dropdowns (Font / Color & style / Crop / Playback) =====
     Same trigger+menu pattern as Context's color dropdown: one open at
     a time, closes on an outside click or after picking an option. */
  /* Now shared/site.js's bcRegisterDropdown (this file was the original
     source of that pattern — Coudio and Colorfy used to hand-roll
     visually identical copies of it under their own class prefixes;
     all three now point at the one shared implementation). Kept as a
     thin wrapper since every call site here also needs the live
     preview + autosave side effects the shared version doesn't know
     about. */
  function registerDropdown(trigger, menu, onSelect){
    return bcRegisterDropdown(trigger, menu, (opt) => {
      onSelect(opt);
      renderPreview();
      schedulePersist();
    });
  }

  /* Same wrapper, for the two color dropdowns (caption text/stroke
     color) — shared/site.js's bcRegisterColorDropdown already handles
     the dot+label swatch sync, so onSelect here only needs the bit
     that's actually specific to each caller (writing the color onto
     whatever it's coloring). */
  function registerColorDropdown(trigger, dotEl, labelEl, menu, onSelect){
    return bcRegisterColorDropdown(trigger, dotEl, labelEl, menu, (opt) => {
      onSelect(opt);
      renderPreview();
      schedulePersist();
    });
  }

  /* Frame rate — shared/site.js's bcRegisterOptionChangeBtn (a single
     click-to-advance button, .option-change-btn) rather than a
     .bc-dropdown: this is a short ordered ladder of steps, not a set of
     options worth browsing in a menu. */
  const FPS_OPTIONS = [
    { fps: 5, label: "5 fps" },
    { fps: 10, label: "10 fps" },
    { fps: 15, label: "15 fps" },
    { fps: 20, label: "20 fps" },
    { fps: 25, label: "25 fps" },
    { fps: 33.3, label: "33.3 fps" },
    { fps: 50, label: "50 fps" }
  ];
  const fpsControl = bcRegisterOptionChangeBtn(fpsBtn, FPS_OPTIONS, (opt) => {
    fps = opt.fps;
    renderPreview();
    schedulePersist();
  }, FPS_OPTIONS.findIndex(o => o.fps === fps));

  /* The actual export resolution — independent of frameWidth (see the
     resize-handle comment above). Fixed presets rather than a free drag
     since this number has real consequences (file size, encode time)
     that a "just try a value" continuous control obscures. */
  registerDropdown(resolutionTrigger, resolutionMenu, (opt) => {
    outputWidth = parseInt(opt.dataset.width, 10);
    resolutionTriggerLabel.textContent = opt.dataset.label;
  });
  /* Unlike fps/crop/order/speed (which default silently, with no option
     marked active until touched), resolution reflects a remembered
     choice from a past successful download right away — file size is
     a real consequence users should see before hitting Convert, not
     discover after. */
  if (recentWidth){
    const initialOpt = findByDataset(resolutionMenu, "width", String(outputWidth));
    if (initialOpt){
      bcSetDropdownActive(resolutionMenu, initialOpt);
      resolutionTriggerLabel.textContent = initialOpt.dataset.label;
    }
  }

  registerDropdown(captionFontTrigger, captionFontMenu, (opt) => {
    const cap = findCaptionById(selectedCaptionId);
    captionFontTriggerLabel.textContent = opt.dataset.label;
    captionFontTrigger.style.fontFamily = opt.dataset.font;
    if (!cap) return;
    cap.font = opt.dataset.font;
    const inner = previewFrame.querySelector('.gif-caption-box[data-caption-id="' + cap.id + '"] .gif-caption-inner');
    if (inner) applyCaptionElStyle(cap, inner);
  });

  registerColorDropdown(captionColorTrigger, captionColorTriggerDot, captionColorTriggerLabel, captionColorMenu, (opt) => {
    const cap = findCaptionById(selectedCaptionId);
    if (!cap) return;
    cap.color = opt.dataset.color;
    const inner = previewFrame.querySelector('.gif-caption-box[data-caption-id="' + cap.id + '"] .gif-caption-inner');
    if (inner) applyCaptionElStyle(cap, inner);
  });

  registerColorDropdown(captionStrokeColorTrigger, captionStrokeColorTriggerDot, captionStrokeColorTriggerLabel, captionStrokeColorMenu, (opt) => {
    const cap = findCaptionById(selectedCaptionId);
    if (!cap) return;
    cap.strokeColor = opt.dataset.color;
    const inner = previewFrame.querySelector('.gif-caption-box[data-caption-id="' + cap.id + '"] .gif-caption-inner');
    if (inner) applyCaptionElStyle(cap, inner);
  });

  /* Stroke thickness — .option-change-btn like fps/crop/order above, but
     with a renderOption callback: its current value is shown as an
     actual line-weight sample (see the sizing table below), not text,
     so it can't use the shared helper's default textContent rendering. */
  const STROKE_WIDTH_OPTIONS = [
    { width: 1, label: "Thin", lineHeight: "2px" },
    { width: 2, label: "Medium", lineHeight: "4px" },
    { width: 4, label: "Thick", lineHeight: "6px" },
    { width: 7, label: "Extra thick", lineHeight: "9px" }
  ];
  function renderStrokeWidthOption(opt, btn){
    captionStrokeWidthBtnLine.style.height = opt.lineHeight;
    btn.setAttribute("aria-label", "Stroke thickness: " + opt.label);
  }
  const strokeWidthControl = bcRegisterOptionChangeBtn(captionStrokeWidthBtn, STROKE_WIDTH_OPTIONS, (opt) => {
    const cap = findCaptionById(selectedCaptionId);
    if (cap){
      cap.strokeWidth = opt.width;
      const inner = previewFrame.querySelector('.gif-caption-box[data-caption-id="' + cap.id + '"] .gif-caption-inner');
      if (inner) applyCaptionElStyle(cap, inner);
    }
    renderPreview();
    schedulePersist();
  }, STROKE_WIDTH_OPTIONS.findIndex(o => o.width === 2), renderStrokeWidthOption);

  /* Aspect ratio / Playback — same .option-change-btn click-to-advance
     pattern as fps above: short, ordered option lists, no real "browse"
     need. Aspect ratio itself now lives as a corner button on the
     preview frame (see its own markup/CSS) rather than in the settings
     row — same component, just repositioned and icon-only until
     clicked. */
  const CROP_OPTIONS = [
    { crop: "free", label: "Free", ratio: null },
    { crop: "16:9", label: "16:9", ratio: 16 / 9 },
    { crop: "9:16", label: "9:16", ratio: 9 / 16 },
    { crop: "1:1", label: "1:1", ratio: 1 },
    { crop: "2:3", label: "2:3", ratio: 2 / 3 },
    { crop: "3:2", label: "3:2", ratio: 3 / 2 }
  ];
  /* Every ratio (including Free, shown as "0") uses the same
     corner-brackets icon — only the centered label text changes. */
  function renderCropOption(opt, btn){
    cropFreeIconNumber.textContent = opt.crop === "free" ? "0" : opt.label;
    btn.setAttribute("aria-label", "Aspect ratio: " + opt.label);
  }
  const cropControl = bcRegisterOptionChangeBtn(cropBtn, CROP_OPTIONS, (opt) => {
    cropMode = opt.crop;
    cropRatio = opt.ratio;
    renderPreview();
    schedulePersist();
  }, CROP_OPTIONS.findIndex(o => o.crop === cropMode), renderCropOption);

  const ORDER_OPTIONS = [
    { order: "normal", label: "Normal" },
    { order: "reverse", label: "Reverse" },
    { order: "boomerang", label: "Boomerang" }
  ];
  const orderControl = bcRegisterOptionChangeBtn(orderBtn, ORDER_OPTIONS, (opt) => {
    stopPreviewPlayback();
    orderMode = opt.order;
    renderPreview();
    schedulePersist();
  }, ORDER_OPTIONS.findIndex(o => o.order === orderMode));

  registerDropdown(speedTrigger, speedMenu, (opt) => {
    playbackSpeed = parseFloat(opt.dataset.speed);
    speedTriggerLabel.textContent = opt.dataset.label;
    if (orderMode === "normal") video.playbackRate = playbackSpeed;
  });

  /* Builds the filmstrip once per loaded video: a fixed number of
     thumbnails evenly spaced across the FULL clip (not just the current
     trim range), so the timeline always shows the whole source — the
     trim handles/dimming overlay on top are what actually show which
     frames are "cut in" to the GIF. Runs after the scrubber is already
     interactive, filling thumbnails in progressively as each seek
     resolves rather than blocking the UI on one big await. */
  const FILMSTRIP_CELLS = 14;
  const FILMSTRIP_CELL_WIDTH = 60;
  const FILMSTRIP_CELL_HEIGHT = 64;
  let filmstripToken = 0;
  async function buildFilmstrip(){
    const myToken = ++filmstripToken;
    const ctx = filmstripCanvas.getContext("2d");
    filmstripCanvas.width = FILMSTRIP_CELL_WIDTH * FILMSTRIP_CELLS;
    filmstripCanvas.height = FILMSTRIP_CELL_HEIGHT;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, filmstripCanvas.width, filmstripCanvas.height);
    const wasTime = video.currentTime;
    for (let i = 0; i < FILMSTRIP_CELLS; i++){
      const t = (duration * (i + 0.5)) / FILMSTRIP_CELLS;
      await seekTo(t);
      if (myToken !== filmstripToken) return;
      drawCoverFrame(ctx, i * FILMSTRIP_CELL_WIDTH, FILMSTRIP_CELL_WIDTH, FILMSTRIP_CELL_HEIGHT);
    }
    await seekTo(wasTime);
    if (myToken === filmstripToken) renderPreview();
  }

  /* Skipped during a "Continue where you left off" restore (see
     isRestoringSession + restoreTrim below) — restoring registers its
     own "loadedmetadata" listener that needs to set trimStart/trimEnd
     to the SAVED values and seek there, not the fresh-upload defaults
     this listener resets them to. Both listeners fire on the same
     event when a restored file loads, and letting both call
     buildFilmstrip()/seekTo() at once was a real bug: seekTo() waits
     for a single "seeked" event via a one-shot listener, and two
     independent seek chains setting video.currentTime back to back on
     the same element can make the browser coalesce them into one
     "seeked" event — so whichever seekTo() doesn't get it hangs
     forever, unresolved. If that was the restore's own seek, the
     preview never renders and the editor looks "stuck" right after
     clicking Continue, with no error anywhere. */
  video.addEventListener("loadedmetadata", () => {
    duration = video.duration;
    drop.hidden = true;
    videoWrap.classList.add("active");
    convertBtn.disabled = false;
    if (isRestoringSession) return;
    trimStart = 0;
    trimEnd = duration;
    layoutScrubber();
    buildFilmstrip();
    schedulePersist();
  });

  /* Same "×" remove pattern as Context's ctRemoveBtn — clears the
     loaded clip and brings the drop zone back, rather than requiring a
     second file pick to swap it out. */
  function resetGif(){
    stopPreviewPlayback();
    isRestoringSession = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    currentFile = null;
    video.removeAttribute("src");
    video.load();
    duration = 0;
    trimStart = 0;
    trimEnd = 0;
    videoWrap.classList.remove("active");
    scrubberFileName.value = "";
    convertBtn.disabled = true;
    resultsEl.innerHTML = "";
    resultsEl.hidden = false;
    resultsHeader.hidden = true;
    lastResultBytes = null;
    lastResultType = null;
    statusEl.textContent = "";
    previewCanvas.width = previewCanvas.width;
    hideDoneView();
    drop.hidden = false;
    bcDbClear(GIF_DB_NAME, GIF_DB_STORE);
  }

  removeBtn.addEventListener("click", resetGif);

  input.addEventListener("change", (e) => setFile(e.target.files[0]));

  /* Same whole-banner drop target as Convert's — before a video is
     loaded, #gifDrop is just the dashed visual cue, not the actual
     click/drag scope: the entire .tool-app banner opens the picker and
     accepts a drag/drop. isDragEventInScope() flips the moment a video
     loads and #gifDrop is hidden, so it never fights the caption/output
     controls once there's real content to interact with. */
  const toolApp = document.querySelector(".tool-app");
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      if (!drop.hidden || drop.contains(e.target)){
        input.click();
      }
    });

    function isDragEventInScope(e){
      return !drop.hidden || drop.contains(e.target);
    }
    bcSetupBannerDropTarget(toolApp, {
      isInScope: isDragEventInScope,
      getEnterTarget: e => (!drop.hidden ? toolApp : drop),
      clearTargets: [toolApp, drop],
      onDrop: e => setFile(e.dataTransfer.files[0])
    });

    /* Just a fun double-click easter egg — skips buttons/selects/etc. so
       it never fires from a legitimate double-click on a toolbar
       control. Unlike Context's version, this doesn't gate on the drop
       zone still being visible — it wobbles the banner any time, video
       loaded or not, same as Combine's. */
    toolApp.addEventListener("dblclick", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      toolApp.classList.remove("wobble");
      void toolApp.offsetWidth;
      toolApp.classList.add("wobble");
    });
  }

  /* ===== trim scrubber (simple 1-D pointer drag, two handles) ===== */
  function timeToPercent(t){
    return duration > 0 ? (t / duration) * 100 : 0;
  }

  /* minute:second:centisecond (0:17:00, 1:05:32, …) — a single clock
     reading of the selection's own length, not a start–end range, so
     the label answers "how long is my GIF" at a glance. */
  function formatDuration(t){
    t = Math.max(0, t);
    /* Round the whole value to centiseconds first, then decompose —
       rounding cs on its own (e.g. from a 0.999s value) can carry to
       100 and print "0:00:100" instead of correctly rolling into the
       next second. */
    const totalCs = Math.round(t * 100);
    const cs = totalCs % 100;
    const totalS = Math.floor(totalCs / 100);
    const s = totalS % 60;
    const m = Math.floor(totalS / 60);
    return m + ":" + String(s).padStart(2, "0") + ":" + String(cs).padStart(2, "0");
  }

  /* The readout under the scrubber toggles (click) between two modes:
     "duration" — a single clock reading of the selection's own length —
     and "range" — the selection's start–end position within the whole
     video, both clamped by the trim handles. Persisted so the choice
     survives a reload. */
  const SCRUBBER_LABEL_MODE_KEY = "congify-scrubber-label-mode";
  let scrubberLabelMode = "duration";
  try {
    const savedMode = localStorage.getItem(SCRUBBER_LABEL_MODE_KEY);
    if (savedMode === "range" || savedMode === "duration") scrubberLabelMode = savedMode;
  } catch (err) { /* localStorage unavailable — skip */ }

  function layoutScrubber(){
    const startPct = timeToPercent(trimStart);
    const endPct = timeToPercent(trimEnd);
    handleStart.style.left = startPct + "%";
    handleEnd.style.left = endPct + "%";
    maskLeft.style.width = startPct + "%";
    maskRight.style.width = (100 - endPct) + "%";
    scrubberLabel.textContent = scrubberLabelMode === "range"
      ? formatDuration(trimStart) + " – " + formatDuration(trimEnd)
      : formatDuration(trimEnd - trimStart);
  }

  scrubberLabelToggle.addEventListener("click", () => {
    scrubberLabelMode = scrubberLabelMode === "range" ? "duration" : "range";
    try { localStorage.setItem(SCRUBBER_LABEL_MODE_KEY, scrubberLabelMode); } catch (err) { /* skip */ }
    layoutScrubber();
  });

  function clientXToTime(clientX){
    const rect = scrubber.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return pct * duration;
  }

  /* Live-updates the preview while a trim handle is being dragged.
     Seeking is async (video.currentTime → "seeked") and pointermove fires
     far faster than a seek can resolve, so this can't just fire a seek
     per event — that would stack up a growing backlog of in-flight
     seeks. Instead it's a latest-wins loop: while a seek is in flight,
     newer requests just overwrite dragSeekPending; the moment the
     in-flight seek resolves, it immediately starts the next one for
     whatever time is now pending (skipping anything superseded), so the
     preview always ends up settling on the most recent handle position. */
  let dragSeekBusy = false;
  let dragSeekPending = null;

  function scheduleDragPreview(t){
    dragSeekPending = t;
    if (dragSeekBusy) return;
    dragSeekBusy = true;
    (function step(){
      const target = dragSeekPending;
      dragSeekPending = null;
      seekTo(target).then(() => {
        renderPreview();
        if (dragSeekPending !== null) step();
        else dragSeekBusy = false;
      });
    })();
  }

  function startDrag(handle, which){
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stopPreviewPlayback();
      handle.setPointerCapture(e.pointerId);
      function onMove(ev){
        const t = clientXToTime(ev.clientX);
        if (which === "start"){
          trimStart = Math.min(t, trimEnd - 0.1);
          trimStart = Math.max(0, trimStart);
        } else {
          trimEnd = Math.max(t, trimStart + 0.1);
          trimEnd = Math.min(duration, trimEnd);
        }
        layoutScrubber();
        scheduleDragPreview(which === "start" ? trimStart : trimEnd);
      }
      function onUp(ev){
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        scheduleDragPreview(which === "start" ? trimStart : trimEnd);
        schedulePersist();
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }
  startDrag(handleStart, "start");
  startDrag(handleEnd, "end");

  /* Output file name — defaults to the source clip's name (minus
     extension) in setFile(), editable right there next to the trim
     range so renaming doesn't need a separate control. */
  scrubberFileName.addEventListener("input", schedulePersist);

  /* ===== conversion ===== */
  convertBtn.addEventListener("click", async () => {
    if (!video.src || trimEnd <= trimStart) return;
    stopPreviewPlayback();
    convertBtn.disabled = true;
    statusEl.textContent = "Loading encoder...";

    try {
      await loadGifJs();

      const cropRect = getCropRect();
      const outHeight = outputHeightFor(outputWidth);
      /* Captions were positioned/sized against frameWidth (the
         on-screen editor frame) — see drawCaption()'s comment. Scale
         them up/down to whatever the real export resolution is. */
      const captionScale = outputWidth / frameWidth;

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext("2d");

      /* quality is gif.js's NeuQuant sample interval — lower samples more
         pixels per frame for a more accurate 256-color palette (1 is
         exhaustive, slower; the library's own default is 10). dither
         matters more than quality does for how "sharp" the output
         looks: it was off entirely before, so every pixel just snapped
         to its nearest palette color — fine for flat UI color fills,
         but it turns anti-aliased text edges and gradients into visibly
         blocky, low-res-looking bands. Floyd-Steinberg spreads each
         pixel's quantization error into its neighbors instead, which is
         what actually fixes that — same fix any real GIF tool applies.
         globalPalette (one shared 256-color table for every frame,
         instead of each frame picking its own) was tried here too, on
         the theory that it'd cut file size and stop per-frame color
         drift — tested head-to-head against a real multi-frame clip and
         it came out ~35% BIGGER with no visible quality difference:
         dithering every frame against a palette only tuned to frame one
         costs more in scattered noise (worse LZW compression) than it
         saves in dropped per-frame palette tables. Left out. */
      /* Was a hardcoded 2 — gif.js splits the palette/LZW encode across
         this many Web Workers, so it's pure parallelism with no quality
         cost (unlike `quality` above, which trades encode speed for
         accuracy on purpose). Scales to the machine's actual core count
         instead of leaving most of them idle, capped at 6 since gif.js's
         own per-worker overhead stops paying off past that on typical
         clip lengths. */
      const gif = new GIF({
        workers: Math.min(navigator.hardwareConcurrency || 4, 6),
        quality: 1,
        dither: "FloydSteinberg-serpentine",
        width: outputWidth,
        height: outHeight,
        workerScript: "/vendor/gif.worker.js"
      });

      const frameInterval = 1 / fps;
      const times = [];
      for (let t = trimStart; t < trimEnd; t += frameInterval) times.push(t);

      /* Reverse plays the trimmed clip backwards; Boomerang plays it
         forward then back (the popular "bounce" GIF effect) — both
         just reorder the same extracted timestamps, no separate
         extraction pass needed. */
      let orderedTimes = times;
      if (orderMode === "reverse"){
        orderedTimes = times.slice().reverse();
      } else if (orderMode === "boomerang"){
        orderedTimes = times.concat(times.slice().reverse().slice(1));
      }

      for (let i = 0; i < orderedTimes.length; i++){
        statusEl.textContent = "Extracting frame " + (i + 1) + " of " + orderedTimes.length + "...";
        await seekTo(orderedTimes[i]);
        ctx.drawImage(video, cropRect.sx, cropRect.sy, cropRect.sw, cropRect.sh, 0, 0, outputWidth, outHeight);
        drawAllCaptions(ctx, outputWidth, outHeight, captionScale);
        gif.addFrame(ctx, { delay: Math.round((frameInterval * 1000) / playbackSpeed), copy: true });
      }

      gif.on("progress", (p) => {
        statusEl.textContent = "Encoding GIF... " + Math.round(p * 100) + "%";
      });

      gif.on("finished", async (blob) => {
        statusEl.textContent = "Done.";

        recentWidth = outputWidth;
        try { localStorage.setItem(RECENT_WIDTH_KEY, String(outputWidth)); } catch (err) { /* skip */ }

        renderResult(blob);
        lastResultType = blob.type || "image/gif";
        lastResultBytes = await blob.arrayBuffer();
        schedulePersist();

        convertBtn.disabled = false;
        showDoneView();
      });

      gif.render();
    } catch (err){
      statusEl.textContent = "Something went wrong converting this video.";
      convertBtn.disabled = false;
    }
  });

  /* ===== "Continue where you left off" ===== persists the loaded clip's
     bytes plus every editing setting (trim, fps/width, crop, playback
     order, and the full caption styling/position), so "Continue"
     restores the exact same editing state, not just the file. Only
     clears when the video itself is removed (resetGif). */
  function findByDataset(group, key, value){
    return [...group.children].find(b => b.dataset[key] === value);
  }

  let persistTimer = null;
  let persistBusy = false;
  function schedulePersist(){
    if (!currentFile) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }

  async function persistNow(){
    if (!currentFile || persistBusy) return;
    persistBusy = true;
    try {
      const bytes = await currentFile.arrayBuffer();
      await bcDbPut(GIF_DB_NAME, GIF_DB_STORE, {
        file: { name: currentFile.name, type: currentFile.type, bytes },
        result: lastResultBytes ? { type: lastResultType, bytes: lastResultBytes } : null,
        outputName: scrubberFileName.value,
        trimStart,
        trimEnd,
        fps,
        width: frameWidth,
        outputWidth,
        cropMode,
        orderMode,
        playbackSpeed,
        captions
      });
    } catch (err){ /* storage unavailable — skip */
    } finally { persistBusy = false; }
  }

  setInterval(() => { if (currentFile) persistNow(); }, 4000);

  (async () => {
    const saved = await bcDbGet(GIF_DB_NAME, GIF_DB_STORE);
    /* Signals shared/site.js's scroll restore that this async check (and
       the "Continue where you left off" button it may just have revealed
       — a real, measurable layout-height change) is done, so it can
       re-apply the remembered scroll position one more time instead of
       leaving it wherever it landed before this resolved. Dispatched
       unconditionally, before the early returns below, so it always
       fires exactly once regardless of which branch runs. */
    document.dispatchEvent(new Event("bc:session-check-done"));
    if (!saved || !saved.file) return;
    if (currentFile) return;
    continueBtn.hidden = false;
    continueBtn.addEventListener("click", () => {
      continueBtn.hidden = true;
      try {
        if (saved.fps){
          fps = saved.fps;
          const idx = FPS_OPTIONS.findIndex(o => o.fps === saved.fps);
          if (idx !== -1) fpsControl.setIndex(idx);
        }
        if (saved.width){
          frameWidth = Math.min(PREVIEW_WIDTH_MAX, Math.max(getPreviewWidthMin(), saved.width));
          previewFrame.style.width = frameWidth + "px";
        }
        /* Older saved sessions (before preview/output were split) have
           no outputWidth field — outputWidth's own recentWidth-based
           default from page load stands in for those. */
        if (saved.outputWidth){
          outputWidth = saved.outputWidth;
          const opt = findByDataset(resolutionMenu, "width", String(saved.outputWidth));
          if (opt){ bcSetDropdownActive(resolutionMenu, opt); resolutionTriggerLabel.textContent = opt.dataset.label; }
        }
        if (saved.cropMode){
          const idx = CROP_OPTIONS.findIndex(o => o.crop === saved.cropMode);
          if (idx !== -1){
            cropMode = CROP_OPTIONS[idx].crop;
            cropRatio = CROP_OPTIONS[idx].ratio;
            cropControl.setIndex(idx);
          }
        }
        if (saved.orderMode){
          orderMode = saved.orderMode;
          const idx = ORDER_OPTIONS.findIndex(o => o.order === saved.orderMode);
          if (idx !== -1) orderControl.setIndex(idx);
        }
        if (saved.playbackSpeed){
          playbackSpeed = saved.playbackSpeed;
          const opt = findByDataset(speedMenu, "speed", String(saved.playbackSpeed));
          if (opt){ bcSetDropdownActive(speedMenu, opt); speedTriggerLabel.textContent = opt.dataset.label; }
        }
        video.addEventListener("loadedmetadata", function restoreTrim(){
          video.removeEventListener("loadedmetadata", restoreTrim);
          if (typeof saved.trimStart === "number" && typeof saved.trimEnd === "number"){
            trimStart = Math.max(0, Math.min(saved.trimStart, duration));
            trimEnd = Math.max(trimStart + 0.1, Math.min(saved.trimEnd, duration));
            layoutScrubber();
          }
          /* Own seek first, then hand off to buildFilmstrip() — not
             concurrently with it. isRestoringSession (cleared here) is
             what kept the OTHER loadedmetadata listener above from
             also calling buildFilmstrip() at the same moment on the
             same video element, which is what used to hang the whole
             restore (see the comment on that listener). */
          seekTo(trimStart).then(() => {
            renderPreview();
            isRestoringSession = false;
            buildFilmstrip();
          });
        }, { once: true });

        isRestoringSession = true;
        const restored = new File([saved.file.bytes], saved.file.name, { type: saved.file.type });
        setFile(restored);

        if (typeof saved.outputName === "string") scrubberFileName.value = saved.outputName;

        if (Array.isArray(saved.captions)){
          /* Sessions saved before the stroke controls existed won't have
             these fields — default them in rather than rendering with
             an undefined (falsy, so stroke-less) outline, which would
             silently change the look of an already-saved caption. */
          captions = saved.captions.slice(0, MAX_CAPTIONS).map(c => ({
            strokeEnabled: true,
            strokeColor: "#000000",
            strokeWidth: 2,
            ...c
          }));
          nextCaptionId = captions.reduce((max, c) => Math.max(max, c.id), 0) + 1;
          selectedCaptionId = captions.length ? captions[captions.length - 1].id : null;
          renderCaptionBoxes();
          updateAddTextBtnState();
          syncCaptionControlsToSelection();
        }

        if (saved.result && saved.result.bytes){
          lastResultType = saved.result.type || "image/gif";
          lastResultBytes = saved.result.bytes;
          renderResult(new Blob([lastResultBytes], { type: lastResultType }));
          /* Restores straight into the editor (no showDoneView() call in
             this path), so minimize is meaningful here — same as after
             clicking "Continue working". */
          resultsHeader.hidden = false;
        }
      } catch (err){
        console.error(err);
        isRestoringSession = false;
        continueBtn.hidden = false;
      }
    });
  })();
})();
