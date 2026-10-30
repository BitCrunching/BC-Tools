/* ===== COMBINE TOOL (PDF + JPG/PNG merge with drag-to-reorder) ===== */
(function(){
  const drop = document.getElementById("cbDrop");
  const input = document.getElementById("cbInput");
  const fileList = document.getElementById("cbFileList");
  const combineBtn = document.getElementById("cbCombineBtn");
  bcRegisterKeyShortcut("d", combineBtn);
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
    ["WELCOME_TO_COMBINE", "Combine merges PDFs and JPG or PNG images into one PDF, in whatever order you drag them into. Click, drop, or press (A) to add your files to get started."],
    ["REORDER_YOUR_PAGES", "Drag files up or down in the list to change the order they'll appear in the merged PDF. Each image becomes one page."],
    ["CHECK_BEFORE_COMBINING", "Each file shows a thumbnail and its size — check them before combining, and remove any you don't need."],
    ["ONE_FILE_OUT", "Combine always produces a single merged PDF, in the exact order shown in the list."],
    ["YOU_ARE_SET", "Hit the Download button (D) and your merged PDF is saved automatically. Close this with the red dot and we won't show it again."]
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
  function isJpegFile(f){
    return f.type === "image/jpeg" || /\.jpe?g$/i.test(f.name);
  }
  function isPngFile(f){
    return f.type === "image/png" || /\.png$/i.test(f.name);
  }
  function isImageFile(f){
    return isJpegFile(f) || isPngFile(f);
  }
  function isCombinable(f){
    return isPdfFile(f) || isImageFile(f);
  }

  async function getThumbnail(file){
    if (thumbnailCache.has(file)) return thumbnailCache.get(file);
    if (isImageFile(file)){
      const url = URL.createObjectURL(file);
      thumbnailCache.set(file, url);
      return url;
    }
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
        <span class="combine-file-size">${bcFormatFileSize(file.size)}</span>
        <button type="button" class="combine-file-remove bc-file-remove-btn" aria-label="${bcT("Remove")}" title="${bcT("Remove file")}">×</button>
      `;

      const thumbSlot = item.querySelector(".combine-file-thumb");
      getThumbnail(file).then(dataUrl => {
        if (dataUrl){
          thumbSlot.innerHTML = `<img src="${dataUrl}" alt="">`;
        } else {
          thumbSlot.classList.add("combine-file-thumb-fallback");
          thumbSlot.textContent = isPngFile(file) ? "PNG" : isJpegFile(file) ? "JPG" : bcT("PDF");
        }
      });

      item.querySelector(".combine-file-remove").addEventListener("click", () => {
        if (isImageFile(file) && thumbnailCache.get(file)) URL.revokeObjectURL(thumbnailCache.get(file));
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
    status.textContent = files.length
      ? bcT("{0} {1} loaded", [files.length, files.length === 1 ? "file" : "files"])
      : "";
    if (files.length === 0) bcDbClear(CB_DB_NAME, CB_DB_STORE);
    else schedulePersist();
  }

  function addFiles(newFiles){
    const incoming = [...newFiles];
    const accepted = incoming.filter(isCombinable);
    if (accepted.length === 0 && incoming.length > 0){
      /* Same fix shape as Convert's applyPickedFiles() — a selection
         that's wholly unsupported (e.g. a .txt/.exe) used to be silent. */
      status.textContent = bcT("Combine works with PDFs and JPG or PNG images — none of the selected file(s) qualify.");
      return;
    }
    files = files.concat(accepted);
    continueBtn.hidden = true;
    if (files.length) revealAfterDropUI();
    renderList();
    /* Same partial-rejection gap Convert's applyPickedFiles() closed —
       the wholly-unsupported branch above never fires for a mixed batch
       (e.g. 2 valid files + 1 .cr2), which used to load the valid ones
       with zero indication the odd one out never made it in. */
    if (accepted.length < incoming.length && accepted.length > 0){
      const skipped = incoming.length - accepted.length;
      const msg = skipped === 1
        ? bcT("1 file wasn't a PDF or JPG/PNG image and was skipped.")
        : bcT("{0} files weren't PDFs or JPG/PNG images and were skipped.", [skipped]);
      status.innerHTML += ` <span style="color:var(--text)">${msg}</span>`;
    }
  }

  input.addEventListener("change", (e) => {
    addFiles(e.target.files);
    input.value = "";
  });

  /* EXIF orientation of a JPEG (1 = upright). pdf-lib embeds the raw
     bytes and ignores the tag, so the page has to rotate for it. Same
     helper as Convert's JPG-to-PDF path. */
  function jpegOrientation(bytes){
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1;
    let o = 2;
    while (o + 4 < bytes.length && bytes[o] === 0xFF){
      const marker = bytes[o + 1];
      const len = (bytes[o + 2] << 8) | bytes[o + 3];
      if (marker === 0xE1 && bytes[o + 4] === 0x45 && bytes[o + 5] === 0x78 && bytes[o + 6] === 0x69 && bytes[o + 7] === 0x66){
        const t = o + 10;
        const le = bytes[t] === 0x49;
        const u16 = p => le ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1];
        const u32 = p => le
          ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0
          : ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
        const ifd = t + u32(t + 4);
        const count = u16(ifd);
        for (let i = 0; i < count; i++){
          const entry = ifd + 2 + i * 12;
          if (u16(entry) === 0x0112) return u16(entry + 8);
        }
        return 1;
      }
      if (marker === 0xDA) break;
      o += 2 + len;
    }
    return 1;
  }

  /* Mirrored EXIF orientations (rare) can't be expressed with a rotated
     draw, so those JPEGs are redrawn upright on a canvas first. */
  async function uprightJpegBytes(file){
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return blob.arrayBuffer();
  }

  /* One image -> one page. JPG and PNG are embedded as-is (no
     re-encoding, so the merged PDF grows by about the file's own size);
     the page keeps the image's proportions, sized to fit A4. */
  async function addImagePage(pdfDoc, file){
    const { degrees } = PDFLib;
    let image;
    let orientation = 1;
    if (isJpegFile(file)){
      const bytes = new Uint8Array(await file.arrayBuffer());
      orientation = jpegOrientation(bytes);
      if (orientation === 2 || orientation === 4 || orientation === 5 || orientation === 7){
        orientation = 1;
        image = await pdfDoc.embedJpg(await uprightJpegBytes(file));
      } else {
        image = await pdfDoc.embedJpg(bytes);
      }
    } else {
      image = await pdfDoc.embedPng(await file.arrayBuffer());
    }

    const sideways = orientation === 6 || orientation === 8;
    const shownW = sideways ? image.height : image.width;
    const shownH = sideways ? image.width : image.height;
    const [boxW, boxH] = shownW >= shownH ? [842, 595] : [595, 842];
    const scale = Math.min(boxW / shownW, boxH / shownH);
    const pageW = shownW * scale;
    const pageH = shownH * scale;
    const page = pdfDoc.addPage([pageW, pageH]);

    if (orientation === 6){
      page.drawImage(image, { x: 0, y: pageH, width: pageH, height: pageW, rotate: degrees(-90) });
    } else if (orientation === 8){
      page.drawImage(image, { x: pageW, y: 0, width: pageH, height: pageW, rotate: degrees(90) });
    } else if (orientation === 3){
      page.drawImage(image, { x: pageW, y: pageH, width: pageW, height: pageH, rotate: degrees(180) });
    } else {
      page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
    }
  }

  combineBtn.addEventListener("click", async () => {
    if (!files.length) return;
    combineBtn.disabled = true;
    status.textContent = bcT("Combining PDFs…");

    startPrivacyCheck();
    try {
      const { PDFDocument } = PDFLib;
      const mergedPdf = await PDFDocument.create();

      for (const file of files){
        if (isImageFile(file)){
          await addImagePage(mergedPdf, file);
          continue;
        }
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

      status.textContent = bcT("Done. Combined {0} files into one PDF.", [files.length]);
    } catch (err) {
      status.textContent = bcT("Something went wrong combining the PDFs. Please check the files and try again.");
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

