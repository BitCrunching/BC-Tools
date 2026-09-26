(function(){
  const drop = document.getElementById("cpDrop");
  const addTile = document.getElementById("cpAddTile");
  const input = document.getElementById("cpInput");
  const levelButtons = document.querySelectorAll("#cpLevelButtons .tool-format-btn");
  const compressBtn = document.getElementById("cpCompressBtn");
  bcRegisterKeyShortcut("d", compressBtn);
  const status = document.getElementById("cpStatus");
  const results = document.getElementById("cpResults");
  const selectedCompression = document.getElementById("cpSelectedCompression");
  const afterDrop = document.getElementById("cpAfterDrop");
  const controls = document.getElementById("cpControls");
  const removeBtn = document.getElementById("cpRemoveBtn");
  const toolApp = document.querySelector(".tool-app");

  /* Clears only the .result cards, not #cpAddTile — that tile is a
     permanent fixture of #cpResults (files load in beside it), not
     something rebuilt on every render. Plain results.innerHTML=""
     would delete it outright (it's a real DOM node, not recreated) —
     same pattern as Convert's clearResultCards(). */
  function clearResultCards(){
    results.querySelectorAll(".result").forEach(el => el.remove());
  }

  let files = [];
  let selectedQuality = null;

  /* Keyed by File object — holds the decoded/compressed preview a HEIC
     row's "Preview" button produced, so a full showSelectedPreviews()
     rebuild (removing a different file, restoring a saved session) shows
     that image straight away instead of resetting back to the Preview
     button. Also persisted into IndexedDB (see "Continue where you left
     off" below) so it survives a page reload, not just a same-session
     rebuild. */
  const heicPreviewCache = new Map();

  /* ===== Single files / .zip download-mode toggle =====
     Same reasoning/thresholds/solo-segment behavior as Convert's own
     copy of this (see its own comment for the full rationale): stays
     visible once any file's loaded, but solos down to whichever single
     option is valid at the current count — ≤5 forces "Single files"
     (removes the .zip segment), >20 forces ".zip" (removes the "Single
     files" segment), and only 6-20 shows both as a real choice,
     defaulting to "zip" (Compress's original, toggle-less behavior). */
  const DOWNLOAD_MODE_TOGGLE_MIN = 5;
  const DOWNLOAD_MODE_TOGGLE_MAX = 20;
  const downloadModeToggle = document.getElementById("cpDownloadModeToggle");
  const downloadModeSingleBtn = document.getElementById("cpDownloadModeSingleBtn");
  const downloadModeZipBtn = document.getElementById("cpDownloadModeZipBtn");
  let downloadMode = "zip";
  function setDownloadMode(mode){
    downloadMode = mode;
    if (downloadModeSingleBtn) downloadModeSingleBtn.setAttribute("aria-pressed", String(mode === "single"));
    if (downloadModeZipBtn) downloadModeZipBtn.setAttribute("aria-pressed", String(mode === "zip"));
  }
  if (downloadModeSingleBtn && downloadModeZipBtn){
    downloadModeSingleBtn.addEventListener("click", () => setDownloadMode("single"));
    downloadModeZipBtn.addEventListener("click", () => setDownloadMode("zip"));
  }
  /* Collapses a no-longer-valid segment via .bc-segmented-toggle-solo's
     sibling class (.bc-segmented-toggle-collapsed, shared/site.css)
     instead of the [hidden] attribute — [hidden] snaps to display:none
     instantly (no transition possible), the collapsed class animates
     its flex share/padding/opacity down to 0 so the toggle smoothly
     grows/shrinks between showing one segment and two, rather than
     popping. aria-hidden/tabindex keep it out of the tab order and
     screen-reader flow while collapsed, since pointer-events:none alone
     only blocks clicks, not keyboard focus. */
  function updateDownloadModeToggle(count){
    if (!downloadModeToggle || !downloadModeSingleBtn || !downloadModeZipBtn) return;
    downloadModeToggle.hidden = count === 0;
    const showSingle = count <= DOWNLOAD_MODE_TOGGLE_MAX;
    const showZip = count > DOWNLOAD_MODE_TOGGLE_MIN;
    [[downloadModeSingleBtn, showSingle], [downloadModeZipBtn, showZip]].forEach(([btn, show]) => {
      btn.classList.toggle("bc-segmented-toggle-collapsed", !show);
      btn.setAttribute("aria-hidden", String(!show));
      btn.tabIndex = show ? 0 : -1;
    });
    downloadModeSingleBtn.classList.toggle("bc-segmented-toggle-solo", showSingle && !showZip);
    downloadModeZipBtn.classList.toggle("bc-segmented-toggle-solo", showZip && !showSingle);
    if (showSingle && !showZip) setDownloadMode("single");
    else if (showZip && !showSingle) setDownloadMode("zip");
  }
  function effectiveUseZip(count){
    if (count <= DOWNLOAD_MODE_TOGGLE_MIN) return false;
    if (count > DOWNLOAD_MODE_TOGGLE_MAX) return true;
    return downloadMode === "zip";
  }

  /* "Compress and download" is the idle label everywhere except
     mobile, where it's shortened to just "Download" — screen width,
     not device, since it's about fitting the button. Only touches the
     idle label; "Compressing..." (set directly, below) stays as real
     in-progress feedback regardless of width. */
  const mobileQuery = window.matchMedia("(max-width:768px)");
  function compressBtnIdleLabel(){
    return mobileQuery.matches ? "Download" : "Compress and download";
  }
  compressBtn.textContent = compressBtnIdleLabel();
  mobileQuery.addEventListener("change", () => {
    if (!compressBtn.disabled || files.length === 0) compressBtn.textContent = compressBtnIdleLabel();
  });

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("compress", "cp", [
    ["WELCOME_TO_COMPRESS", "Compress shrinks your images' file size — pick a level and see the estimated result before committing. Click or drop an image below to get started."],
    ["PICK_A_LEVEL", "Choose Low, Medium, or High — each shows a live estimate of the resulting file size before you commit."],
    ["CHECK_BEFORE_COMPRESSING", "Your files show up below once picked — check them before compressing, and remove any you don't need."],
    ["NOT_SURE_WHAT_TO_PICK", "Scroll down to the level guide further down the page — it explains what each level is actually good for."],
    ["YOU_ARE_SET", "Hit Compress and the files download automatically — as a ZIP once you've got more than 5 (you can switch back to single files up to 20). Close this with the red dot and we won't show it again."]
  ]);

  /* Level buttons + Compress button stay hidden until a file is
     picked — first-time visitors get one obvious step instead of
     competing controls at once. */
  /* Before a file is picked, #cpDrop's original "Click or drop images"
     intro stays exactly as it always was, and the whole banner acts as
     the drop zone behind it. Once a file lands, revealAfterDropUI()
     hides #cpDrop for good and #cpAddTile (the shared .bc-add-tile,
     always present as the first item in #cpResults — files load in to
     its right) takes over as the target for adding more, same split
     Convert's #cvDrop/#cvAddTile use. */
  function revealAfterDropUI(){
    if (afterDrop) afterDrop.hidden = false;
    drop.hidden = true;
    addTile.hidden = false;
    if (controls) controls.hidden = false;
  }

  /* addTile is a real <button>, so it's exempt from the generic click
     handler below (which explicitly skips buttons) and gets its own
     listener instead. */
  addTile.addEventListener("click", () => input.click());

  /* Before a file is picked, the whole banner acts as the drop zone —
     not just the (visually hidden) dashed box. */
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      if (afterDrop.hidden){
        input.click();
      }
    });

    /* Just a fun double-click easter egg — skips buttons/selects/etc.
       so it never fires from a legitimate double-click on a control. */
    toolApp.addEventListener("dblclick", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      toolApp.classList.remove("wobble");
      void toolApp.offsetWidth;
      toolApp.classList.add("wobble");
    });
  }

  function isDragEventInScope(e){
    return afterDrop.hidden || addTile.contains(e.target);
  }
  bcSetupBannerDropTarget(toolApp, {
    isInScope: isDragEventInScope,
    getEnterTarget: e => (afterDrop.hidden ? toolApp : addTile),
    clearTargets: [toolApp, addTile],
    onDrop: e => setFiles(e.dataTransfer.files)
  });

  /* ===== "Remove all" reset — clears every loaded file and returns to
     the pre-upload intro state. Mirrors Convert's own #cvRemoveBtn/
     resetTool(), adapted for Compress's own state shape (a flat files[]
     array plus a single selectedQuality, rather than two format
     <select>s). */
  function resetTool(){
    files = [];
    selectedQuality = null;
    levelButtons.forEach(b => b.classList.remove("active"));
    selectedCompression.textContent = "";
    afterDrop.hidden = true;
    drop.hidden = false;
    addTile.hidden = true;
    if (controls) controls.hidden = true;
    clearResultCards();
    renderStatus();
    compressBtn.disabled = true;
    compressBtn.textContent = compressBtnIdleLabel();
    heicPreviewCache.clear();
    bcDbClear(CP_DB_NAME, CP_DB_STORE);
  }
  removeBtn.addEventListener("click", resetTool);

  levelButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      selectedQuality = Number(btn.dataset.quality);
      levelButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedCompression.textContent = `Compression level: ${btn.dataset.label}`;
      updateAllEstimates();
      schedulePersist();
    });
  });

  function formatKB(bytes){
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /* Original-size label only — the "Estimated after compression" figure
     stays plain KB via formatKB above regardless of size, on purpose. */
  function formatSize(bytes){
    const kb = bytes / 1024;
    if (kb > 1000) return `${(kb / 1024).toFixed(1)} MB`;
    return formatKB(bytes);
  }

  function isHeicFile(f){
    return f.type === "image/heic" || f.type === "image/heif" || /\.(heic|heif)$/i.test(f.name);
  }

  /* Loaded on demand (not a static <script> tag) — it's a ~1.3MB WASM
     decoder bundle, and most visitors never touch a HEIC file, so
     there's no reason to make everyone download it up front. Cached
     after the first load so picking multiple HEIC files only pays the
     download once. Same pattern as Convert's loadHeic2any(). */
  let heic2anyLoadPromise = null;
  function loadHeic2any(){
    if (window.heic2any) return Promise.resolve();
    if (!heic2anyLoadPromise){
      heic2anyLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/vendor/heic2any.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load the HEIC decoder."));
        document.head.appendChild(script);
      });
    }
    return heic2anyLoadPromise;
  }

  /* Cached per file so an on-demand preview decode and the real
     compression pass (whichever happens first) only pay the slow WASM
     decode once. Same pattern as Convert's decodeHeicFile(). */
  const heicDecodeCache = new WeakMap();
  async function decodeHeicFile(file){
    if (heicDecodeCache.has(file)) return heicDecodeCache.get(file);
    await loadHeic2any();
    const decoded = await window.heic2any({ blob: file, toType: "image/png", quality: 0.92 });
    const pngFile = Array.isArray(decoded) ? decoded[0] : decoded;
    heicDecodeCache.set(file, pngFile);
    return pngFile;
  }

  function renderStatus(){
    updateDownloadModeToggle(files.length);
    if (files.length > 0){
      const count = files.length;
      const word = count === 1 ? "image" : "images";
      const readyText = `Ready to compress: ${count} ${word}`;

      const hasPng = files.some(f => f.type === "image/png");
      if (hasPng){
        status.innerHTML = `${readyText}. <span style="color:var(--text)">PNG will be converted to JPG for better compression.</span>`;
      } else {
        status.textContent = readyText;
      }
    } else {
      status.textContent = "";
    }
  }

  /* Thumbnails load through a small, separate concurrency-capped queue
     (like ESTIMATE_CONCURRENCY above, but for <img> decode/paint rather
     than canvas encode) so a big batch's filename/size text — already
     in the DOM the instant appendPreviewCard runs, no queue involved —
     visibly settles first, with photos filling in afterward rather than
     all trying to decode and paint at once. Confirmed directly (iPhone
     13 mini) that leaving thumbnails on the plain synchronous
     `<img src>` path was the remaining source of jank on a big batch
     even after the estimate calculation itself was capped. */
  const IMAGE_LOAD_CONCURRENCY = 3;
  const imageLoadQueue = [];
  let imageLoadersActive = 0;
  function loadCardImage(img, src){
    return new Promise(resolve => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
      img.src = src;
    });
  }
  function pumpImageQueue(){
    while (imageLoadersActive < IMAGE_LOAD_CONCURRENCY && imageLoadQueue.length){
      const { img, src } = imageLoadQueue.shift();
      imageLoadersActive++;
      loadCardImage(img, src).then(() => {
        imageLoadersActive--;
        pumpImageQueue();
      });
    }
  }
  /* requestAnimationFrame, not requestIdleCallback — Safari/iOS has never
     implemented the latter. rAF still guarantees the text stats get at
     least one paint before any thumbnail decode starts, since the
     callback only runs on the *next* frame, never synchronously. Paired
     with a 100ms setTimeout fallback because rAF itself never fires at
     all in a backgrounded/hidden tab (confirmed live: a whole batch's
     thumbnails silently never loaded while the tab was inactive) — a
     visitor switching tabs mid-batch shouldn't leave every thumbnail
     stuck waiting forever for a frame that isn't coming. Whichever
     fires first runs the pump; the `done` guard just stops the other
     from running it twice. */
  function enqueueImageLoad(img, src){
    imageLoadQueue.push({ img, src });
    let done = false;
    const run = () => { if (done) return; done = true; pumpImageQueue(); };
    requestAnimationFrame(run);
    setTimeout(run, 100);
  }

  function appendPreviewCard(item){
    const card = document.createElement("div");
    card.className = "result";
    card.innerHTML = `
      <img alt="${item.name}" loading="lazy" decoding="async">
      <div class="result-name">${item.name}</div>
      <div class="result-size">${item.info}</div>
    `;
    results.appendChild(card);
    if (item.src) enqueueImageLoad(card.querySelector("img"), item.src);
    return card;
  }

  /* Shared by both the live "Preview" click and a cache-hit re-render
     (a rebuilt card from showSelectedPreviews, or one restored from a
     saved session) — same DOM change either way, just triggered from two
     different places. */
  function showHeicPreviewImage(card, blob, name){
    const img = document.createElement("img");
    img.src = URL.createObjectURL(blob);
    img.alt = name;
    card.insertBefore(img, card.firstChild);
    card.classList.remove("result-pdf");
    const previewBtn = card.querySelector(".result-heic-preview-btn");
    if (previewBtn) previewBtn.remove();
  }

  let previewEntries = [];

  function showSelectedPreviews(){
    previewEntries = [];
    if (files.length === 0){ clearResultCards(); return; }
    clearResultCards();

    files.forEach(file => {
      /* HEIC skips the automatic thumbnail — an <img> pointed at raw
         HEIC bytes just shows a broken image icon in every browser
         but Safari, and running the full WASM decode for every file
         in a big batch is the slow part a visitor actually notices.
         Instead it's opt-in: a "Preview" button decodes just that one
         file on click. Since decodeHeicFile caches its result,
         clicking it doesn't cost anything extra when Compress later
         needs the same decode to actually compress the file. */
      const heic = isHeicFile(file);
      const card = appendPreviewCard({
        src: heic ? "" : URL.createObjectURL(file),
        name: file.name,
        info: formatSize(file.size)
      });
      if (heic){
        card.classList.add("result-pdf");
        card.querySelector("img").remove();

        const cachedPreview = heicPreviewCache.get(file);
        if (cachedPreview){
          showHeicPreviewImage(card, cachedPreview, file.name);
        } else {
          const previewBtn = document.createElement("button");
          previewBtn.type = "button";
          previewBtn.className = "result-heic-preview-btn";
          previewBtn.textContent = "Preview";
          previewBtn.addEventListener("click", async () => {
            previewBtn.disabled = true;
            previewBtn.textContent = "Loading...";
            try {
              /* A HEIC preview only ever shows up on screen at thumbnail
                 size, and the file gets compressed on download regardless
                 — decoding it to a full-quality PNG just to display small
                 is pure wasted work. Once a compression level is picked,
                 show the actual compressed result instead (compressImageFile
                 already runs the file through decodeHeicFile internally,
                 which is cache-hit-cheap since this preview click likely
                 already triggered that same decode via queueEstimates).
                 Before a level's picked there's nothing to compress to yet,
                 so it falls back to the plain decode. */
              const decoded = selectedQuality !== null
                ? await compressImageFile(file, selectedQuality, getOutputMimeType(file))
                : await decodeHeicFile(file);
              heicPreviewCache.set(file, decoded);
              showHeicPreviewImage(card, decoded, file.name);
              schedulePersist();
            } catch (err){
              previewBtn.disabled = false;
              previewBtn.textContent = "Preview failed — retry";
            }
          });
          card.appendChild(previewBtn);
        }
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cp-file-remove-btn bc-file-remove-btn";
      btn.setAttribute("aria-label", "Remove");
      btn.textContent = "×";
      btn.addEventListener("click", () => {
        files = files.filter(f => f !== file);
        heicPreviewCache.delete(file);
        /* Removing the last file this way used to leave the tool
           stranded in the "revealed" post-upload state — level buttons,
           empty add-tile, disabled Compress button — with no way back to
           the actual intro drop zone short of the red remove-all button.
           Reuse the same resetTool() the remove-all button calls so
           dropping to zero files always lands back at the intro, however
           the last file left. */
        if (files.length === 0){
          resetTool();
          return;
        }
        renderStatus();
        showSelectedPreviews();
        compressBtn.disabled = files.length === 0;
        schedulePersist();
      });
      card.appendChild(btn);

      const entry = { file, infoEl: card.querySelector(".result-size"), token: 0 };
      previewEntries.push(entry);
    });

    queueEstimates(previewEntries);
  }

  function addResultRemoveButton(card){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cp-file-remove-btn bc-file-remove-btn";
    btn.setAttribute("aria-label", "Remove");
    btn.textContent = "×";
    btn.addEventListener("click", () => {
      const img = card.querySelector("img");
      if (img && img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
      card.remove();
    });
    card.appendChild(btn);
  }

  async function updateEstimateForEntry(entry){
    const originalText = formatSize(entry.file.size);
    if (selectedQuality === null){
      entry.infoEl.textContent = originalText;
      return;
    }

    const myToken = ++entry.token;
    entry.infoEl.innerHTML = `${originalText}<br>Estimate: calculating...`;

    try {
      const outputMimeType = getOutputMimeType(entry.file);
      const compressedBlob = await compressImageFile(entry.file, selectedQuality, outputMimeType);
      if (entry.token !== myToken) return;
      const savedPercent = Math.max(0, Math.round((1 - compressedBlob.size / entry.file.size) * 100));
      entry.infoEl.innerHTML = `${originalText}<br>Estimated after compression: ${formatKB(compressedBlob.size)} (-${savedPercent}%)`;
    } catch (err){
      if (entry.token !== myToken) return;
      entry.infoEl.textContent = originalText;
    }
  }

  /* Estimate recalculation runs a real canvas encode per file — firing
     every one at once (a plain forEach) is what bogs down lower-end
     devices once a batch gets past ~10 images. Capped at 5 concurrent
     encodes instead: still lets a visitor load as many files as they
     want, just processes the estimates in waves of 5 rather than all at
     once. Each entry still uses its own token check, so a level change
     mid-run correctly discards stale results same as before. Every entry
     not yet picked up by one of the 5 workers shows "Waiting..." instead
     of sitting there with no feedback at all, so a 20-file batch reads as
     "working through these" rather than looking stalled. */
  const ESTIMATE_CONCURRENCY = 5;
  async function runWithConcurrencyLimit(items, limit, worker){
    let index = 0;
    async function runNext(){
      while (index < items.length){
        const item = items[index++];
        await worker(item);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  }

  function queueEstimates(entries){
    if (selectedQuality !== null){
      entries.forEach(entry => {
        entry.infoEl.innerHTML = `${formatSize(entry.file.size)}<br>Waiting...`;
      });
    }
    runWithConcurrencyLimit(entries, ESTIMATE_CONCURRENCY, updateEstimateForEntry);
  }

  function updateAllEstimates(){
    queueEstimates(previewEntries);
  }

  /* Appends to the existing selection rather than replacing it, so
     picking (or dropping) a second round of images adds to the first
     instead of wiping it out — matches Combine's "upload as many
     rounds as you like" behavior. */
  /* GIF matches "image/*" like any other image, but Compress's pipeline
     (compressImageFile, below) draws the file onto a <canvas> and
     re-encodes it as a single JPG/WEBP frame — for an animated GIF that
     silently throws away every frame but the first and hands back a
     misleadingly-named static file. Excluded here (not just via the
     input's accept attribute, which drag-and-drop bypasses entirely) so
     a dropped GIF is rejected the same way a picked one is. */
  function isGifFile(f){
    return f.type === "image/gif" || /\.gif$/i.test(f.name);
  }

  function setFiles(fileList){
    const incoming = [...fileList];
    const gifRejected = incoming.some(isGifFile);
    const picked = incoming.filter(f => (f.type.startsWith("image/") && !isGifFile(f)) || isHeicFile(f));
    if (picked.length === 0){
      if (gifRejected){
        status.textContent = "GIFs aren't supported here — Compress only handles static images. Use Congify to shrink an animated GIF instead.";
      }
      return;
    }
    files = files.concat(picked);
    revealAfterDropUI();
    renderStatus();
    if (gifRejected){
      status.innerHTML += ` <span style="color:var(--text)">GIFs were skipped — animated images aren't supported here, try Congify instead.</span>`;
    }
    showSelectedPreviews();
    compressBtn.disabled = files.length === 0;
    schedulePersist();
  }

  input.addEventListener("change", e => setFiles(e.target.files));

  function getOutputMimeType(file){
    if (file.type === "image/webp") return "image/webp";
    return "image/jpeg";
  }

  function getOutputExtension(mimeType){
    return mimeType === "image/webp" ? "webp" : "jpg";
  }

  async function compressImageFile(file, qualityRatio, outputMimeType){
    /* HEIC can't be decoded by <img>/<canvas> in any browser but
       Safari — run it through the WASM decoder first (cached, so this
       is free if the file was already previewed) to get a real image,
       then hand that to the exact same canvas pipeline below as if it
       had been a normal image all along. */
    if (isHeicFile(file)){
      file = await decodeHeicFile(file);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (outputMimeType === "image/jpeg"){
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) { reject(new Error(`Failed to compress ${file.name}`)); return; }
          resolve(blob);
        }, outputMimeType, qualityRatio);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Failed to load ${file.name}`));
      };
      img.src = objectUrl;
    });
  }

  compressBtn.addEventListener("click", async () => {
    if (files.length === 0){
      status.textContent = "Please select at least one image first.";
      return;
    }
    if (selectedQuality === null){
      status.textContent = "Please select a compression level first.";
      return;
    }

    compressBtn.disabled = true;
    compressBtn.textContent = "Compressing...";
    status.textContent = `Compressing... 0 of ${files.length}`;

    const useZip = effectiveUseZip(files.length);
    let resultsCleared = false;
    function clearResultsOnce(){
      if (resultsCleared) return;
      resultsCleared = true;
      clearResultCards();
    }

    startPrivacyCheck();
    try {
      const zip = useZip ? new JSZip() : null;
      let done = 0;

      for (const file of files){
        const outputMimeType = getOutputMimeType(file);
        const extension = getOutputExtension(outputMimeType);
        const compressedBlob = await compressImageFile(file, selectedQuality, outputMimeType);
        const outputName = file.name.replace(/\.[^.]+$/, "") + "_compressed." + extension;

        const savedPercent = Math.max(0, Math.round((1 - compressedBlob.size / file.size) * 100));
        clearResultsOnce();
        const resultCard = appendPreviewCard({
          src: URL.createObjectURL(compressedBlob),
          name: outputName,
          info: `${formatSize(file.size)} → ${formatKB(compressedBlob.size)} • -${savedPercent}%`
        });
        addResultRemoveButton(resultCard);

        if (useZip){
          zip.file(outputName, compressedBlob);
        } else {
          downloadBlob(compressedBlob, outputName);
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        done++;
        status.textContent = `Compressing... ${done} of ${files.length}`;
      }

      if (useZip){
        status.textContent = "Building ZIP file...";
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, "bccompress-images.zip");
        status.textContent = `Done. ZIP contains ${files.length} compressed images.`;
      } else {
        const word = files.length === 1 ? "image" : "images";
        status.textContent = `Done. Downloaded ${files.length} compressed ${word}.`;
      }

      files = [];
      bcDbClear(CP_DB_NAME, CP_DB_STORE);
    } catch (err){
      console.error(err);
      status.textContent = "Something went wrong during compression.";
    } finally {
      compressBtn.disabled = files.length === 0;
      compressBtn.textContent = compressBtnIdleLabel();
      finishPrivacyCheck(document.getElementById("cpPrivacyBadge"));
    }
  });

  /* ===== "Continue where you left off" persistence ===== */
  const CP_DB_NAME = "bctools-compress";
  const CP_DB_STORE = "session";
  const continueBtn = document.getElementById("cpContinueBtn");

  let persistTimer = null;
  let persistBusy = false;
  function schedulePersist(){
    if (files.length === 0) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }

  async function persistNow(){
    if (files.length === 0 || persistBusy) return;
    persistBusy = true;
    try {
      const storedFiles = await Promise.all(files.map(async f => {
        const record = { name: f.name, type: f.type, bytes: await f.arrayBuffer() };
        const preview = heicPreviewCache.get(f);
        if (preview){
          record.previewBytes = await preview.arrayBuffer();
          record.previewType = preview.type;
        }
        return record;
      }));
      const activeBtn = document.querySelector("#cpLevelButtons .tool-format-btn.active");
      await bcDbPut(CP_DB_NAME, CP_DB_STORE, {
        files: storedFiles,
        levelKey: activeBtn ? activeBtn.dataset.levelKey : null
      });
    } catch (err){ /* storage unavailable — skip */
    } finally { persistBusy = false; }
  }

  setInterval(() => { if (files.length) persistNow(); }, 4000);

  (async () => {
    const saved = await bcDbGet(CP_DB_NAME, CP_DB_STORE);
    /* Signals shared/site.js's scroll restore that this async check (and
       the "Continue where you left off" button it may just have revealed
       — a real, measurable layout-height change) is done, so it can
       re-apply the remembered scroll position one more time instead of
       leaving it wherever it landed before this resolved. Dispatched
       unconditionally, before the early returns below, so it always
       fires exactly once regardless of which branch runs. */
    document.dispatchEvent(new Event("bc:session-check-done"));
    if (!saved || !saved.files || !saved.files.length) return;
    if (files.length) return;
    continueBtn.hidden = false;
    continueBtn.addEventListener("click", () => {
      continueBtn.hidden = true;
      try {
        const restored = saved.files.map(f => {
          const file = new File([f.bytes], f.name, { type: f.type });
          if (f.previewBytes) heicPreviewCache.set(file, new Blob([f.previewBytes], { type: f.previewType }));
          return file;
        });
        setFiles(restored);
        if (saved.levelKey){
          const matchingBtn = document.querySelector(`#cpLevelButtons .tool-format-btn[data-level-key="${saved.levelKey}"]`);
          if (matchingBtn) matchingBtn.click();
        }
      } catch (err){
        console.error(err);
        continueBtn.hidden = false;
      }
    });
  })();
})();
