/* Cqualy — equalizer and sound wave. Decoding and playback use the native
   Web Audio API, so nothing is uploaded and no library is loaded. The
   engine (cqEngine) knows nothing about the page: it takes a File and
   returns an AudioBuffer, peaks and playback state, so another surface
   can drive it later. */
(function(){
  const EQ_BANDS = [
    { type: "lowshelf",  freq: 31 },
    { type: "peaking",   freq: 60 },
    { type: "peaking",   freq: 170 },
    { type: "peaking",   freq: 310 },
    { type: "peaking",   freq: 600 },
    { type: "peaking",   freq: 1000 },
    { type: "peaking",   freq: 3000 },
    { type: "peaking",   freq: 6000 },
    { type: "peaking",   freq: 12000 },
    { type: "peaking",   freq: 14000 },
    { type: "highshelf", freq: 16000 }
  ];

  function makeFilter(audioCtx, band, gain){
    const f = audioCtx.createBiquadFilter();
    f.type = band.type;
    f.frequency.value = band.freq;
    f.gain.value = gain;
    if (band.type === "peaking") f.Q.value = 1.4;
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
    let processed = null;
    let processedPeak = 1;
    let procToken = 0;
    let procRunning = false;
    let procDirty = false;
    let onProcessed = null;
    let volumeDb = 0;
    let rate = 1;
    let outChannels = 0;
    let pan = 0;
    let master = null;
    let panner = null;

    function ensureContext(){
      if (ctx) return ctx;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      filters = EQ_BANDS.map((band, i) => makeFilter(ctx, band, gains[i]));
      master = ctx.createGain();
      master.gain.value = Math.pow(10, volumeDb / 20);
      panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) panner.pan.value = pan;
      filters.forEach((f, i) => f.connect(i + 1 < filters.length ? filters[i + 1] : master));
      if (panner){
        master.connect(panner);
        panner.connect(ctx.destination);
      } else {
        master.connect(ctx.destination);
      }
      return ctx;
    }

    function decode(file){
      const audioCtx = ensureContext();
      return file.arrayBuffer().then(bytes => new Promise((resolve, reject) => {
        const pending = audioCtx.decodeAudioData(bytes, resolve, reject);
        if (pending && pending.catch) pending.catch(() => {});
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
      const t = playing ? offset + (ctx.currentTime - startedAt) * rate : offset;
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
      source.playbackRate.value = rate;
      startedAt = audioCtx.currentTime;
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
      processed = null;
      processedPeak = 1;
      scheduleProcessed();
    }

    function unload(){
      load(null);
    }

    function setGain(index, db){
      gains[index] = db;
      if (filters[index]) filters[index].gain.value = db;
      scheduleProcessed();
    }

    function setRate(next){
      if (playing){
        offset = position();
        startedAt = ctx.currentTime;
      }
      rate = next;
      if (source) source.playbackRate.value = next;
      scheduleProcessed();
    }

    function setVolume(db){
      volumeDb = db;
      if (master) master.gain.value = Math.pow(10, db / 20);
      scheduleProcessed();
    }

    function setPan(value){
      pan = value;
      if (panner) panner.pan.value = value;
      scheduleProcessed();
    }

    function scheduleProcessed(){
      const token = ++procToken;
      if (!buffer || (gains.every(g => g === 0) && volumeDb === 0 && pan === 0 && rate === 1)){
        processed = null;
        processedPeak = 1;
        if (onProcessed) onProcessed();
        return;
      }
      if (procRunning){
        procDirty = true;
        return;
      }
      procRunning = true;
      render().then(rendered => {
        if (token !== procToken && !procDirty) return;
        let peak = 0;
        for (let c = 0; c < rendered.numberOfChannels; c++){
          const data = rendered.getChannelData(c);
          for (let i = 0; i < data.length; i++){
            const v = Math.abs(data[i]);
            if (v > peak) peak = v;
          }
        }
        processed = rendered;
        processedPeak = peak;
      }).catch(() => {
        processed = null;
        processedPeak = 1;
      }).then(() => {
        procRunning = false;
        if (onProcessed) onProcessed();
        if (procDirty){
          procDirty = false;
          scheduleProcessed();
        }
      });
    }

    function setOutputChannels(n){
      outChannels = n;
    }

    function render(final){
      if (!buffer) return Promise.reject(new Error("No audio loaded"));
      const channels = final && outChannels
        ? outChannels
        : pan !== 0 ? Math.max(2, buffer.numberOfChannels) : buffer.numberOfChannels;
      const off = new OfflineAudioContext(channels, Math.max(1, Math.ceil(buffer.length / rate)), buffer.sampleRate);
      const src = off.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      let node = src;
      EQ_BANDS.forEach((band, i) => {
        const f = makeFilter(off, band, gains[i]);
        node.connect(f);
        node = f;
      });
      const level = off.createGain();
      level.gain.value = Math.pow(10, volumeDb / 20);
      node.connect(level);
      node = level;
      if (pan !== 0 && off.createStereoPanner && channels >= 2){
        const p = off.createStereoPanner();
        p.pan.value = pan;
        node.connect(p);
        node = p;
      }
      node.connect(off.destination);
      src.start();
      return off.startRendering();
    }

    function peaks(columns){
      const out = new Float32Array(columns * 2);
      if (!buffer || columns < 1) return out;
      const src = processed || buffer;
      const k = processed && processedPeak > 1 ? 0.99 / processedPeak : 1;
      const channels = [];
      for (let c = 0; c < src.numberOfChannels; c++) channels.push(src.getChannelData(c));
      const perColumn = src.length / columns;
      const stride = Math.max(1, Math.floor(perColumn / 96));
      for (let x = 0; x < columns; x++){
        const from = Math.floor(x * perColumn);
        const to = Math.min(src.length, Math.floor((x + 1) * perColumn));
        let lo = 0, hi = 0;
        for (let i = from; i < to; i += stride){
          for (let c = 0; c < channels.length; c++){
            const v = channels[c][i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        out[x * 2] = lo * k;
        out[x * 2 + 1] = hi * k;
      }
      return out;
    }

    return {
      decode, load, unload, play, pause, seek, position, peaks, setGain, setVolume, setPan, setRate, setOutputChannels, render,
      get buffer(){ return buffer; },
      get playing(){ return playing; },
      set onEnd(fn){ onEnd = fn; },
      set onProcessed(fn){ onProcessed = fn; }
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
    const extensible = channels > 2;
    const headerSize = extensible ? 68 : 44;
    const view = new DataView(new ArrayBuffer(headerSize + dataSize));
    const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeString(0, "RIFF");
    view.setUint32(4, headerSize - 8 + dataSize, true);
    writeString(8, "WAVEfmt ");
    view.setUint32(16, extensible ? 40 : 16, true);
    view.setUint16(20, extensible ? 0xFFFE : 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    if (extensible){
      const masks = { 4: 0x33, 6: 0x3F, 8: 0x63F };
      view.setUint16(36, 22, true);
      view.setUint16(38, 16, true);
      view.setUint32(40, masks[channels] || 0, true);
      [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71]
        .forEach((byte, i) => view.setUint8(44 + i, byte));
    }
    writeString(headerSize - 8, "data");
    view.setUint32(headerSize - 4, dataSize, true);
    const pcm = [];
    for (let c = 0; c < channels; c++) pcm.push(floatTo16BitPCM(audioBuffer.getChannelData(c)));
    let offset = headerSize;
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
  let outputBase = "";
  let sourceChannels = 0;
  let outCh = 0;
  let outFormat = "mp3";

  const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)$/i;
  const VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/x-m4v"];
  function isAudioFile(file){
    if (file.type && file.type.indexOf("audio/") === 0) return true;
    if (VIDEO_MIME.includes(file.type)) return true;
    return AUDIO_EXT.test(file.name) || VIDEO_EXT.test(file.name);
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
  engine.onProcessed = () => {
    peaks = null;
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
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: [6, 6, 5, 3, 1, 0, 0, 0, 0, 0, 0],
    treble: [0, 0, 0, 0, 0, 0, 1, 3, 5, 6, 6],
    voice: [-4, -3, -2, 0, 1, 3, 4, 2, 0, -2, -3],
    rock: [4, 4, 2, -1, -2, -1, 1, 3, 4, 4, 4],
    pop: [-2, -1, 0, 2, 3, 3, 2, 0, -1, -1, -2],
    jazz: [3, 2, 1, 2, -2, -2, 0, 1, 2, 3, 3],
    classical: [3, 2, 1, 1, 0, 0, 0, -1, -2, -3, -3],
    electronic: [5, 5, 3, 0, -2, -2, 0, 2, 4, 5, 5],
    hiphop: [6, 5, 4, 2, 1, -1, -1, 1, 1, 2, 2],
    acoustic: [3, 3, 2, 1, 2, 2, 2, 2, 3, 2, 1],
    loudness: [6, 5, 3, 0, -1, -1, 0, 2, 4, 5, 6],
    rumble: [-12, -8, -3, 0, 0, 0, 0, 0, 0, 0, 0],
    hiss: [0, 0, 0, 0, 0, 0, 0, -2, -4, -6, -8]
  };
  const bandsEl = document.getElementById("cqBands");
  const presetTrigger = document.getElementById("cqPresetTrigger");
  const presetMenu = document.getElementById("cqPresetMenu");
  const presetField = document.getElementById("cqPresetField");
  presetField.placeholder = bcT("Custom");
  function setPresetCustom(){
    presetMenu.querySelectorAll(".bc-combo-option").forEach(o => {
      o.classList.remove("active");
      o.setAttribute("aria-selected", "false");
    });
    presetField.value = "";
  }

  const UNIT_KEY = "bc-cqualy-unit";
  let unitPct = false;
  try { unitPct = localStorage.getItem(UNIT_KEY) === "pct"; } catch (e) { /* storage unavailable */ }
  const formatValue = db => unitPct
    ? Math.round(Math.pow(10, db / 20) * 100) + "%"
    : (db > 0 ? "+" : "") + db + " dB";
  const formatHz = hz => hz >= 1000 ? (hz / 1000) + "k" : String(hz);

  const sliders = EQ_BANDS.map((band, i) => {
    const wrap = document.createElement("div");
    wrap.className = "cq-band";
    const valueEl = document.createElement("button");
    valueEl.type = "button";
    valueEl.className = "bc-body cq-band-value";
    valueEl.title = bcT("Click to switch between dB and %");
    valueEl.textContent = formatValue(0);
    valueEl.addEventListener("click", toggleUnit);
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
    hzEl.className = "bc-body cq-band-hz";
    hzEl.textContent = formatHz(band.freq);
    track.appendChild(range);
    wrap.append(valueEl, track, hzEl);
    bandsEl.appendChild(wrap);
    range.addEventListener("input", () => {
      engine.setGain(i, +range.value);
      valueEl.textContent = formatValue(+range.value);
      setPresetCustom();
    });
    range.addEventListener("dblclick", () => {
      range.value = 0;
      range.dispatchEvent(new Event("input"));
    });
    return { range, valueEl };
  });

  const outputUi = [];

  function toggleUnit(){
    unitPct = !unitPct;
    try { localStorage.setItem(UNIT_KEY, unitPct ? "pct" : "db"); } catch (e) { /* storage unavailable */ }
    sliders.forEach(sl => { sl.valueEl.textContent = formatValue(+sl.range.value); });
    outputUi.forEach(u => u.refresh());
  }

  const outputEl = document.getElementById("cqOutput");
  const formatPan = p => p === 0 ? bcT("Center") : (p < 0 ? "L " : "R ") + Math.round(Math.abs(p) * 100) + "%";
  [
    { label: bcT("Balance"), min: -1, max: 1, step: 0.05, initial: 0, format: formatPan, apply: v => engine.setPan(v), unitToggle: false },
    { label: bcT("Speed"), min: 0.5, max: 2, step: 0.05, initial: 1, format: r => Math.round(r * 100) + "%", apply: v => engine.setRate(v), unitToggle: false }
  ].forEach(def => {
    const row = document.createElement("div");
    row.className = "cq-out-row";
    const labelEl = document.createElement("span");
    labelEl.className = "bc-label cq-out-label";
    labelEl.textContent = def.label;
    const range = document.createElement("input");
    range.type = "range";
    range.min = def.min;
    range.max = def.max;
    range.step = def.step;
    range.value = def.initial;
    range.setAttribute("aria-label", def.label);
    const valueEl = document.createElement("button");
    valueEl.type = "button";
    valueEl.className = "bc-body cq-band-value cq-out-value";
    valueEl.textContent = def.format(def.initial);
    if (def.unitToggle){
      valueEl.title = bcT("Click to switch between dB and %");
      valueEl.addEventListener("click", toggleUnit);
    } else {
      valueEl.disabled = true;
    }
    const refresh = () => { valueEl.textContent = def.format(+range.value); };
    range.addEventListener("input", () => {
      def.apply(+range.value);
      refresh();
    });
    range.addEventListener("dblclick", () => {
      range.value = def.initial;
      range.dispatchEvent(new Event("input"));
    });
    row.append(labelEl, range, valueEl);
    outputEl.appendChild(row);
    outputUi.push({ range, refresh });
  });

  (function buildVolume(){
    const wrap = document.createElement("div");
    wrap.className = "cq-band";
    const valueEl = document.createElement("button");
    valueEl.type = "button";
    valueEl.className = "bc-body cq-band-value";
    valueEl.title = bcT("Click to switch between dB and %");
    valueEl.textContent = formatValue(0);
    valueEl.addEventListener("click", toggleUnit);
    const track = document.createElement("div");
    track.className = "cq-band-track";
    const range = document.createElement("input");
    range.type = "range";
    range.min = -12;
    range.max = 12;
    range.step = 0.5;
    range.value = 0;
    range.setAttribute("aria-label", bcT("Volume"));
    const labelEl = document.createElement("span");
    labelEl.className = "bc-body cq-band-hz";
    labelEl.textContent = bcT("Volume");
    track.appendChild(range);
    wrap.append(valueEl, track, labelEl);
    document.getElementById("cqVolume").appendChild(wrap);
    const refresh = () => { valueEl.textContent = formatValue(+range.value); };
    range.addEventListener("input", () => {
      engine.setVolume(+range.value);
      refresh();
    });
    range.addEventListener("dblclick", () => {
      range.value = 0;
      range.dispatchEvent(new Event("input"));
    });
    outputUi.push({ range, refresh });
  })();

  const downloadBtn = document.getElementById("cqDownloadBtn");
  const formatTrigger = document.getElementById("cqFormatTrigger");
  const formatMenu = document.getElementById("cqFormatMenu");
  bcRegisterDropdown(formatTrigger, formatMenu, opt => {
    outFormat = opt.dataset.format;
    formatTrigger.querySelector(".bc-dropdown-trigger-label").textContent = opt.dataset.label;
    if (outFormat === "mp3" && outCh > 2) setOutChannels(2);
    schedulePersist();
  });

  async function download(){
    if (!engine.buffer) return;
    downloadBtn.disabled = true;
    statusEl.textContent = bcT("Rendering {0}...", [currentName]);
    startPrivacyCheck();
    try {
      const rendered = await engine.render(true);
      limitPeaks(rendered);
      const blob = outFormat === "wav" ? encodeWav(rendered) : await encodeMp3(rendered, 320);
      const outName = bcSafeBaseName(outputBase, currentName.replace(/\.[^.]+$/, "") + " (eq)") + "." + outFormat;
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
      sliders[i].valueEl.textContent = formatValue(g);
      engine.setGain(i, g);
    });
  }

  bcRegisterCombo(presetTrigger, presetField, presetMenu, document.getElementById("cqPresetEmpty"), opt => {
    applyBands(PRESETS[opt.dataset.preset]);
    schedulePersist();
  });

  const DB_NAME = "bctools-cqualy";
  const DB_STORE = "session";
  const continueBtn = document.getElementById("cqContinueBtn");
  let currentFile = null;

  function currentSettings(){
    const active = presetMenu.querySelector(".bc-combo-option.active");
    const ranges = (sel) => [...document.querySelectorAll(sel)].map(r => +r.value);
    const [balance, speed] = ranges("#cqOutput input");
    return {
      gains: sliders.map(sl => +sl.range.value),
      volume: ranges("#cqVolume input")[0],
      balance,
      speed,
      preset: active ? active.dataset.preset : "",
      format: outFormat,
      channels: outCh,
      base: outputBase
    };
  }

  const SETTINGS_KEY = "bc-cqualy-settings";

  /* Settings are tiny, so they are saved instantly and synchronously (a quick F5 cannot lose
     them); only the file bytes go to IndexedDB, once per loaded file. */
  function schedulePersist(){
    if (!currentFile) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ name: currentFile.name, size: currentFile.size, settings: currentSettings() })); } catch (err) { /* storage unavailable */ }
  }

  async function persistFile(file){
    try {
      const bytes = await file.arrayBuffer();
      if (file !== currentFile) return;
      await bcDbPut(DB_NAME, DB_STORE, { name: file.name, type: file.type, size: file.size, bytes });
    } catch (err){ /* storage unavailable — skip */ }
  }

  function setRange(range, value){
    if (!range || typeof value !== "number") return;
    range.value = value;
    range.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applySettings(s){
    if (!s) return;
    if (Array.isArray(s.gains)) s.gains.forEach((g, i) => { if (sliders[i]) setRange(sliders[i].range, g); });
    if (s.preset){
      const opt = presetMenu.querySelector('[data-preset="' + s.preset + '"]');
      if (opt) opt.click();
    }
    const outputs = document.querySelectorAll("#cqOutput input");
    setRange(document.querySelector("#cqVolume input"), s.volume);
    setRange(outputs[0], s.balance);
    setRange(outputs[1], s.speed);
    if (s.format){
      const opt = formatMenu.querySelector('[data-format="' + s.format + '"]');
      if (opt) opt.click();
    }
    if (s.channels && chOpts.some(o => o.value === s.channels)) setOutChannels(s.channels);
    if (typeof s.base === "string" && s.base){
      const nameInput = nameEl.querySelector("input");
      if (nameInput) nameInput.value = s.base;
      outputBase = s.base;
    }
  }

  ["cqBands", "cqOutput", "cqVolume"].forEach(id => document.getElementById(id).addEventListener("input", schedulePersist));

  (async () => {
    const saved = await bcDbGet(DB_NAME, DB_STORE);
    document.dispatchEvent(new Event("bc:session-check-done"));
    if (!saved || !saved.bytes) return;
    if (!editor.hidden) return;
    continueBtn.hidden = false;
    continueBtn.addEventListener("click", () => {
      continueBtn.hidden = true;
      const file = new File([saved.bytes], saved.name, { type: saved.type });
      let settings = null;
      try {
        const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (stored && stored.name === saved.name) settings = stored.settings;
      } catch (err) { /* ignore */ }
      addFile([file]).then(ok => {
        if (ok) applySettings(settings);
        else continueBtn.hidden = false;
      });
    });
  })();

  function channelName(n){
    return n === 1 ? bcT("Mono") : n === 2 ? bcT("Stereo") : n === 4 ? bcT("Quad") : n === 6 ? "5.1" : n === 8 ? "7.1" : bcT("{0} channels", [n]);
  }
  const chBtn = document.getElementById("cqChBtn");
  const chOpts = [1, 2, 6, 8].map(n => ({ value: n, label: channelName(n) }));
  const chCtl = bcRegisterOptionChangeBtn(chBtn, chOpts, opt => {
    outCh = opt.value;
    engine.setOutputChannels(outCh);
    if (outCh > 2 && outFormat === "mp3") formatMenu.querySelector('[data-format="wav"]').click();
    schedulePersist();
  }, 1);
  function setOutChannels(n){
    outCh = n;
    engine.setOutputChannels(n);
    const i = chOpts.findIndex(o => o.value === n);
    if (i >= 0) chCtl.setIndex(i);
    schedulePersist();
  }

  function showEditor(file, buffer){
    currentName = file.name;
    outputBase = file.name.replace(/\.[^.]+$/, "") + " (eq)";
    nameEl.textContent = "";
    nameEl.appendChild(bcCreateRowNameInput(outputBase, value => { outputBase = value; schedulePersist(); }));
    sourceChannels = buffer.numberOfChannels;
    chOpts.length = 0;
    [...new Set([1, 2, 6, 8, sourceChannels])].sort((x, y) => x - y).forEach(n => chOpts.push({ value: n, label: channelName(n) }));
    setOutChannels(sourceChannels);
    drop.hidden = true;
    editor.hidden = false;
    peaks = null;
    setPlayLabel();
    refresh();
  }

  function resetTool(){
    loadToken++;
    currentFile = null;
    try { localStorage.removeItem(SETTINGS_KEY); } catch (err) { /* storage unavailable */ }
    bcDbClear(DB_NAME, DB_STORE);
    engine.unload();
    peaks = null;
    editor.hidden = true;
    drop.hidden = false;
    statusEl.textContent = "";
    setPlayLabel();
  }

  function addFile(files){
    const file = files && files[0];
    if (!file) return Promise.resolve(false);
    if (!isAudioFile(file)){
      statusEl.textContent = bcT("Cqualy only works with audio or video files — that file doesn't qualify.");
      return Promise.resolve(false);
    }
    const token = ++loadToken;
    statusEl.textContent = bcT("Reading {0}...", [file.name]);
    return engine.decode(file).then(buffer => {
      if (token !== loadToken) return false;
      engine.load(buffer);
      currentFile = file;
      continueBtn.hidden = true;
      statusEl.textContent = bcT("{0} loaded ({1})", [file.name, bcFormatFileSize(file.size)]);
      showEditor(file, buffer);
      persistFile(file);
      schedulePersist();
      return true;
    }).catch(() => {
      if (token !== loadToken) return false;
      const isVideo = VIDEO_MIME.includes(file.type) || VIDEO_EXT.test(file.name);
      statusEl.textContent = isVideo
        ? bcT("{0} has no sound to work with, or its audio can't be read.", [file.name])
        : bcT("Couldn't read {0}. Make sure it's a valid audio file.", [file.name]);
      return false;
    });
  }

  removeBtn.addEventListener("click", resetTool);
  input.addEventListener("change", e => { addFile(e.target.files); input.value = ""; });

  toolApp.addEventListener("click", e => {
    if (e.target.closest("button, select, a, label, input, canvas")) return;
    if (editor.hidden) input.click();
  });
  toolApp.addEventListener("dblclick", e => {
    if (e.target.closest("button, select, a, label, input, canvas")) return;
    toolApp.classList.remove("wobble");
    void toolApp.offsetWidth;
    toolApp.classList.add("wobble");
  });
  toolApp.addEventListener("animationend", e => {
    if (e.target === toolApp) toolApp.classList.remove("wobble");
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
