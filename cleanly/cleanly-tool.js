/* ===== EXIF STRIPPER TOOL ===== */
(function(){
  const drop = document.getElementById("exDrop");
  const input = document.getElementById("exInput");
  const fileList = document.getElementById("exFileList");
  const status = document.getElementById("exStatus");
  const afterDrop = document.getElementById("exAfterDrop");
  const toolApp = document.querySelector(".tool-app");
  const mobileDownloadBtn = document.getElementById("exMobileDownloadBtn");
  if (!drop || !input || !fileList) return;

  let files = [];

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("cleanly", "ex", [
    ["WELCOME_TO_CLEANLY", "Cleanly scans your images for hidden metadata — GPS location, camera model, timestamps — so you can strip it before sharing. Click or drop an image below to get started."],
    ["WHAT_IT_FINDS", "Once a file's in, we scan it and show exactly what's hiding inside — GPS location, camera model, timestamps, or editor data."],
    ["CHECK_BEFORE_STRIPPING", "Your files show up below once picked — check what was found, and remove any you don't need."],
    ["NOT_SURE_WHY_IT_MATTERS", "Scroll down to the guide further down the page — it explains what metadata actually reveals and why stripping it matters."],
    ["YOU_ARE_SET", "Each file gets its own Clean first / Clean and download buttons, right next to its remove × — Clean first just checks the result, Clean and download saves it right away. (On a phone-width screen, one Download button below the list cleans and saves everything at once instead.) Close this with the red dot and we won't show it again."]
  ]);

  /* File list stays hidden until a file is picked — first-time visitors
     get one obvious step instead of competing controls at once. */
  function revealAfterDropUI(){
    if (afterDrop) afterDrop.hidden = false;
    drop.classList.add("tool-drop-revealed");
  }

  /* ===== "Remove all" reset — clears every loaded file and returns to
     the pre-upload intro state. Called by the red #exRemoveBtn (the
     canvas-corner "×", same as Convert/Compress) and also when the
     per-file remove button below empties the list — without the latter,
     removing the last file one-by-one left the tool stranded in the
     "revealed" state (empty file list area) with no way back to the
     actual intro drop zone. */
  function resetTool(){
    files = [];
    fileList.innerHTML = "";
    if (afterDrop) afterDrop.hidden = true;
    drop.classList.remove("tool-drop-revealed");
    status.textContent = "";
    if (mobileDownloadBtn) mobileDownloadBtn.disabled = true;
    bcDbClear(EX_DB_NAME, EX_DB_STORE);
  }

  const removeBtn = document.getElementById("exRemoveBtn");
  if (removeBtn) removeBtn.addEventListener("click", resetTool);

  function isSvgFile(f){
    return f.type === "image/svg+xml" || /\.svg$/i.test(f.name);
  }

  /* Browsers that can't natively decode HEIC (everything but Safari)
     also don't recognize its MIME type — f.type comes back empty
     rather than "image/heic" — so the extension check is required,
     not just a nice-to-have fallback like it is for .svg above. Same
     check as Convert's/Compress's own isHeicFile(). */
  function isHeicFile(f){
    return f.type === "image/heic" || f.type === "image/heif" || /\.hei[cf]$/i.test(f.name);
  }

  function isImageFile(f){
    return f.type === "image/jpeg" || f.type === "image/png" || /\.(jpe?g|png)$/i.test(f.name) || isSvgFile(f) || isHeicFile(f);
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
        found.push("Embedded metadata found!");
      }
      const customNs = findCustomNsPrefixes(text);
      if (customNs.length){
        found.push("Editor metadata found!");
      }
      if (/<!--[\s\S]*?-->/.test(text)){
        found.push("Comments metadata found!");
      }
    } catch (err){
      /* unreadable as text — treat as clean, stripImage will still try */
    }
    return found;
  }

  /* HEIC decode (via heic2any's WASM HEVC decoder) — loaded on demand,
     same pattern as Convert's/Compress's own loadHeic2any()/
     decodeHeicFile(). exif.js (below) can't read a HEIC file's
     metadata box at all (it only understands JPEG/TIFF's APP1
     segment), so there's no accurate "found tags" list for HEIC the
     way there is for JPEG/PNG — heicFindings() below is a fixed
     disclaimer tag instead of a real scan. Stripping still genuinely
     works: decoding through heic2any and re-encoding to PNG produces
     a brand-new file with none of the original's metadata attached,
     scanned or not. */
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

  const heicDecodeCache = new WeakMap();
  async function decodeHeicFile(file){
    if (heicDecodeCache.has(file)) return heicDecodeCache.get(file);
    await loadHeic2any();
    const decoded = await window.heic2any({ blob: file, toType: "image/png", quality: 0.92 });
    const pngFile = Array.isArray(decoded) ? decoded[0] : decoded;
    heicDecodeCache.set(file, pngFile);
    return pngFile;
  }

  function heicFindings(){
    return ["HEIC metadata found!"];
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
      found.push("GPS metadata found!");
    }

    if (tags.Make || tags.Model){
      found.push("Camera metadata found!");
    }

    if (tags.DateTimeOriginal || tags.DateTime){
      found.push("Date metadata found!");
    }

    if (tags.Software){
      found.push("Software metadata found!");
    }

    return found;
  }

  function renderList(){
    fileList.innerHTML = "";
    files.forEach((item, i) => {
      const el = document.createElement("div");
      el.className = "exif-file-item result";

      const noMetadataText = "No dangerous metadata found";
      /* The "-" separator lives inside the same span as the icon (not as
         a bare text node after it) specifically so mobile's
         .exif-status-icon{display:none} rule (shared/site.css) hides
         both the emoji and its separator together, rather than leaving
         a dangling "- Camera metadata found!" behind. */
      const tagsHtml = item.tags.length
        ? item.tags.map((label, idx) => idx === 0
            ? `<span class="exif-tag"><span class="exif-status-icon exif-status-icon-warn" aria-hidden="true">⚠ -</span> ${label}</span>`
            : `<span class="exif-tag">${label}</span>`).join("")
        : `<span class="exif-tag exif-tag-clean"><span class="exif-status-icon exif-status-icon-clean" aria-hidden="true">✓ -</span> ${noMetadataText}</span>`;

      const svgScanNote = isSvgFile(item.file)
        ? `<div class="exif-scan-note">Cleanly checks for known patterns — it does not guarantee your file will be completely clean.</div>`
        : "";

      /* HEIC thumbnails skip the automatic <img> — pointed straight at
         raw HEIC bytes it just shows a broken image icon in every
         browser but Safari. Same opt-in "Preview" pattern as Convert/
         Compress's own HEIC result cards, just scaled down to this
         row's small thumb instead of a full preview card. */
      const thumbHtml = isHeicFile(item.file)
        ? `<button type="button" class="exif-file-heic-preview" aria-label="Preview">HEIC</button>`
        : `<img src="${item.src}" alt="">`;

      /* Three states per row:
         - not yet cleaned: "Clean first" (processes only, no download —
           see stripEntry's own doc comment) and "Clean and download"
           (cleans, then immediately downloads) sit side by side.
         - cleaned but not yet downloaded (only reachable via "Clean
           first"): a single, enabled "Download" button — there's still a
           real action left to offer.
         - already downloaded, however it got there: whichever button
           actually triggered the download ("Download" after Clean first,
           or "Clean and download" directly) stays in place but
           permanently disabled, rather than swapping label or
           disappearing — the file already saved itself, so there's
           nothing left to click, but the row still reads clearly as
           "this is how it got downloaded" instead of a control just
           vanishing. item.downloaded (set by downloadEntry(), the one
           function both paths funnel through) is what flips this state;
           item.downloadedVia records which of the two labels to keep
           showing, disabled.
         Each enabled button carries its own data-ga-action (on top of
         the shared data-ga-event/data-ga-tool pair every .tool-primary-
         btn already uses) so GA can tell which of the three a click was,
         not just that "the cleanly primary action" fired. */
      const actionButtonsHtml = item.stripped
        ? (item.downloaded
            ? (item.downloadedVia === "clean_and_download"
                ? `<button type="button" class="tool-primary-btn ex-row-clean-download-btn" disabled>Clean and download</button>`
                : `<button type="button" class="tool-primary-btn ex-row-download-btn" disabled>Download</button>`)
            : `<button type="button" class="tool-primary-btn ex-row-download-btn" data-ga-event="tool_primary_action" data-ga-tool="cleanly" data-ga-action="download">Download</button>`)
        : `<button type="button" class="tool-primary-btn ex-row-strip-btn" data-ga-event="tool_primary_action" data-ga-tool="cleanly" data-ga-action="clean_first">Clean first</button>
           <button type="button" class="tool-primary-btn ex-row-clean-download-btn" data-ga-event="tool_primary_action" data-ga-tool="cleanly" data-ga-action="clean_and_download">Clean and download</button>`;

      el.innerHTML = `
        <div class="exif-file-thumb">${thumbHtml}</div>
        <div class="exif-file-info">
          <div class="exif-file-name">${item.file.name}</div>
          <div class="exif-file-size">${formatSize(item.file.size)}</div>
          <div class="exif-tags">${tagsHtml}</div>
          ${svgScanNote}
        </div>
        <div class="exif-file-actions">${actionButtonsHtml}</div>
        <button type="button" class="exif-file-remove bc-file-remove-btn" aria-label="Remove" title="Remove file">×</button>
      `;

      const heicPreviewBtn = el.querySelector(".exif-file-heic-preview");
      if (heicPreviewBtn){
        heicPreviewBtn.addEventListener("click", async () => {
          heicPreviewBtn.disabled = true;
          try {
            const decoded = await decodeHeicFile(item.file);
            const img = document.createElement("img");
            img.alt = "";
            img.src = URL.createObjectURL(decoded);
            heicPreviewBtn.replaceWith(img);
          } catch (err){
            heicPreviewBtn.disabled = false;
          }
        });
      }

      el.querySelector(".exif-file-remove").addEventListener("click", () => {
        files.splice(i, 1);
        if (files.length === 0){
          resetTool();
          return;
        }
        renderList();
      });

      const downloadBtn = el.querySelector(".ex-row-download-btn");
      if (downloadBtn) downloadBtn.addEventListener("click", () => downloadEntry(item, "download"));

      const cleanFirstBtn = el.querySelector(".ex-row-strip-btn");
      if (cleanFirstBtn) cleanFirstBtn.addEventListener("click", () => stripEntry(item, el));

      const cleanDownloadBtn = el.querySelector(".ex-row-clean-download-btn");
      if (cleanDownloadBtn) cleanDownloadBtn.addEventListener("click", () => stripEntry(item, el, { thenDownload: true }));

      fileList.appendChild(el);
    });

    if (mobileDownloadBtn) mobileDownloadBtn.disabled = files.length === 0;
    if (files.length === 0) bcDbClear(EX_DB_NAME, EX_DB_STORE);
    else schedulePersist();
  }

  async function addFiles(newFiles){
    const picked = [...newFiles].filter(isImageFile);
    if (picked.length === 0) return;
    for (const file of picked){
      const tags = isSvgFile(file) ? await readSvgFindings(file)
        : isHeicFile(file) ? heicFindings()
        : summarizeTags(await readTags(file));
      files.push({
        file,
        src: isHeicFile(file) ? "" : URL.createObjectURL(file),
        tags
      });
    }
    revealAfterDropUI();
    renderList();
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

  /* HEIC can't be re-encoded as HEIC in-browser (no browser ships a
     HEIC/HEVC encoder) — decoding through heic2any straight to PNG
     both strips the metadata (the decode discards it, nothing carries
     it into the freshly-encoded PNG) and sidesteps the <img>/canvas
     round trip below, which can't decode HEIC bytes in the first
     place outside Safari. Output name gets its extension swapped to
     .png to match — see the outputName logic in the strip handler. */
  async function stripHeic(file){
    await loadHeic2any();
    const decoded = await window.heic2any({ blob: file, toType: "image/png", quality: 0.95 });
    return Array.isArray(decoded) ? decoded[0] : decoded;
  }

  function stripImage(file){
    if (isSvgFile(file)) return stripSvg(file);
    if (isHeicFile(file)) return stripHeic(file);
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

  /* Per-row Clean — same shape as Coudio's own convertEntry(): each file
     is a fully independent action (own buttons), not one shared batch
     button running all files in sequence. No ZIP path needed any more
     since there's never more than one file being downloaded at once.

     Two entry points before a file's cleaned — "Clean first" (no
     download) and "Clean and download" (cleans, then immediately calls
     downloadEntry once) — both funnel through this one function,
     distinguished only by the thenDownload option. Clean first leaves
     item.downloaded unset, so the row falls back to a single, enabled
     "Download" button — the file's clean but not yet saved, so there's
     still a real action to offer. Once *that* button is clicked (or
     "Clean and download" was clicked directly), downloadEntry() itself
     sets item.downloaded/item.downloadedVia — see its own doc comment —
     and the row permanently disables whichever button actually did the
     downloading rather than swapping labels or removing it. See
     renderList's actionButtonsHtml for exactly which of the two
     item.stripped/item.downloaded reads produces.

     Unlike Coudio's Convert button, none of these labels change while
     working — they just get disabled. The working/done/failed state
     shows up in the shared #exStatus line below the list instead
     ("Removing metadata from X…" / "Done — X cleaned. Click Download to
     save it." / "Couldn't clean X…"), the same place every other status
     message in this tool already goes — a mid-word button label was more
     churn on the one element a visitor is already looking at than it was
     worth.

     Cleaning itself never touches the network (it's pure canvas/
     heic2any/SVG-string work), so it doesn't get its own privacy-check
     pair — only the eventual download does, since that's the step the
     privacy badge is actually about. */
  /* The actual clean step, with no button/row bookkeeping — shared by
     stripEntry() (desktop, one row at a time) and mobileDownloadAll()
     (mobile, looping over every file with no per-row buttons to manage
     at all). */
  async function cleanFile(item){
    const blob = await stripImage(item.file);
    /* HEIC comes back out as a PNG (see stripHeic above) — swap the
       extension so the eventual download actually matches its real
       format instead of a .heic name on a PNG's bytes. */
    const outputName = isHeicFile(item.file)
      ? item.file.name.replace(/\.hei[cf]$/i, ".png")
      : item.file.name;

    item.stripped = true;
    item.strippedBlob = blob;
    item.strippedName = outputName;
    item.tags = [];
  }

  async function stripEntry(item, row, { thenDownload = false } = {}){
    const buttons = [...row.querySelectorAll(".ex-row-strip-btn, .ex-row-clean-download-btn")];
    buttons.forEach(btn => { btn.disabled = true; });
    status.textContent = `Removing metadata from ${item.file.name}…`;

    try {
      await cleanFile(item);

      if (thenDownload){
        downloadEntry(item, "clean_and_download");
      } else {
        status.textContent = `Done — ${item.file.name} cleaned. Click Download to save it.`;
        renderList();
      }
    } catch (err){
      console.error(err);
      status.textContent = `Couldn't clean ${item.file.name}. Please try again.`;
      buttons.forEach(btn => { btn.disabled = false; });
    }
  }

  /* Mobile's one global button (see the .ex-mobile-download-btn CSS note
     in index.html for why): no per-row buttons exist to click on mobile,
     so this cleans (if not already) and downloads every loaded file in
     one pass instead. Sequential, not parallel — same reasoning Coudio's
     own batch-ish flows use: this is CPU-bound canvas/heic2any work, so
     "at once" would just thrash one core rather than actually go faster.
     A small delay between downloads (matching Combine's/Cleanly's old
     batch download pacing) keeps the browser from treating a burst of
     several downloads as spam and blocking them. */
  async function mobileDownloadAll(){
    if (!files.length || !mobileDownloadBtn) return;
    mobileDownloadBtn.disabled = true;
    for (const item of files){
      try {
        if (!item.stripped) await cleanFile(item);
        if (!item.downloaded){
          downloadEntry(item, "mobile_download_all");
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (err){
        console.error(err);
        status.textContent = `Couldn't clean ${item.file.name}. Please try again.`;
      }
    }
    mobileDownloadBtn.disabled = files.length === 0;
  }
  if (mobileDownloadBtn) mobileDownloadBtn.addEventListener("click", mobileDownloadAll);

  /* Marks the file as downloaded and re-renders so whichever button
     triggered this (the standalone "Download" after Clean first, or
     "Clean and download" directly) locks into a permanently disabled
     state — see the note on actionButtonsHtml in renderList(). Called
     both from a row's Download button and from stripEntry()'s
     thenDownload path, which is why it takes `via` rather than assuming
     one particular caller. The only step in this flow that gets a
     privacy-check pair — cleaning itself never touches the network. */
  function downloadEntry(item, via){
    startPrivacyCheck();
    downloadBlob(item.strippedBlob, item.strippedName);
    item.downloaded = true;
    item.downloadedVia = via;
    status.textContent = `Downloaded ${item.strippedName}.`;
    finishPrivacyCheck(document.getElementById("exPrivacyBadge"));
    renderList();
  }

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
