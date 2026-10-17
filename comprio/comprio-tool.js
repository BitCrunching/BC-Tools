(function(){
  const drop = document.getElementById("crDrop");
  const addTile = document.getElementById("crAddTile");
  const input = document.getElementById("crInput");
  const levelButtons = [...document.querySelectorAll("#crLevelButtons .tool-format-btn")];
  const compressBtn = document.getElementById("crCompressBtn");
  bcRegisterKeyShortcut("d", compressBtn);
  const status = document.getElementById("crStatus");
  const results = document.getElementById("crResults");
  const selectedCompression = document.getElementById("crSelectedCompression");
  const afterDrop = document.getElementById("crAfterDrop");
  const controls = document.getElementById("crControls");
  const removeBtn = document.getElementById("crRemoveBtn");
  const continueBtn = document.getElementById("crContinueBtn");
  const toolApp = document.querySelector(".tool-app");
  const badge = document.getElementById("crPrivacyBadge");

  bcSetupHelpBanner("comprio", "cr", [
    ["WELCOME_TO_COMPRESSION", "Comprio shrinks your videos' file size — MP4, MOV, WebM and more, entirely in your browser. Click, drop, or press (A) to add a video to get started."],
    ["PICK_A_LEVEL", "Choose Low, Medium, or High — each shows an estimate of the resulting file size before you commit. Optionally scale the video down to 1080p, 720p or 480p for an even smaller file."],
    ["CHECK_BEFORE_COMPRESSING", "Your videos show up below once picked — check them before compressing, and remove any you don't need."],
    ["YOU_ARE_SET", "Hit the Download button (D) and each video is compressed and saved as an MP4. Keep this tab open while it works — a long video takes a while. Close this with the red dot and we won't show it again."]
  ]);

  /* bits per pixel per frame — what H.264 needs to look right at each level */
  const LEVELS = {
    low:    { bpp: .11,  audio: 160000 },
    medium: { bpp: .065, audio: 128000 },
    high:   { bpp: .035, audio: 96000 }
  };
  const MIN_VIDEO_BITRATE = 150000;

  let entries = [];
  let levelKey = "medium";
  let targetHeight = 0;
  let running = false;
  let currentEntry = null;

  const mobileQuery = window.matchMedia("(max-width:768px)");
  function idleLabel(){
    return bcT(mobileQuery.matches ? "Download" : "Compress and download");
  }
  compressBtn.textContent = idleLabel();
  mobileQuery.addEventListener("change", () => { if (!running) compressBtn.textContent = idleLabel(); });

  let mbPromise = null;
  function loadMediabunny(){
    if (!mbPromise) mbPromise = import("/vendor/mediabunny.min.js");
    return mbPromise;
  }

  function even(n){ return Math.max(2, Math.round(n / 2) * 2); }

  function plan(entry){
    const info = entry.info;
    if (!info) return null;
    let w = info.width, h = info.height;
    const short = Math.min(w, h);
    if (targetHeight && short > targetHeight){
      const k = targetHeight / short;
      w = even(w * k);
      h = even(h * k);
    }
    const lvl = LEVELS[levelKey];
    const fps = Math.min(info.fps || 30, 60);
    let vbr = w * h * fps * lvl.bpp;
    if (info.videoBitrate) vbr = Math.min(vbr, info.videoBitrate * .9);
    vbr = Math.max(MIN_VIDEO_BITRATE, Math.round(vbr));
    const abr = info.hasAudio ? lvl.audio : 0;
    const bytes = Math.round((vbr + abr) * info.duration / 8);
    return { width: w, height: h, resized: w !== even(info.width) || h !== even(info.height), videoBitrate: vbr, audioBitrate: abr, bytes };
  }

  function renderEntry(entry){
    const card = entry.card;
    const meta = card.querySelector(".cr-card-meta");
    const size = card.querySelector(".result-size");
    if (!entry.info){
      meta.textContent = "";
      size.innerHTML = entry.failed || !entry.probing
        ? bcFormatFileSize(entry.file.size)
        : `${bcFormatFileSize(entry.file.size)}<br>${bcT("Waiting...")}`;
      return;
    }
    meta.textContent = `${entry.info.width}×${entry.info.height}`;
    const original = bcFormatFileSize(entry.file.size);
    const line = (bytes, approx) => {
      const pct = Math.max(0, Math.round((1 - bytes / entry.file.size) * 100));
      size.innerHTML = `${original} &gt; ${approx ? "~" : ""}${bcFormatFileSize(bytes)}<br>(-${pct}%)`;
    };
    if (entry.result && entry.result.key === settingsKey()){
      line(entry.result.blob.size, false);
      return;
    }
    const p = plan(entry);
    if (p) line(Math.min(p.bytes, entry.file.size), true);
    else size.textContent = original;
  }

  function renderAll(){ entries.forEach(renderEntry); }

  function settingsKey(){ return levelKey + "|" + targetHeight; }

  function renderStatus(){
    if (!entries.length){ status.textContent = ""; return; }
    const n = entries.length;
    status.textContent = bcT("{0} {1} loaded", [n, n === 1 ? "file" : "files"]);
  }

  function updateButtonState(){
    compressBtn.disabled = running ? false : !entries.some(e => e.info);
  }

  function applyLevel(key){
    levelKey = key;
    levelButtons.forEach(b => b.classList.toggle("active", b.dataset.levelKey === key));
    const btn = levelButtons.find(b => b.dataset.levelKey === key);
    selectedCompression.textContent = bcT("Compression level: {0}", [btn.dataset.label]);
    renderAll();
    schedulePersist();
  }
  levelButtons.forEach(btn => btn.addEventListener("click", () => {
    applyLevel(btn.dataset.levelKey);
    const i = LEVEL_OPTIONS.findIndex(o => o.levelKey === btn.dataset.levelKey);
    if (levelOptionChangeControl && i !== -1) levelOptionChangeControl.setIndex(i);
  }));

  const LEVEL_OPTIONS = levelButtons.map(b => ({ levelKey: b.dataset.levelKey, label: b.dataset.label }));
  const levelOptionChangeBtn = document.getElementById("crLevelOptionChangeBtn");
  const levelOptionChangeControl = levelOptionChangeBtn
    ? bcRegisterOptionChangeBtn(levelOptionChangeBtn, LEVEL_OPTIONS, opt => {
        applyLevel(opt.levelKey);
      }, 1)
    : null;

  const sizeTrigger = document.getElementById("crSizeTrigger");
  const sizeTriggerLabel = document.getElementById("crSizeTriggerLabel");
  const sizeMenu = document.getElementById("crSizeMenu");
  bcRegisterDropdown(sizeTrigger, sizeMenu, opt => {
    targetHeight = parseInt(opt.dataset.height, 10) || 0;
    sizeTriggerLabel.textContent = bcT(opt.dataset.label);
    renderAll();
    schedulePersist();
  });
  bcSetDropdownActive(sizeMenu, sizeMenu.querySelector('[data-height="0"]'));

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

  function isVideoFile(f){
    return f.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|3gp|ogv|ts|mts|m2ts)$/i.test(f.name);
  }

  async function probe(file){
    const mb = await loadMediabunny();
    const inp = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    try {
      const track = await inp.getPrimaryVideoTrack();
      if (!track) throw new Error("no video track");
      if (!(await track.canDecode())) throw new Error("undecodable");
      const [duration, stats, audio] = await Promise.all([
        inp.computeDuration(),
        track.computePacketStats(150),
        inp.getPrimaryAudioTrack()
      ]);
      return {
        width: track.displayWidth,
        height: track.displayHeight,
        duration,
        fps: stats.averagePacketRate || 30,
        videoBitrate: stats.averageBitrate || 0,
        hasAudio: !!audio
      };
    } finally {
      inp.dispose();
    }
  }

  function buildCard(entry){
    const card = document.createElement("div");
    card.className = "result cr-file-card";
    card.innerHTML = `
      <div class="cr-thumb"><video muted playsinline preload="metadata"></video><div class="cr-card-meta"></div><div class="cr-progress"><div class="cr-progress-bar"></div></div></div>
      <div class="result-name"></div>
      <div class="result-size"></div>
    `;
    card.querySelector(".result-name").textContent = entry.file.name;
    card.querySelector(".result-name").title = entry.file.name;
    const video = card.querySelector("video");
    video.src = entry.objectUrl + "#t=0.1";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "cr-file-remove-btn bc-file-remove-btn";
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
    const videos = incoming.filter(isVideoFile);
    if (!videos.length){
      status.textContent = bcT("Comprio only works with video files — none of the selected file(s) qualify.");
      return;
    }
    const added = videos.map(file => {
      const entry = { file, objectUrl: URL.createObjectURL(file), info: null, failed: false, result: null, probing: true };
      entry.card = buildCard(entry);
      results.appendChild(entry.card);
      entries.push(entry);
      return entry;
    });
    revealAfterDropUI();
    if (!selectedCompression.textContent) applyLevel(levelKey);
    renderStatus();
    renderAll();
    updateButtonState();
    const skipped = incoming.length - videos.length;
    const skippedText = skipped ? bcT("{0} file(s) weren't a video and were skipped.", [skipped]) : "";
    if (skippedText) status.textContent += " " + skippedText;
    await runWithConcurrencyLimit(added, PROBE_CONCURRENCY, async entry => {
      try {
        entry.info = await probe(entry.file);
      } catch (err){
        console.error(err);
        entry.failed = true;
        entry.card.classList.add("cr-file-card-error");
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
    selectedCompression.textContent = "";
    status.textContent = "";
    compressBtn.disabled = true;
    compressBtn.textContent = idleLabel();
    bcDbClear(CR_DB_NAME, CR_DB_STORE);
  }
  removeBtn.addEventListener("click", resetTool);

  async function compressEntry(entry){
    const p = plan(entry);
    const key = settingsKey();
    if (entry.result && entry.result.key === key){
      downloadBlob(entry.result.blob, entry.result.name);
      return true;
    }
    const mb = await loadMediabunny();
    const bar = entry.card.querySelector(".cr-progress");
    const barFill = entry.card.querySelector(".cr-progress-bar");
    bar.classList.add("on");
    barFill.style.width = "0%";
    entry.card.classList.remove("cr-file-card-error");
    entry.card.removeAttribute("title");

    const inp = new mb.Input({ source: new mb.BlobSource(entry.file), formats: mb.ALL_FORMATS });
    let useAvc = false;
    try { useAvc = await mb.canEncodeVideo("avc", { width: p.width, height: p.height, bitrate: p.videoBitrate }); } catch (e){}
    const output = new mb.Output({
      format: useAvc ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat(),
      target: new mb.BufferTarget()
    });
    const videoOpts = { codec: useAvc ? "avc" : "vp9", bitrate: p.videoBitrate, fit: "fill" };
    if (p.resized){ videoOpts.width = p.width; videoOpts.height = p.height; }
    const audioOpts = p.audioBitrate ? { bitrate: p.audioBitrate } : {};

    try {
      const conversion = await mb.Conversion.init({ input: inp, output, video: videoOpts, audio: audioOpts, showWarnings: false });
      entry.conversion = conversion;
      if (!conversion.isValid) throw new Error("This video can't be compressed in your browser.");
      conversion.onProgress = pr => { barFill.style.width = Math.round(pr * 100) + "%"; };
      await conversion.execute();
      const ext = useAvc ? "mp4" : "webm";
      const base = entry.file.name.replace(/\.[^.]+$/, "") || "video";
      const blob = new Blob([output.target.buffer], { type: useAvc ? "video/mp4" : "video/webm" });
      entry.result = { key, blob, name: `${base}-compressed.${ext}` };
      barFill.style.width = "100%";
      downloadBlob(blob, entry.result.name);
      return true;
    } finally {
      entry.conversion = null;
      inp.dispose();
      setTimeout(() => bar.classList.remove("on"), 600);
    }
  }

  let cancelRequested = false;
  function requestCancel(){
    cancelRequested = true;
    if (currentEntry && currentEntry.conversion) currentEntry.conversion.cancel().catch(() => {});
  }

  async function compressAll(){
    const queue = entries.filter(e => e.info);
    if (!queue.length) return;
    running = true;
    cancelRequested = false;
    startPrivacyCheck();
    let done = 0, failed = 0;
    compressBtn.classList.add("cr-compress-btn-working");
    for (const entry of queue){
      if (cancelRequested) break;
      if (!entries.includes(entry)) continue;
      currentEntry = entry;
      compressBtn.textContent = bcT("Cancel");
      status.textContent = bcT("Compressing {0}…", [entry.file.name]);
      try {
        await compressEntry(entry);
        done++;
        renderEntry(entry);
      } catch (err){
        const canceled = err && /cancel/i.test(err.name || err.message || "");
        if (cancelRequested) break;
        if (canceled) continue;
        console.error(err);
        failed++;
        entry.card.classList.add("cr-file-card-error");
        entry.card.title = bcT("Couldn't compress \"{0}\".", [entry.file.name]) + `\n(${err.message || err})`;
      }
    }
    currentEntry = null;
    running = false;
    compressBtn.classList.remove("cr-compress-btn-working");
    compressBtn.textContent = idleLabel();
    finishPrivacyCheck(badge);
    updateButtonState();
    if (!entries.length){ status.textContent = ""; return; }
    if (cancelRequested){ status.textContent = bcT("Canceled."); return; }
    if (failed && !done) status.textContent = failed === 1 && queue.length === 1
      ? bcT("Couldn't compress {0}. Try another level or a smaller size.", [queue[0].file.name])
      : bcT("Couldn't compress {0} files. Try another level or a smaller size.", [failed]);
    else if (failed) status.textContent = bcT("Done — {0} compressed, {1} couldn't be compressed.", [done, failed]);
    else if (done) status.textContent = done === 1 && queue.length === 1
      ? bcT("Done — {0} saved.", [queue[0].result.name])
      : bcT("Done — {0} videos compressed.", [done]);
  }

  compressBtn.addEventListener("click", () => {
    if (running){ requestCancel(); return; }
    compressAll();
  });

  const CR_DB_NAME = "bctools-comprio";
  const CR_DB_STORE = "session";
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
      await bcDbPut(CR_DB_NAME, CR_DB_STORE, { files, levelKey, targetHeight });
    } catch (err){
    } finally { persistBusy = false; }
  }

  (async () => {
    const saved = await bcDbGet(CR_DB_NAME, CR_DB_STORE);
    if (!saved || !saved.files || !saved.files.length) return;
    if (entries.length) return;
    continueBtn.hidden = false;
    continueBtn.addEventListener("click", () => {
      continueBtn.hidden = true;
      try {
        if (saved.levelKey && LEVELS[saved.levelKey]){
          const i = LEVEL_OPTIONS.findIndex(o => o.levelKey === saved.levelKey);
          if (levelOptionChangeControl && i !== -1) levelOptionChangeControl.setIndex(i);
          levelKey = saved.levelKey;
        }
        if (saved.targetHeight){
          const opt = sizeMenu.querySelector(`[data-height="${saved.targetHeight}"]`);
          if (opt){
            targetHeight = saved.targetHeight;
            sizeTriggerLabel.textContent = opt.dataset.label;
            bcSetDropdownActive(sizeMenu, opt);
          }
        }
        addFiles(saved.files.map(f => new File([f.bytes], f.name, { type: f.type })));
      } catch (err){
        continueBtn.hidden = false;
      }
    });
  })();
})();
