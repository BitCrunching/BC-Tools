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
  const sourceAudio = document.getElementById("cdSourceAudio");
  const fileNameEl = document.getElementById("cdFileName");
  const convertBtn = document.getElementById("cdConvertBtn");
  const statusEl = document.getElementById("cdStatus");
  const resultsEl = document.getElementById("cdResults");
  const bitrateGroup = document.getElementById("cdBitrateGroup");

  const formatTrigger = document.getElementById("cdFormatTrigger");
  const formatInput = document.getElementById("cdFormatInput");
  const formatMenu = document.getElementById("cdFormatMenu");
  const formatEmpty = document.getElementById("cdFormatEmpty");
  const bitrateTrigger = document.getElementById("cdBitrateTrigger");
  const bitrateTriggerLabel = document.getElementById("cdBitrateTriggerLabel");
  const bitrateMenu = document.getElementById("cdBitrateMenu");

  const urlRow = document.getElementById("cdUrlRow");
  const urlInput = document.getElementById("cdUrlInput");
  const urlBtn = document.getElementById("cdUrlBtn");
  const urlPasteBtn = document.getElementById("cdUrlPasteBtn");
  const urlStatus = document.getElementById("cdUrlStatus");

  /* ===== Help banner (step-through intro for first-time visitors) =====
     Shared logic — shared/site.js's bcSetupHelpBanner — only the step
     content lives here now. */
  bcSetupHelpBanner("coudio", "cd", [
    ["WELCOME_TO_COUDIO", "Coudio converts audio and video between MP3, WAV, OGG, AIFF, AU, CAF, and VOC — entirely in your browser. Click or drop a file below to get started."],
    ["PICK_YOUR_FORMAT", "Choose MP3 or WAV as the output — MP3 also lets you pick a bitrate to trade file size for quality."],
    ["CHECK_BEFORE_CONVERTING", "Your file shows up below once picked — give it a quick listen before converting."],
    ["YOU_ARE_SET", "Hit Convert and the file downloads automatically. Close this with the red dot and we won't show it again."]
  ]);

  let currentFile = null;
  let objectUrl = null;
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
     only has 3, so it stays on the shared plain bcRegisterDropdown. */
  bcRegisterCombo(formatTrigger, formatInput, formatMenu, formatEmpty, (opt) => {
    outputFormat = opt.dataset.format;
    /* Bitrate only applies to the two lossy formats (MP3, OGG/Opus) —
       every other option here is uncompressed PCM, no such setting. */
    bitrateGroup.hidden = outputFormat !== "mp3" && outputFormat !== "ogg";
  });
  bcRegisterDropdown(bitrateTrigger, bitrateMenu, (opt) => {
    bitrate = parseInt(opt.dataset.bitrate, 10);
    bitrateTriggerLabel.textContent = opt.dataset.label;
  });

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

  function setFile(file){
    if (!isAcceptableFile(file)) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    currentFile = file;
    objectUrl = URL.createObjectURL(file);
    sourceAudio.src = objectUrl;
    fileNameEl.textContent = file.name;
    drop.hidden = true;
    urlRow.hidden = true;
    editor.hidden = false;
    convertBtn.disabled = false;
    resultsEl.innerHTML = "";
    statusEl.textContent = "";
  }

  function resetTool(){
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    currentFile = null;
    sourceAudio.removeAttribute("src");
    editor.hidden = true;
    drop.hidden = false;
    urlRow.hidden = false;
    convertBtn.disabled = true;
    resultsEl.innerHTML = "";
    statusEl.textContent = "";
    urlStatus.hidden = true;
    urlInput.value = "";
  }

  removeBtn.addEventListener("click", resetTool);
  input.addEventListener("change", (e) => setFile(e.target.files[0]));

  /* ===== load from a direct URL — an alternative to picking/dropping a
     local file. This only works for links the source server actually
     lets a browser fetch cross-origin (CORS); most sites don't opt
     into that, so fetch() just throws a generic network error for
     those — there's no way to tell "blocked by CORS" apart from "the
     link is dead" from here, so the error message below covers both
     rather than guessing wrong. */
  async function loadFromUrl(){
    const url = urlInput.value.trim();
    if (!url) return;
    urlBtn.disabled = true;
    urlStatus.hidden = false;
    urlStatus.textContent = "Fetching...";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Server returned " + res.status);
      const blob = await res.blob();
      let name = "audio";
      try {
        const path = new URL(url).pathname;
        const last = path.split("/").pop();
        if (last) name = decodeURIComponent(last);
      } catch (err) { /* malformed URL — keep the fallback name */ }
      const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
      if (!isAcceptableFile(file)){
        urlStatus.textContent = "That link doesn't look like an audio or video file.";
        return;
      }
      setFile(file);
    } catch (err){
      console.error(err);
      urlStatus.hidden = false;
      urlStatus.textContent = "Couldn't load that link — it may be down, or the server may not allow cross-origin downloads (most don't). Try downloading it yourself and dropping the file instead.";
    } finally {
      urlBtn.disabled = false;
    }
  }
  urlBtn.addEventListener("click", loadFromUrl);
  /* Mobile-only (see .bc-url-paste-btn CSS) — reads the clipboard
     directly into the field instead of relying on a phone keyboard's
     paste affordance, which is easy to miss on a URL-type field.
     navigator.clipboard.readText() needs a secure context and can be
     denied by the user or blocked entirely on some browsers, so this
     fails quietly into just focusing the input — worst case, they're
     exactly where they'd be without the button. */
  if (urlPasteBtn){
    urlPasteBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) urlInput.value = text.trim();
      } catch (err){
        /* clipboard read denied/unsupported — fall through to focus */
      }
      urlInput.focus();
    });
  }
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      loadFromUrl();
    }
  });

  /* Same whole-banner drop target as Convert/Congify's — before an
     audio file is loaded, #cdDrop is just the dashed visual cue, not
     the actual click/drag scope: the entire .tool-app banner opens the
     picker and accepts a drag/drop. isDragEventInScope() flips the
     moment a file loads and #cdDrop is hidden, so it never fights the
     format/bitrate controls once there's real content to interact
     with. */
  const toolApp = document.querySelector(".tool-app");
  if (toolApp){
    toolApp.addEventListener("click", e => {
      if (e.target.closest("button, select, a, label, input")) return;
      if (!drop.hidden || drop.contains(e.target)){
        input.click();
      }
    });

    function isDragEventInScope(e){
      return !drop.hidden || drop.contains(e.target);
    }
    bcSetupBannerDropTarget(toolApp, {
      isInScope: isDragEventInScope,
      getEnterTarget: e => (!drop.hidden ? toolApp : drop),
      clearTargets: [toolApp, drop],
      onDrop: e => setFile(e.dataTransfer.files[0])
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

  /* ===== conversion ===== */
  convertBtn.addEventListener("click", async () => {
    if (!currentFile) return;
    convertBtn.disabled = true;
    statusEl.textContent = "Decoding audio...";

    try {
      const arrayBuffer = await currentFile.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      let blob, ext, mime;
      if (outputFormat === "wav"){
        statusEl.textContent = "Encoding WAV...";
        blob = encodeWav(audioBuffer);
        ext = "wav";
        mime = "audio/wav";
      } else if (outputFormat === "ogg"){
        statusEl.textContent = "Encoding OGG...";
        blob = await encodeOgg(audioBuffer, bitrate);
        ext = "ogg";
        mime = "audio/ogg";
      } else if (outputFormat === "aiff"){
        statusEl.textContent = "Encoding AIFF...";
        blob = encodeAiff(audioBuffer);
        ext = "aiff";
        mime = "audio/aiff";
      } else if (outputFormat === "au"){
        statusEl.textContent = "Encoding AU...";
        blob = encodeAu(audioBuffer);
        ext = "au";
        mime = "audio/basic";
      } else if (outputFormat === "caf"){
        statusEl.textContent = "Encoding CAF...";
        blob = encodeCaf(audioBuffer);
        ext = "caf";
        mime = "audio/x-caf";
      } else if (outputFormat === "voc"){
        statusEl.textContent = "Encoding VOC...";
        blob = encodeVoc(audioBuffer);
        ext = "voc";
        mime = "audio/x-voc";
      } else {
        statusEl.textContent = "Encoding MP3...";
        blob = await encodeMp3(audioBuffer, bitrate);
        ext = "mp3";
        mime = "audio/mpeg";
      }
      audioCtx.close();

      statusEl.textContent = "Done.";
      const outName = currentFile.name.replace(/\.[^.]+$/, "") + "." + ext;
      downloadBlob(blob, outName);

      const url = URL.createObjectURL(blob);
      const result = document.createElement("div");
      result.className = "result";
      const resultAudio = document.createElement("audio");
      resultAudio.controls = true;
      resultAudio.style.width = "100%";
      resultAudio.src = url;
      result.appendChild(resultAudio);
      resultsEl.innerHTML = "";
      resultsEl.appendChild(result);

      convertBtn.disabled = false;
    } catch (err){
      console.error(err);
      statusEl.textContent = "Something went wrong converting this file.";
      convertBtn.disabled = false;
    }
  });
})();
