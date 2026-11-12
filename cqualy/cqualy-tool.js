/* Cqualy — equalizer and sound wave. Decoding and playback use the native
   Web Audio API, so nothing is uploaded and no library is loaded. The
   engine (cqEngine) knows nothing about the page: it takes a File and
   returns an AudioBuffer, peaks and playback state, so another surface
   can drive it later. */
(function(){
  const EQ_BANDS = [
    { type: "lowshelf",  freq: 60 },
    { type: "peaking",   freq: 170 },
    { type: "peaking",   freq: 400 },
    { type: "peaking",   freq: 1000 },
    { type: "peaking",   freq: 2400 },
    { type: "peaking",   freq: 6000 },
    { type: "highshelf", freq: 12000 }
  ];

  function makeFilter(audioCtx, band, gain){
    const f = audioCtx.createBiquadFilter();
    f.type = band.type;
    f.frequency.value = band.freq;
    f.gain.value = gain;
    if (band.type === "peaking") f.Q.value = 1.1;
    return f;
  }

  function createEngine(){
    let ctx = null;
    let filters = [];
    const gains = EQ_BANDS.map(() => 0);
    let buffer = null;
    let source = null;
    let playing = false;
    let startedAt = 0;
    let offset = 0;
    let onEnd = null;

    function ensureContext(){
      if (ctx) return ctx;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      filters = EQ_BANDS.map((band, i) => makeFilter(ctx, band, gains[i]));
      filters.forEach((f, i) => f.connect(i + 1 < filters.length ? filters[i + 1] : ctx.destination));
      return ctx;
    }

    function decode(file){
      const audioCtx = ensureContext();
      return file.arrayBuffer().then(bytes => new Promise((resolve, reject) => {
        audioCtx.decodeAudioData(bytes, resolve, reject);
      }));
    }

    function stopSource(){
      if (!source) return;
      source.onended = null;
      try { source.stop(); } catch (e) {}
      source.disconnect();
      source = null;
    }

    function position(){
      if (!buffer) return 0;
      const t = playing ? ctx.currentTime - startedAt : offset;
      return Math.min(Math.max(t, 0), buffer.duration);
    }

    function play(){
      if (!buffer || playing) return;
      if (offset >= buffer.duration - 0.01) offset = 0;
      const audioCtx = ensureContext();
      if (audioCtx.state === "suspended") audioCtx.resume();
      source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(filters[0]);
      source.onended = () => {
        if (!playing) return;
        playing = false;
        offset = buffer.duration;
        source = null;
        if (onEnd) onEnd();
      };
      startedAt = audioCtx.currentTime - offset;
      source.start(0, offset);
      playing = true;
    }

    function pause(){
      if (!playing) return;
      offset = position();
      playing = false;
      stopSource();
    }

    function seek(seconds){
      if (!buffer) return;
      const target = Math.min(Math.max(seconds, 0), buffer.duration);
      const wasPlaying = playing;
      if (wasPlaying){
        playing = false;
        stopSource();
      }
      offset = target;
      if (wasPlaying) play();
    }

    function load(next){
      playing = false;
      stopSource();
      buffer = next;
      offset = 0;
    }

    function unload(){
      load(null);
    }

    function setGain(index, db){
      gains[index] = db;
      if (filters[index]) filters[index].gain.value = db;
    }

    function render(){
      if (!buffer) return Promise.reject(new Error("No audio loaded"));
      const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      const src = off.createBufferSource();
      src.buffer = buffer;
      let node = src;
      EQ_BANDS.forEach((band, i) => {
        const f = makeFilter(off, band, gains[i]);
        node.connect(f);
        node = f;
      });
      node.connect(off.destination);
      src.start();
      return off.startRendering();
    }

    function peaks(columns){
      const out = new Float32Array(columns * 2);
      if (!buffer || columns < 1) return out;
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const perColumn = buffer.length / columns;
      const stride = Math.max(1, Math.floor(perColumn / 96));
      for (let x = 0; x < columns; x++){
        const from = Math.floor(x * perColumn);
        const to = Math.min(buffer.length, Math.floor((x + 1) * perColumn));
        let lo = 0, hi = 0;
        for (let i = from; i < to; i += stride){
          for (let c = 0; c < channels.length; c++){
            const v = channels[c][i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        out[x * 2] = lo;
        out[x * 2 + 1] = hi;
      }
      return out;
    }

    return {
      decode, load, unload, play, pause, seek, position, peaks, setGain, render,
      get buffer(){ return buffer; },
      get playing(){ return playing; },
      set onEnd(fn){ onEnd = fn; }
    };
  }

  function loadLame(){
    if (window.lamejs) return Promise.resolve();
    if (!loadLame.promise){
      loadLame.promise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/vendor/lame.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load lame.min.js"));
        document.head.appendChild(script);
      });
    }
    return loadLame.promise;
  }

  function limitPeaks(audioBuffer){
    let peak = 0;
    for (let c = 0; c < audioBuffer.numberOfChannels; c++){
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++){
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    if (peak <= 1) return;
    const gain = 0.99 / peak;
    for (let c = 0; c < audioBuffer.numberOfChannels; c++){
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] *= gain;
    }
  }

  function floatTo16BitPCM(input){
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++){
      const v = Math.max(-1, Math.min(1, input[i]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
  }

  function encodeWav(audioBuffer){
    const channels = audioBuffer.numberOfChannels;
    const frames = audioBuffer.length;
    const blockAlign = channels * 2;
    const dataSize = frames * blockAlign;
    const view = new DataView(new ArrayBuffer(44 + dataSize));
    const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);
    const pcm = [];
    for (let c = 0; c < channels; c++) pcm.push(floatTo16BitPCM(audioBuffer.getChannelData(c)));
    let offset = 44;
    for (let i = 0; i < frames; i++){
      for (let c = 0; c < channels; c++){
        view.setInt16(offset, pcm[c][i], true);
        offset += 2;
      }
    }
    return new Blob([view], { type: "audio/wav" });
  }

  async function encodeMp3(audioBuffer, kbps){
    await loadLame();
    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const encoder = new lamejs.Mp3Encoder(channels, audioBuffer.sampleRate, kbps);
    const left = floatTo16BitPCM(audioBuffer.getChannelData(0));
    const right = channels === 2 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : null;
    const chunks = [];
    for (let i = 0; i < left.length; i += 1152){
      const out = channels === 2 ? encoder.encodeBuffer(left.subarray(i, i + 1152), right.subarray(i, i + 1152)) : encoder.encodeBuffer(left.subarray(i, i + 1152));
      if (out.length > 0) chunks.push(out);
    }
    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(tail);
    return new Blob(chunks, { type: "audio/mpeg" });
  }

  const engine = createEngine();
  window.cqEngine = engine;

  const toolApp = document.getElementById("page-cqualy");
  const drop = document.getElementById("cqDrop");
  const input = document.getElementById("cqInput");
  const editor = document.getElementById("cqEditor");
  const removeBtn = document.getElementById("cqRemoveBtn");
  const statusEl = document.getElementById("cqStatus");
  const nameEl = document.getElementById("cqName");
  const metaEl = document.getElementById("cqMeta");
  const canvas = document.getElementById("cqWave");
  const playBtn = document.getElementById("cqPlayBtn");
  const timeEl = document.getElementById("cqTime");
  const ctx2d = canvas.getContext("2d");

  const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i;
  let peaks = null;
  let peaksWidth = 0;
  let rafId = 0;
  let loadToken = 0;
  let currentName = "";
  let outFormat = "mp3";

  function isAudioFile(file){
    return (file.type && file.type.indexOf("audio/") === 0) || AUDIO_EXT.test(file.name);
  }

  function formatTime(seconds){
    const s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function updateTime(){
    const total = engine.buffer ? engine.buffer.duration : 0;
    timeEl.textContent = formatTime(engine.position()) + " / " + formatTime(total);
  }

  function draw(){
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h){
      canvas.width = w;
      canvas.height = h;
    }
    ctx2d.clearRect(0, 0, w, h);
    if (!engine.buffer) return;

    const barW = Math.max(2, Math.round(3 * dpr));
    const gap = Math.max(1, Math.round(dpr));
    const columns = Math.max(1, Math.floor(w / (barW + gap)));
    if (!peaks || peaksWidth !== columns){
      peaks = engine.peaks(columns);
      peaksWidth = columns;
    }

    const mid = h / 2;
    const progress = engine.position() / engine.buffer.duration;
    const color = getComputedStyle(canvas).color;
    for (let i = 0; i < columns; i++){
      const lo = peaks[i * 2], hi = peaks[i * 2 + 1];
      const top = mid + lo * mid * 0.92;
      const bottom = mid + hi * mid * 0.92;
      const barH = Math.max(2 * dpr, bottom - top);
      ctx2d.globalAlpha = (i + 0.5) / columns <= progress ? 1 : 0.4;
      ctx2d.fillStyle = color;
      ctx2d.fillRect(i * (barW + gap), top, barW, barH);
    }
    ctx2d.globalAlpha = 1;
    const x = Math.round(progress * w);
    ctx2d.fillStyle = color;
    ctx2d.fillRect(Math.min(x, w - Math.max(2, dpr)), 0, Math.max(2, Math.round(dpr * 1.5)), h);
  }

  function tick(){
    rafId = 0;
    draw();
    updateTime();
    if (engine.playing) rafId = requestAnimationFrame(tick);
  }

  function refresh(){
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function setPlayLabel(){
    playBtn.textContent = engine.playing ? bcT("Pause") : bcT("Play");
  }

  function togglePlay(){
    if (!engine.buffer) return;
    if (engine.playing) engine.pause(); else engine.play();
    setPlayLabel();
    refresh();
  }

  engine.onEnd = () => {
    setPlayLabel();
    refresh();
  };

  function seekFromEvent(e){
    if (!engine.buffer) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    engine.seek(ratio * engine.buffer.duration);
    refresh();
  }

  let scrubbing = false;
  canvas.addEventListener("pointerdown", e => {
    scrubbing = true;
    canvas.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  });
  canvas.addEventListener("pointermove", e => { if (scrubbing) seekFromEvent(e); });
  const endScrub = () => { scrubbing = false; };
  canvas.addEventListener("pointerup", endScrub);
  canvas.addEventListener("pointercancel", endScrub);

  playBtn.addEventListener("click", togglePlay);

  const PRESETS = {
    flat:   [0, 0, 0, 0, 0, 0, 0],
    bass:   [6, 5, 2, 0, 0, 0, 0],
    treble: [0, 0, 0, 0, 2, 5, 6],
    voice:  [-3, -2, 0, 3, 4, 2, -1]
  };
  const bandsEl = document.getElementById("cqBands");
  const presetTrigger = document.getElementById("cqPresetTrigger");
  const presetMenu = document.getElementById("cqPresetMenu");
  const presetLabel = presetTrigger.querySelector(".bc-dropdown-trigger-label");

  const formatDb = db => (db > 0 ? "+" : "") + db + " dB";
  const formatHz = hz => hz >= 1000 ? (hz / 1000) + "k" : String(hz);

  const sliders = EQ_BANDS.map((band, i) => {
    const wrap = document.createElement("div");
    wrap.className = "cq-band";
    const valueEl = document.createElement("span");
    valueEl.className = "cq-band-value";
    valueEl.textContent = formatDb(0);
    const track = document.createElement("div");
    track.className = "cq-band-track";
    const range = document.createElement("input");
    range.type = "range";
    range.min = -12;
    range.max = 12;
    range.step = 0.5;
    range.value = 0;
    range.setAttribute("aria-label", formatHz(band.freq) + " Hz");
    const hzEl = document.createElement("span");
    hzEl.className = "cq-band-hz";
    hzEl.textContent = formatHz(band.freq);
    track.appendChild(range);
    wrap.append(valueEl, track, hzEl);
    bandsEl.appendChild(wrap);
    range.addEventListener("input", () => {
      engine.setGain(i, +range.value);
      valueEl.textContent = formatDb(+range.value);
      presetLabel.textContent = bcT("Custom");
    });
    range.addEventListener("dblclick", () => {
      range.value = 0;
      range.dispatchEvent(new Event("input"));
    });
    return { range, valueEl };
  });

  const downloadBtn = document.getElementById("cqDownloadBtn");
  const formatTrigger = document.getElementById("cqFormatTrigger");
  const formatMenu = document.getElementById("cqFormatMenu");
  bcRegisterDropdown(formatTrigger, formatMenu, opt => {
    outFormat = opt.dataset.format;
    formatTrigger.querySelector(".bc-dropdown-trigger-label").textContent = opt.dataset.label;
  });

  async function download(){
    if (!engine.buffer) return;
    downloadBtn.disabled = true;
    statusEl.textContent = bcT("Rendering {0}...", [currentName]);
    startPrivacyCheck();
    try {
      const rendered = await engine.render();
      limitPeaks(rendered);
      const blob = outFormat === "wav" ? encodeWav(rendered) : await encodeMp3(rendered, 320);
      const outName = currentName.replace(/\.[^.]+$/, "") + " (eq)." + outFormat;
      downloadBlob(blob, outName);
      statusEl.textContent = bcT("Done — {0} saved.", [outName]);
    } catch (err){
      console.error(err);
      statusEl.textContent = bcT("Couldn't render {0}. Try a smaller file or another format.", [currentName]);
    } finally {
      finishPrivacyCheck(document.getElementById("cqPrivacyBadge"));
      downloadBtn.disabled = false;
    }
  }
  downloadBtn.addEventListener("click", download);

  function applyBands(gains){
    gains.forEach((g, i) => {
      sliders[i].range.value = g;
      sliders[i].valueEl.textContent = formatDb(g);
      engine.setGain(i, g);
    });
  }

  bcRegisterDropdown(presetTrigger, presetMenu, opt => {
    presetLabel.textContent = opt.dataset.label;
    applyBands(PRESETS[opt.dataset.preset]);
  });

  function showEditor(file, buffer){
    currentName = file.name;
    nameEl.textContent = file.name;
    nameEl.title = file.name;
    const channels = buffer.numberOfChannels === 1 ? bcT("Mono") : buffer.numberOfChannels === 2 ? bcT("Stereo") : bcT("{0} channels", [buffer.numberOfChannels]);
    metaEl.textContent = [formatTime(buffer.duration), channels, bcFormatFileSize(file.size)].join(" · ");
    drop.hidden = true;
    editor.hidden = false;
    peaks = null;
    setPlayLabel();
    refresh();
  }

  function resetTool(){
    loadToken++;
    engine.unload();
    peaks = null;
    editor.hidden = true;
    drop.hidden = false;
    statusEl.textContent = "";
    setPlayLabel();
  }

  function addFile(files){
    const file = files && files[0];
    if (!file) return;
    if (!isAudioFile(file)){
      statusEl.textContent = bcT("Cqualy only works with audio files — that file doesn't qualify.");
      return;
    }
    const token = ++loadToken;
    statusEl.textContent = bcT("Reading {0}...", [file.name]);
    engine.decode(file).then(buffer => {
      if (token !== loadToken) return;
      engine.load(buffer);
      statusEl.textContent = bcT("{0} loaded", [file.name]);
      showEditor(file, buffer);
    }).catch(() => {
      if (token !== loadToken) return;
      statusEl.textContent = bcT("Couldn't read {0}. Make sure it's a valid audio file.", [file.name]);
    });
  }

  removeBtn.addEventListener("click", resetTool);
  input.addEventListener("change", e => { addFile(e.target.files); input.value = ""; });

  toolApp.addEventListener("click", e => {
    if (e.target.closest("button, select, a, label, input, canvas")) return;
    if (editor.hidden) input.click();
  });
  bcSetupBannerDropTarget(toolApp, {
    isInScope: () => editor.hidden,
    getEnterTarget: () => toolApp,
    clearTargets: [toolApp, drop],
    onDrop: e => addFile(e.dataTransfer.files)
  });

  addEventListener("keydown", e => {
    if (editor.hidden || e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.code === "Space" && !e.target.closest("button")){
      e.preventDefault();
      togglePlay();
    } else if (e.code === "ArrowLeft" || e.code === "ArrowRight"){
      engine.seek(engine.position() + (e.code === "ArrowRight" ? 5 : -5));
      refresh();
    }
  });

  addEventListener("resize", refresh);
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
