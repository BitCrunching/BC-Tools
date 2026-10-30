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
  const rotations = new WeakMap();
  let pageSize = "a4";
  let imageQuality = "original";
  let pageMargin = 0;
  let pageOrientation = "auto";
  let orientTouched = false;
  const PAGE_BOXES = { a4: [595, 842], letter: [612, 792] };
  const QUALITY_LEVELS = {
    smaller: { maxSide: 2400, jpegQuality: 0.82 },
    smallest: { maxSide: 1600, jpegQuality: 0.7 }
  };
  const rotationOf = file => rotations.get(file) || 0;
  const thumbWidths = new WeakMap();
  const THUMB_MIN = 76;
  const THUMB_MAX = 300;
  const THUMB_RATIO = 96 / 76;
  const phoneQuery = window.matchMedia("(max-width:768px)");
  const PHONE_THUMB = 57.5;
  const thumbWidthOf = file => phoneQuery.matches ? PHONE_THUMB : (thumbWidths.get(file) || THUMB_MIN);
  phoneQuery.addEventListener("change", () => { if (files.length) renderList(); });

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("combine", "cb", [
    ["WELCOME_TO_COMBINE", "Combine merges PDFs and JPG or PNG images into one PDF, in whatever order you drag them into. Click, drop, or press (A) to add your files to get started."],
    ["REORDER_YOUR_PAGES", "Drag files up or down in the list to change the order they'll appear in the merged PDF. Each image becomes one page."],
    ["CHECK_BEFORE_COMBINING", "Each file shows a preview of its page and its size — check them before combining, and remove any you don't need."],
    ["ROTATE_A_FILE", "Use the rotate button on a file to turn just the picture a quarter at a time. The page keeps its shape, so the picture turns inside it."],
    ["TUNE_THE_RESULT", "Click the options below the list to cycle them: image page size (A4, Letter or original), page orientation, margin, and image quality. Smaller quality updates each file's size, and the previews follow every change."],
    ["NAME_YOUR_PDF", "Type the name you want in Combined file name — the .pdf is added for you. Combine always produces a single PDF, in the exact order shown in the list."],
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
    pageOrientation = "auto";
    orientTouched = false;
    syncOrientButton("portrait");
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
      const scale = THUMB_MAX / baseViewport.width;
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

  const previewLayouts = new Set();
  function refreshPreviews(){
    previewLayouts.forEach(layout => layout());
  }

  /* In "Smaller" quality an image row shows the size its re-encoded JPEG
     will add, computed one file at a time so a big batch doesn't stall. */
  const sizeUpdaters = new Set();
  const smallSizes = new WeakMap();
  let smallSizeQueue = Promise.resolve();
  function smallSizeOf(file, levelName){
    const cached = smallSizes.get(file) || {};
    if (levelName in cached) return Promise.resolve(cached[levelName]);
    const job = smallSizeQueue.then(async () => {
      const size = (await smallJpegBytes(file, QUALITY_LEVELS[levelName])).byteLength;
      smallSizes.set(file, { ...smallSizes.get(file), [levelName]: size });
      return size;
    });
    smallSizeQueue = job.catch(() => {});
    return job;
  }
  function refreshSizes(){
    sizeUpdaters.forEach(update => update());
  }

  /* Mirrors addImagePage's page maths so the thumbnail shows the page
     (size, margin, rotation) the combined PDF will actually get. */
  function layoutImagePreview(slot, img, file){
    const turn = rotationOf(file);
    const sideways = turn === 90 || turn === 270;
    let baseW = img.naturalWidth;
    let baseH = img.naturalHeight;
    if (imageQuality in QUALITY_LEVELS){
      const down = Math.min(1, QUALITY_LEVELS[imageQuality].maxSide / Math.max(baseW, baseH));
      baseW *= down;
      baseH *= down;
    }
    if (!orientTouched && files[0] === file) syncOrientButton(baseW >= baseH ? "landscape" : "portrait");
    const w = sideways ? baseH : baseW;
    const h = sideways ? baseW : baseH;
    const { pageW, pageH, innerW, innerH, spots } = imageLayout(w, h, baseW, baseH);
    const thumbBoxW = thumbWidthOf(file);
    const thumbBoxH = phoneQuery.matches ? thumbBoxW : thumbBoxW * THUMB_RATIO;
    const k = Math.min((thumbBoxW - 2) / pageW, (thumbBoxH - 2) / pageH);
    const page = slot.firstElementChild;
    page.style.width = pageW * k + "px";
    page.style.height = pageH * k + "px";
    /* The row's preview box hugs the page, so the resize handle sits on
       the page's own corner whatever its shape. */
    slot.parentElement.style.height = Math.round(pageH * k + 2) + "px";
    const boxW = sideways ? innerH * k : innerW * k;
    const boxH = sideways ? innerW * k : innerH * k;
    const spot = spots[0];
    img.style.width = boxW + "px";
    img.style.height = boxH + "px";
    img.style.left = spot.x * k + (innerW * k - boxW) / 2 + "px";
    img.style.top = spot.yTop * k + (innerH * k - boxH) / 2 + "px";
    img.style.transform = turn ? `rotate(${turn}deg)` : "";
  }

  function renderList(){
    fileList.innerHTML = "";
    previewLayouts.clear();
    sizeUpdaters.clear();
    files.forEach((file, i) => {
      const item = document.createElement("div");
      item.className = "combine-file-item result";
      item.draggable = true;
      item.dataset.index = i;

      item.innerHTML = `
        <span class="combine-drag-handle">⠿</span>
        <span class="combine-file-index">${i + 1}</span>
        <div class="combine-file-thumb-wrap bc-hover-reveal-host">
          <div class="combine-file-thumb"></div>
          <button type="button" class="combine-thumb-resize bc-resize-handle bc-hover-reveal" aria-label="${bcT("Resize preview")}" title="${bcT("Resize preview")}"></button>
        </div>
        <div class="combine-file-meta">
          <span class="combine-file-name">${file.name}</span>
          <span class="combine-file-size">${bcFormatFileSize(file.size)}</span>
        </div>
        <div class="combine-file-actions">
        <button type="button" class="combine-file-rotate bc-file-remove-btn" aria-label="${bcT("Rotate")}" title="${bcT("Rotate 90°")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg></button>
        <button type="button" class="combine-file-remove bc-file-remove-btn" aria-label="${bcT("Remove")}" title="${bcT("Remove file")}">×</button>
        </div>
      `;

      const sizeEl = item.querySelector(".combine-file-size");
      const updateSize = async () => {
        sizeEl.textContent = bcFormatFileSize(file.size);
        const levelName = imageQuality;
        if (!(levelName in QUALITY_LEVELS) || !isImageFile(file)) return;
        try {
          const size = await smallSizeOf(file, levelName);
          if (imageQuality === levelName) sizeEl.textContent = bcFormatFileSize(size);
        } catch (err){}
      };
      sizeUpdaters.add(updateSize);
      updateSize();

      const thumbSlot = item.querySelector(".combine-file-thumb");
      const thumbWrap = item.querySelector(".combine-file-thumb-wrap");
      const resizeHandle = item.querySelector(".combine-thumb-resize");
      const applyThumbSize = () => {
        const w = thumbWidthOf(file);
        thumbWrap.style.width = w + "px";
        thumbWrap.style.height = Math.round(w * THUMB_RATIO) + "px";
      };
      applyThumbSize();
      resizeHandle.addEventListener("pointerdown", e => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = thumbWrap.offsetWidth;
        item.draggable = false;
        thumbWrap.classList.add("is-active");
        resizeHandle.setPointerCapture(e.pointerId);
        const move = ev => {
          thumbWidths.set(file, Math.max(THUMB_MIN, Math.min(THUMB_MAX, Math.round(startW + ev.clientX - startX))));
          applyThumbSize();
          refreshPreviews();
        };
        const stop = () => {
          resizeHandle.removeEventListener("pointermove", move);
          resizeHandle.removeEventListener("pointerup", stop);
          resizeHandle.removeEventListener("pointercancel", stop);
          item.draggable = true;
          thumbWrap.classList.remove("is-active");
          schedulePersist();
        };
        resizeHandle.addEventListener("pointermove", move);
        resizeHandle.addEventListener("pointerup", stop);
        resizeHandle.addEventListener("pointercancel", stop);
      });
      const applyThumbRotation = () => {
        if (thumbSlot.querySelector(".combine-thumb-page")){
          refreshPreviews();
          return;
        }
        const turn = rotationOf(file);
        const target = thumbSlot.firstElementChild || thumbSlot;
        const fit = turn === 90 || turn === 270 ? " scale(.79)" : "";
        target.style.transform = turn ? `rotate(${turn}deg)${fit}` : "";
      };
      getThumbnail(file).then(dataUrl => {
        if (dataUrl && isImageFile(file)){
          thumbSlot.innerHTML = `<div class="combine-thumb-page"><img src="${dataUrl}" alt=""></div>`;
          const img = thumbSlot.querySelector("img");
          const layout = () => layoutImagePreview(thumbSlot, img, file);
          previewLayouts.add(layout);
          if (img.complete && img.naturalWidth) layout();
          else img.addEventListener("load", layout);
          return;
        }
        if (dataUrl){
          thumbSlot.innerHTML = `<img src="${dataUrl}" alt="">`;
        } else {
          thumbSlot.classList.add("combine-file-thumb-fallback");
          thumbSlot.textContent = isPngFile(file) ? "PNG" : isJpegFile(file) ? "JPG" : bcT("PDF");
        }
        applyThumbRotation();
      });

      item.querySelector(".combine-file-rotate").addEventListener("click", () => {
        rotations.set(file, (rotationOf(file) + 90) % 360);
        applyThumbRotation();
        schedulePersist();
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

      /* HTML5 drag-and-drop never fires on touch screens, so touch/pen
         reorder through the grip with pointer events instead (mouse keeps
         the native drag above). */
      item.querySelector(".combine-drag-handle").addEventListener("pointerdown", e => {
        if (e.pointerType === "mouse") return;
        e.preventDefault();
        const handle = e.currentTarget;
        const rows = [...fileList.children];
        let target = i;
        const startY = e.clientY;
        item.draggable = false;
        item.classList.add("dragging", "touch-dragging");
        handle.setPointerCapture(e.pointerId);
        const move = ev => {
          item.style.transform = `translateY(${ev.clientY - startY}px)`;
          rows.forEach(r => r.classList.remove("drag-over"));
          const hit = rows.findIndex(r => r !== item && ev.clientY >= r.getBoundingClientRect().top && ev.clientY <= r.getBoundingClientRect().bottom);
          if (hit !== -1){
            target = hit;
            rows[hit].classList.add("drag-over");
          } else {
            target = i;
          }
          if (ev.clientY < 70) window.scrollBy(0, -12);
          else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
        };
        const stop = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", stop);
          handle.removeEventListener("pointercancel", stop);
          item.draggable = true;
          if (target !== i){
            const [moved] = files.splice(i, 1);
            files.splice(target, 0, moved);
          }
          renderList();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
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

  /* Quarter turns a JPEG's EXIF orientation asks for, clockwise. */
  const EXIF_TURN = { 1: 0, 3: 180, 6: 90, 8: 270 };

  /* "Smaller"/"Smallest": the image is redrawn on a canvas at most
     level.maxSide px on its long side and saved as a JPEG, upright. */
  async function smallJpegBytes(file, level){
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const ratio = Math.min(1, level.maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", level.jpegQuality));
    return blob.arrayBuffer();
  }

  /* Page and image box for an image shown at shownW x shownH. The page is
     worked out from the image as uploaded (baseW x baseH) so rotating the
     file turns only the picture inside its page. The page size never
     depends on the margin: A4/Letter stay a full sheet and Original keeps
     the image's own size, the margin only shrinks the picture inside.
     "Auto" picks portrait/landscape from the upright image. */
  function imageLayout(shownW, shownH, baseW, baseH){
    const m = pageMargin;
    const landscape = pageOrientation === "auto" ? baseW >= baseH : pageOrientation === "landscape";
    let pageW, pageH;
    if (pageSize === "original"){
      pageW = baseW;
      pageH = baseH;
      if (pageOrientation !== "auto" && (pageW >= pageH) !== landscape){
        [pageW, pageH] = [pageH, pageW];
      }
    } else {
      const [shortSide, longSide] = PAGE_BOXES[pageSize];
      [pageW, pageH] = landscape ? [longSide, shortSide] : [shortSide, longSide];
    }
    let scale = Math.min((pageW - 2 * m) / shownW, (pageH - 2 * m) / shownH);
    if (pageSize === "original") scale = Math.min(1, scale);
    const innerW = shownW * scale;
    const innerH = shownH * scale;
    return { pageW, pageH, innerW, innerH, spots: [{ x: (pageW - innerW) / 2, yTop: (pageH - innerH) / 2 }] };
  }

  /* One image -> one page. In "Original" quality JPG and PNG are
     embedded as-is (no re-encoding, so the merged PDF grows by about
     the file's own size). The page keeps the image's proportions and is
     sized by the page-size option; the file's rotate button adds to any
     rotation the photo's own EXIF tag asks for. */
  async function addImagePage(pdfDoc, file){
    const { degrees } = PDFLib;
    let image;
    let turn = 0;
    if (imageQuality in QUALITY_LEVELS){
      image = await pdfDoc.embedJpg(await smallJpegBytes(file, QUALITY_LEVELS[imageQuality]));
    } else if (isJpegFile(file)){
      const bytes = new Uint8Array(await file.arrayBuffer());
      const orientation = jpegOrientation(bytes);
      if (orientation in EXIF_TURN){
        turn = EXIF_TURN[orientation];
        image = await pdfDoc.embedJpg(bytes);
      } else {
        image = await pdfDoc.embedJpg(await uprightJpegBytes(file));
      }
    } else {
      image = await pdfDoc.embedPng(await file.arrayBuffer());
    }
    const exifTurn = turn;
    turn = (turn + rotationOf(file)) % 360;

    const sideways = turn === 90 || turn === 270;
    const shownW = sideways ? image.height : image.width;
    const shownH = sideways ? image.width : image.height;
    const baseSideways = exifTurn === 90 || exifTurn === 270;
    const baseW = baseSideways ? image.height : image.width;
    const baseH = baseSideways ? image.width : image.height;
    const { pageW, pageH, innerW, innerH, spots } = imageLayout(shownW, shownH, baseW, baseH);
    const page = pdfDoc.addPage([pageW, pageH]);

    for (const spot of spots){
      const offX = spot.x;
      const offY = pageH - spot.yTop - innerH;
      if (turn === 90){
        page.drawImage(image, { x: offX, y: offY + innerH, width: innerH, height: innerW, rotate: degrees(-90) });
      } else if (turn === 270){
        page.drawImage(image, { x: offX + innerW, y: offY, width: innerH, height: innerW, rotate: degrees(90) });
      } else if (turn === 180){
        page.drawImage(image, { x: offX + innerW, y: offY + innerH, width: innerW, height: innerH, rotate: degrees(180) });
      } else {
        page.drawImage(image, { x: offX, y: offY, width: innerW, height: innerH });
      }
    }
  }

  function outputFileName(){
    const raw = (document.getElementById("cbFileName").value || "").trim()
      .replace(/\.pdf$/i, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
      .trim();
    return raw || "combined";
  }

  /* ===== Options row ===== */
  const SIZE_OPTIONS = [
    { label: bcT("Fit to A4"), phoneLabel: bcT("A4"), value: "a4" },
    { label: bcT("Fit to Letter"), phoneLabel: bcT("Letter"), value: "letter" },
    { label: bcT("Original size"), phoneLabel: bcT("Original"), value: "original" }
  ];
  const sizeControl = bcRegisterOptionChangeBtn(document.getElementById("cbSizeBtn"), SIZE_OPTIONS, opt => {
    pageSize = opt.value;
    refreshPreviews();
  }, 0, (opt, btn) => {
    btn.querySelector(".option-change-btn-label").textContent = phoneQuery.matches ? opt.phoneLabel : opt.label;
  });
  phoneQuery.addEventListener("change", () => sizeControl.setIndex(SIZE_OPTIONS.indexOf(sizeControl.current)));
  const MARGIN_OPTIONS = [
    { label: bcT("No margin"), phoneLabel: bcT("No margin"), value: 0 },
    { label: bcT("Margin 1") + " (12px)", phoneLabel: bcT("Margin 1"), value: 12 },
    { label: bcT("Margin 2") + " (24px)", phoneLabel: bcT("Margin 2"), value: 24 },
    { label: bcT("Margin 3") + " (36px)", phoneLabel: bcT("Margin 3"), value: 36 },
    { label: bcT("Margin 4") + " (48px)", phoneLabel: bcT("Margin 4"), value: 48 },
    { label: bcT("Margin 5") + " (60px)", phoneLabel: bcT("Margin 5"), value: 60 }
  ];
  const marginControl = bcRegisterOptionChangeBtn(document.getElementById("cbMarginBtn"), MARGIN_OPTIONS, opt => {
    pageMargin = opt.value;
    refreshPreviews();
  }, 0, (opt, btn) => {
    btn.querySelector(".option-change-btn-label").textContent = phoneQuery.matches ? opt.phoneLabel : opt.label;
  });
  phoneQuery.addEventListener("change", () => marginControl.setIndex(MARGIN_OPTIONS.indexOf(marginControl.current)));
  /* No "Auto" choice: until the user clicks, pages follow each image's own
     orientation (pageOrientation "auto") and the button just shows what the
     first image is; a click then forces that orientation on every page. */
  const ORIENT_OPTIONS = [
    { label: bcT("Portrait"), value: "portrait" },
    { label: bcT("Landscape"), value: "landscape" }
  ];
  const orientControl = bcRegisterOptionChangeBtn(document.getElementById("cbOrientBtn"), ORIENT_OPTIONS, opt => {
    orientTouched = true;
    pageOrientation = opt.value;
    refreshPreviews();
  }, 0, (opt, btn) => {
    const labelEl = btn.querySelector(".option-change-btn-label");
    if (phoneQuery.matches){
      let rect = labelEl.querySelector(".cb-orient-rect");
      if (!rect){
        labelEl.textContent = "";
        rect = document.createElement("span");
        rect.className = "cb-orient-rect";
        rect.setAttribute("aria-hidden", "true");
        labelEl.appendChild(rect);
      }
      rect.dataset.orient = opt.value;
    } else {
      labelEl.textContent = opt.label;
    }
    btn.setAttribute("aria-label", opt.label);
  });
  function syncOrientButton(value){
    const i = ORIENT_OPTIONS.findIndex(o => o.value === value);
    if (i !== -1 && orientControl.current !== ORIENT_OPTIONS[i]) orientControl.setIndex(i);
  }
  phoneQuery.addEventListener("change", () => orientControl.setIndex(ORIENT_OPTIONS.indexOf(orientControl.current)));
  bcRegisterOptionChangeBtn(document.getElementById("cbQualityBtn"), [
    { label: bcT("Original"), value: "original" },
    { label: bcT("Smaller"), value: "smaller" },
    { label: bcT("Smallest"), value: "smallest" }
  ], opt => {
    imageQuality = opt.value;
    refreshPreviews();
    refreshSizes();
  }, 0);

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
        const turn = rotationOf(file);
        copiedPages.forEach(page => {
          if (turn) page.setRotation(PDFLib.degrees((page.getRotation().angle + turn) % 360));
          mergedPdf.addPage(page);
        });
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputFileName() + ".pdf";
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
        rotation: rotationOf(f),
        thumbWidth: thumbWidths.get(f),
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
        files = saved.files.map(f => {
          const restored = new File([f.bytes], f.name, { type: f.type });
          if (f.rotation) rotations.set(restored, f.rotation);
          if (f.thumbWidth) thumbWidths.set(restored, f.thumbWidth);
          return restored;
        });
        if (files.length) revealAfterDropUI();
        renderList();
      } catch (err){
        console.error(err);
        continueBtn.hidden = false;
      }
    });
  })();
})();
