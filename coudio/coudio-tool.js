/* Coudio — Audio format converter (prototype: MP3 <-> WAV). Decoding
   uses the native Web Audio API (decodeAudioData), which already reads
   MP3/WAV/OGG/AAC in every modern browser — no library needed there.
   Encoding is the part browsers can't do natively: WAV is free (just
   writing raw PCM + a header, no library), MP3 uses lamejs (lazy-loaded
   on first use, mirroring the SPA's loadHeic2any()/Congif's
   loadGifJs() pattern) so most visitors never fetch it. */
(function(){
  const drop = document.getElementById("cdDrop");
  const input = document.getElementById("cdInput");
  const editor = document.getElementById("cdEditor");
  const removeBtn = document.getElementById("cdRemoveBtn");
  const rowTemplate = document.getElementById("cdFileRowTemplate");
  const fileListEl = document.getElementById("cdFileList");
  const statusEl = document.getElementById("cdStatus");
  const continueBtn = document.getElementById("cdContinueBtn");

  bcSetupHelpBanner("coudio", "cd", [
    ["WELCOME_TO_COUDIO", "Coudio converts audio and video between MP3, WAV, OGG, AIFF, AU, CAF, and VOC — entirely in your browser. Click or drop one or more files below to get started."],
    ["PICK_YOUR_FORMAT", "Every file is fully independent — pick its own Output format (MP3/OGG also let you pick a bitrate) and its own output name, right on its row."],
    ["CHECK_BEFORE_CONVERTING", "Each row has its own player — give a file a quick listen before hitting its own Convert button."],
    ["YOU_ARE_SET", "Each row converts and downloads on its own — no need to wait for the others. Close this with the red dot and we won't show it again."]
  ]);

  /* Each entry: {
       file, objectUrl, outputName,
       outputFormat ("mp3"|"wav"|"ogg"|"aiff"|"au"|"caf"|"voc"), bitrate,
       row: <this entry's own .cd-file-row element>
     }
     Every file is fully independent — own detected Input (auto-
     detected at decode time, shown for information only, never
     chosen), own Output format, own Bitrate, own output filename, own
     inline player, own Convert/download button. There's no shared
     "selected file" concept the way one global player/settings row
     used to require. */
  let loaded = [];

  /* ===== lazy-load lame.min.js (mirrors loadGifJs() in Congify) ===== */
  let lameLoadPromise = null;
  function loadLame(){
    if (window.lamejs) return Promise.resolve();
    if (!lameLoadPromise){
      lameLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/vendor/lame.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load lame.min.js"));
        document.head.appendChild(script);
      });
    }
    return lameLoadPromise;
  }

  /* ===== file loading ===== */
  /* Video is accepted alongside audio files — decodeAudioData() and
     <audio src> both pull just the audio track out of a video
     container on their own (same platform decoder <video> uses), so no
     separate demuxing library is needed: the rest of the pipeline below
     treats it exactly like any other input file. That only works for
     containers the browser can demux natively, though — MP4/M4V, WEBM,
     MOV (QuickTime, when it's carrying the same H.264/AAC MP4 payload
     Chrome already understands) and OGV. MKV, AVI, WMV and FLV aren't
     natively demuxable in any browser — decodeAudioData just fails on
     them — so those would need a real demuxer (e.g. ffmpeg.wasm, tens
     of MB) to support, a much bigger dependency than anything else
     vendored here. */
  const VIDEO_EXTENSIONS = /\.(mp4|m4v|webm|mov|ogv)$/i;
  const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/x-m4v"];
  function isAcceptableFile(file){
    if (!file) return false;
    if (file.type.startsWith("audio/")) return true;
    if (VIDEO_MIME_TYPES.includes(file.type)) return true;
    if (VIDEO_EXTENSIONS.test(file.name)) return true;
    return false;
  }

  /* Short recognized-format label (e.g. "MP3", "MP4") for a single
     loaded file — same idea as Output format's own short label.
     Falls back to the MIME subtype, then a generic label, for a file
     with no/an unusual extension. */
  function detectedTypeLabel(file){
    const extMatch = /\.([a-z0-9]+)$/i.exec(file.name);
    if (extMatch) return extMatch[1].toUpperCase();
    const mimeMatch = /\/([a-z0-9-]+)$/i.exec(file.type);
    if (mimeMatch) return mimeMatch[1].toUpperCase();
    return "File";
  }

  function formatKB(bytes){
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /* Just a plain loaded-file count now that conversion itself is
     per-row (each row's own Convert button), not a single batch
     action — still useful as an at-a-glance "how many files are
     loaded" line. */
  function renderStatus(){
    if (loaded.length > 0){
      const count = loaded.length;
      const word = count === 1 ? "file" : "files";
      statusEl.textContent = `${count} ${word} loaded`;
    } else {
      statusEl.textContent = "";
    }
  }

  /* ===== one row per file — own player, own Input display, own
     Output/Bitrate controls, own filename, own remove, own Convert
     button — built by cloning #cdFileRowTemplate. bcRegisterCombo/
     bcRegisterDropdown (shared/site.js) both take elements directly,
     so every clone's controls wire up on their own with no id
     collisions to worry about. */
  function createRow(entry){
    const row = document.importNode(rowTemplate.content, true).querySelector(".cd-file-row");

    row.querySelector(".cd-row-audio").src = entry.objectUrl;

    const nameInput = row.querySelector(".cd-file-name");
    nameInput.value = entry.outputName;
    nameInput.addEventListener("input", () => {
      entry.outputName = nameInput.value;
      schedulePersist();
    });

    row.querySelector(".cd-row-input-badge").textContent = detectedTypeLabel(entry.file);
    row.querySelector(".cd-row-size").textContent = formatKB(entry.file.size);

    const bitrateDropdownEl = row.querySelector(".cd-row-bitrate-dropdown");
    const formatTrigger = row.querySelector(".cd-row-format-combo .bc-combo-trigger");
    const formatInput = row.querySelector(".cd-row-format-combo .bc-combo-input");
    const formatMenu = row.querySelector(".cd-row-format-combo .bc-combo-menu");
    const formatEmpty = row.querySelector(".cd-row-format-combo .bc-combo-empty");
    bcRegisterCombo(formatTrigger, formatInput, formatMenu, formatEmpty, opt => {
      entry.outputFormat = opt.dataset.format;
      /* Bitrate only applies to the two lossy formats (MP3, OGG/Opus) —
         every other option here is uncompressed PCM, no such setting. */
      bitrateDropdownEl.hidden = entry.outputFormat !== "mp3" && entry.outputFormat !== "ogg";
      schedulePersist();
    });

    const bitrateTrigger = row.querySelector(".cd-row-bitrate-dropdown .bc-dropdown-trigger");
    const bitrateTriggerLabel = row.querySelector(".cd-row-bitrate-dropdown .bc-dropdown-trigger-label");
    const bitrateMenu = row.querySelector(".cd-row-bitrate-dropdown .bc-dropdown-menu");
    bcRegisterDropdown(bitrateTrigger, bitrateMenu, opt => {
      entry.bitrate = parseInt(opt.dataset.bitrate, 10);
      bitrateTriggerLabel.textContent = opt.dataset.label;
      schedulePersist();
    });

    row.querySelector(".result-remove").addEventListener("click", () => removeEntry(entry));
    row.querySelector(".cd-row-convert-btn").addEventListener("click", () => convertEntry(entry));

    return row;
  }

  /* ===== smooth height flip on add/remove =====
     The banner's decorative ripple (#page-coudio::after, a
     repeating-radial-gradient centered at a fixed 50%/58% *percentage*
     of the box) recenters itself the instant the box's height changes
     — with no transition on that change, the whole ripple pattern
     visibly snaps/jumps to its new center the moment a row is added or
     removed. CSS can't transition a plain height:auto element by
     itself (there's no defined "auto" state to interpolate from), so
     this does the classic FLIP trick by hand: measure the height
     before the DOM mutation, apply the mutation, measure the height
     after, then briefly pin an explicit px height and transition
     between the two — the ripple's percentage-based origin recomputes
     every frame along the way, which is what actually produces the
     smooth "settling" reshape (no separate animation on the gradient
     itself is needed). */
  /* Tracks the in-flight transitionend listener (if any) so a second
     add/remove arriving before the first flip finishes can clean up
     properly instead of leaving an orphaned listener that never fires
     (a CSS transition interrupted by a new value change never fires
     transitionend for the interrupted one) — without this, overlapping
     calls left #page-coudio permanently stuck with an inline height
     and overflow:hidden, confirmed live by adding two files back to
     back with no pause between them. */
  let pendingHeightCleanup = null;

  function withSmoothHeightChange(mutate){
    // Snap any still-running flip to its natural state first, so this
    // call always measures a real, current height rather than a
    // mid-transition one.
    if (pendingHeightCleanup){
      pendingHeightCleanup();
      pendingHeightCleanup = null;
    }

    const startHeight = toolApp.getBoundingClientRect().height;
    mutate();
    const endHeight = toolApp.getBoundingClientRect().height;
    if (startHeight === endHeight) return;
    toolApp.style.height = startHeight + "px";
    toolApp.style.overflow = "hidden";
    void toolApp.offsetHeight; // force layout so the next line animates from startHeight, not endHeight
    toolApp.style.transition = "height .4s cubic-bezier(.22,1,.36,1)";
    requestAnimationFrame(() => {
      toolApp.style.height = endHeight + "px";
    });

    function cleanup(){
      toolApp.removeEventListener("transitionend", onEnd);
      clearTimeout(fallbackTimer);
      toolApp.style.height = "";
      toolApp.style.overflow = "";
      toolApp.style.transition = "";
      pendingHeightCleanup = null;
    }
    function onEnd(e){
      if (e.propertyName !== "height") return;
      cleanup();
    }
    toolApp.addEventListener("transitionend", onEnd);
    /* Backstop for transitionend never arriving — a backgrounded tab
       can suspend the transition entirely (confirmed live: a hidden
       tab left the inline height/overflow permanently stuck, since
       rAF/transitions don't run without a compositor), and even in a
       normal foreground tab a transition can be interrupted in ways
       that skip the event. Cleanup is idempotent either way. */
    const fallbackTimer = setTimeout(cleanup, 500);
    pendingHeightCleanup = cleanup;
  }

  function addFiles(fileList){
    const accepted = [...fileList].filter(isAcceptableFile);
    if (accepted.length === 0) return;
    withSmoothHeightChange(() => {
      accepted.forEach(file => {
        const entry = {
          file,
          objectUrl: URL.createObjectURL(file),
          outputName: file.name.replace(/\.[^.]+$/, ""),
          outputFormat: "mp3",
          bitrate: 320
        };
        entry.row = createRow(entry);
        loaded.push(entry);
        fileListEl.appendChild(entry.row);
      });
      editor.hidden = false;
      /* #cdDrop is never hidden again from here on — same pattern as
         Combine's #cbDrop — it just picks up this class and stays in
         place above the file list as the "add more files" target. */
      drop.classList.add("tool-drop-revealed");
    });
    renderStatus();
    continueBtn.hidden = true;
    schedulePersist();
  }

  function removeEntry(entry){
    const idx = loaded.indexOf(entry);
    if (idx === -1) return;
    withSmoothHeightChange(() => {
      loaded.splice(idx, 1);
      URL.revokeObjectURL(entry.objectUrl);
      entry.row.remove();
    });
    if (loaded.length === 0){
      resetTool();
    } else {
      renderStatus();
      schedulePersist();
    }
  }

  function resetTool(){
    loaded.forEach(entry => URL.revokeObjectURL(entry.objectUrl));
    loaded = [];
    fileListEl.innerHTML = "";
    editor.hidden = true;
    drop.classList.remove("tool-drop-revealed");
    renderStatus();
    bcDbClear(CD_DB_NAME, CD_DB_STORE);
  }

  /* ===== "Continue where you left off" persistence =====
     Same IndexedDB pattern Convert/Compress/Combine/Cleanly/Context/
     Congify already use (shared/site.js's bcDbPut/bcDbGet/bcDbClear) —
     stores each file's bytes plus its own chosen format/bitrate/name,
     so a reload (or coming back later) can offer to restore exactly
     where you left off instead of starting over. */
  const CD_DB_NAME = "bctools-coudio";
  const CD_DB_STORE = "session";

  let persistTimer = null;
  let persistBusy = false;
  function schedulePersist(){
    if (loaded.length === 0) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }

  async function persistNow(){
    if (loaded.length === 0 || persistBusy) return;
    persistBusy = true;
    try {
      const files = await Promise.all(loaded.map(async entry => ({
        name: entry.file.name,
        type: entry.file.type,
        bytes: await entry.file.arrayBuffer(),
        outputName: entry.outputName,
        outputFormat: entry.outputFormat,
        bitrate: entry.bitrate
      })));
      await bcDbPut(CD_DB_NAME, CD_DB_STORE, { files });
    } catch (err){ /* storage unavailable — skip */
    } finally { persistBusy = false; }
  }

  (async () => {
    const saved = await bcDbGet(CD_DB_NAME, CD_DB_STORE);
    if (!saved || !saved.files || !saved.files.length) return;
    if (loaded.length) return;
    continueBtn.hidden = false;
    continueBtn.addEventListener("click", () => {
      continueBtn.hidden = true;
      try {
        const restored = saved.files.map(f => new File([f.bytes], f.name, { type: f.type }));
        addFiles(restored);
        /* addFiles() just gave every entry a fresh basename outputName
           and the mp3/320kbps default — reapply each file's own saved
           (possibly renamed/reformatted) settings on top, refreshing
           that row's own controls to match. */
        saved.files.forEach((f, i) => {
          const entry = loaded[i];
          if (!entry) return;
          if (typeof f.outputName === "string"){
            entry.outputName = f.outputName;
            entry.row.querySelector(".cd-file-name").value = entry.outputName;
          }
          if (f.outputFormat && f.outputFormat !== entry.outputFormat){
            const formatMenu = entry.row.querySelector(".cd-row-format-combo .bc-combo-menu");
            const formatInput = entry.row.querySelector(".cd-row-format-combo .bc-combo-input");
            const formatOpt = formatMenu.querySelector(`[data-format="${f.outputFormat}"]`);
            if (formatOpt){
              bcSetComboDisplay(formatMenu, formatInput, "format", f.outputFormat);
              entry.outputFormat = f.outputFormat;
              entry.row.querySelector(".cd-row-bitrate-dropdown").hidden =
                entry.outputFormat !== "mp3" && entry.outputFormat !== "ogg";
            }
          }
          if (f.bitrate && f.bitrate !== entry.bitrate){
            const bitrateMenu = entry.row.querySelector(".cd-row-bitrate-dropdown .bc-dropdown-menu");
            const bitrateTriggerLabel = entry.row.querySelector(".cd-row-bitrate-dropdown .bc-dropdown-trigger-label");
            const bitrateOpt = bitrateMenu.querySelector(`[data-bitrate="${f.bitrate}"]`);
            if (bitrateOpt){
              bcSetDropdownActive(bitrateMenu, bitrateOpt);
              bitrateTriggerLabel.textContent = bitrateOpt.dataset.label;
              entry.bitrate = f.bitrate;
            }
          }
        });
      } catch (err){
        console.error(err);
        continueBtn.hidden = false;
      }
    });
  })();

  removeBtn.addEventListener("click", resetTool);
  input.addEventListener("change", (e) => { addFiles(e.target.files); input.value = ""; });

  /* Whole-banner drop target as Convert/Congify's — before any file is
     loaded, #cdDrop is just the dashed visual cue, not the actual
     click/drag scope: the entire .tool-app banner opens the picker and
     accepts a drag/drop. Once files ARE loaded, #cdDrop is never
     actually hidden (same pattern as Combine's #cbDrop) — it just picks
     up .tool-drop-revealed and stays in place above the file list as
     the target for adding more, so the banner stays a drop target
     throughout instead of narrowing to one small tile. */
  const toolApp = document.querySelector(".tool-app");
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      if (editor.hidden || drop.contains(e.target)){
        input.click();
      }
    });

    function isDragEventInScope(e){
      return editor.hidden || drop.contains(e.target);
    }
    bcSetupBannerDropTarget(toolApp, {
      isInScope: isDragEventInScope,
      getEnterTarget: e => (editor.hidden ? toolApp : drop),
      clearTargets: [toolApp, drop],
      onDrop: e => addFiles(e.dataTransfer.files)
    });

    /* Just a fun double-click easter egg — skips buttons/selects/etc.
       so it never fires from a legitimate double-click on a toolbar
       control. Wobbles the banner any time, same as Combine's. */
    toolApp.addEventListener("dblclick", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      toolApp.classList.remove("wobble");
      void toolApp.offsetWidth;
      toolApp.classList.add("wobble");
    });
  }

  /* ===== Shared PCM helpers — WAV, AIFF, AU, CAF and VOC are all just
     the same 16-bit interleaved PCM samples wrapped in a different
     header, no codec involved. ===== */
  function writeAsciiString(view, offset, str){
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  function interleave16(audioBuffer){
    const numChannels = audioBuffer.numberOfChannels;
    const numFrames = audioBuffer.length;
    const channelData = [];
    for (let c = 0; c < numChannels; c++) channelData.push(audioBuffer.getChannelData(c));
    const samples = new Int16Array(numFrames * numChannels);
    let i = 0;
    for (let f = 0; f < numFrames; f++){
      for (let c = 0; c < numChannels; c++){
        const s = Math.max(-1, Math.min(1, channelData[c][f]));
        samples[i++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    }
    return { numChannels, sampleRate: audioBuffer.sampleRate, numFrames, samples };
  }

  /* ===== WAV encoding — plain 16-bit PCM, no library needed ===== */
  function encodeWav(audioBuffer){
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numFrames = audioBuffer.length;
    const blockAlign = numChannels * 2;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset, str){
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = [];
    for (let c = 0; c < numChannels; c++) channelData.push(audioBuffer.getChannelData(c));
    let offset = 44;
    for (let i = 0; i < numFrames; i++){
      for (let c = 0; c < numChannels; c++){
        const s = Math.max(-1, Math.min(1, channelData[c][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([view], { type: "audio/wav" });
  }

  /* ===== AIFF encoding (also used for the .aif/.aifc aliases — all
     three are the same big-endian PCM container, just conventionally
     different file extensions for the same format) ===== */
  function encodeAiff(audioBuffer){
    const { numChannels, sampleRate, numFrames, samples } = interleave16(audioBuffer);
    const dataSize = samples.length * 2;
    const buffer = new ArrayBuffer(54 + dataSize); // 12 FORM + 26 COMM + 16 SSND header
    const view = new DataView(buffer);

    writeAsciiString(view, 0, "FORM");
    view.setUint32(4, 46 + dataSize, false);
    writeAsciiString(view, 8, "AIFF");

    writeAsciiString(view, 12, "COMM");
    view.setUint32(16, 18, false);
    view.setUint16(20, numChannels, false);
    view.setUint32(22, numFrames, false);
    view.setUint16(26, 16, false); // bits per sample

    /* Sample rate as an 80-bit IEEE 754 extended-precision float (the
       one place AIFF still insists on this ancient format) — sign+
       exponent in the first 2 bytes, explicit leading bit + 63-bit
       mantissa in the next 8. Every sample rate this tool ever
       produces is a plain positive integer well within that range. */
    let bits = BigInt(sampleRate);
    let shift = 0;
    while (bits < (1n << 63n)){ bits <<= 1n; shift++; }
    const exp = 16383 + 63 - shift; // bias 16383, exponent = position of the integer's highest set bit
    view.setUint16(28, exp, false);
    view.setUint32(30, Number(bits >> 32n), false);
    view.setUint32(34, Number(bits & 0xffffffffn), false);

    writeAsciiString(view, 38, "SSND");
    view.setUint32(42, 8 + dataSize, false);
    view.setUint32(46, 0, false); // offset
    view.setUint32(50, 0, false); // block size

    let offset = 54;
    for (let i = 0; i < samples.length; i++){
      view.setInt16(offset, samples[i], false); // big-endian
      offset += 2;
    }
    return new Blob([view], { type: "audio/aiff" });
  }

  /* ===== AU encoding (Sun/NeXT) — the simplest container here: a flat
     24-byte big-endian header, then raw big-endian 16-bit PCM. ===== */
  function encodeAu(audioBuffer){
    const { numChannels, sampleRate, samples } = interleave16(audioBuffer);
    const dataSize = samples.length * 2;
    const buffer = new ArrayBuffer(24 + dataSize);
    const view = new DataView(buffer);
    writeAsciiString(view, 0, ".snd");
    view.setUint32(4, 24, false); // data offset
    view.setUint32(8, dataSize, false);
    view.setUint32(12, 3, false); // encoding: 3 = 16-bit linear PCM
    view.setUint32(16, sampleRate, false);
    view.setUint32(20, numChannels, false);
    let offset = 24;
    for (let i = 0; i < samples.length; i++){
      view.setInt16(offset, samples[i], false);
      offset += 2;
    }
    return new Blob([view], { type: "audio/basic" });
  }

  /* ===== CAF encoding (Apple Core Audio Format) — a small chunked
     container (like RIFF/IFF, but chunk sizes are 64-bit big-endian):
     a fixed "desc" chunk describing the PCM format, then one "data"
     chunk holding the raw little-endian samples. ===== */
  function encodeCaf(audioBuffer){
    const { numChannels, sampleRate, samples } = interleave16(audioBuffer);
    const dataSize = samples.length * 2;
    const bytesPerFrame = numChannels * 2;
    const buffer = new ArrayBuffer(8 + 12 + 32 + 12 + 4 + dataSize); // caff header + desc chunk (tag+size+body) + data chunk (tag+size) + edit count
    const view = new DataView(buffer);
    let o = 0;
    writeAsciiString(view, o, "caff"); o += 4;
    view.setUint16(o, 1, false); o += 2; // version
    view.setUint16(o, 0, false); o += 2; // flags

    writeAsciiString(view, o, "desc"); o += 4;
    view.setBigInt64(o, 32n, false); o += 8; // chunk size
    view.setFloat64(o, sampleRate, false); o += 8;
    writeAsciiString(view, o, "lpcm"); o += 4; // format ID
    view.setUint32(o, 1, false); o += 4; // formatFlags: bit0 = little-endian
    view.setUint32(o, bytesPerFrame, false); o += 4; // bytes per packet
    view.setUint32(o, 1, false); o += 4; // frames per packet
    view.setUint32(o, numChannels, false); o += 4;
    view.setUint32(o, 16, false); o += 4; // bits per channel

    writeAsciiString(view, o, "data"); o += 4;
    view.setBigInt64(o, BigInt(4 + dataSize), false); o += 8; // chunk size (edit count + samples)
    view.setUint32(o, 0, false); o += 4; // edit count

    for (let i = 0; i < samples.length; i++){
      view.setInt16(o, samples[i], true); // little-endian, per formatFlags above
      o += 2;
    }
    return new Blob([view], { type: "audio/x-caf" });
  }

  /* ===== VOC encoding (Creative Voice File) — a "new sound data"
     block (type 9, the one that supports 16-bit PCM — the original
     type-1 block is 8-bit only) inside the classic VOC header. ===== */
  function encodeVoc(audioBuffer){
    const { numChannels, sampleRate, samples } = interleave16(audioBuffer);
    const dataSize = samples.length * 2;
    const blockSize = 12 + dataSize; // sampleRate+bits+channels+format+reserved + PCM
    const buffer = new ArrayBuffer(26 + 4 + blockSize + 1); // header + block header(4) + block body + terminator
    const view = new DataView(buffer);
    writeAsciiString(view, 0, "Creative Voice File\x1A");
    view.setUint16(20, 26, true); // data block offset
    view.setUint16(22, 0x010A, true); // version 1.10
    view.setUint16(24, (~0x010A + 0x1234) & 0xffff, true); // version checksum

    let o = 26;
    view.setUint8(o, 9); o += 1; // block type 9: new sound data
    view.setUint8(o, blockSize & 0xff); view.setUint8(o + 1, (blockSize >> 8) & 0xff); view.setUint8(o + 2, (blockSize >> 16) & 0xff);
    o += 3;
    view.setUint32(o, sampleRate, true); o += 4;
    view.setUint8(o, 16); o += 1; // bits per sample
    view.setUint8(o, numChannels); o += 1;
    view.setUint16(o, 4, true); o += 2; // format: 4 = 16-bit signed PCM
    view.setUint32(o, 0, true); o += 4; // reserved

    for (let i = 0; i < samples.length; i++){
      view.setInt16(o, samples[i], true);
      o += 2;
    }
    view.setUint8(o, 0); // terminator block
    return new Blob([view], { type: "audio/x-voc" });
  }

  /* ===== MP3 encoding via lamejs — mono/stereo, fed in 1152-sample
     blocks (the codec's fixed frame size) ===== */
  function floatTo16BitPCM(input){
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++){
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  async function encodeMp3(audioBuffer, kbps){
    await loadLame();
    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const sampleRate = audioBuffer.sampleRate;
    const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
    const left = floatTo16BitPCM(audioBuffer.getChannelData(0));
    const right = channels === 2 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : null;

    const chunks = [];
    const blockSize = 1152;
    for (let i = 0; i < left.length; i += blockSize){
      const leftChunk = left.subarray(i, i + blockSize);
      let mp3buf;
      if (channels === 2){
        mp3buf = encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize));
      } else {
        mp3buf = encoder.encodeBuffer(leftChunk);
      }
      if (mp3buf.length > 0) chunks.push(mp3buf);
    }
    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(tail);
    return new Blob(chunks, { type: "audio/mpeg" });
  }

  /* ===== OGG (Opus) encoding via opus-recorder's encoder worker =====
     The worker normally paces itself to a live microphone stream (real
     time); talking to it directly like this instead — pushing the
     whole decoded buffer in chunks with no delay between messages —
     encodes as fast as the CPU allows instead of taking as long as the
     clip itself. Protocol (postMessage command → onmessage message):
       init → "ready"
       getHeaderPages → two "page" messages (Ogg ID + comment headers)
       encode (repeated) → "page" messages as pages fill up
       done → any final "page" messages, then "done"
     Every "page" carries one Ogg page's raw bytes, which just need to
     be concatenated in the order they arrived. */
  function encodeOgg(audioBuffer, kbps){
    return new Promise((resolve, reject) => {
      const worker = new Worker("/vendor/opus-encoder-worker.min.js");
      const pages = [];
      const channels = Math.min(2, audioBuffer.numberOfChannels);
      const channelData = [];
      for (let c = 0; c < channels; c++) channelData.push(audioBuffer.getChannelData(c));

      worker.onerror = (e) => { worker.terminate(); reject(e.error || new Error("Opus encoder failed")); };
      worker.onmessage = ({ data }) => {
        if (data.message === "page"){
          pages.push(data.page);
        } else if (data.message === "ready"){
          worker.postMessage({ command: "getHeaderPages" });
          /* Feed the whole clip in fixed-size chunks — the worker's
             own frame buffering (encoderFrameSize) handles the actual
             codec block size internally, so chunk size here just
             trades message-passing overhead against memory. */
          const chunkSize = 4096;
          for (let i = 0; i < channelData[0].length; i += chunkSize){
            const buffers = channelData.map(c => c.subarray(i, i + chunkSize));
            worker.postMessage({ command: "encode", buffers });
          }
          worker.postMessage({ command: "done" });
        } else if (data.message === "done"){
          worker.terminate();
          resolve(new Blob(pages, { type: "audio/ogg" }));
        }
      };
      worker.postMessage({
        command: "init",
        encoderSampleRate: 48000,
        originalSampleRate: audioBuffer.sampleRate,
        numberOfChannels: channels,
        encoderApplication: 2049, // full-band audio, not voice
        encoderFrameSize: 20,
        encoderBitRate: kbps * 1000,
        maxFramesPerPage: 40,
        resampleQuality: 6
      });
    });
  }

  async function convertOneFile(file, outputFormat, bitrate){
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    /* try/finally so a decode failure (a genuinely malformed or
       unsupported file) still closes the context — Chrome caps
       concurrent AudioContexts at ~6, so repeated failures without
       this would eventually throw on every later conversion too, not
       just this one. */
    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      let blob, ext;
      if (outputFormat === "wav"){
        blob = encodeWav(audioBuffer);
        ext = "wav";
      } else if (outputFormat === "ogg"){
        blob = await encodeOgg(audioBuffer, bitrate);
        ext = "ogg";
      } else if (outputFormat === "aiff"){
        blob = encodeAiff(audioBuffer);
        ext = "aiff";
      } else if (outputFormat === "au"){
        blob = encodeAu(audioBuffer);
        ext = "au";
      } else if (outputFormat === "caf"){
        blob = encodeCaf(audioBuffer);
        ext = "caf";
      } else if (outputFormat === "voc"){
        blob = encodeVoc(audioBuffer);
        ext = "voc";
      } else {
        blob = await encodeMp3(audioBuffer, bitrate);
        ext = "mp3";
      }
      return { blob, ext };
    } finally {
      audioCtx.close();
    }
  }

  /* ===== conversion — fully independent per row ===== each file
     decodes/encodes and downloads entirely on its own, using only that
     row's own Output format/Bitrate/filename, the moment its own
     Convert button is clicked — no shared batch loop, no waiting on
     any other file. */
  async function convertEntry(entry){
    const btn = entry.row.querySelector(".cd-row-convert-btn");
    const idleLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Converting…";
    entry.row.classList.remove("cd-file-row-error");
    entry.row.removeAttribute("title");
    statusEl.textContent = `Converting ${entry.file.name}...`;
    startPrivacyCheck();

    try {
      const { blob, ext } = await convertOneFile(entry.file, entry.outputFormat, entry.bitrate);
      const outName = (entry.outputName.trim() || "converted") + "." + ext;
      downloadBlob(blob, outName);
      btn.textContent = "Done";
      statusEl.textContent = `Done — ${outName} converted successfully.`;
    } catch (err){
      console.error(err);
      /* Flags this row so it's obvious at a glance which file actually
         failed — hover for the real browser-reported reason (usually a
         decode failure: not a real/supported audio file). The status
         tag needs its own update here too — it used to just sit on
         whatever load-count text it last had (e.g. "1 file loaded")
         forever, never actually reacting to a failed conversion. */
      entry.row.classList.add("cd-file-row-error");
      entry.row.title = `Couldn't convert "${entry.file.name}" — it may not be a valid or supported audio/video file.\n(${err.message || err})`;
      btn.textContent = "Failed";
      statusEl.textContent = `Couldn't convert ${entry.file.name}. Make sure it's a valid audio or video file.`;
    } finally {
      finishPrivacyCheck(document.getElementById("cdPrivacyBadge"));
      setTimeout(() => {
        btn.textContent = idleLabel;
        btn.disabled = false;
      }, 1800);
    }
  }
})();
