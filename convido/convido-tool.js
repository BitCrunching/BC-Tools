(function(){
  const drop = document.getElementById("cnDrop");
  const addTile = document.getElementById("cnAddTile");
  const input = document.getElementById("cnInput");
  const inSelect = document.getElementById("cnInSelect");
  const outSelect = document.getElementById("cnOutSelect");
  const convertBtn = document.getElementById("cnConvertBtn");
  bcRegisterKeyShortcut("d", convertBtn);
  const status = document.getElementById("cnStatus");
  const results = document.getElementById("cnResults");
  const afterDrop = document.getElementById("cnAfterDrop");
  const controls = document.getElementById("cnControls");
  const removeBtn = document.getElementById("cnRemoveBtn");
  const continueBtn = document.getElementById("cnContinueBtn");
  const toolApp = document.querySelector(".tool-app");
  const badge = document.getElementById("cnPrivacyBadge");

  bcSetupHelpBanner("convido", "cn", [
    ["WELCOME_TO_CONVIDO", "Convido converts your videos between MP4, WebM, MOV and MKV, entirely in your browser. Click, drop, or press (A) to add a video to get started."],
    ["PICK_A_FORMAT", "Choose the format you want — MP4, WebM, MOV or MKV. When the video inside already fits the new format it is just re-packed, which is nearly instant and lossless."],
    ["CHECK_BEFORE_CONVERTING", "Your videos show up below once picked — check them before converting, and remove any you don't need."],
    ["YOU_ARE_SET", "Hit the Download button (D) and each video is converted and saved in the new format. Keep this tab open while it works — a video that has to be re-encoded takes a while. Close this with the red dot and we won't show it again."]
  ]);

  const FORMATS = {
    mp4:  { label: "MP4",  ext: "mp4",  mime: "video/mp4",        output: "Mp4OutputFormat" },
    webm: { label: "WebM", ext: "webm", mime: "video/webm",       output: "WebMOutputFormat" },
    mov:  { label: "MOV",  ext: "mov",  mime: "video/quicktime",  output: "MovOutputFormat" },
    mkv:  { label: "MKV",  ext: "mkv",  mime: "video/x-matroska", output: "MkvOutputFormat" },
    avi:  { label: "AVI",  ext: "avi",  mime: "video/x-msvideo",  mux: "avi" },
    flv:  { label: "FLV",  ext: "flv",  mime: "video/x-flv",      mux: "flv" }
  };

  let entries = [];
  let formatKey = "";
  let running = false;
  let currentEntry = null;

  const mobileQuery = window.matchMedia("(max-width:768px)");
  function idleLabel(){
    return bcT(mobileQuery.matches ? "Download" : "Convert and download");
  }
  convertBtn.textContent = idleLabel();
  mobileQuery.addEventListener("change", () => { if (!running) convertBtn.textContent = idleLabel(); });

  let mbPromise = null;
  function loadMediabunny(){
    if (!mbPromise) mbPromise = import("/vendor/mediabunny.min.js");
    return mbPromise;
  }

  function sourceLabel(file){
    const m = file.name.match(/\.([^.]+)$/);
    return m ? m[1].toUpperCase() : "VIDEO";
  }

  function needsReencode(entry, mb){
    if (!formatKey || entry.info.isGif) return false;
    const target = FORMATS[formatKey];
    const fmt = target.mux ? null : new mb[target.output]();
    const v = fmt ? fmt.getSupportedVideoCodecs() : ["avc"];
    const a = fmt ? fmt.getSupportedAudioCodecs() : ["aac"];
    const info = entry.info;
    return !v.includes(info.videoCodec) || (info.hasAudio && !a.includes(info.audioCodec));
  }

  function entryNotes(entry){
    if (!entry.reencode) return [];
    return [[bcT("This video will be re-encoded."), bcT("Its video or audio doesn't fit this format as it is, so converting takes longer and quality can change slightly. Pick a format that keeps it as is for an instant, lossless result.")]];
  }

  function renderEntry(entry){
    const card = entry.card;
    const size = card.querySelector(".result-size");
    const infoBtn = card.querySelector(".cn-info-btn");
    const tip = card.querySelector(".cn-info-tooltip");
    if (!entry.info){
      infoBtn.hidden = true;
      size.innerHTML = entry.failed || !entry.probing
        ? bcFormatFileSize(entry.file.size)
        : `${bcFormatFileSize(entry.file.size)}<br>${bcT("Waiting...")}`;
      return;
    }
    const notes = entryNotes(entry);
    infoBtn.hidden = !notes.length;
    tip.innerHTML = "";
    notes.forEach(([head, body]) => {
      const p = document.createElement("p");
      const b = document.createElement("strong");
      b.textContent = head;
      p.append(b, " " + body);
      tip.appendChild(p);
    });
    infoBtn.setAttribute("aria-label", notes.map(n => n.join(" ")).join(" "));
    if (!notes.length){ tip.hidden = true; infoBtn.setAttribute("aria-expanded", "false"); }
    const original = bcFormatFileSize(entry.file.size);
    const converted = formatKey && entry.result && entry.result.key === formatKey
      ? `<br>&gt; ${bcFormatFileSize(entry.result.size)}`
      : "";
    size.innerHTML = `${bcT("Orig. size:")} ${original}${converted}`;
  }

  function refreshReencode(){
    loadMediabunny().then(mb => {
      entries.forEach(e => { if (e.info) e.reencode = needsReencode(e, mb); });
      renderAll();
    }).catch(() => renderAll());
  }

  function renderAll(){ entries.forEach(renderEntry); }

  const DOWNLOAD_MODE_TOGGLE_MIN = 5;
  const DOWNLOAD_MODE_TOGGLE_MAX = 20;
  const downloadModeToggle = document.getElementById("cnDownloadModeToggle");
  const downloadModeSingleBtn = document.getElementById("cnDownloadModeSingleBtn");
  const downloadModeZipBtn = document.getElementById("cnDownloadModeZipBtn");
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

  function renderStatus(){
    updateDownloadModeToggle(entries.length);
    if (!entries.length){ status.textContent = ""; return; }
    const n = entries.length;
    status.textContent = bcT("{0} {1} loaded", [n, n === 1 ? "file" : "files"]);
  }

  function updateButtonState(){
    convertBtn.disabled = running ? false : !(formatKey && entries.some(e => e.info));
  }

  const inField = document.getElementById("cnInField");
  const inMenu = document.getElementById("cnInMenu");
  const outMenu = document.getElementById("cnOutMenu");
  const outLabel = document.getElementById("cnOutTriggerLabel");
  inField.placeholder = bcT("Choose format");
  function syncDropdownTrigger(select){
    if (select === inSelect){
      const chosen = select.value ? inMenu.querySelector('[data-value="' + select.value + '"]') : null;
      inMenu.querySelectorAll(".bc-combo-option").forEach(o => {
        o.classList.toggle("active", o === chosen);
        o.setAttribute("aria-selected", String(o === chosen));
      });
      inField.value = chosen ? chosen.dataset.label : "";
      return;
    }
    const opt = select.value ? outMenu.querySelector('[data-value="' + select.value + '"]') : null;
    outMenu.querySelectorAll(".bc-dropdown-option").forEach(o => {
      o.classList.toggle("active", o === opt);
      o.setAttribute("aria-selected", String(o === opt));
    });
    outLabel.textContent = opt ? opt.dataset.label : bcT("Choose a format");
    outLabel.classList.toggle("is-placeholder", !opt);
  }
  bcRegisterCombo(document.getElementById("cnInTrigger"), inField, inMenu, document.getElementById("cnInEmpty"), opt => {
    inSelect.value = opt.dataset.value;
    inSelect.dispatchEvent(new Event("change"));
    syncDropdownTrigger(inSelect);
  });
  bcRegisterDropdown(document.getElementById("cnOutTrigger"), outMenu, opt => {
    outSelect.value = opt.dataset.value;
    outSelect.dispatchEvent(new Event("change"));
    syncDropdownTrigger(outSelect);
  });
  bcRegisterInfoTooltip(document.getElementById("cnInInfoBtn"), document.getElementById("cnInInfoTooltip"));

  let prevIn = inSelect.value;
  let prevOut = outSelect.value;
  function setSelect(select, value){
    select.value = value && select.querySelector('option[value="' + value + '"]') ? value : "";
    syncDropdownTrigger(select);
  }
  function onFormatsChanged(){
    prevIn = inSelect.value;
    prevOut = outSelect.value;
    formatKey = outSelect.value;
    updateButtonState();
    refreshReencode();
    schedulePersist();
  }
  outSelect.addEventListener("change", () => {
    if (outSelect.value && inSelect.value === outSelect.value) setSelect(inSelect, prevOut);
    onFormatsChanged();
  });
  inSelect.addEventListener("change", () => {
    if (inSelect.value && inSelect.value === outSelect.value) setSelect(outSelect, prevIn);
    onFormatsChanged();
  });

  const INPUT_KEYS = [...inSelect.options].map(o => o.value).filter(Boolean);
  function detectInputKey(file){
    const ext = (file.name.match(/\.([^.]+)$/) || [])[1];
    const e = ext ? ext.toLowerCase() : "";
    if (INPUT_KEYS.includes(e)) return e;
    if (file.type === "image/gif") return "gif";
    if (file.type === "video/mp4") return "mp4";
    if (file.type === "video/quicktime") return "mov";
    if (file.type === "video/webm") return "webm";
    if (file.type === "video/x-matroska") return "mkv";
    return "";
  }

  function revealAfterDropUI(){
    afterDrop.hidden = false;
    drop.hidden = true;
    addTile.hidden = false;
    controls.hidden = false;
  }

  addTile.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    addFiles(input.files);
    input.value = "";
  });

  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      if (afterDrop.hidden) input.click();
    });
    toolApp.addEventListener("dblclick", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      toolApp.classList.remove("wobble");
      void toolApp.offsetWidth;
      toolApp.classList.add("wobble");
    });
  }
  bcSetupBannerDropTarget(toolApp, {
    isInScope: e => afterDrop.hidden || addTile.contains(e.target),
    getEnterTarget: () => (afterDrop.hidden ? toolApp : addTile),
    clearTargets: [toolApp, addTile],
    onDrop: e => addFiles(e.dataTransfer.files)
  });

  const PROBE_CONCURRENCY = 5;
  async function runWithConcurrencyLimit(items, limit, worker){
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    });
    await Promise.all(runners);
  }

  const UNREADABLE_EXT = /\.(avi|flv|wmv|asf|vob|mpe?g|mpg|mod|mxf|dv|dvr|rm|rmvb|swf|cavs|ogv|ogg)$/i;
  function isVideoFile(f){
    return f.type.startsWith("video/") || isGif(f) || /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|3gp|3gpp|3g2|ogv|ts|mts|m2ts|flv|wmv|asf|vob|mod|mxf|dv|dvr|rm|rmvb|swf|cavs)$/i.test(f.name);
  }

  function isGif(f){
    return f.type === "image/gif" || /\.gif$/i.test(f.name);
  }

  async function probeGif(file){
    if (typeof ImageDecoder === "undefined") throw new Error("GIF input isn't supported by this browser.");
    const dec = new ImageDecoder({ data: file.stream(), type: "image/gif" });
    try {
      await dec.completed;
      const { image } = await dec.decode({ frameIndex: 0 });
      const info = { width: image.displayWidth, height: image.displayHeight, videoCodec: null, audioCodec: null, hasAudio: false, isGif: true };
      image.close();
      return info;
    } finally {
      dec.close();
    }
  }

  async function probe(file){
    if (isGif(file)) return probeGif(file);
    const mb = await loadMediabunny();
    const inp = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    try {
      const track = await inp.getPrimaryVideoTrack();
      if (!track) throw new Error("no video track");
      if (!(await track.canDecode())) throw new Error("undecodable");
      const audio = await inp.getPrimaryAudioTrack();
      return {
        width: track.displayWidth,
        height: track.displayHeight,
        videoCodec: track.codec,
        audioCodec: audio ? audio.codec : null,
        hasAudio: !!audio
      };
    } finally {
      inp.dispose();
    }
  }

  window.addEventListener("scroll", () => {
    document.querySelectorAll(".cn-info-tooltip:not([hidden])").forEach(t => {
      t.hidden = true;
      const b = t.closest(".cn-file-card").querySelector(".cn-info-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }, true);

  function buildCard(entry){
    const card = document.createElement("div");
    card.className = "result cn-file-card";
    card.innerHTML = `
      <div class="cn-thumb"><video muted playsinline preload="metadata"></video><button type="button" class="bc-info-btn cn-info-btn" aria-expanded="false" hidden>i</button></div>
      <div class="bc-info-tooltip cn-info-tooltip" hidden></div>
      <div class="result-name"></div>
      <div class="result-size"></div>
    `;
    card.querySelector(".result-name").textContent = entry.file.name;
    card.querySelector(".result-name").title = entry.file.name;
    const video = card.querySelector("video");
    if (isGif(entry.file)){
      const img = document.createElement("img");
      img.src = entry.objectUrl;
      img.alt = "";
      video.replaceWith(img);
    } else {
      video.src = entry.objectUrl + "#t=0.1";
    }
    const infoBtn = card.querySelector(".cn-info-btn");
    const infoTip = card.querySelector(".cn-info-tooltip");
    bcRegisterInfoTooltip(infoBtn, infoTip);
    infoBtn.addEventListener("click", () => {
      if (infoTip.hidden) return;
      const r = infoBtn.getBoundingClientRect();
      infoTip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - infoTip.offsetWidth - 8)) + "px";
      const below = r.bottom + 6;
      infoTip.style.top = (below + infoTip.offsetHeight > window.innerHeight ? Math.max(8, r.top - 6 - infoTip.offsetHeight) : below) + "px";
    });
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "cn-file-remove-btn bc-file-remove-btn";
    rm.setAttribute("aria-label", "Remove file");
    rm.title = bcT("Remove file");
    rm.textContent = "×";
    rm.addEventListener("click", () => removeEntry(entry));
    card.appendChild(rm);
    return card;
  }

  async function addFiles(fileList){
    const incoming = [...fileList];
    if (!incoming.length) return;
    continueBtn.hidden = true;
    const unreadableFormat = incoming.filter(f => UNREADABLE_EXT.test(f.name));
    const videos = incoming.filter(f => isVideoFile(f) && !UNREADABLE_EXT.test(f.name));
    const formatText = unreadableFormat.length ? bcT("{0} file(s) are in a format Convido can't read (AVI, FLV, WMV, MPG and similar) and were skipped.", [unreadableFormat.length]) : "";
    if (!videos.length){
      status.textContent = formatText || bcT("Convido only works with video files — none of the selected file(s) qualify.");
      return;
    }
    const added = videos.map(file => {
      const entry = { file, objectUrl: URL.createObjectURL(file), info: null, failed: false, result: null, probing: true, reencode: false };
      entry.card = buildCard(entry);
      results.appendChild(entry.card);
      entries.push(entry);
      return entry;
    });
    revealAfterDropUI();
    renderStatus();
    renderAll();
    updateButtonState();
    const skipped = incoming.length - videos.length - unreadableFormat.length;
    const skippedText = [formatText, skipped ? bcT("{0} file(s) weren't a video and were skipped.", [skipped]) : ""].filter(Boolean).join(" ");
    if (skippedText) status.textContent += " " + skippedText;
    await runWithConcurrencyLimit(added, PROBE_CONCURRENCY, async entry => {
      try {
        entry.info = await probe(entry.file);
        const mb = await loadMediabunny();
        entry.reencode = needsReencode(entry, mb);
        if (!inSelect.value){
          const detected = detectInputKey(entry.file);
          if (detected){ setSelect(inSelect, detected); prevIn = detected; }
        }
      } catch (err){
        console.error(err);
        entry.failed = true;
        entry.card.classList.add("cn-file-card-error");
        entry.card.title = bcT("Couldn't read \"{0}\" — it may not be a valid or supported video file.", [entry.file.name]);
      }
      entry.probing = false;
      renderEntry(entry);
      updateButtonState();
    });
    const unreadable = added.filter(e => e.failed);
    if (unreadable.length || skippedText){
      const parts = [];
      if (unreadable.length === 1) parts.push(bcT("Couldn't read {0}. Make sure it's a valid video file.", [unreadable[0].file.name]));
      else if (unreadable.length) parts.push(bcT("Couldn't read {0} files — they may be corrupted or not a supported video format.", [unreadable.length]));
      if (skippedText) parts.push(skippedText);
      status.textContent = parts.join(" ");
    }
    schedulePersist();
  }

  function removeEntry(entry){
    if (entry === currentEntry && entry.conversion) entry.conversion.cancel().catch(() => {});
    URL.revokeObjectURL(entry.objectUrl);
    entry.card.remove();
    entries = entries.filter(e => e !== entry);
    if (!entries.length){ resetTool(); return; }
    renderStatus();
    updateButtonState();
    schedulePersist();
  }

  function resetTool(){
    if (running) requestCancel();
    entries.forEach(e => URL.revokeObjectURL(e.objectUrl));
    entries = [];
    results.querySelectorAll(".result").forEach(el => el.remove());
    afterDrop.hidden = true;
    drop.hidden = false;
    addTile.hidden = true;
    controls.hidden = true;
    updateDownloadModeToggle(0);
    setSelect(inSelect, "");
    setSelect(outSelect, "");
    formatKey = "";
    prevIn = "";
    prevOut = "";
    status.textContent = "";
    convertBtn.disabled = true;
    convertBtn.textContent = idleLabel();
    bcDbClear(CN_DB_NAME, CN_DB_STORE);
  }
  removeBtn.addEventListener("click", resetTool);

  async function convertEntry(entry){
    const fmt = FORMATS[formatKey];
    if (entry.result && entry.result.key === formatKey && entry.result.blob) return entry.result;
    const mb = await loadMediabunny();
    entry.card.classList.remove("cn-file-card-error");
    entry.card.removeAttribute("title");

    if (fmt.mux) return convertMuxed(entry, fmt, mb);
    if (entry.info.isGif) return storeResult(entry, fmt, await encodeGif(entry, fmt, mb));

    const inp = new mb.Input({ source: new mb.BlobSource(entry.file), formats: mb.ALL_FORMATS });
    const output = new mb.Output({ format: new mb[fmt.output](), target: new mb.BufferTarget() });

    try {
      const conversion = await mb.Conversion.init({ input: inp, output, showWarnings: false });
      entry.conversion = conversion;
      if (!conversion.isValid) throw new Error("This video can't be converted in your browser.");
      await conversion.execute();
      return storeResult(entry, fmt, output.target.buffer);
    } finally {
      entry.conversion = null;
      inp.dispose();
    }
  }

  function storeResult(entry, fmt, buffer){
    const base = entry.file.name.replace(/\.[^.]+$/, "") || "video";
    const same = sourceLabel(entry.file).toLowerCase() === fmt.ext;
    const blob = buffer instanceof Blob ? buffer : new Blob([buffer], { type: fmt.mime });
    if (lastResultEntry && lastResultEntry !== entry && lastResultEntry.result) lastResultEntry.result.blob = null;
    lastResultEntry = entry;
    entry.result = { key: formatKey, blob, size: blob.size, name: `${base}${same ? "-converted" : ""}.${fmt.ext}` };
    return entry.result;
  }

  async function convertMuxed(entry, fmt, mb){
    let buffer;
    if (entry.info.isGif){
      buffer = await encodeGif(entry, FORMATS.mp4, mb);
    } else {
      const inp = new mb.Input({ source: new mb.BlobSource(entry.file), formats: mb.ALL_FORMATS });
      const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
      try {
        const conversion = await mb.Conversion.init({ input: inp, output, video: { codec: "avc" }, audio: { codec: "aac", bitrate: 128000 }, showWarnings: false });
        entry.conversion = conversion;
        if (!conversion.isValid) throw new Error("This video can't be converted in your browser.");
        await conversion.execute();
        buffer = output.target.buffer;
      } finally {
        entry.conversion = null;
        inp.dispose();
      }
    }
    const parts = await ConvidoMux.collect(mb, buffer);
    return storeResult(entry, fmt, fmt.mux === "flv" ? ConvidoMux.buildFlv(parts) : ConvidoMux.buildAvi(parts));
  }

  async function encodeGif(entry, fmt, mb){
    const codec = fmt.ext === "webm" ? "vp9" : "avc";
    const pad = codec === "avc" ? 1 : 0;
    const w = entry.info.width + (entry.info.width % 2) * pad;
    const h = entry.info.height + (entry.info.height % 2) * pad;
    if (!(await mb.canEncodeVideo(codec, { width: w, height: h }))) throw new Error("This GIF is too large to encode in your browser.");
    const output = new mb.Output({ format: new mb[fmt.output](), target: new mb.BufferTarget() });
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    const source = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_HIGH });
    output.addVideoTrack(source);
    await output.start();
    const dec = new ImageDecoder({ data: entry.file.stream(), type: "image/gif" });
    entry.gifCancel = false;
    entry.conversion = { cancel: async () => { entry.gifCancel = true; } };
    try {
      await dec.completed;
      const count = dec.tracks.selectedTrack.frameCount;
      let t = 0;
      for (let i = 0; i < count; i++){
        if (entry.gifCancel){
          await output.cancel();
          throw new Error("Canceled");
        }
        const { image } = await dec.decode({ frameIndex: i });
        const dur = image.duration > 20000 ? image.duration / 1e6 : 0.1;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(image, 0, 0);
        image.close();
        await source.add(t, dur);
        t += dur;
      }
      source.close();
      await output.finalize();
      return output.target.buffer;
    } finally {
      entry.conversion = null;
      dec.close();
    }
  }

  let cancelRequested = false;
  let lastResultEntry = null;
  function requestCancel(){
    cancelRequested = true;
    if (currentEntry && currentEntry.conversion) currentEntry.conversion.cancel().catch(() => {});
  }

  async function convertAll(){
    const queue = entries.filter(e => e.info);
    if (!queue.length) return;
    running = true;
    cancelRequested = false;
    startPrivacyCheck();
    let done = 0, failed = 0;
    const useZip = effectiveUseZip(queue.length);
    const zip = useZip ? new JSZip() : null;
    convertBtn.classList.add("cn-convert-btn-working");
    for (const entry of queue){
      if (cancelRequested) break;
      if (!entries.includes(entry)) continue;
      currentEntry = entry;
      convertBtn.textContent = bcT("Cancel");
      status.textContent = bcT("Converting {0}…", [entry.file.name]);
      try {
        const result = await convertEntry(entry);
        if (useZip) zip.file(result.name, result.blob);
        else {
          downloadBlob(result.blob, result.name);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        done++;
        renderEntry(entry);
      } catch (err){
        const canceled = err && /cancel/i.test(err.name || err.message || "");
        if (cancelRequested) break;
        if (canceled) continue;
        console.error(err);
        failed++;
        entry.card.classList.add("cn-file-card-error");
        entry.card.title = bcT("Couldn't convert \"{0}\".", [entry.file.name]) + `\n(${err.message || err})`;
      }
    }
    if (useZip && done && !cancelRequested){
      status.textContent = bcT("Building ZIP file...");
      downloadBlob(await zip.generateAsync({ type: "blob" }), "bcconvido-videos.zip");
    }
    currentEntry = null;
    running = false;
    convertBtn.classList.remove("cn-convert-btn-working");
    convertBtn.textContent = idleLabel();
    finishPrivacyCheck(badge);
    updateButtonState();
    if (!entries.length){ status.textContent = ""; return; }
    if (cancelRequested){ status.textContent = bcT("Canceled."); return; }
    if (failed && !done) status.textContent = failed === 1 && queue.length === 1
      ? bcT("Couldn't convert {0}. Try another format.", [queue[0].file.name])
      : bcT("Couldn't convert {0} files. Try another format.", [failed]);
    else if (failed) status.textContent = bcT("Done — {0} converted, {1} couldn't be converted.", [done, failed]);
    else if (done) status.textContent = done === 1 && queue.length === 1
      ? bcT("Done — {0} saved.", [queue[0].result.name])
      : bcT("Done — {0} videos converted.", [done]);
  }

  convertBtn.addEventListener("click", () => {
    if (running){ requestCancel(); return; }
    convertAll();
  });

  const CN_DB_NAME = "bctools-convido";
  const CN_DB_STORE = "session";
  const PERSIST_MAX_BYTES = 300 * 1024 * 1024;
  let persistTimer = null;
  let persistBusy = false;
  function schedulePersist(){
    if (!entries.length) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 600);
  }
  async function persistNow(){
    if (!entries.length || persistBusy) return;
    if (entries.reduce((n, e) => n + e.file.size, 0) > PERSIST_MAX_BYTES) return;
    persistBusy = true;
    try {
      const files = await Promise.all(entries.map(async e => ({
        name: e.file.name, type: e.file.type, bytes: await e.file.arrayBuffer()
      })));
      await bcDbPut(CN_DB_NAME, CN_DB_STORE, { files, formatKey, inKey: inSelect.value });
    } catch (err){
    } finally { persistBusy = false; }
  }

  (async () => {
    const saved = await bcDbGet(CN_DB_NAME, CN_DB_STORE);
    if (!saved || !saved.files || !saved.files.length) return;
    if (entries.length) return;
    continueBtn.hidden = false;
    continueBtn.addEventListener("click", () => {
      continueBtn.hidden = true;
      try {
        if (saved.inKey && INPUT_KEYS.includes(saved.inKey)) setSelect(inSelect, saved.inKey);
        if (saved.formatKey && FORMATS[saved.formatKey]){
          setSelect(outSelect, saved.formatKey);
          formatKey = saved.formatKey;
        }
        prevIn = inSelect.value;
        prevOut = outSelect.value;
        addFiles(saved.files.map(f => new File([f.bytes], f.name, { type: f.type })));
      } catch (err){
        continueBtn.hidden = false;
      }
    });
  })();
})();
