(function(){
  const drop = document.getElementById("cvDrop");
  const input = document.getElementById("cvInput");
  const formatSelect = document.getElementById("cvFormatSelect");
  const inputSelect = document.getElementById("cvInputSelect");
  const convertBtn = document.getElementById("cvConvertBtn");

  /* ===== Input/Output format pickers =====
     The <select> elements above are the real state/event backend —
     every bit of format logic below (mutual-exclusion, URL routing,
     auto-detect, restore) reads/writes .value and dispatches "change"
     on them exactly as it always did. What's new is the visible
     control: a .bc-dropdown (shared/site.js's bcRegisterDropdown) sits
     on top, and syncDropdownTrigger() keeps its label/active-option in
     sync with the select's value at every point that value changes —
     including the several places below that set .value directly
     without a dispatch (browsers don't fire "change" on a
     programmatic .value assignment, so each of those call sites calls
     syncDropdownTrigger() itself right after). */
  const inputTrigger = document.getElementById("cvInputTrigger");
  const inputMenu = document.getElementById("cvInputMenu");
  const inputTriggerLabel = document.getElementById("cvInputTriggerLabel");
  const formatTrigger = document.getElementById("cvFormatTrigger");
  const formatMenu = document.getElementById("cvFormatMenu");
  const formatTriggerLabel = document.getElementById("cvFormatTriggerLabel");
  const DROPDOWN_SYNC = new Map([
    [inputSelect, { menu: inputMenu, label: inputTriggerLabel, placeholder: "Choose format" }],
    [formatSelect, { menu: formatMenu, label: formatTriggerLabel, placeholder: "Choose a format" }]
  ]);
  function syncDropdownTrigger(select){
    const cfg = DROPDOWN_SYNC.get(select);
    if (!cfg) return;
    const val = select.value;
    const opt = val ? cfg.menu.querySelector('[data-value="' + val + '"]') : null;
    cfg.menu.querySelectorAll(".bc-dropdown-option").forEach(o => {
      o.classList.toggle("active", o === opt);
      o.setAttribute("aria-selected", String(o === opt));
    });
    cfg.label.textContent = opt ? opt.dataset.label : cfg.placeholder;
  }
  bcRegisterDropdown(inputTrigger, inputMenu, (opt) => {
    inputSelect.value = opt.dataset.value;
    inputSelect.dispatchEvent(new Event("change"));
    syncDropdownTrigger(inputSelect);
  });
  bcRegisterDropdown(formatTrigger, formatMenu, (opt) => {
    formatSelect.value = opt.dataset.value;
    formatSelect.dispatchEvent(new Event("change"));
    syncDropdownTrigger(formatSelect);
  });
  /* The "change" listeners further down each also call
     syncDropdownTrigger() on BOTH selects (not just the one that
     fired) — picking one can silently swap the other's value too (the
     anti-same-format logic below), and that swapped side's own visible
     dropdown needs to catch up even though it wasn't the one clicked. */
  const status = document.getElementById("cvStatus");
  const results = document.getElementById("cvResults");
  const whyArticle = document.getElementById("cvWhyArticle");
  const whyHeading = document.getElementById("cvWhyHeading");
  const whyP1 = document.getElementById("cvWhyP1");
  const whyP2 = document.getElementById("cvWhyP2");
  const afterDrop = document.getElementById("cvAfterDrop");

  /* "Convert and download" is the idle label everywhere except mobile,
     where it's shortened to just "Download" — screen width, not
     device, since it's about fitting the button, not what device it
     is. Only touches the idle label; "Converting..." (set directly,
     below) stays as real in-progress feedback regardless of width. */
  const mobileQuery = window.matchMedia("(max-width:768px)");
  function convertBtnIdleLabel(){
    return mobileQuery.matches ? "Download" : "Convert and download";
  }
  convertBtn.textContent = convertBtnIdleLabel();
  mobileQuery.addEventListener("change", () => {
    if (!convertBtn.disabled || files.length === 0) convertBtn.textContent = convertBtnIdleLabel();
  });

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. Dismissal is per-tool, stored in
     localStorage under one key shared by this page and all 16 pair
     pages, so closing it anywhere means it stays closed everywhere. */
  bcSetupHelpBanner("convert", "cv", [
    ["WELCOME_TO_CONVERT", "Convert switches images and PDFs between formats — JPG, PNG, WEBP, HEIC, PDF. Click or drop a file below to get started."],
    ["PICK_YOUR_FORMATS", "Once a file's in, we select the Input format for you — you just choose what you want as Output."],
    ["CHECK_BEFORE_CONVERTING", "Your files show up below once picked — check them before converting, and remove any you don't need."],
    ["NOT_SURE_WHAT_TO_PICK", "Scroll down to the format guide further down the page — it explains what each format (JPG, PNG, WEBP, HEIC, PDF) is actually good for."],
    ["YOU_ARE_SET", "Hit Convert and the files download automatically. Close this with the red dot and we won't show it again."]
  ]);

  const inputInfoBtn = document.getElementById("cvInputInfoBtn");
  const inputInfoTooltip = document.getElementById("cvInputInfoTooltip");
  if (inputInfoBtn && inputInfoTooltip){
    inputInfoBtn.addEventListener("click", e => {
      e.stopPropagation();
      const willShow = inputInfoTooltip.hidden;
      inputInfoTooltip.hidden = !willShow;
      inputInfoBtn.setAttribute("aria-expanded", String(willShow));
    });
    document.addEventListener("click", e => {
      if (!inputInfoTooltip.hidden && !inputInfoTooltip.contains(e.target) && e.target !== inputInfoBtn){
        inputInfoTooltip.hidden = true;
        inputInfoBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* Input/Output pickers and the Convert button stay hidden until a
     file is picked (or the page loads with a preselected pair, e.g.
     /convert/png-to-jpg/) — first-time visitors get one obvious step
     instead of three competing controls at once. */
  function revealAfterDropUI(){
    if (afterDrop) afterDrop.hidden = false;
    drop.classList.add("tool-drop-revealed");
  }

  /* ===== "Why convert X to Y?" article =====
     One entry per realistic input/output pair (excludes same-format
     and HEIC-as-output, which the tool doesn't offer). Keyed as
     "input>output" using the dropdowns' own option values. Kept in
     sync with the live Input/Output selections below, so this works
     for every combination reachable from the dropdowns — not just
     the 16 pairs that also have their own dedicated /convert/x-to-y/
     URL (whose static HTML already has this exact copy pre-rendered;
     this just keeps it live if the visitor changes the dropdowns). */
  const WHY_CONVERT_COPY = {
    "image/jpeg>image/png": ["Why convert a JPG to PNG?",
      "JPG re-compresses every time you save it, so a photo that's been edited a few times can pick up visible blur or blocky artifacts around sharp edges. Converting to PNG locks in whatever quality is left and stops any further loss — useful before you run it through another round of editing.",
      "It's also the move if you need transparency: a JPG background is always opaque, but once it's a PNG you (or an image editor) can cut out the background and get a real transparent layer to work with."],
    "image/jpeg>image/webp": ["Why convert a JPG to WEBP?",
      "WEBP was built for the web: at the same visual quality it typically comes in noticeably smaller than a JPG, which means faster page loads if you're uploading product photos, blog images, or a portfolio.",
      "Every modern browser renders WEBP natively, so the only real reason to stay on JPG is if you're feeding the file into older software that never added WEBP support — otherwise it's a straightforward size win."],
    "image/jpeg>application/pdf": ["Why convert a JPG to PDF?",
      "A single JPG is easy to lose track of once you've got a dozen of them — receipts, scanned pages, screenshots. Bundling them into one PDF turns a folder of loose photos into one document you can attach, print, or file away.",
      "PDF also renders identically everywhere it's opened, which matters if you're sending something official and don't want it to look different on the recipient's screen than it did on yours."],
    "image/png>image/jpeg": ["Why convert a PNG to JPG?",
      "PNG is lossless, which makes it the right call for logos and screenshots — but that same lossless quality means PNG files are often several times larger than they need to be for an ordinary photo, especially once a screenshot has real photographic detail in it.",
      "If you don't need transparency and just want a smaller file for email, a form upload with a size limit, or a faster-loading web page, JPG usually gets you there with no visible difference."],
    "image/png>image/webp": ["Why convert a PNG to WEBP?",
      "WEBP supports transparency just like PNG does, but compresses it far more efficiently — so you keep the see-through background while cutting the file size down, often significantly.",
      "That makes it the better default for anything going on a website: logos, icons, and graphics with transparent backgrounds load faster as WEBP without losing what made PNG the right format in the first place."],
    "image/png>application/pdf": ["Why convert a PNG to PDF?",
      "Screenshots and diagrams saved as PNG are great individually, but awkward to hand someone as a set — a PDF turns several PNGs into one scrollable document, in the order you dropped them in.",
      "It's a common move for turning a stack of screenshots into something that reads like an actual report, or for sending a design mockup as a file that opens the same way on any device."],
    "image/webp>image/jpeg": ["Why convert a WEBP to JPG?",
      "WEBP is efficient, but not every piece of software recognizes it yet — some older editing tools, printers, and upload forms still expect a JPG and will reject or mishandle a WEBP file outright.",
      "Converting back to JPG trades a bit of that efficiency for near-universal compatibility, which is worth it the moment you hit a tool that can't open WEBP directly."],
    "image/webp>image/png": ["Why convert a WEBP to PNG?",
      "If a WEBP image has a transparent background and you need to bring it into an editor that doesn't support WEBP, converting to PNG preserves that transparency in a format almost every image tool can open.",
      "It's also useful for archiving: PNG's lossless compression means the image won't degrade any further no matter how many times it gets opened and re-saved down the line."],
    "image/webp>application/pdf": ["Why convert a WEBP to PDF?",
      "Images downloaded from the web — product photos, saved graphics, screenshots from a site — often come as WEBP these days. Bundling a handful of them into a PDF makes it easy to share the set as one file instead of several loose images.",
      "It also sidesteps the compatibility question entirely: PDF opens the same way on virtually any device, so you don't have to worry whether the person you're sending it to can view WEBP."],
    "image/heic>image/jpeg": ["Why convert a HEIC photo to JPG?",
      "HEIC is what iPhones save photos as by default, and it compresses better than JPG at the same quality — but that efficiency comes at the cost of compatibility. Plenty of non-Apple apps, older software, and upload forms still can't open a HEIC file directly.",
      "Converting to JPG trades a bit of that space savings for a format that opens everywhere, which is the usual reason to do it: sharing a photo with someone on Windows or Android, or uploading it somewhere that rejects HEIC outright."],
    "image/heic>image/png": ["Why convert a HEIC photo to PNG?",
      "This one's less common than HEIC-to-JPG, but it matters if you're about to edit the photo and want zero further compression loss — PNG is lossless, so nothing degrades once you convert.",
      "It's also the right call if you need to isolate part of the photo and add a transparent background afterward, since PNG is the format that actually supports that."],
    "image/heic>image/webp": ["Why convert a HEIC photo to WEBP?",
      "If the destination is a website rather than another device — a blog post, a gallery, a product listing — WEBP gives you a genuinely small file without the compatibility gap HEIC has everywhere outside Apple's ecosystem.",
      "You get most of HEIC's space efficiency, but in a format every modern browser can actually render, which JPG and PNG both fall short of matching for web use."],
    "image/heic>application/pdf": ["Why convert a HEIC photo to PDF?",
      "A phone photo of a receipt, a whiteboard, or a signed document is often taken straight off an iPhone as HEIC — turning it into a PDF is the natural next step if it's going somewhere official, like an expense report or a form submission.",
      "PDF also lets you combine several HEIC photos — say, multiple pages of a scanned document — into one file instead of sending them as separate images."],
    "application/pdf>image/jpeg": ["Why convert a PDF to JPG?",
      "Sometimes you don't need the whole document — just a page of it, as an image you can drop into a slide deck, post on social media, or paste into a chat.",
      "Converting extracts each page as its own JPG, which is also the fix when something insists on an image upload and won't accept a PDF at all."],
    "application/pdf>image/png": ["Why convert a PDF to PNG?",
      "If the PDF page has text, diagrams, or line art that needs to stay perfectly sharp — not slightly softened by JPG compression — PNG keeps every pixel exactly as it was in the original document.",
      "It's the better choice over PDF-to-JPG specifically when you plan to zoom in, annotate, or edit the extracted page afterward, since there's no compression artifacting to fight with."],
    "application/pdf>image/webp": ["Why convert a PDF to WEBP?",
      "Publishing PDF pages on a website — documentation screenshots, a preview of a downloadable guide — works better as WEBP than as a full-size PDF page image, since the file size stays small without a visible quality hit.",
      "It keeps page-load times down if you're embedding several extracted pages on the same page, which a stack of JPGs or PNGs would make noticeably heavier."]
  };

  function updateWhyConvertArticle(){
    const key = inputSelect.value + ">" + formatSelect.value;
    const entry = WHY_CONVERT_COPY[key];
    updateShareUrl(key, entry);
    if (!whyArticle) return;
    if (!entry){
      whyArticle.hidden = true;
      return;
    }
    whyHeading.textContent = entry[0];
    whyP1.textContent = entry[1];
    whyP2.textContent = entry[2];
    whyArticle.hidden = false;
  }

  /* ===== Shareable URL =====
     Reflects the current Input/Output pair in the address bar (no
     reload) whenever it matches one of the 16 dedicated routes, so
     copying the link from the address bar takes the recipient
     straight to that same combination. Falls back to the plain
     /convert/ URL for combinations with no dedicated route. Uses
     replaceState rather than pushState so clicking through formats
     doesn't fill up the visitor's back-button history. */
  const FORMAT_TO_SLUG = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };
  const baseTitle = document.title;
  function updateShareUrl(key, entry){
    const [src, dst] = key.split(">");
    const slug = entry && FORMAT_TO_SLUG[src] && FORMAT_TO_SLUG[dst]
      ? FORMAT_TO_SLUG[src] + "-to-" + FORMAT_TO_SLUG[dst]
      : null;
    const path = slug ? "/convert/" + slug + "/" : "/convert/";
    if (location.pathname !== path){
      history.replaceState(null, "", path);
    }
    document.title = entry ? "Convert " + FORMAT_TO_SLUG[src].toUpperCase() + " to " + FORMAT_TO_SLUG[dst].toUpperCase() + " – Free Online Converter – BC Tools" : baseTitle;
  }

  function appendPreviewCard(item){
    const card = document.createElement("div");
    card.className = "result" + (/\.svg$/i.test(item.name) ? " result-svg" : "");
    card.innerHTML = `
      <img${item.src ? ` src="${item.src}"` : ""} alt="${item.name}">
      <div class="result-name">${item.name}</div>
      <div class="result-size">${item.info}</div>
    `;
    results.appendChild(card);
    return card;
  }

  function formatKB(bytes){
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  let files = [];
  let selectedFormat = "";

  /* ===== Keep Input and Output from ever matching =====
     If picking one makes it equal the other, the other side flips to
     whatever the changed side used to be — e.g. Input=JPG/Output=PNG,
     then Input is changed to PNG, so Output flips back to JPG rather
     than sitting on the same format as Input. */
  let prevInputValue = inputSelect.value;
  let prevOutputValue = formatSelect.value;

  function trySetSelectValue(select, value){
    if (value && select.querySelector('option[value="' + value + '"]')){
      select.value = value;
      syncDropdownTrigger(select);
      return true;
    }
    select.value = "";
    syncDropdownTrigger(select);
    return false;
  }

  /* Keeps the "Not sure which format to use?" cards' selected-button
     highlight truthful to the actual Input/Output values instead of
     just whichever button was last clicked — reads the two selects
     directly, so it stays correct even when the anti-collision swap
     above silently flips the other side (see the button click
     handlers below, and both change listeners). */
  function syncFormatPickSelection(){
    const inVal = inputSelect.value;
    const outVal = formatSelect.value;
    document.querySelectorAll(".format-pick-action-btn[data-set-input]").forEach(b => {
      b.classList.toggle("selected", !!inVal && b.dataset.setInput === inVal);
    });
    document.querySelectorAll(".format-pick-action-btn[data-set-output]").forEach(b => {
      b.classList.toggle("selected", !!outVal && b.dataset.setOutput === outVal);
    });
  }

  formatSelect.addEventListener("change", () => {
    if (formatSelect.value && inputSelect.value && formatSelect.value === inputSelect.value){
      trySetSelectValue(inputSelect, prevOutputValue);
    }
    selectedFormat = formatSelect.value;
    renderStatus();
    updateWhyConvertArticle();
    prevInputValue = inputSelect.value;
    prevOutputValue = formatSelect.value;
    syncFormatPickSelection();
    schedulePersist();
  });

  inputSelect.addEventListener("change", () => {
    if (inputSelect.value && formatSelect.value && inputSelect.value === formatSelect.value){
      trySetSelectValue(formatSelect, prevInputValue);
      selectedFormat = formatSelect.value;
      renderStatus();
    }
    prevInputValue = inputSelect.value;
    prevOutputValue = formatSelect.value;
    updateWhyConvertArticle();
    syncFormatPickSelection();
    schedulePersist();
  });

  /* ===== "Not sure which format to use?" cards =====
     Each card has its own "I have this" (sets Input) and "I need
     this" (sets Output, absent on HEIC) buttons — the
     card itself isn't clickable.

     The clicked button stays visually "selected" afterward instead of
     resetting — that's what makes the cards useful for both sides at
     once: pick "I have this" on one card, see it marked, then still
     pick "I need this" on a different card without losing that mark.
     Input and Output selections are tracked independently (two
     separate button groups below) so setting one never disturbs the
     other — someone who already uploaded a file only needs to pick
     Output, and the Input side just stays however it was. */
  function pickFormat(select, value){
    if (!select.querySelector('option[value="' + value + '"]')) return;
    revealAfterDropUI();
    select.value = value;
    syncDropdownTrigger(select);
    select.dispatchEvent(new Event("change"));
  }

  /* No manual .selected toggling here on purpose — pickFormat()'s
     dispatched "change" always runs syncFormatPickSelection() (above),
     which re-derives both groups' highlight from the selects' real
     values. That's what keeps this honest when the anti-same-format
     swap silently clears or flips the *other* select: a stale button
     from before the swap doesn't stay lit just because it was the one
     last clicked. */
  document.querySelectorAll(".format-pick-action-btn[data-set-input]").forEach(btn => {
    btn.addEventListener("click", () => pickFormat(inputSelect, btn.dataset.setInput));
  });

  document.querySelectorAll(".format-pick-action-btn[data-set-output]").forEach(btn => {
    btn.addEventListener("click", () => pickFormat(formatSelect, btn.dataset.setOutput));
  });

  /* Before a file is picked, the whole banner acts as the drop zone —
     not just the (visually hidden) dashed box — so there's one big
     obvious target instead of a small one lost inside a large card.
     Once a file lands, the dashed box reappears and takes over as
     the (now much smaller) target for adding more files, and the
     rest of the banner goes back to just being a container for the
     dropdowns/buttons. */
  const toolApp = document.querySelector(".tool-app");
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      /* Pre-reveal, the whole banner opens the picker. Once files
         and controls are showing, only the (now visible) drop box
         still does — clicking elsewhere shouldn't hijack clicks
         meant for the dropdowns/buttons around it. */
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
    onDrop: e => applyPickedFiles([...e.dataTransfer.files].filter(isConvertibleFile))
  });

  function renderStatus(){
    if (files.length > 0){
      const count = files.length;
      const word = count === 1 ? "file" : "files";
      if (!selectedFormat){
        status.textContent = `${count} ${word} loaded — choose an output format`;
      } else {
        status.textContent = `Ready to convert: ${count} ${word}`;
      }
    } else {
      status.textContent = "";
    }
  }

  /* Browsers that can't natively decode HEIC (everything but Safari)
     also don't recognize its MIME type — f.type comes back empty
     rather than "image/heic" — so the extension check is required,
     not just a nice-to-have fallback like it is for .svg above. */
  function isHeicFile(f){
    return f.type === "image/heic" || f.type === "image/heif" || /\.hei[cf]$/i.test(f.name);
  }

  function isImageFile(f){
    return f.type.startsWith("image/") || /\.svg$/i.test(f.name) || isHeicFile(f);
  }

  function isPdfFile(f){
    return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  }

  function isConvertibleFile(f){
    return isImageFile(f) || isPdfFile(f);
  }

  /* Maps a real file to one of the Input dropdown's options, so a
     file dropped before the visitor has picked anything still shows
     an accurate format instead of the "Choose format" placeholder.
     Returns "" for anything with no matching option (e.g. SVG),
     leaving the placeholder in place rather than guessing wrong. */
  function detectInputFormatValue(f){
    if (isPdfFile(f)) return "application/pdf";
    if (isHeicFile(f)) return "image/heic";
    if (f.type === "image/jpeg" || /\.jpe?g$/i.test(f.name)) return "image/jpeg";
    if (f.type === "image/png" || /\.png$/i.test(f.name)) return "image/png";
    if (f.type === "image/webp" || /\.webp$/i.test(f.name)) return "image/webp";
    return "";
  }

  const thumbnailCache = new WeakMap();

  async function getPdfThumbnail(file){
    if (thumbnailCache.has(file)) return thumbnailCache.get(file);
    if (!window.pdfjsLib) return null;

    try {
      if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc){
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
      }
      const bytes = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = 200 / baseViewport.width;
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

  // Only show format buttons valid for the current input: images can
  // target JPG/PNG/WEBP/PDF, but a PDF input can only export as a
  // raster image (PDF -> PDF doesn't apply).
  function updateFormatButtonVisibility(){
    const filesArePdf = files.length > 0 && files.every(isPdfFile);
    Array.from(formatSelect.options).forEach(opt => {
      if (!opt.value) return;
      const hide = filesArePdf && opt.value === "application/pdf";
      opt.hidden = hide;
      opt.disabled = hide;
      /* Mirror onto the visible .bc-dropdown-option too — the select
         stays the source of truth, this just keeps the menu the user
         actually sees from offering a choice the select would reject. */
      const menuOpt = formatMenu.querySelector('[data-value="' + opt.value + '"]');
      if (menuOpt) menuOpt.hidden = hide;
    });
    if (filesArePdf && formatSelect.value === "application/pdf"){
      formatSelect.value = "";
      selectedFormat = "";
      syncDropdownTrigger(formatSelect);
      syncFormatPickSelection();
    }
  }

  function addRemoveButton(card, file){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "result-remove";
    btn.setAttribute("aria-label", "Remove");
    btn.textContent = "×";
    btn.addEventListener("click", () => {
      files = files.filter(f => f !== file);
      renderStatus();
      updateFormatButtonVisibility();
      showSelectedPreviews();
      convertBtn.disabled = files.length === 0;
      if (files.length === 0) bcDbClear(CV_DB_NAME, CV_DB_STORE);
      else schedulePersist();
    });
    card.appendChild(btn);
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

  function showSelectedPreviews(){
    if (files.length === 0){ results.innerHTML = ""; return; }
    results.innerHTML = "";

    /* HEIC and PDF thumbnails both need real decode/render work (WASM
       HEVC decode, or a pdf.js page render), so they queue up and run
       one at a time instead of all firing at once. That work is
       CPU-bound and mostly single-threaded, so N of them "running in
       parallel" doesn't actually run in parallel — it just thrashes
       one core and ends up slower overall than doing them in order.
       Plain images skip the queue entirely since createObjectURL is
       instant. HEIC decodes are also cached (see decodeHeicFile), so
       this queue front-loads the one decode that conversion later
       reuses for free. */
    let previewQueue = Promise.resolve();

    files.forEach(file => {
      if (isPdfFile(file)){
        const card = appendPreviewCard({ src: "", name: file.name, info: "PDF" });
        card.classList.add("result-pdf");
        const img = card.querySelector("img");
        previewQueue = previewQueue.then(() => getPdfThumbnail(file)).then(dataUrl => {
          if (dataUrl){
            img.src = dataUrl;
          } else {
            img.remove();
          }
        }).catch(() => { img.remove(); });
        addRemoveButton(card, file);
      } else if (isHeicFile(file)){
        /* Skips decoding for the thumbnail by default — an <img>
           pointed straight at raw HEIC bytes just shows a broken image
           icon in every browser but Safari, and running the full WASM
           decode for every file in a big batch is the slow part a
           visitor actually notices. Instead it's opt-in: a "Preview"
           button decodes just that one file on click. Since
           decodeHeicFile caches its result, clicking it doesn't cost
           anything extra at Convert time — it's the same decode
           either way, just done a little earlier for whoever wants to
           see it. */
        const card = appendPreviewCard({
          src: "",
          name: file.name,
          info: `Original size: ${formatKB(file.size)}`
        });
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

        addRemoveButton(card, file);
      } else {
        const card = appendPreviewCard({
          src: URL.createObjectURL(file),
          name: file.name,
          info: `Original size: ${formatKB(file.size)}`
        });
        addRemoveButton(card, file);
      }
    });
  }

  /* Appends to the existing selection rather than replacing it, so
     picking (or dropping) a second round of files adds to the first
     instead of wiping it out — matches Combine's "upload as many
     rounds as you like" behavior. Rejects the whole addition (keeping
     the existing files untouched) if mixing it in would create a
     batch that's part-image, part-PDF. */
  function applyPickedFiles(picked){
    if (picked.length === 0) return;
    const combined = files.concat(picked);
    if (!(combined.every(isPdfFile) || combined.every(isImageFile))){
      status.textContent = "Please select either only images or only PDF files, not both at once.";
      return;
    }
    files = combined;
    revealAfterDropUI();
    renderStatus();
    if (files.length && !inputSelect.value){
      const detected = detectInputFormatValue(files[0]);
      if (detected){
        inputSelect.value = detected;
        syncDropdownTrigger(inputSelect);
        updateWhyConvertArticle();
        syncFormatPickSelection();
      }
    }
    updateFormatButtonVisibility();
    showSelectedPreviews();
    convertBtn.disabled = files.length === 0;
    schedulePersist();
  }

  input.addEventListener("change", e => {
    applyPickedFiles([...e.target.files].filter(isConvertibleFile));
  });


  /* Loaded on demand (not a static <script> tag) — it's a ~1.3MB WASM
     decoder bundle, and most visitors never touch a HEIC file, so
     there's no reason to make everyone download it up front. Cached
     after the first load so picking multiple HEIC files only pays the
     download once. */
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

  /* HEIC decode (via heic2any's WASM HEVC decoder) is by far the
     slowest step in the whole pipeline — the preview thumbnail and
     the real conversion used to each run it separately, silently
     doubling the wait on a batch of HEIC photos. Cached per file so
     the second call (whichever happens first, preview or convert)
     is instant. */
  const heicDecodeCache = new WeakMap();
  async function decodeHeicFile(file){
    if (heicDecodeCache.has(file)) return heicDecodeCache.get(file);
    await loadHeic2any();
    const decoded = await window.heic2any({ blob: file, toType: "image/png", quality: 0.92 });
    const pngFile = Array.isArray(decoded) ? decoded[0] : decoded;
    heicDecodeCache.set(file, pngFile);
    return pngFile;
  }

  async function convertImageFile(file, mimeType){
    /* HEIC can't be decoded by <img>/<canvas> in any browser but
       Safari — run it through the WASM decoder first to get a real
       image, then hand that to the exact same pipeline below as if
       it had been a normal image all along.

       Fast path: heic2any can encode straight to JPEG or PNG itself,
       so when that's exactly the target format, its output *is* the
       final file — skips an entire extra decode+draw+encode round
       trip through <img>/canvas that would otherwise just be
       re-deriving the same pixels. Only WEBP (and anything heic2any
       doesn't support directly) still needs the canvas step below,
       via decodeHeicFile's cached PNG. */
    if (isHeicFile(file)){
      if (mimeType === "image/jpeg" || mimeType === "image/png"){
        await loadHeic2any();
        const decoded = await window.heic2any({ blob: file, toType: mimeType, quality: 0.95 });
        return Array.isArray(decoded) ? decoded[0] : decoded;
      }
      file = await decodeHeicFile(file);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        // viewBox-only SVGs report 0 for intrinsic width/height — fall
        // back to a default so conversion still works.
        const width = img.naturalWidth || img.width || 512;
        const height = img.naturalHeight || img.height || 512;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(blob => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) { reject(new Error("Failed to create blob.")); return; }
          resolve(blob);
        }, mimeType, 0.95);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Failed to load ${file.name}`));
      };
      img.src = objectUrl;
    });
  }

  async function imagesToSinglePdf(imageFiles){
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    for (const file of imageFiles){
      // Rasterizes to PNG first — pdf-lib only embeds JPG/PNG directly,
      // so this reuses the canvas pipeline for SVG/WEBP too.
      const pngBlob = await convertImageFile(file, "image/png");
      const pngBytes = await pngBlob.arrayBuffer();
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
      page.drawImage(pngImage, { x: 0, y: 0, width: pngImage.width, height: pngImage.height });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: "application/pdf" });
  }

  async function pdfFileToImageBlobs(file, mimeType, extension){
    if (!window.pdfjsLib) throw new Error("pdf.js not loaded");
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const outputs = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++){
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

      const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.95));
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const outputName = pdf.numPages > 1
        ? `${baseName}_page${pageNum}.${extension}`
        : `${baseName}.${extension}`;
      outputs.push({ blob, outputName });
    }

    return outputs;
  }

  convertBtn.addEventListener("click", async () => {
    if (files.length === 0){
      status.textContent = "Please select at least one file first.";
      return;
    }
    if (!selectedFormat){
      status.textContent = "Please select an output format first.";
      return;
    }

    const inputIsPdf = files.every(isPdfFile);
    const outputIsPdf = selectedFormat === "application/pdf";

    convertBtn.disabled = true;
    convertBtn.textContent = "Converting...";
    let resultsCleared = false;
    function clearResultsOnce(){
      if (resultsCleared) return;
      resultsCleared = true;
      results.innerHTML = "";
    }

    startPrivacyCheck();
    try {
      if (outputIsPdf && !inputIsPdf){
        // Images -> single combined PDF (many-to-one)
        status.textContent = "Building PDF...";
        const pdfBlob = await imagesToSinglePdf(files);
        clearResultsOnce();
        downloadBlob(pdfBlob, "bcconvert-images.pdf");
        status.textContent = `Done. Created a PDF with ${files.length} pages.`;

      } else if (inputIsPdf){
        // PDF(s) -> images, one per page (one-to-many)
        const formatMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const extension = formatMap[selectedFormat] || "png";
        const allOutputs = [];

        for (const file of files){
          const pages = await pdfFileToImageBlobs(file, selectedFormat, extension);
          allOutputs.push(...pages);
        }

        const useZip = allOutputs.length > 5;
        const zip = useZip ? new JSZip() : null;
        let done = 0;

        /* Result cards render an <img> each, which forces the browser
           to lay out and decode-for-display on every single iteration
           if appended inside this loop — real, visible overhead on a
           big batch. Collecting them and rendering once after the
           loop finishes keeps that entirely off the conversion path. */
        for (const { blob, outputName } of allOutputs){
          if (useZip){
            zip.file(outputName, blob);
          } else {
            downloadBlob(blob, outputName);
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          done++;
          status.textContent = `Converting... ${done} of ${allOutputs.length}`;
        }

        clearResultsOnce();
        allOutputs.forEach(({ blob, outputName }) => {
          const resultCard = appendPreviewCard({
            src: URL.createObjectURL(blob),
            name: outputName,
            info: `${formatKB(blob.size)} • .${extension.toUpperCase()}`
          });
          addResultRemoveButton(resultCard);
        });

        if (useZip){
          status.textContent = "Building ZIP file...";
          const zipBlob = await zip.generateAsync({ type: "blob" });
          downloadBlob(zipBlob, "bcconvert-pages.zip");
          status.textContent = `Done. ZIP contains ${allOutputs.length} images.`;
        } else {
          const word = allOutputs.length === 1 ? "image" : "images";
          status.textContent = `Done. Downloaded ${allOutputs.length} ${word}.`;
        }

      } else {
        // Images -> images
        status.textContent = `Converting... 0 of ${files.length}`;
        const useZip = files.length > 5;
        const formatMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const extension = formatMap[selectedFormat] || selectedFormat.split("/")[1];
        const zip = useZip ? new JSZip() : null;
        const finishedResults = [];
        let done = 0;

        /* Same reasoning as the PDF-pages branch above: rendering a
           result card (an <img>, forced layout, decode-for-display)
           on every iteration is real overhead on a big batch. Collect
           results and render them all at once after conversion is
           actually done. */
        for (const file of files){
          const blob = await convertImageFile(file, selectedFormat);
          const outputName = file.name.replace(/\.[^.]+$/, "") + "." + extension;

          finishedResults.push({
            blob,
            outputName,
            info: `${formatKB(file.size)} → ${formatKB(blob.size)} • .${extension.toUpperCase()}`
          });

          if (useZip){
            zip.file(outputName, blob);
          } else {
            downloadBlob(blob, outputName);
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          done++;
          status.textContent = `Converting... ${done} of ${files.length}`;
        }

        clearResultsOnce();
        finishedResults.forEach(({ blob, outputName, info }) => {
          const resultCard = appendPreviewCard({
            src: URL.createObjectURL(blob),
            name: outputName,
            info
          });
          addResultRemoveButton(resultCard);
        });

        if (useZip){
          status.textContent = "Building ZIP file...";
          const zipBlob = await zip.generateAsync({ type: "blob" });
          downloadBlob(zipBlob, "bcconvert-images.zip");
          status.textContent = `Done. ZIP contains ${files.length} images.`;
        } else {
          const word = files.length === 1 ? "image" : "images";
          status.textContent = `Done. Downloaded ${files.length} ${word}.`;
        }
      }

      // Conversion succeeded — clear the source selection so the now-stale
      // "files" array can't be reconverted by clicking the button again
      // after removing a result card (result cards only remove themselves
      // from view, they never represented the source files anymore).
      files = [];
      bcDbClear(CV_DB_NAME, CV_DB_STORE);
    } catch (err){
      console.error(err);
      status.textContent = "Something went wrong during conversion.";
    } finally {
      convertBtn.disabled = files.length === 0;
      convertBtn.textContent = convertBtnIdleLabel();
      finishPrivacyCheck(document.getElementById("cvPrivacyBadge"));
    }
  });

  /* ===== "Continue where you left off" persistence ===== */
  const CV_DB_NAME = "bctools-convert";
  const CV_DB_STORE = "session";
  const continueBtn = document.getElementById("cvContinueBtn");

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
      await bcDbPut(CV_DB_NAME, CV_DB_STORE, { files: storedFiles, selectedFormat });
    } catch (err){ /* storage unavailable — skip */
    } finally { persistBusy = false; }
  }

  setInterval(() => { if (files.length) persistNow(); }, 4000);

  (async () => {
    const saved = await bcDbGet(CV_DB_NAME, CV_DB_STORE);
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
        applyPickedFiles(restored);
        if (saved.selectedFormat){
          selectedFormat = saved.selectedFormat;
          formatSelect.value = selectedFormat;
          syncDropdownTrigger(formatSelect);
          updateWhyConvertArticle();
          syncFormatPickSelection();
        }
      } catch (err){
        console.error(err);
        continueBtn.hidden = false;
      }
    });
  })();

  /* ===== URL-based format preselection =====
     SEO landing pages like /convert/png-to-jpg/ pre-highlight the
     matching input/output dropdowns so the page visibly matches what
     the visitor searched for. Parsed from the URL path, not a query
     param, so each pair can be its own crawlable static route with
     its own title/meta. */
  (function(){
    const m = location.pathname.match(/([a-z]+)-to-(jpg|png|webp|pdf)\/?$/);
    if (!m) return;
    const map = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" };
    const src = map[m[1]];
    const dst = map[m[2]];
    revealAfterDropUI();
    if (src && inputSelect.querySelector('option[value="' + src + '"]')){
      inputSelect.value = src;
      syncDropdownTrigger(inputSelect);
    }
    if (dst){
      formatSelect.value = dst;
      syncDropdownTrigger(formatSelect);
      formatSelect.dispatchEvent(new Event("change"));
    }
  })();
})();
