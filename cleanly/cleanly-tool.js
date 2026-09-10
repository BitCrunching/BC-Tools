/* ===== EXIF STRIPPER TOOL ===== */
(function(){
  const drop = document.getElementById("exDrop");
  const input = document.getElementById("exInput");
  const fileList = document.getElementById("exFileList");
  const stripBtn = document.getElementById("exStripBtn");
  const status = document.getElementById("exStatus");
  const afterDrop = document.getElementById("exAfterDrop");
  const toolApp = document.querySelector(".tool-app");
  if (!drop || !input || !fileList || !stripBtn) return;

  let files = [];

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("cleanly", "ex", [
    ["WELCOME_TO_CLEANLY", "Cleanly scans your images for hidden metadata — GPS location, camera model, timestamps — so you can strip it before sharing. Click or drop an image below to get started."],
    ["WHAT_IT_FINDS", "Once a file's in, we scan it and show exactly what's hiding inside — GPS location, camera model, timestamps, or editor data."],
    ["CHECK_BEFORE_STRIPPING", "Your files show up below once picked — check what was found, and remove any you don't need."],
    ["NOT_SURE_WHY_IT_MATTERS", "Scroll down to the guide further down the page — it explains what metadata actually reveals and why stripping it matters."],
    ["YOU_ARE_SET", "Hit Strip and the cleaned files download automatically (as a ZIP if there are more than 5). Close this with the red dot and we won't show it again."]
  ]);

  /* File list + Strip button stay hidden until a file is picked —
     first-time visitors get one obvious step instead of competing
     controls at once. */
  function revealAfterDropUI(){
    if (afterDrop) afterDrop.hidden = false;
    drop.classList.add("tool-drop-revealed");
  }

  /* ===== "Remove all" reset — clears every loaded file and returns to
     the pre-upload intro state. Called by the red #exRemoveBtn (the
     canvas-corner "×", same as Convert/Compress) and also when the
     per-file remove button below empties the list — without the latter,
     removing the last file one-by-one left the tool stranded in the
     "revealed" state (file list area, disabled Strip button) with no
     way back to the actual intro drop zone. */
  function resetTool(){
    files = [];
    fileList.innerHTML = "";
    if (afterDrop) afterDrop.hidden = true;
    drop.classList.remove("tool-drop-revealed");
    stripBtn.disabled = true;
    status.textContent = "";
    bcDbClear(EX_DB_NAME, EX_DB_STORE);
  }

  const removeBtn = document.getElementById("exRemoveBtn");
  if (removeBtn) removeBtn.addEventListener("click", resetTool);

  function isSvgFile(f){
    return f.type === "image/svg+xml" || /\.svg$/i.test(f.name);
  }

  function isImageFile(f){
    return f.type === "image/jpeg" || f.type === "image/png" || /\.(jpe?g|png)$/i.test(f.name) || isSvgFile(f);
  }

  /* Any xmlns:<prefix> declaration other than the standard SVG-spec
     "xlink" namespace is editor/authoring-tool territory — Inkscape's
     inkscape/sodipodi, Illustrator's "ai" namespace, Dublin Core/
     Creative Commons dc/cc/rdf, or whatever the next tool invents.
     Rather than hardcode a fixed list of known editors (which drifts
     out of date and misses whatever wrote the next file), find every
     declared custom prefix in the document and sweep it generically:
     its elements, its attributes, and the xmlns declaration itself. */
  function findCustomNsPrefixes(text){
    const prefixes = new Set();
    const nsDeclRe = /xmlns:([\w.-]+)="[^"]*"/gi;
    let m;
    while ((m = nsDeclRe.exec(text))){
      if (m[1].toLowerCase() !== "xlink") prefixes.add(m[1]);
    }
    return [...prefixes];
  }

  /* Pure string-based cleanup — strips editor-only cruft that design
     tools leave behind (comments, embedded metadata/RDF blocks, any
     custom-namespaced elements/attributes) and collapses insignificant
     whitespace. Nothing here touches actual geometry or styling, so
     the result renders and edits identically to the source — just
     smaller and stripped of whatever authorship/tooling info the
     metadata carried. */
  function optimizeSvgMarkup(text){
    let out = text;
    out = out.replace(/<!--[\s\S]*?-->/g, "");
    out = out.replace(/<\?xml[\s\S]*?\?>/gi, "");
    out = out.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
    out = out.replace(/<metadata[\s\S]*?<\/metadata>/gi, "");
    out = out.replace(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/gi, "");

    findCustomNsPrefixes(out).forEach(prefix => {
      const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`<${esc}:[\\w-]+(?:\\s[^>]*)?/>`, "gi"), "");
      out = out.replace(new RegExp(`<${esc}:[\\w-]+[^>]*>[\\s\\S]*?</${esc}:[\\w-]+>`, "gi"), "");
      out = out.replace(new RegExp(`\\s+${esc}:[\\w-]+="[^"]*"`, "gi"), "");
      out = out.replace(new RegExp(`\\s+xmlns:${esc}="[^"]*"`, "gi"), "");
    });

    out = out.replace(/>\s+</g, "><").trim();
    return out;
  }

  async function readSvgFindings(file){
    const found = [];
    try {
      const text = await file.text();
      if (/<metadata[\s\S]*?<\/metadata>/i.test(text) || /<rdf:RDF/i.test(text)){
        found.push("🧾 Embedded metadata");
      }
      const customNs = findCustomNsPrefixes(text);
      if (customNs.length){
        found.push(`🖋️ Editor authoring data (${customNs.join(", ")})`);
      }
      if (/<!--[\s\S]*?-->/.test(text)){
        found.push("💬 Comments");
      }
    } catch (err){
      /* unreadable as text — treat as clean, stripImage will still try */
    }
    return found;
  }

  function formatSize(bytes){
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function gpsToDecimal(coords, ref){
    if (!coords || coords.length < 3) return null;
    let decimal = coords[0] + coords[1] / 60 + coords[2] / 3600;
    if (ref === "S" || ref === "W") decimal = -decimal;
    return decimal;
  }

  function readTags(file){
    return new Promise(resolve => {
      if (!window.EXIF){ resolve({}); return; }
      try {
        EXIF.getData(file, function(){
          resolve(EXIF.getAllTags(this) || {});
        });
      } catch (err){
        resolve({});
      }
    });
  }

  function summarizeTags(tags){
    const found = [];

    const lat = gpsToDecimal(tags.GPSLatitude, tags.GPSLatitudeRef);
    const lon = gpsToDecimal(tags.GPSLongitude, tags.GPSLongitudeRef);
    if (lat !== null && lon !== null){
      found.push(`📍 ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }

    if (tags.Make || tags.Model){
      found.push(`📷 ${[tags.Make, tags.Model].filter(Boolean).join(" ")}`);
    }

    if (tags.DateTimeOriginal || tags.DateTime){
      found.push(`📅 ${tags.DateTimeOriginal || tags.DateTime}`);
    }

    if (tags.Software){
      found.push(`🖋️ ${tags.Software}`);
    }

    return found;
  }

  function renderList(){
    fileList.innerHTML = "";
    files.forEach((item, i) => {
      const el = document.createElement("div");
      el.className = "exif-file-item result";

      const noMetadataText = "No metadata found";
      const tagsHtml = item.tags.length
        ? item.tags.map(label => `<span class="exif-tag">${label}</span>`).join("")
        : `<span class="exif-tag exif-tag-clean">${noMetadataText}</span>`;

      const svgScanNote = isSvgFile(item.file)
        ? `<div class="exif-scan-note">Cleanly checks for known patterns — it does not guarantee your file will be completely clean.</div>`
        : "";

      el.innerHTML = `
        <div class="exif-file-thumb"><img src="${item.src}" alt=""></div>
        <div class="exif-file-info">
          <div class="exif-file-name">${item.file.name}</div>
          <div class="exif-file-size">${formatSize(item.file.size)}</div>
          <div class="exif-tags">${tagsHtml}</div>
          ${svgScanNote}
        </div>
        <button type="button" class="exif-file-remove bc-file-remove-btn" aria-label="Remove">×</button>
      `;

      el.querySelector(".exif-file-remove").addEventListener("click", () => {
        files.splice(i, 1);
        if (files.length === 0){
          resetTool();
          return;
        }
        renderList();
        stripBtn.disabled = files.length === 0;
      });

      fileList.appendChild(el);
    });

    if (files.length === 0) bcDbClear(EX_DB_NAME, EX_DB_STORE);
    else schedulePersist();
  }

  async function addFiles(newFiles){
    const picked = [...newFiles].filter(isImageFile);
    if (picked.length === 0) return;
    for (const file of picked){
      const tags = isSvgFile(file) ? await readSvgFindings(file) : summarizeTags(await readTags(file));
      files.push({
        file,
        src: URL.createObjectURL(file),
        tags
      });
    }
    revealAfterDropUI();
    renderList();
    stripBtn.disabled = files.length === 0;
  }

  input.addEventListener("change", e => {
    addFiles(e.target.files);
    input.value = "";
  });

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

  async function stripSvg(file){
    const text = await file.text();
    return new Blob([optimizeSvgMarkup(text)], { type: "image/svg+xml" });
  }

  function stripImage(file){
    if (isSvgFile(file)) return stripSvg(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error("toBlob failed"));
        }, file.type, 0.95);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  stripBtn.addEventListener("click", async () => {
    if (!files.length) return;
    stripBtn.disabled = true;
    status.textContent = "Removing metadata…";

    startPrivacyCheck();
    try {
      const useZip = files.length > 5;
      const zip = useZip ? new JSZip() : null;
      let done = 0;

      for (const item of files){
        const blob = await stripImage(item.file);
        const outputName = item.file.name;

        if (useZip){
          zip.file(outputName, blob);
        } else {
          downloadBlob(blob, outputName);
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        done++;
        status.textContent = `Processing… ${done} of ${files.length}`;
      }

      if (useZip){
        status.textContent = "Building ZIP file…";
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, "bctools-cleaned-images.zip");
        status.textContent = `Done. ZIP contains ${files.length} cleaned images.`;
      } else {
        status.textContent = `Done. Cleaned ${files.length} images.`;
      }
    } catch (err){
      console.error(err);
      status.textContent = "Something went wrong removing metadata. Please try again.";
    } finally {
      stripBtn.disabled = files.length === 0;
      finishPrivacyCheck(document.getElementById("exPrivacyBadge"));
    }
  });

  document.addEventListener("bc:langchange", () => {
    renderList();
  });

  /* ===== "Continue where you left off" persistence =====
     Same "list stays after a successful run" behavior as Combine —
     persistence only clears when the list itself is emptied (handled
     inside renderList() above), not after a successful strip. */
  const EX_DB_NAME = "bctools-cleanly";
  const EX_DB_STORE = "session";
  const continueBtn = document.getElementById("exContinueBtn");

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
      const storedFiles = await Promise.all(files.map(async item => ({
        name: item.file.name,
        type: item.file.type,
        bytes: await item.file.arrayBuffer()
      })));
      await bcDbPut(EX_DB_NAME, EX_DB_STORE, { files: storedFiles });
    } catch (err){ /* storage unavailable — skip */
    } finally { persistBusy = false; }
  }

  setInterval(() => { if (files.length) persistNow(); }, 4000);

  (async () => {
    const saved = await bcDbGet(EX_DB_NAME, EX_DB_STORE);
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
        addFiles(restored);
      } catch (err){
        console.error(err);
        continueBtn.hidden = false;
      }
    });
  })();
})();
