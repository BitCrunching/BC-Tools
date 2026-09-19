/* Codify — pure logic with no DOM dependency, split out of
   codify-tool.js specifically so it can be unit-tested (see
   codify-pure.test.js) without a browser: escapeXml (SVG-export text
   escaping) and the HSV<->hex color math behind the Background panel's
   free-form saturation/value square + hue slider. Everything else in
   Codify stays in codify-tool.js — this file exists only for the parts
   that are deterministic, DOM-free, and worth guarding with a real
   test instead of "reload the page and eyeball it."

   Loaded before codify-tool.js, which pulls these three off
   `window.CodifyPure` instead of redefining them locally. Exported as
   CommonJS too (`module.exports`) so the same file — not a copy of
   it — is what codify-pure.test.js requires under Node; there is
   exactly one implementation of each function, browser and test alike. */
(function(root){
  function escapeXml(str){
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* h in [0,360), s and v in [0,1]. Same table-based conversion Codify's
     Background panel has always used — kept byte-for-byte, just moved. */
  function hsvToHex(h, s, v){
    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    const table = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
    const [r, g, b] = table[i].map(x => Math.round(x * 255));
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  /* Inverse of hsvToHex: a 7-char "#rrggbb" hex string in, [h, s, v] out
     (h in [0,360), s and v in [0,1]). */
  function hexToHsv(hex){
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0){
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max === 0 ? 0 : d / max, max];
  }

  const CodifyPure = { escapeXml, hsvToHex, hexToHsv };
  root.CodifyPure = CodifyPure;
  if (typeof module !== "undefined" && module.exports){
    module.exports = CodifyPure;
  }
})(typeof window !== "undefined" ? window : globalThis);
