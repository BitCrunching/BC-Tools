window.ConvidoMux = (function(){
  async function collect(mb, buffer){
    const inp = new mb.Input({ source: new mb.BlobSource(new Blob([buffer])), formats: mb.ALL_FORMATS });
    try {
      const out = { video: null, audio: null };
      const vt = await inp.getPrimaryVideoTrack();
      if (!vt) throw new Error("no video track");
      const read = async (track, config) => {
        const packets = [];
        for await (const p of new mb.EncodedPacketSink(track).packets()){
          packets.push({ ts: p.timestamp, key: p.type === "key", data: p.data });
        }
        return { config, packets };
      };
      out.video = await read(vt, await vt.getDecoderConfig());
      const at = await inp.getPrimaryAudioTrack();
      if (at) out.audio = await read(at, await at.getDecoderConfig());
      out.duration = await inp.computeDuration();
      return out;
    } finally {
      inp.dispose();
    }
  }

  function decodeOrderTimes(packets){
    const sorted = packets.map(p => p.ts).sort((a, b) => a - b);
    const shift = Math.max(0, ...sorted.map((t, i) => t - packets[i].ts));
    return { shift, list: packets.map((p, i) => ({ dts: sorted[i], cts: p.ts - sorted[i] + shift })) };
  }

  function bytes(...parts){
    const len = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  function be(value, size){
    const a = new Uint8Array(size);
    for (let i = size - 1; i >= 0; i--){ a[i] = value & 255; value = Math.floor(value / 256); }
    return a;
  }
  function le(value, size){
    const a = new Uint8Array(size);
    for (let i = 0; i < size; i++){ a[i] = value & 255; value = Math.floor(value / 256); }
    return a;
  }
  function ascii(s){ return Uint8Array.from(s, c => c.charCodeAt(0)); }
  function f64(v){ const a = new Uint8Array(8); new DataView(a.buffer).setFloat64(0, v); return a; }

  function buildFlv(src){
    const { video, audio, duration } = src;
    const cfg = video.config;
    const meta = [["duration", duration], ["width", cfg.codedWidth], ["height", cfg.codedHeight], ["videocodecid", 7]];
    if (audio) meta.push(["audiocodecid", 10]);
    const amfBody = bytes(
      Uint8Array.of(2), be(10, 2), ascii("onMetaData"),
      Uint8Array.of(8), be(meta.length, 4),
      ...meta.map(([k, v]) => bytes(be(k.length, 2), ascii(k), Uint8Array.of(0), f64(v))),
      Uint8Array.of(0, 0, 9)
    );
    const parts = [bytes(ascii("FLV"), Uint8Array.of(1, (audio ? 4 : 0) | 1), be(9, 4), be(0, 4))];
    const tag = (type, ms, payload) => {
      ms = Math.max(0, Math.round(ms));
      parts.push(bytes(Uint8Array.of(type), be(payload.length, 3), be(ms & 0xffffff, 3), Uint8Array.of((ms >>> 24) & 255), be(0, 3), payload, be(11 + payload.length, 4)));
    };
    tag(18, 0, amfBody);
    tag(9, 0, bytes(Uint8Array.of(0x17, 0, 0, 0, 0), new Uint8Array(cfg.description)));
    if (audio) tag(8, 0, bytes(Uint8Array.of(0xaf, 0), new Uint8Array(audio.config.description)));
    const { shift, list: times } = decodeOrderTimes(video.packets);
    const events = video.packets.map((p, i) => ({ ms: times[i].dts * 1000, v: true, p, cts: Math.round(times[i].cts * 1000) }));
    if (audio) audio.packets.forEach(p => events.push({ ms: (p.ts + shift) * 1000, v: false, p }));
    events.sort((a, b) => a.ms - b.ms);
    events.forEach(e => {
      if (e.v) tag(9, e.ms, bytes(Uint8Array.of(e.p.key ? 0x17 : 0x27, 1), be(e.cts & 0xffffff, 3), e.p.data));
      else tag(8, e.ms, bytes(Uint8Array.of(0xaf, 1), e.p.data));
    });
    return new Blob(parts, { type: "video/x-flv" });
  }

  function parseAvcC(desc){
    const d = new Uint8Array(desc);
    const nals = [];
    let o = 5;
    const sps = d[o++] & 31;
    for (let i = 0; i < sps; i++){ const n = (d[o] << 8) | d[o + 1]; nals.push(d.subarray(o + 2, o + 2 + n)); o += 2 + n; }
    const pps = d[o++];
    for (let i = 0; i < pps; i++){ const n = (d[o] << 8) | d[o + 1]; nals.push(d.subarray(o + 2, o + 2 + n)); o += 2 + n; }
    return { nals, lengthSize: (d[4] & 3) + 1 };
  }

  function toAnnexB(data, lengthSize, prefix){
    const start = Uint8Array.of(0, 0, 0, 1);
    const out = [];
    if (prefix) prefix.forEach(n => out.push(start, n));
    let o = 0;
    while (o + lengthSize <= data.length){
      let n = 0;
      for (let i = 0; i < lengthSize; i++) n = n * 256 + data[o + i];
      o += lengthSize;
      out.push(start, data.subarray(o, o + n));
      o += n;
    }
    return bytes(...out);
  }

  function buildAvi(src){
    const { video, audio, duration } = src;
    const cfg = video.config;
    const w = cfg.codedWidth, h = cfg.codedHeight;
    const avc = parseAvcC(cfg.description);
    const frames = video.packets.length;
    const fps = frames / Math.max(duration, 0.001);
    const rate = Math.max(1, Math.round(fps * 1000));
    const chunk = (id, data) => bytes(ascii(id), le(data.length, 4), data, data.length % 2 ? Uint8Array.of(0) : new Uint8Array(0));
    const list = (type, ...inner) => { const body = bytes(ascii(type), ...inner); return bytes(ascii("LIST"), le(body.length, 4), body); };

    const events = video.packets.map(p => ({ ms: p.ts, v: true, p }));
    if (audio) audio.packets.forEach(p => events.push({ ms: p.ts, v: false, p }));
    const { shift, list: times } = decodeOrderTimes(video.packets);
    events.filter(e => e.v).forEach((e, i) => { e.ms = times[i].dts; });
    events.filter(e => !e.v).forEach(e => { e.ms += shift; });
    events.sort((a, b) => a.ms - b.ms);

    const movi = [];
    const index = [];
    let offset = 4;
    let maxChunk = 0;
    events.forEach(e => {
      const data = e.v ? toAnnexB(e.p.data, avc.lengthSize, e.p.key ? avc.nals : null) : e.p.data;
      const c = chunk(e.v ? "00dc" : "01wb", data);
      movi.push(c);
      index.push(bytes(ascii(e.v ? "00dc" : "01wb"), le(e.p.key || !e.v ? 0x10 : 0, 4), le(offset, 4), le(data.length, 4)));
      offset += c.length;
      maxChunk = Math.max(maxChunk, data.length);
    });

    const avih = chunk("avih", bytes(le(Math.round(1e6 / fps), 4), le(0, 4), le(0, 4), le(0x10, 4), le(frames, 4), le(0, 4), le(audio ? 2 : 1, 4), le(maxChunk, 4), le(w, 4), le(h, 4), le(0, 16)));
    const vStrh = chunk("strh", bytes(ascii("vids"), ascii("H264"), le(0, 4), le(0, 4), le(0, 4), le(1000, 4), le(rate, 4), le(0, 4), le(frames, 4), le(maxChunk, 4), le(0xffffffff, 4), le(0, 4), le(0, 2), le(0, 2), le(w, 2), le(h, 2)));
    const vStrf = chunk("strf", bytes(le(40, 4), le(w, 4), le(h, 4), le(1, 2), le(24, 2), ascii("H264"), le(w * h * 3, 4), le(0, 16)));
    const vList = list("strl", vStrh, vStrf);
    let aList = new Uint8Array(0);
    if (audio){
      const ac = audio.config;
      const asc = new Uint8Array(ac.description);
      const aStrh = chunk("strh", bytes(ascii("auds"), le(0, 4), le(0, 4), le(0, 4), le(0, 4), le(1024, 4), le(ac.sampleRate, 4), le(0, 4), le(audio.packets.length, 4), le(8192, 4), le(0xffffffff, 4), le(0, 4), le(0, 8)));
      const aStrf = chunk("strf", bytes(le(0x00ff, 2), le(ac.numberOfChannels, 2), le(ac.sampleRate, 4), le(16000, 4), le(1, 2), le(16, 2), le(asc.length, 2), asc));
      aList = list("strl", aStrh, aStrf);
    }
    const hdrl = list("hdrl", avih, vList, aList);
    const moviList = bytes(ascii("LIST"), le(4 + movi.reduce((n, c) => n + c.length, 0), 4), ascii("movi"));
    const idx1 = bytes(ascii("idx1"), le(index.length * 16, 4), ...index);
    const total = 4 + hdrl.length + moviList.length + movi.reduce((n, c) => n + c.length, 0) + idx1.length;
    return new Blob([ascii("RIFF"), le(total, 4), ascii("AVI "), hdrl, moviList, ...movi, idx1], { type: "video/x-msvideo" });
  }

  return { collect, buildFlv, buildAvi };
})();
