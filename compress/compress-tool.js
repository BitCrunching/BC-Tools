(function(){
  const drop = document.getElementById("cpDrop");
  const input = document.getElementById("cpInput");
  const levelButtons = document.querySelectorAll("#cpLevelButtons .tool-format-btn");
  const compressBtn = document.getElementById("cpCompressBtn");
  const status = document.getElementById("cpStatus");
  const results = document.getElementById("cpResults");
  const selectedCompression = document.getElementById("cpSelectedCompression");
  const afterDrop = document.getElementById("cpAfterDrop");
  const toolApp = document.querySelector(".tool-app");

  let files = [];
  let selectedQuality = null;

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
    ["YOU_ARE_SET", "Hit Compress and the files download automatically (as a ZIP if there are more than 5). Close this with the red dot and we won't show it again."]
  ]);

  /* Level buttons + Compress button stay hidden until a file is
     picked — first-time visitors get one obvious step instead of
     competing controls at once. */
  function revealAfterDropUI(){
    if (afterDrop) afterDrop.hidden = false;
    drop.classList.add("tool-drop-revealed");
  }

  /* Before a file is picked, the whole banner acts as the drop zone —
     not just the (visually hidden) dashed box. Once a file lands, the
     dashed box reappears and takes over as the target for adding
     more files. */
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      if (afterDrop.hidden || drop.contains(e.target)){
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
    return afterDrop.hidden || drop.contains(e.target);
  }
  bcSetupBannerDropTarget(toolApp, {
    isInScope: isDragEventInScope,
    getEnterTarget: e => (afterDrop.hidden ? toolApp : drop),
    clearTargets: [toolApp, drop],
    onDrop: e => setFiles(e.dataTransfer.files)
  });

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

  function appendPreviewCard(item){
    const card = document.createElement("div");
    card.className = "result";
    card.innerHTML = `
      <img src="${item.src}" alt="${item.name}">
      <div class="result-name">${item.name}</div>
      <div class="result-size">${item.info}</div>
    `;
    results.appendChild(card);
    return card;
  }

  let previewEntries = [];

  function showSelectedPreviews(){
    previewEntries = [];
    if (files.length === 0){ results.innerHTML = ""; return; }
    results.innerHTML = "";

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
        info: `Original size: ${formatKB(file.size)}`
      });
      if (heic){
        card.classList.add("result-pdf");
        card.querySelector("img").remove();

        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.className = "result-heic-preview-btn";
        previewBtn.textContent = "Preview";
        previewBtn.addEventListener("click", async () => {
          previewBtn.disabled = true;
          previewBtn.textContent = "Loading...";
          try {
            const decoded = await decodeHeicFile(file);
            const img = document.createElement("img");
            img.src = URL.createObjectURL(decoded);
            img.alt = file.name;
            card.insertBefore(img, card.firstChild);
            card.classList.remove("result-pdf");
            previewBtn.remove();
          } catch (err){
            previewBtn.disabled = false;
            previewBtn.textContent = "Preview failed — retry";
          }
        });
        card.appendChild(previewBtn);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result-remove";
      btn.setAttribute("aria-label", "Remove");
      btn.textContent = "×";
      btn.addEventListener("click", () => {
        files = files.filter(f => f !== file);
        renderStatus();
        showSelectedPreviews();
        compressBtn.disabled = files.length === 0;
        if (files.length === 0) bcDbClear(CP_DB_NAME, CP_DB_STORE);
        else schedulePersist();
      });
      card.appendChild(btn);

      const entry = { file, infoEl: card.querySelector(".result-size"), token: 0 };
      previewEntries.push(entry);
      updateEstimateForEntry(entry);
    });
  }

  function addResultRemoveButton(card){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "result-remove";
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
    const originalText = `Original size: ${formatKB(entry.file.size)}`;
    if (selectedQuality === null){
      entry.infoEl.textContent = originalText;
      return;
    }

    const myToken = ++entry.token;
    entry.infoEl.textContent = `${originalText} • Estimate: calculating...`;

    try {
      const outputMimeType = getOutputMimeType(entry.file);
      const compressedBlob = await compressImageFile(entry.file, selectedQuality, outputMimeType);
      if (entry.token !== myToken) return;
      const savedPercent = Math.max(0, Math.round((1 - compressedBlob.size / entry.file.size) * 100));
      entry.infoEl.textContent = `${originalText} • Estimated after compression: ${formatKB(compressedBlob.size)} (-${savedPercent}%)`;
    } catch (err){
      if (entry.token !== myToken) return;
      entry.infoEl.textContent = originalText;
    }
  }

  function updateAllEstimates(){
    previewEntries.forEach(updateEstimateForEntry);
  }

  /* Appends to the existing selection rather than replacing it, so
     picking (or dropping) a second round of images adds to the first
     instead of wiping it out — matches Combine's "upload as many
     rounds as you like" behavior. */
  function setFiles(fileList){
    const picked = [...fileList].filter(f => f.type.startsWith("image/") || isHeicFile(f));
    if (picked.length === 0) return;
    files = files.concat(picked);
    revealAfterDropUI();
    renderStatus();
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

    const useZip = files.length > 5;
    let resultsCleared = false;
    function clearResultsOnce(){
      if (resultsCleared) return;
      resultsCleared = true;
      results.innerHTML = "";
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
          info: `${formatKB(file.size)} → ${formatKB(compressedBlob.size)} • -${savedPercent}%`
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
      const storedFiles = await Promise.all(files.map(async f => ({
        name: f.name,
        type: f.type,
        bytes: await f.arrayBuffer()
      })));
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
        const restored = saved.files.map(f => new File([f.bytes], f.name, { type: f.type }));
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
