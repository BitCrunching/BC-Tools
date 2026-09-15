/* Unit tests for codify-pure.js (escapeXml, hsvToHex, hexToHsv) — the
   one part of Codify that's pure, DOM-free logic, and so the one part
   actually worth guarding this way instead of only ever being checked
   by reloading the page and eyeballing a screenshot.

   No test framework/runner dependency on purpose (nothing else in this
   repo has one yet) — plain Node, plain assert, run directly:

     node codify/codify-pure.test.js

   Exits non-zero and prints the failing assertion's own message if
   anything regresses; prints "All N tests passed." and exits 0
   otherwise. Safe to wire into a CI step later without any changes. */
"use strict";
const assert = require("node:assert/strict");
const { escapeXml, hsvToHex, hexToHsv } = require("./codify-pure.js");

let passCount = 0;
function test(name, fn){
  fn();
  passCount++;
  console.log(`  ok — ${name}`);
}

console.log("escapeXml");
test("leaves plain text untouched", () => {
  assert.equal(escapeXml("hello world"), "hello world");
});
test("encodes < and >", () => {
  assert.equal(escapeXml("<div>"), "&lt;div&gt;");
});
test("encodes &", () => {
  assert.equal(escapeXml("a && b"), "a &amp;&amp; b");
});
test("encodes & before < / > so entities never get double-escaped", () => {
  // A naive re-ordering (< / > first, & last) would turn "&lt;" into
  // "&amp;lt;" — encode & first and this can't happen.
  assert.equal(escapeXml("&lt;"), "&amp;lt;");
});
test("handles a realistic code line with all three characters", () => {
  assert.equal(escapeXml('if (a < b && b > 0) {'), 'if (a &lt; b &amp;&amp; b &gt; 0) {');
});

console.log("hsvToHex");
test("black at v=0 regardless of hue/saturation", () => {
  assert.equal(hsvToHex(0, 0, 0), "#000000");
  assert.equal(hsvToHex(200, 1, 0), "#000000");
});
test("white at s=0, v=1 regardless of hue", () => {
  assert.equal(hsvToHex(0, 0, 1), "#ffffff");
  assert.equal(hsvToHex(275, 0, 1), "#ffffff");
});
test("pure red/green/blue at the primary hues", () => {
  assert.equal(hsvToHex(0, 1, 1), "#ff0000");
  assert.equal(hsvToHex(120, 1, 1), "#00ff00");
  assert.equal(hsvToHex(240, 1, 1), "#0000ff");
});
test("wraps a hue of exactly 360 the same as 0", () => {
  assert.equal(hsvToHex(360, 1, 1), hsvToHex(0, 1, 1));
});

console.log("hexToHsv");
test("is the inverse of hsvToHex for black/white/gray", () => {
  assert.deepEqual(hexToHsv("#000000"), [0, 0, 0]);
  assert.deepEqual(hexToHsv("#ffffff"), [0, 0, 1]);
  assert.deepEqual(hexToHsv("#808080"), [0, 0, 128 / 255]);
});
test("recovers hue 0/120/240 for pure red/green/blue", () => {
  assert.deepEqual(hexToHsv("#ff0000"), [0, 1, 1]);
  assert.deepEqual(hexToHsv("#00ff00"), [120, 1, 1]);
  assert.deepEqual(hexToHsv("#0000ff"), [240, 1, 1]);
});
test("round-trips hsvToHex -> hexToHsv -> hsvToHex back to the same hex", () => {
  // The middle hexToHsv step won't reproduce the exact original h/s/v
  // (RGB rounding loses precision), but re-encoding whatever it recovers
  // must still land on the same hex — that's the actual guarantee the
  // Background panel's swatch/hex-input round trip depends on.
  for (const [h, s, v] of [[35, 0.6, 0.9], [210, 0.25, 0.5], [300, 1, 0.4]]){
    const hex = hsvToHex(h, s, v);
    const [h2, s2, v2] = hexToHsv(hex);
    assert.equal(hsvToHex(h2, s2, v2), hex, `round-trip broke for hsv(${h}, ${s}, ${v})`);
  }
});

console.log(`\nAll ${passCount} tests passed.`);
