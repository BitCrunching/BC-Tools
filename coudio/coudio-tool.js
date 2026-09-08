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
  const inputBtnLabel = document.getElementById("cdInputBtnLabel");
  const fileListEl = document.getElementById("cdFileList");
  const addTile = document.getElementById("cdAddTile");
  const sourceAudio = document.getElementById("cdSourceAudio");
  const fileNameEl = document.getElementById("cdFileName");
  const convertBtn = document.getElementById("cdConvertBtn");
  const statusEl = document.getElementById("cdStatus");
  const resultsEl = document.getElementById("cdResults");
  const bitrateGroup = document.getElementById("cdBitrateGroup");
  const continueBtn = document.getElementById("cdContinueBtn");

  const formatTrigger = document.getElementById("cdFormatTrigger");
  const formatInput = document.getElementById("cdFormatInput");
  const formatMenu = document.getElementById("cdFormatMenu");
  const formatEmpty = document.getElementById("cdFormatEmpty");
  const bitrateTrigger = document.getElementById("cdBitrateTrigger");
  const bitrateTriggerLabel = document.getElementById("cdBitrateTriggerLabel");
  const bitrateMenu = document.getElementById("cdBitrateMenu");

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("coudio", "cd", [
    ["WELCOME_TO_COUDIO", "Coudio converts audio and video between MP3, WAV, OGG, AIFF, AU, CAF, and VOC — entirely in your browser. Click or drop one or more files below to get started."],
    ["PICK_YOUR_FORMAT", "Choose MP3 or WAV as the output — MP3 also lets you pick a bitrate to trade file size for quality."],
    ["CHECK_BEFORE_CONVERTING", "Your files show up below once picked — give each a quick listen before converting."],
    ["YOU_ARE_SET", "Hit Convert and each file downloads automatically. Close this with the red dot and we won't show it again."]
  ]);

  /* Each entry: { file: File, objectUrl: string, outputName: string }.
     outputName defaults to file's own basename but is independently
     editable per file (via #cdFileName, shown/edited whichever file is
     currently selected) — File objects are immutable, so renaming
     means tracking a separate name rather than touching file.name.
     Every file decodes and converts independently — its own input
     format is auto-detected at decode time (decodeAudioData doesn't
     care what container it came from), there's no per-file
     input-format choice to make. All loaded files share the one
     Output format/Bitrate below. */
  let loaded = [];
  let outputFormat = "mp3"; // "mp3" | "wav"
  let bitrate = 192;

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

  /* ===== dropdowns (Format / Bitrate) =====
     Format has 7 options — long enough that search helps — so it uses
     the shared searchable bcRegisterCombo (shared/site.js). Bitrate
     only has 3, so it stays on the shared plain bcRegisterDropdown.
     Named functions (not inline onSelect callbacks) so "Continue where
     you left off" can re-run the exact same selection logic when
     restoring a saved format/bitrate, instead of duplicating it. */
  function handleFormatSelect(opt){
    outputFormat = opt.dataset.format;
    /* Bitrate only applies to the two lossy formats (MP3, OGG/Opus) —
       every other option here is uncompressed PCM, no such setting. */
    bitrateGroup.hidden = outputFormat !== "mp3" && outputFormat !== "ogg";
    schedulePersist();
  }
  function handleBitrateSelect(opt){
    bitrate = parseInt(opt.dataset.bitrate, 10);
    bitrateTriggerLabel.textContent = opt.dataset.label;
    schedulePersist();
  }
  bcRegisterCombo(formatTrigger, formatInput, formatMenu, formatEmpty, handleFormatSelect);
  bcRegisterDropdown(bitrateTrigger, bitrateMenu, handleBitrateSelect);

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

  /* Wiping a results container via innerHTML="" directly (as this used
     to) drops any previous result <audio>'s object URL without ever
     revoking it — a real leak the moment a new batch replaces the old
     one without every individual × being clicked first. Shared
     by both the pre-conversion file list and the post-conversion
     results, since both hold the same kind of <audio>-bearing card. */
  function clearResultsContainer(container){
    container.querySelectorAll("audio").forEach(a => {
      if (a.src && a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
    });
    container.innerHTML = "";
  }

  /* Which loaded file is currently playing in the one shared
     #cdSourceAudio player — an index into `loaded`, not a stored
     reference, so it stays valid across renderFileList() rebuilds. */
  let selectedIndex = -1;

  /* "Found input" — Convert's real Expected Input dropdown has actual
     options to choose between; Coudio's doesn't (each file's format is
     auto-detected, not picked), so this just echoes whatever the
     currently *selected* file was detected as, whether there's one
     file loaded or several. */
  function updateInputSummary(){
    inputBtnLabel.textContent = loaded[selectedIndex]
      ? detectedTypeLabel(loaded[selectedIndex].file)
      : "Choose file";
  }

  function selectFile(index){
    if (!loaded[index]) return;
    selectedIndex = index;
    sourceAudio.src = loaded[index].objectUrl;
    fileNameEl.value = loaded[index].outputName;
    fileListEl.querySelectorAll(".cd-file-card").forEach((card, i) => {
      card.classList.toggle("active", i === index);
    });
    updateInputSummary();
  }

  function renderFileList(){
    /* Only clears the .cd-file-card entries, not #cdAddTile — that
       tile is a permanent fixture of the list (files load in beside
       it), not something rebuilt on every render. */
    fileListEl.querySelectorAll(".cd-file-card").forEach(el => el.remove());
    loaded.forEach((entry, index) => {
      const card = document.createElement("div");
      card.className = "result cd-file-card" + (index === selectedIndex ? " active" : "");
      card.innerHTML = `
        <span class="cd-file-dot" aria-hidden="true"></span>
        <div class="result-name">${entry.file.name}</div>
        <div class="result-size">${formatKB(entry.file.size)}</div>
      `;
      /* Whole card selects the file — not just a sub-control — so the
         remove button (which sits on top of it) has to stop the click
         from also bubbling up into this handler and re-selecting the
         card it's about to remove. */
      card.addEventListener("click", () => selectFile(index));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result-remove";
      btn.setAttribute("aria-label", "Remove");
      btn.textContent = "×";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFileAt(index);
      });
      card.appendChild(btn);
      fileListEl.appendChild(card);
    });
  }

  function addFiles(fileList){
    const accepted = [...fileList].filter(isAcceptableFile);
    if (accepted.length === 0) return;
    const hadNone = loaded.length === 0;
    accepted.forEach(file => {
      loaded.push({
        file,
        objectUrl: URL.createObjectURL(file),
        outputName: file.name.replace(/\.[^.]+$/, "")
      });
    });
    updateInputSummary();
    renderFileList();
    if (hadNone) selectFile(0);
    drop.hidden = true;
    editor.hidden = false;
    convertBtn.disabled = false;
    clearResultsContainer(resultsEl);
    statusEl.textContent = "";
    continueBtn.hidden = true;
    schedulePersist();
  }

  function removeFileAt(index){
    const [removed] = loaded.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.objectUrl);
    if (loaded.length === 0){
      resetTool();
    } else {
      updateInputSummary();
      /* Keep playing the same file if it's still around (its index
         just shifted down by one); otherwise fall back to whatever
         is now at that position, or the last file if it was removed. */
      const nextIndex = Math.min(index, loaded.length - 1);
      renderFileList();
      selectFile(selectedIndex === index ? nextIndex : (selectedIndex > index ? selectedIndex - 1 : selectedIndex));
      schedulePersist();
    }
  }

  function resetTool(){
    loaded.forEach(entry => URL.revokeObjectURL(entry.objectUrl));
    loaded = [];
    selectedIndex = -1;
    sourceAudio.removeAttribute("src");
    fileNameEl.value = "";
    editor.hidden = true;
    drop.hidden = false;
    convertBtn.disabled = true;
    /* Only the .cd-file-card entries — not innerHTML="" — since that
       would also delete #cdAddTile itself (a real, permanent DOM node,
       not something renderFileList() recreates). That's exactly what
       was happening: the tile would vanish for good after a reset,
       since the const addTile reference still pointed at the now-
       detached node afterward. */
    fileListEl.querySelectorAll(".cd-file-card").forEach(el => el.remove());
    clearResultsContainer(resultsEl);
    statusEl.textContent = "";
    updateInputSummary();
    bcDbClear(CD_DB_NAME, CD_DB_STORE);
  }

  /* ===== "Continue where you left off" persistence =====
     Same IndexedDB pattern Convert/Compress/Combine/Cleanly/Context/
     Congify already use (shared/site.js's bcDbPut/bcDbGet/bcDbClear) —
     stores the file's bytes plus the chosen format/bitrate, so a
     reload (or coming back later) can offer to restore exactly where
     you left off instead of starting over. */
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
        outputName: entry.outputName
      })));
      await bcDbPut(CD_DB_NAME, CD_DB_STORE, { files, outputFormat, bitrate });
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
        /* addFiles() just reset every outputName back to each file's
           own basename — reapply the saved (possibly renamed) ones on
           top, then refresh the visible field if it's the selected one. */
        saved.files.forEach((f, i) => {
          if (typeof f.outputName === "string" && loaded[i]) loaded[i].outputName = f.outputName;
        });
        if (loaded[selectedIndex]) fileNameEl.value = loaded[selectedIndex].outputName;
        if (saved.outputFormat){
          bcSetComboDisplay(formatMenu, formatInput, "format", saved.outputFormat);
          const formatOpt = formatMenu.querySelector(`[data-format="${saved.outputFormat}"]`);
          if (formatOpt) handleFormatSelect(formatOpt);
        }
        if (saved.bitrate){
          const bitrateOpt = bitrateMenu.querySelector(`[data-bitrate="${saved.bitrate}"]`);
          if (bitrateOpt){
            bcSetDropdownActive(bitrateMenu, bitrateOpt);
            handleBitrateSelect(bitrateOpt);
          }
        }
      } catch (err){
        console.error(err);
        continueBtn.hidden = false;
      }
    });
  })();

  removeBtn.addEventListener("click", resetTool);
  input.addEventListener("change", (e) => addFiles(e.target.files));
  addTile.addEventListener("click", () => input.click());
  fileNameEl.addEventListener("input", () => {
    if (loaded[selectedIndex]) loaded[selectedIndex].outputName = fileNameEl.value;
    schedulePersist();
  });

  /* Whole-banner drop target as Convert/Congify's — before any file is
     loaded, #cdDrop is just the dashed visual cue, not the actual
     click/drag scope: the entire .tool-app banner opens the picker and
     accepts a drag/drop. Once files ARE loaded, #cdAddTile (the
     shared .bc-add-tile — always present in #cdFileList, files load in
     to its right) takes over as the target instead — the banner stays
     a drop target throughout (previously it silently stopped accepting
     drops the moment a file loaded, since the old scope check keyed
     entirely off #cdDrop, which is hidden by then), just handing the
     "active" highlight to whichever affordance is actually visible. */
  const toolApp = document.querySelector(".tool-app");
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      if (!drop.hidden || drop.contains(e.target)){
        input.click();
      }
    });

    function isDragEventInScope(e){
      return !drop.hidden || drop.contains(e.target) || !editor.hidden;
    }
    bcSetupBannerDropTarget(toolApp, {
      isInScope: isDragEventInScope,
      getEnterTarget: e => (!drop.hidden ? toolApp : (!editor.hidden ? addTile : drop)),
      clearTargets: [toolApp, drop, addTile],
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

  /* ===== result preview — shares Convert's .result card ===== same
     shared/site.css component Convert's appendPreviewCard()/
     addResultRemoveButton() use (.result/.result-name/.result-size/
     .result-remove) — just standing in an <audio> element where
     Convert puts an <img>, since there's no visual thumbnail for
     audio. Lets you listen to what you were just converted (or a
     previous batch's results still sitting there) instead of only
     getting a status line. */
  function addResultRemoveButton(card){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "result-remove";
    btn.setAttribute("aria-label", "Remove");
    btn.textContent = "×";
    btn.addEventListener("click", () => {
      const resultAudio = card.querySelector("audio");
      if (resultAudio && resultAudio.src.startsWith("blob:")) URL.revokeObjectURL(resultAudio.src);
      card.remove();
    });
    card.appendChild(btn);
  }

  async function convertOneFile(file){
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    /* try/finally so a decode failure (a genuinely malformed or
       unsupported file mid-batch) still closes the context — Chrome
       caps concurrent AudioContexts at ~6, so repeated failures
       without this would eventually throw on every later file too,
       not just the bad one. */
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

  /* ===== conversion ===== each file decodes/encodes independently
     (its own input format auto-detected at decode time) and converts
     to the one shared Output format/Bitrate — downloaded and shown as
     its own result card as soon as it's done, rather than waiting for
     the whole batch. */
  convertBtn.addEventListener("click", async () => {
    if (loaded.length === 0) return;
    convertBtn.disabled = true;
    clearResultsContainer(resultsEl);
    startPrivacyCheck();

    let successCount = 0;
    for (let i = 0; i < loaded.length; i++){
      const file = loaded[i].file;
      const label = loaded.length > 1 ? ` (${i + 1}/${loaded.length})` : "";
      statusEl.textContent = `Converting ${file.name}...${label}`;
      try {
        const { blob, ext } = await convertOneFile(file);
        const outName = (loaded[i].outputName.trim() || "converted") + "." + ext;
        downloadBlob(blob, outName);

        const url = URL.createObjectURL(blob);
        const result = document.createElement("div");
        result.className = "result";
        result.innerHTML = `
          <audio controls controlsList="nodownload" style="width:100%"></audio>
          <div class="result-name">${outName}</div>
          <div class="result-size">${formatKB(blob.size)}</div>
        `;
        result.querySelector("audio").src = url;
        addResultRemoveButton(result);
        resultsEl.appendChild(result);
        successCount++;
      } catch (err){
        console.error(err);
      }
    }

    statusEl.textContent = successCount === loaded.length
      ? "Done."
      : `Done — ${successCount} of ${loaded.length} converted successfully.`;
    if (successCount > 0) bcDbClear(CD_DB_NAME, CD_DB_STORE);
    convertBtn.disabled = false;
    finishPrivacyCheck(document.getElementById("cdPrivacyBadge"));
  });
})();
