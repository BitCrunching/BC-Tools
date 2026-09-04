/* ===== COLORFY TOOL (pick a color from any pixel in an image) ===== */
(function(){
  const drop = document.getElementById("cyDrop");
  const input = document.getElementById("cyInput");
  const afterDrop = document.getElementById("cyAfterDrop");
  const frame = document.getElementById("cyFrame");
  const canvas = document.getElementById("cyCanvas");
  const addBtn = document.getElementById("cyAddBtn");
  const pickerList = document.getElementById("cyPickerList");
  const palette = document.getElementById("cyPalette");
  const paletteList = document.getElementById("cyPaletteList");
  const formatTrigger = document.getElementById("cyFormatTrigger");
  const formatTriggerLabel = document.getElementById("cyFormatTriggerLabel");
  const formatMenu = document.getElementById("cyFormatMenu");
  const removeBtn = document.getElementById("cyRemoveBtn");
  const resizeHandle = document.getElementById("cyResizeHandle");
  const status = document.getElementById("cyStatus");
  const toolApp = document.querySelector(".tool-app");
  const copyTerminal = document.getElementById("cyCopyTerminal");
  const copyTerminalText = document.getElementById("cyCopyTerminalText");
  let copyTerminalTimer = null;
  if (!drop || !input || !afterDrop || !canvas || !pickerList) return;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let currentFile = null;
  let currentFormat = "hex";
  const FRAME_WIDTH_MIN = 240;
  const FRAME_WIDTH_MAX = 800;

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("colorfy", "cy", [
    ["WELCOME_TO_COLORFY", "Colorfy reads the exact color of any pixel in an image. Click or drop an image below to get started."],
    ["A_PIXEL_IS_PICKED_FOR_YOU", "Two spots are sampled automatically as soon as you drop an image — drag either ring, or just click anywhere on the image, to sample a different spot."],
    ["ADD_MORE_PICKERS", "Hit the + in the corner to add up to 4 pickers at once, each with its own row below — handy for comparing a few spots side by side."],
    ["READ_THE_CODE", "The swatch and the code below update live as you move a picker. Switch between HEX, RGB, HSB, and HSL from the dropdown, and click any code to copy it."],
    ["YOU_ARE_SET", "Drop a new image any time to start over. Close this with the red dot and we won't show it again."]
  ]);

  function isImageFile(f){
    return f && f.type.startsWith("image/");
  }

  function revealAfterDropUI(){
    afterDrop.hidden = false;
    drop.classList.add("tool-drop-revealed");
  }

  /* ===== pickers ===== each is { id, fracX, fracY, el, rgb }. fracX/
     fracY are 0-1 fractions of the canvas (not pixel coordinates), so
     a picker's position stays correct regardless of how large the
     canvas is rendered (CSS width:100%, resizable) versus its real
     pixel dimensions, which is what getImageData actually needs. */
  const MAX_PICKERS = 4;
  /* Rule-of-thirds points, ordered so the first two (used for the two
     pickers every image starts with) sit diagonally opposite each
     other rather than clustered near the same corner. */
  const DEFAULT_FRACS = [[1 / 3, 1 / 3], [2 / 3, 2 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3]];
  let pickers = [];
  let activePicker = null;
  let nextPickerId = 1;

  function clampInt(v, size){
    return Math.min(size - 1, Math.max(0, v));
  }

  function updatePickerPosition(p){
    const rect = canvas.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    p.el.style.left = (rect.left - frameRect.left + p.fracX * rect.width) + "px";
    p.el.style.top = (rect.top - frameRect.top + p.fracY * rect.height) + "px";
  }
  function updateAllPickerPositions(){
    pickers.forEach(updatePickerPosition);
  }

  function sampleColor(p){
    if (!canvas.width || !canvas.height) return;
    const px = clampInt(Math.round(p.fracX * canvas.width), canvas.width);
    const py = clampInt(Math.round(p.fracY * canvas.height), canvas.height);
    let data;
    try {
      data = ctx.getImageData(px, py, 1, 1).data;
    } catch (err){
      /* Cross-origin canvases throw on read — shouldn't happen here
         since files only ever come from a local blob URL, but fail
         quietly rather than breaking the picker if it ever does. */
      return;
    }
    p.rgb = [data[0], data[1], data[2]];
    renderList();
  }

  function setFracFromClientPoint(p, clientX, clientY){
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    p.fracX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    p.fracY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    updatePickerPosition(p);
    sampleColor(p);
  }

  function wirePicker(p){
    let dragging = false;
    p.el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      activePicker = p;
      try { p.el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    p.el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      setFracFromClientPoint(p, e.clientX, e.clientY);
    });
    function endDrag(e){
      dragging = false;
      try { p.el.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    p.el.addEventListener("pointerup", endDrag);
    p.el.addEventListener("pointercancel", endDrag);

    /* Keyboard nudge — each picker is a role="slider", arrow keys move
       it by a single source pixel per press. */
    p.el.addEventListener("keydown", (e) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      activePicker = p;
      if (!canvas.width || !canvas.height) return;
      const stepX = 1 / canvas.width;
      const stepY = 1 / canvas.height;
      if (e.key === "ArrowUp") p.fracY = Math.max(0, p.fracY - stepY);
      if (e.key === "ArrowDown") p.fracY = Math.min(1, p.fracY + stepY);
      if (e.key === "ArrowLeft") p.fracX = Math.max(0, p.fracX - stepX);
      if (e.key === "ArrowRight") p.fracX = Math.min(1, p.fracX + stepX);
      updatePickerPosition(p);
      sampleColor(p);
    });
  }

  function renumberPickers(){
    pickers.forEach((p, i) => {
      const label = "Sampled pixel " + (i + 1);
      p.el.setAttribute("aria-label", label);
      p.el.querySelector(".colorfy-picker-num").textContent = String(i + 1);
    });
  }

  function updateAddBtnState(){
    /* Hidden outright rather than just disabled once the cap is hit —
       a greyed-out button invites a click to see what happens; with
       nothing left to add, there's nothing useful for it to do. */
    addBtn.hidden = pickers.length >= MAX_PICKERS;
  }

  function addPicker(fracX, fracY){
    if (pickers.length >= MAX_PICKERS) return null;
    const el = document.createElement("span");
    el.className = "colorfy-picker";
    el.setAttribute("role", "slider");
    el.tabIndex = 0;
    const numEl = document.createElement("span");
    numEl.className = "colorfy-picker-num";
    el.appendChild(numEl);
    frame.appendChild(el);

    const p = { id: nextPickerId++, fracX, fracY, el, rgb: [0, 0, 0] };
    wirePicker(p);
    pickers.push(p);
    activePicker = p;
    renumberPickers();
    updateAddBtnState();
    updatePickerPosition(p);
    sampleColor(p);
    return p;
  }

  function removePicker(id){
    if (pickers.length <= 1) return;
    const idx = pickers.findIndex(p => p.id === id);
    if (idx === -1) return;
    pickers[idx].el.remove();
    const wasActive = activePicker && activePicker.id === id;
    pickers.splice(idx, 1);
    if (wasActive) activePicker = pickers[0];
    renumberPickers();
    updateAddBtnState();
    renderList();
  }

  function clearPickers(){
    pickers.forEach(p => p.el.remove());
    pickers = [];
    activePicker = null;
  }

  addBtn.addEventListener("click", () => {
    const [fx, fy] = DEFAULT_FRACS[pickers.length] || [0.5, 0.5];
    addPicker(fx, fy);
  });

  function resetTool(){
    currentFile = null;
    afterDrop.hidden = true;
    drop.classList.remove("tool-drop-revealed");
    input.value = "";
    status.textContent = "";
    clearPickers();
    pickerList.innerHTML = "";
  }
  removeBtn.addEventListener("click", resetTool);

  function setFile(file){
    if (!isImageFile(file)){
      status.textContent = "Please pick an image file.";
      return;
    }
    currentFile = file;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      revealAfterDropUI();
      clearPickers();
      /* Two pickers by default, at diagonally opposite rule-of-thirds
         points rather than both starting near the center — spread
         apart like this, they land on two different parts of the
         image (and so, in practice, two different colors) far more
         reliably than two nearby default positions would. */
      addPicker(DEFAULT_FRACS[0][0], DEFAULT_FRACS[0][1]);
      addPicker(DEFAULT_FRACS[1][0], DEFAULT_FRACS[1][1]);
      status.textContent = "";
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      status.textContent = "Couldn't read that image — it may be corrupted or an unsupported format.";
    };
    img.src = url;
  }

  input.addEventListener("change", (e) => setFile(e.target.files[0]));

  /* Same whole-banner drop target every tool uses — before an image is
     picked, #cyDrop is just the dashed visual cue, not the actual
     click/drag scope: the entire .tool-app banner opens the picker and
     accepts a drag/drop. isDragEventInScope() flips the moment an
     image loads and #cyDrop is hidden, so it never fights the color
     picker once there's real content to interact with. */
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input, canvas")) return;
      if (afterDrop.hidden || drop.contains(e.target)){
        input.click();
      }
    });

    toolApp.addEventListener("dblclick", e => {
      if (e.target.closest("button, select, a, label, input, canvas")) return;
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
    onDrop: e => setFile(e.dataTransfer.files[0])
  });

  function componentToHex(c){
    return c.toString(16).padStart(2, "0");
  }

  /* ===== RGB -> HSB/HSL — standard conversions, both returned as
     integer degrees/percentages (the form every design tool displays
     them in) rather than the raw 0-1 fractions the math produces. */
  function rgbToHsb(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h;
    if (d === 0) h = 0;
    else if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : d / max;
    return [Math.round(h), Math.round(s * 100), Math.round(max * 100)];
  }
  function rgbToHsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    const d = max - min;
    if (d !== 0){
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }

  function formatColor(rgb){
    const [r, g, b] = rgb;
    if (currentFormat === "hex"){
      return ("#" + componentToHex(r) + componentToHex(g) + componentToHex(b)).toUpperCase();
    }
    if (currentFormat === "rgb"){
      return `rgb(${r}, ${g}, ${b})`;
    }
    if (currentFormat === "hsb"){
      const [h, s, v] = rgbToHsb(r, g, b);
      return `hsb(${h}, ${s}%, ${v}%)`;
    }
    const [h, s, l] = rgbToHsl(r, g, b);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  /* Rebuilds the whole list on every color/format change — cheap
     enough at up to 4 rows, and simpler than patching individual rows
     in place. */
  function renderList(){
    pickerList.innerHTML = "";
    pickers.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "colorfy-picker-row";

      const sw = document.createElement("span");
      sw.className = "colorfy-swatch";
      sw.style.background = `rgb(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]})`;
      row.appendChild(sw);

      const codeBtn = document.createElement("button");
      codeBtn.type = "button";
      codeBtn.className = "colorfy-code-btn";
      codeBtn.title = "Click to copy";
      const text = formatColor(p.rgb);
      codeBtn.textContent = text;
      codeBtn.dataset.value = text;
      codeBtn.addEventListener("click", () => copyCode(codeBtn));
      row.appendChild(codeBtn);

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "colorfy-save-btn";
      saveBtn.textContent = "Save";
      saveBtn.title = "Save this color to your palette";
      saveBtn.addEventListener("click", () => saveToPalette(p.rgb, saveBtn));
      row.appendChild(saveBtn);

      if (pickers.length > 1){
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "colorfy-picker-remove-btn bc-remove-btn";
        rm.setAttribute("aria-label", "Remove picker " + (i + 1));
        rm.textContent = "×";
        rm.addEventListener("click", () => removePicker(p.id));
        row.appendChild(rm);
      }

      pickerList.appendChild(row);
    });
  }

  /* ===== saved palette ===== outlives the current image on purpose —
     stored in localStorage (a handful of RGB triples, not image
     bytes) rather than reset alongside the pickers whenever a new
     file loads or the current one is removed. */
  const PALETTE_STORAGE_KEY = "bc-colorfy-palette";
  let savedColors = [];
  let nextSavedId = 1;

  function loadPalette(){
    try {
      const raw = localStorage.getItem(PALETTE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)){
        savedColors = parsed.filter(c => c && Array.isArray(c.rgb));
        savedColors.forEach(c => { c.id = nextSavedId++; });
      }
    } catch (err){
      /* corrupted or storage unavailable — start with an empty palette */
    }
  }
  function persistPalette(){
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(savedColors.map(c => ({ rgb: c.rgb }))));
    } catch (err){
      /* storage unavailable — palette just won't survive a reload */
    }
  }

  function renderPalette(){
    palette.hidden = savedColors.length === 0;
    paletteList.innerHTML = "";
    savedColors.forEach(c => {
      const chip = document.createElement("div");
      chip.className = "colorfy-palette-chip";

      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "colorfy-palette-swatch";
      sw.style.background = `rgb(${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})`;
      sw.title = formatColor(c.rgb) + " — click to copy";
      sw.addEventListener("click", () => copySwatch(sw, c.rgb));
      chip.appendChild(sw);

      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "colorfy-palette-remove-btn bc-remove-btn";
      rm.setAttribute("aria-label", "Remove saved color");
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        savedColors = savedColors.filter(sc => sc.id !== c.id);
        persistPalette();
        renderPalette();
      });
      chip.appendChild(rm);

      paletteList.appendChild(chip);
    });
  }

  function saveToPalette(rgb, btn){
    savedColors.push({ id: nextSavedId++, rgb: [...rgb] });
    persistPalette();
    renderPalette();
    if (btn){
      const original = btn.textContent;
      btn.textContent = "Saved!";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1000);
    }
  }

  function copySwatch(sw, rgb){
    const value = formatColor(rgb);
    navigator.clipboard.writeText(value).then(() => {
      sw.classList.add("copied");
      setTimeout(() => sw.classList.remove("copied"), 1000);
      if (copyTerminal && copyTerminalText){
        copyTerminalText.textContent = `copied ${value}`;
        copyTerminal.classList.add("show");
        clearTimeout(copyTerminalTimer);
        copyTerminalTimer = setTimeout(() => copyTerminal.classList.remove("show"), 1600);
      }
    }).catch(() => {
      status.textContent = "Couldn't copy — your browser may not allow clipboard access here.";
    });
  }

  loadPalette();
  renderPalette();

  /* ===== format dropdown (HEX/RGB/HSB/HSL) — applies to every
     picker's code at once. ===== Now shared/site.js's bcRegisterDropdown
     (used to be hand-rolled inline listeners duplicating that same
     open/close/select logic). */
  bcRegisterDropdown(formatTrigger, formatMenu, (opt) => {
    currentFormat = opt.dataset.format;
    formatTriggerLabel.textContent = opt.dataset.label;
    renderList();
  });

  /* Click-to-place — clicking anywhere on the image jumps the active
     picker (the one most recently clicked or dragged) there directly,
     a faster alternative to dragging it over. */
  canvas.addEventListener("click", (e) => {
    if (!activePicker) return;
    setFracFromClientPoint(activePicker, e.clientX, e.clientY);
  });

  /* ===== drag-to-resize the preview (display size only — the canvas
     keeps sampling at the image's real pixel resolution regardless of
     how large or small it's rendered). Same incremental-delta pattern
     as Congify's output-frame handle: track a virtual width across the
     whole drag rather than re-deriving it from the frame's current
     rendered width each move, so repeated small movements don't drift
     from rounding. */
  if (resizeHandle){
    let resizing = false;
    let resizeLastX = 0;
    let resizeVirtualWidth = 0;

    function frameWidthMax(){
      /* Measured against the banner itself (stable), not the frame's
         own current width — 36px is .tool-app's own padding on each
         side. There's no extra wrapping panel to account for now that
         the frame sits directly in the banner. */
      const containerMax = toolApp.getBoundingClientRect().width - (36 * 2);
      return Math.min(FRAME_WIDTH_MAX, containerMax);
    }

    resizeHandle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      resizeLastX = e.clientX;
      resizeVirtualWidth = frame.getBoundingClientRect().width;
      try { resizeHandle.setPointerCapture(e.pointerId); } catch (err) {}
    });
    resizeHandle.addEventListener("pointermove", (e) => {
      if (!resizing) return;
      resizeVirtualWidth = Math.min(frameWidthMax(), Math.max(FRAME_WIDTH_MIN, resizeVirtualWidth + (e.clientX - resizeLastX)));
      resizeLastX = e.clientX;
      frame.style.width = Math.round(resizeVirtualWidth) + "px";
      updateAllPickerPositions();
    });
    function endResize(e){
      resizing = false;
      try { resizeHandle.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    resizeHandle.addEventListener("pointerup", endResize);
    resizeHandle.addEventListener("pointercancel", endResize);

    /* Keyboard equivalent — role="slider", left/right resize by 20px
       a step (same as arrow-up/down would on a vertical handle). */
    resizeHandle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const current = frame.getBoundingClientRect().width;
      const next = e.key === "ArrowRight" ? current + 20 : current - 20;
      frame.style.width = Math.round(Math.min(frameWidthMax(), Math.max(FRAME_WIDTH_MIN, next))) + "px";
      updateAllPickerPositions();
    });
  }

  /* Keeps every marker aligned with the canvas across reflows — the
     canvas is width:100% of its frame, so its rendered size (and thus
     each marker's pixel position) changes with viewport width. */
  window.addEventListener("resize", () => {
    if (!afterDrop.hidden) updateAllPickerPositions();
  });

  /* ===== copy a code to clipboard ===== */
  function copyCode(btn){
    const value = btn.dataset.value;
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      btn.classList.add("copied");
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.textContent = original;
      }, 1200);
    }).catch(() => {
      status.textContent = "Couldn't copy — your browser may not allow clipboard access here.";
    });
  }
})();
