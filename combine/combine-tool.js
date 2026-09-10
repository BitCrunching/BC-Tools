/* ===== COMBINE TOOL (PDF merge with drag-to-reorder) ===== */
(function(){
  const drop = document.getElementById("cbDrop");
  const input = document.getElementById("cbInput");
  const fileList = document.getElementById("cbFileList");
  const combineBtn = document.getElementById("cbCombineBtn");
  const status = document.getElementById("cbStatus");
  const afterDrop = document.getElementById("cbAfterDrop");
  const toolApp = document.querySelector(".tool-app");
  if (!drop || !input || !fileList || !combineBtn) return;

  if (window.pdfjsLib){
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
  }

  let files = [];
  let dragSrcIndex = null;
  const thumbnailCache = new WeakMap();

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("combine", "cb", [
    ["WELCOME_TO_COMBINE", "Combine merges multiple PDFs into one, in whatever order you drag them into. Click or drop your PDFs below to get started."],
    ["REORDER_YOUR_PAGES", "Drag files up or down in the list to change the order they'll appear in the merged PDF."],
    ["CHECK_BEFORE_COMBINING", "Each file shows a thumbnail of its first page and its size — check them before combining, and remove any you don't need."],
    ["ONE_FILE_OUT", "Combine always produces a single merged PDF, in the exact order shown in the list."],
    ["YOU_ARE_SET", "Hit Combine and the merged PDF downloads automatically. Close this with the red dot and we won't show it again."]
  ]);

  /* The file list + Combine button stay hidden until a file is
     picked — first-time visitors get one obvious step instead of
     competing controls at once. */
  function revealAfterDropUI(){
    if (afterDrop) afterDrop.hidden = false;
    drop.classList.add("tool-drop-revealed");
  }

  /* ===== "Remove all" reset — clears every loaded file and returns to
     the pre-upload intro state. Called by the red #cbRemoveBtn (the
     canvas-corner "×", same as Convert/Compress) and also when the
     per-file remove button below empties the list — without the latter,
     removing the last file one-by-one left the tool stranded in the
     "revealed" state (file list area, disabled Combine button) with no
     way back to the actual intro drop zone. */
  function resetTool(){
    files = [];
    fileList.innerHTML = "";
    if (afterDrop) afterDrop.hidden = true;
    drop.classList.remove("tool-drop-revealed");
    combineBtn.disabled = true;
    status.textContent = "";
    bcDbClear(CB_DB_NAME, CB_DB_STORE);
  }

  const removeBtn = document.getElementById("cbRemoveBtn");
  if (removeBtn) removeBtn.addEventListener("click", resetTool);

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
    onDrop: e => addFiles(e.dataTransfer.files)
  });

  function isPdfFile(f){
    return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  }

  function formatSize(bytes){
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function getThumbnail(file){
    if (thumbnailCache.has(file)) return thumbnailCache.get(file);
    if (!window.pdfjsLib) return null;

    try {
      const bytes = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = 90 / baseViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

      const dataUrl = canvas.toDataURL("image/png");
      thumbnailCache.set(file, dataUrl);
      return dataUrl;
    } catch (err){
      thumbnailCache.set(file, null);
      return null;
    }
  }

  function renderList(){
    fileList.innerHTML = "";
    files.forEach((file, i) => {
      const item = document.createElement("div");
      item.className = "combine-file-item result";
      item.draggable = true;
      item.dataset.index = i;

      item.innerHTML = `
        <span class="combine-drag-handle">⠿</span>
        <span class="combine-file-index">${i + 1}</span>
        <div class="combine-file-thumb"></div>
        <span class="combine-file-name">${file.name}</span>
        <span class="combine-file-size">${formatSize(file.size)}</span>
        <button type="button" class="combine-file-remove bc-file-remove-btn" aria-label="Remove">×</button>
      `;

      const thumbSlot = item.querySelector(".combine-file-thumb");
      getThumbnail(file).then(dataUrl => {
        if (dataUrl){
          thumbSlot.innerHTML = `<img src="${dataUrl}" alt="">`;
        } else {
          thumbSlot.classList.add("combine-file-thumb-fallback");
          thumbSlot.textContent = "PDF";
        }
      });

      item.querySelector(".combine-file-remove").addEventListener("click", () => {
        files.splice(i, 1);
        if (files.length === 0){
          resetTool();
          return;
        }
        renderList();
      });

      item.addEventListener("dragstart", () => {
        dragSrcIndex = i;
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        item.classList.add("drag-over");
      });
      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        const targetIndex = i;
        if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
        const [moved] = files.splice(dragSrcIndex, 1);
        files.splice(targetIndex, 0, moved);
        dragSrcIndex = null;
        renderList();
      });

      fileList.appendChild(item);
    });

    combineBtn.disabled = files.length === 0;
    if (files.length === 0) bcDbClear(CB_DB_NAME, CB_DB_STORE);
    else schedulePersist();
  }

  function addFiles(newFiles){
    const pdfs = [...newFiles].filter(isPdfFile);
    files = files.concat(pdfs);
    if (files.length) revealAfterDropUI();
    renderList();
  }

  input.addEventListener("change", (e) => {
    addFiles(e.target.files);
    input.value = "";
  });

  combineBtn.addEventListener("click", async () => {
    if (!files.length) return;
    combineBtn.disabled = true;
    status.textContent = "Combining PDFs…";

    startPrivacyCheck();
    try {
      const { PDFDocument } = PDFLib;
      const mergedPdf = await PDFDocument.create();

      for (const file of files){
        const bytes = await file.arrayBuffer();
        const srcPdf = await PDFDocument.load(bytes);
        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "combined.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      status.textContent = `Done. Combined ${files.length} files into one PDF.`;
    } catch (err) {
      status.textContent = "Something went wrong combining the PDFs. Please check the files and try again.";
    } finally {
      combineBtn.disabled = files.length === 0;
      finishPrivacyCheck(document.getElementById("cbPrivacyBadge"));
    }
  });

  /* ===== "Continue where you left off" persistence =====
     Unlike Convert/Compress, a successful merge doesn't clear `files` —
     the list stays so you can reorder and merge again — so persistence
     only ever clears when the list itself is emptied (handled inside
     renderList() above), not on a successful combine. */
  const CB_DB_NAME = "bctools-combine";
  const CB_DB_STORE = "session";
  const continueBtn = document.getElementById("cbContinueBtn");

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
      await bcDbPut(CB_DB_NAME, CB_DB_STORE, { files: storedFiles });
    } catch (err){ /* storage unavailable — skip */
    } finally { persistBusy = false; }
  }

  setInterval(() => { if (files.length) persistNow(); }, 4000);

  (async () => {
    const saved = await bcDbGet(CB_DB_NAME, CB_DB_STORE);
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
        files = saved.files.map(f => new File([f.bytes], f.name, { type: f.type }));
        if (files.length) revealAfterDropUI();
        renderList();
      } catch (err){
        console.error(err);
        continueBtn.hidden = false;
      }
    });
  })();
})();

