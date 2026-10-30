# BC Tools — design system reference

Read this before building or editing ANY tool page. Tools built without it
each invent their own slightly different version of the same components.
When a new pattern or rule is established, add it here in the same edit.

**Comments are rare, not default.** Only write one for a genuinely
non-obvious *why*, one line. This file is the exception; comments inside the
site files are not.

**Layout**: reference tools, component reference (current rules only),
operational mechanics (branching, cache-busting, releases, shipping
checklist), then short provenance and "rules we learned" lists.

## Reference tools

Three tools anchor different axes — pick the closest one to the situation,
follow what it does, then add the rule here:

- **Convert** (`convert/`) — the clean baseline: shared components used
  exactly as documented, no undocumented per-tool overrides.
- **Context** (`context/`) — the most component-rich tool. Originated
  `.bc-toggle-btn`, `.bc-resize-handle`, the `.bc-obj-*` family and the
  always-dark-surface override pattern. Use it for in-canvas objects,
  toggle buttons, or an always-dark surface inside a theme-aware page.
- **Codify** (`codify/`) — reference for `.bc-editor-input` and the
  auto-fit / resizable-frame conventions.

## Tool icons: `shared/icons.css`

Every tool icon (`--icon-X` data-URI custom property + `.icon-X` mask rule)
lives only in `shared/icons.css`. Standalone pages get it through
`shared/site.css`'s `@import`; `index.html` links it directly (it keeps its
own inline `<style>`). Add or change an icon only there, and bump
`icons.css`'s `?v=N` (on `index.html`'s `<link>`) and `shared/site.css`'s
`?v=N`. A tool without an icon yet falls back to `.gfx-placeholder`.

## Buttons & pills

### `.tool-primary-btn` — the one big CTA per tool

- `height:74px; padding:0 32px; border-radius:26px; font-weight:900;
  font-size:20px; color:var(--text)`. Follows the on-banner flip recipe
  below; the shared class as-is is the reference (Convert).
- `:disabled` — light `rgba(255,255,255,.2)`, dark `rgba(0,0,0,.14)`.
- **An unavailable control reads as a dashed outline, never a dimmed one**:
  `opacity:1`, transparent background, `border-style:dashed`, no hover
  fill, `cursor:default`. Context's page-arrow buttons (first/last page)
  follow it. Don't use `opacity:.35`.
- `.tool-primary-btn.tool-continue-btn` ("Continue where you left off") is
  a documented compound override in `shared/site.css`.
- **N independent per-item actions (not one CTA) reuse the class, smaller**
  via a second local class that overrides only `height`/`padding`/
  `font-size` (Coudio `.cd-row-convert-btn`, Cleanly `.ex-row-*`: 40px,
  `padding:0 18px`, 14px). Use this only when the number of primary buttons
  genuinely becomes many; a single CTA needing another size gets a real
  `-lg`-style variant instead.
- Context's **Compress file** button is the same compact variant (below).

**Cleanly's per-row buttons**
- A row shows "Clean first" + "Clean and download" until cleaned, then one
  always-enabled "Download". A row that started already clean
  (`item.wasAlreadyClean`) shows "Clean anyways" instead and keeps it.
- Buttons never relabel themselves; every transient message goes to the
  shared `#exStatus` line.
- Only `downloadEntry()` runs `startPrivacyCheck()/finishPrivacyCheck()`;
  cleaning never touches the network.
- Each button has its own `data-ga-action` next to the shared
  `data-ga-event="tool_primary_action"` pair (delegated listener in
  `shared/site.js` turns any `data-ga-<param>` into a GA4 param).
- Below `768px` the per-row buttons are hidden and one global
  "Clean & download" (`#exMobileDownloadBtn`) runs `mobileDownloadAll()`
  (300ms between downloads). A module-level `mobileDownloadRunning` flag
  keeps the button disabled for the whole batch — `renderList()` re-runs
  every iteration and would otherwise re-enable it.

### Picking a dropdown widget

Use a shared widget for any "pick one" control, never a hand-rolled copy:

- `bcRegisterCombo(trigger, input, menu, emptyEl, onSelect)` + `.bc-combo`
  — searchable, for **5+ options**.
- `bcRegisterDropdown(trigger, menu, onSelect)` + `.bc-dropdown` — plain
  menu, **fewer than 5**, or any list whose rows need a custom preview
  (swatch dot, shape icon) regardless of count.
- Both close sibling menus of their type and close on outside click or Esc.

### `.option-change-btn` — click-to-advance picker

For a short ordered list (fps, speed, Compress's mobile level picker): one
click = one step, wrapping at the end; the button always shows the current
value. `bcRegisterOptionChangeBtn(btn, options, onSelect, initialIndex)`
returns `{ setIndex(i), current }` (`setIndex` does not fire `onSelect`).
Same size/flip as `.bc-dropdown-trigger`; `.option-change-btn-lg` is the
74px variant. Compress hides its desktop `.tool-format-btn` row below 768px
and shows `#cpLevelOptionChangeBtn` instead; options are read from the real
buttons' `data-*` attributes and both controls are kept in sync.

### Folding a tool's own pill onto `.bc-dropdown-trigger`

If a local pill is a near copy of `.bc-dropdown-trigger` (40px, 12px radius,
flip recipe), add `bc-dropdown-trigger` as a second class and strip the
duplicate chrome. Check `width` first: the shared class is `width:100%`; in
a flex toolbar keep a local `width:auto` (Context's pills). Pills with
genuinely different geometry (Colorfy `.colorfy-code-btn`, Congify
`.gif-results-toggle`) stay their own classes — matching the flip formula is
the bar, not class sharing.

### `.bc-segmented-toggle` — joined-pill mode toggle

Row of `[aria-pressed]` buttons with one shared outline, selected segment
filled via the flip recipe. Modifiers (animated): `.bc-segmented-toggle-
collapsed` on a segment that's no longer valid (collapses in place; pair with
`aria-hidden`/`tabindex="-1"`) and `.bc-segmented-toggle-solo` on the one
remaining segment (rounds both corners). Width/margin stay local.

**Single files / `.zip` toggle** (Convert, Compress): ≤5 files → only
"Single files"; 6–20 → both, default `.zip`; >20 → only `.zip`.
`effectiveUseZip(count)` makes the download decision;
`updateDownloadModeToggle(count)` (from `renderStatus()`) collapses
segments and force-sets `downloadMode`. Convert's SEO route siblings don't
carry this markup; all lookups are null-guarded.

### Small setting pills (`.bc-combo-trigger`, `.cf-color-trigger`)

`height:40px; padding:0 12px; border-radius:12px`; text `var(--text)`,
700/14px (placeholder same at `opacity:.5`); chevron 6×6px,
`border-right/bottom:1.5px solid currentColor; opacity:.75; rotate(45deg)`.
`.bc-combo-trigger-lg` / `.bc-dropdown-trigger-lg` are the larger
variants — use them, not a height-only override.
**Sizing formula** for a row of pills: measure the longest label (14px/700),
add ~38px (padding + chevron; ~52px with a swatch), then
`flex:1 1 <mid>; min-width:<that+few>; max-width:<longest+few>`; keep
`overflow:hidden; text-overflow:ellipsis` on the inner input as a net.

## On-banner controls flip with theme

**Every interactive control, on any surface, flips between two recipes** via
`html[data-theme="dark"] .foo{…}`:

- Light (default): `border:1px solid rgba(255,255,255,.5);
  background:rgba(255,255,255,.35)`, hover `.45`, text `var(--text)`.
- Dark: `border:1px solid rgba(0,0,0,.4); background:rgba(0,0,0,.25)`,
  hover `.35`. (`.tool-primary-btn` dark is `.28`, hover `.36`.)

Applies to `.tool-primary-btn`, the dropdown/combo triggers and menus,
`.bc-toggle-btn`, `.bc-url-input`, and every on-banner pill. Don't use a
fixed black tint "because it's on a banner".

- **Only exception**: the `.engine-status-card` terminal chip keeps a fixed
  dark look (see Terminal text).
- **A selected/active state needs its own contrast check**: raise opacity
  for the weak theme (`.tool-format-btn.active` light:
  `rgba(255,255,255,.65)` bg / `.9` border / `#1d2436` text).
- **Controls reused inside an always-dark surface** (Context's fullscreen
  overlay and preview panel) must not flip: add `.always-dark-surface
  .the-control{…}` unguarded by `data-theme` instead of flipping globally.
- Native `<option>` elements can't take translucent backgrounds; give them
  an explicit solid light/dark pair.

## `.result` card and `.bc-file-remove-btn`

Every tool that lists loaded files shares `.result` (`shared/site.css`):
light bg `rgba(255,255,255,.35)`, dark `rgba(0,0,0,.25)`, `border-radius:16px;
padding:10px`. A tool-local class goes on the same element as a **second**
class with only what's genuinely local (row layout, a per-tool border colour
as an unguarded flat hex+alpha: Convert `#d670ff55`, Compress `#68e1ff55`,
Cleanly `#4ade8055`, Combine `#FF696155`). `.result-name` text needs its own
`color:var(--text)` — card and text flip independently.

**`.bc-file-remove-btn`** ("the beta remove btn") is the shared translucent
28×28 "×" for a file row (Cleanly, Combine, Convert, Compress, Coudio;
Colorfy's palette chip at 25px). Add it as a second class; the local class
keeps only the JS hook and any absolute-position override. Every adopter
needs `title` next to `aria-label` (`title="Remove file"`, or matching the
item for Colorfy). `.result-remove` (the hover-reveal dark circle) and
`.context-signature-camera-badge` stay fixed-dark on purpose: they overlay
unpredictable image/video content.

## `.bc-remove-btn` / `.bc-canvas-back-btn` — remove-all corner pair

Red "clear everything" × and its mobile back-to-Hub companion are direct
children of `.tool-app`: Remove `top:16px; right:16px`, Back `top:16px;
right:52px`; shown with `.tool-app:has(#xxAfterDrop:not([hidden])) .xx-
remove-btn{display:flex}` (Coudio uses `#page-coudio:has(...)`, Codify a
`hidden` attribute with the same offsets). Never nest them inside the
revealed box with a negative offset.

## Shared typography, editor input, file size

- `.bc-label` / `.bc-heading` (identical: 13px/800, `.04em` letter-spacing,
  uppercase, `opacity:.7`) and `.bc-body` (14px, `opacity:.8`, line-height
  1.5): add as a second class; the local class keeps only layout.
- `.bc-editor-input` owns all theme chrome of an editor textarea (border,
  bg, text, placeholder, hover/focus, hidden scrollbar track); pair with a
  local class for size/font only (Codify's `.cf-code-input`).
- **`bcFormatFileSize(bytes)`** (`shared/site.js`) is mandatory for every
  displayed size: "KB" below 1 MiB (floored at 1 KB), one-decimal "MB"
  above. Never hand-roll a KB/MB calculation.

## Tool banner colour + category texture

- **Exactly 10 colours, used in a fixed order; a colour may repeat across
  categories, never within one.** Convert `#B84CFF` Purple, Compress
  `#3FBFE8` Sky Blue, Combine `#FF6961` Coral Red, Cleanly `#7ED321` Lime
  Green, Context `#F6D44A` Yellow (`var(--context-yellow)`), Colorfy
  `#FF8A4C` Orange (Image); Congify `#22D3D0` Teal (Video); Coudio `#18C98A`
  Emerald (Sound); Codify `#C81C86` Pink (Code); Comprio `#3B6CF6` Cobalt
  Blue (Video); Convido `#B84CFF` Purple (Video, the first reuse — the
  video version of Convert).
- **New tool**: use all 10 once before reusing; from the 11th on take the
  first colour in that order unused in the same category. Never invent an
  11th colour. The category texture tells same-coloured tools apart.
- Set the banner via a `::before` fill (`.tool-app::before` for Compress/
  Cleanly/Context/Convert, `#page-<id>::before` for Colorfy/Coudio/Codify)
  and the matching `#page-mainpage .card.<tool>::before` on the homepage.
  Every homepage card needs `title="The color is: <Color Name>"` on its
  `.card` div.
- **Textures** live in `shared/textures.css`, driven by
  `data-category="image|video|sound|code|special"`: Image plain, Sound
  ripple, Code mosaic, Video filmstrip (top edge only), Special sparkle
  dots. `border-radius:inherit` lets one rule fit cards (28px) and banners
  (36px). No tool banner sets `data-category` yet.
- Layering: colour `::before` (z 0 homepage / -1 tool pages), texture
  `::after` on top, real content above both.

## Homepage card hover

`#page-mainpage .card`/`.card-readmore` (mirrored by hand in `index.html`,
which doesn't load `shared/site.css`): card `transform-origin:bottom center`,
`scale(1.05)` on hover (`1.02` active), `.17s cubic-bezier(.22,1,.36,1)`.
Read More: plain `background`/`color` hover, **no transform** — a transform
on both parent and child desyncs the hover hit-test and flickers. Rejected
for the card: rotate/wobble, tilting Read More, popping it past the card
edge.

## Terminal text

All terminal-style text uses `--bc-mono` (`"Courier New", Courier,
monospace`; mirrored in `index.html`'s `:root`). Three flavours:

- **`.nav-terminal`** — nav copy/theme confirmations, plain text.
- **`.tool-status`** — every tool's status line, plain text with a
  CSS-generated `"> "` prefix. **Default for any new confirmation/status.**
- **`.engine-status-card`** — the one filled chip: fixed dark `#1d2436`
  (`#e4e9f5` light), green `.engine-status-value`. Used by About's status
  card, the homepage loading banner and every help banner.

Colorfy must not grow its own bespoke terminal chip; use `.tool-status`.
Cursor: `animation:copy-toast-blink 1s step-end infinite`; prompt: `>` in an
`opacity:.7` span.

**Status elements inside a conditionally hidden container** can only report
states reachable after it shows. Messages that must appear earlier (like
"none of those files qualify") need the element outside the container, or a
narrower hide rule (Coudio: `#cdStatus:empty`).

## Help banner: `bcSetupHelpBanner`

Every tool calls `bcSetupHelpBanner(toolName, idPrefix, steps)`
(`shared/site.js`): `toolName` = lowercase folder, `idPrefix` = the tool's
own element-ID prefix, `steps` = `[LABEL, body]` pairs. Dismissal persists
in `localStorage["bc-help-<toolName>-dismissed"]` — generated, never
hand-written.

## Pressed buttons and handles

- **`.bc-toggle-btn`** (Bold/Italic-style pressed buttons; `-icon` = 34px
  square; wrap in `.bc-toggle-btn-group`): 40px, `[aria-pressed="true"]`/
  `.active` → white border + darker fill. No shared JS.
- **`.bc-resize-handle`** — canvas/frame-level drag handle (21px, `#2563eb`,
  white 2px border). Position/cursor stay local. Used by Context, Congify,
  Codify, Colorfy.
- **In-canvas object controls** (text box, caption, signature, shape) use
  the separate `.bc-obj-*` family — never `.bc-remove-btn`/`.bc-resize-
  handle`: `.bc-obj-remove-btn` (25px red `#e11d48` ×),
  `.bc-obj-resize-handle` (25px blue `#2563eb`), `.bc-obj-drag-handle`
  (25px yellow `var(--context-yellow)`, `cursor:move`). Size/shape/colour
  only; offsets and z-index stay local. Created by JS (Context, Congify).

## Context: shapes and object mechanics

**Shapes** (`shapeBoxes`, `context-tool.js`) are modelled on signatures:
`{ id, page, xPt, topPt, widthPt, heightPt, kind, color, rotation }`, own
`buildShapeBoxEl()`. `shapeSvg(kind, color)` draws six 0–100 viewBox kinds:
circle, square, triangle, cross, and two form marks (checkmark/crossmark,
`isMarkKind()`: land at 16pt, 4pt minimum vs 10pt). Swapping kind replaces
only the `<svg>` child — a full rebuild would drop the handles' listeners.
The colour dropdown is reused (branches on text vs shape selection).

**Shape button** (`#ctShapeBtn`): click places the preselected kind
(shortcut **H**). Hover for `SHAPE_HOVER_MS = 100` extends the flush arrow
tab `#ctShapeArrow` (same width and `var(--btn-fill)` fill; the button's
bottom corners square off via `:has(.ct-shape-arrow.shown)`); hovering the
arrow opens `#ctShapeKindMenu`; leaving closes after `SHAPE_LEAVE_MS = 200`.
Touch/pen use a `250ms` press-and-hold; ArrowUp/Down also opens it.

**Controls are select-to-show**: shapes and signatures show handles only
while `.selected`; clicking outside deselects. No reposition handle — the
body drags (`startDrag(el, …)` ignores the remove/resize handles). Blue =
uniform resize, yellow `.context-shape-rotate-handle` = rotate (0–360°,
Shift snaps 15°); handles counter-rotate via `--ct-rot`, and the resize
callback projects the pointer delta through the rotation.

**PDF export** uses pdf-lib natives: `drawRectangle` (square), `drawEllipse`
(circle: centre + x/y radii), `drawSvgPath` for every other kind. Anchors
differ: `drawRectangle` is bottom-left (`y = pageH - topPt - heightPt`),
`drawSvgPath` is **top-left** (`y = pageH - topPt`). Rotation rotates the
anchor point about the box centre (`around()`) and passes
`rotate: degrees(...)`.

**Mechanics**
- **Undo/redo** (`#ctUndoBtn`/`#ctRedoBtn`, centred above the canvas;
  Ctrl/Cmd+Z, Shift+Z, Y): debounced shallow snapshots of the three box
  arrays via `noteHistory()` in `schedulePersist()`; inactive while an input
  has focus. Disabled = dashed outline.
- **Page navigator** (`#ctPageNav`): top-left of the panel bar on desktop,
  hidden for single-page files; mobile is a flat row with it first. Rasters
  are cached (`PAGE_CACHE_MAX = 5`) and neighbours prefetched.
- **Copy/paste**: Ctrl/Cmd+C on a selected text box, shape or signature,
  Ctrl/Cmd+V pastes on the *current* page, offset `20pt × n`, clamped to the
  page, selected, one undo step. In a text box it copies the box only when
  the selection is empty or the whole text; partial selections stay normal
  text copy/paste. Copying blurs the editor so the next paste is a box.
- **Delete**: Backspace/Delete on a selected shape or signature `.click()`s
  its remove button (key and button can't diverge); afterwards the most
  recently *created* surviving subject is selected (`selectLastCreated()`).
- **Burst guard**: `noteCreated()` on every creation; 5 within
  `BURST_WINDOW_MS = 600` opens `#ctBurstOverlay` ("Everything okay?",
  signature-modal styling): "Yes, continue" or "Remove those 5". Other
  shortcuts pause while open (`sigModalOpen()`).

**Compress file** (PDFs over `COMPRESS_THRESHOLD = 10 MB`, all in the
browser): the compact `.tool-primary-btn` `#ctCompressBtn` sits beside
`#ctSizeStatus` in `.context-size-row`, with a `.bc-info-btn` tooltip that
starts with bold **Recommended**, lists why the file is big (`explainSize()`:
image share, ~dpi, rest) and suggests re-exporting at 150 dpi.
- Only **JPEG (`DCTDecode`) images** are re-encoded through a canvas.
  `pickCompressStep()` encodes the 4 biggest images at a binary search over
  `COMPRESS_STEPS` (16 steps, max side 4000→1200px, quality .92→.54),
  extrapolates, then one full `recompressImages()` pass targets
  `COMPRESS_TARGET = 9 MB` (up to 3 attempts, +2 steps). A re-encoded image
  is kept only if smaller; the result replaces `currentFile`/
  `currentFileBytes` and the page re-renders.
- **Skip** images with `/SMask` or `/Mask`, images used as a mask,
  `ImageMask`, `/Decode`, and non-RGB/Gray colour spaces. A masked image
  (often with `/Matte`) must keep its mask's pixel dimensions: Adobe Reader
  renders the page blank otherwise while pdf.js and other viewers accept it.
  **Test PDF output in Adobe Reader, not only pdf.js.**
- Unshrinkable files report "can't be compressed any further".

## Drag & drop: `bcSetupBannerDropTarget`

Reuse `bcSetupBannerDropTarget(toolApp, opts)` (`isInScope`, optional
`getEnterTarget`/`clearTargets`, `onDrop`) for any banner drop zone; it
counts nested dragenter/dragleave correctly. Codify doesn't use it (its
input is typed code). The banner is click-to-open but must not show
`cursor:pointer`; only `.tool-drop` does.

## Capping concurrent heavy work

Any expensive per-file work (canvas encode, WASM decode) over an unbounded
batch gets a cap: copy the small `runWithConcurrencyLimit(items, limit,
worker)` from `compress-tool.js`. Compress: `ESTIMATE_CONCURRENCY = 5`
with a `"Waiting..."` label for queued files; thumbnails get their own
pool (`IMAGE_LOAD_CONCURRENCY = 3`) — set `src` after the text paints,
kicked off by `requestAnimationFrame` plus a `setTimeout(…, 100)` fallback
(`requestIdleCallback` is missing in Safari and starves in hidden tabs).
Estimates are cached in `localStorage` (two numbers, key
`name|size|quality`, `ESTIMATE_CACHE_MAX = 100`); HEIC previews are cached
in IndexedDB instead (blobs overflow `localStorage`).

## Editor / resizable-frame conventions

- Auto-fit editors to content (`scrollHeight`), clamp `max-height:80vh`;
  the drag handle is a manual override. Hide the native scrollbar track
  (`scrollbar-width:none; -ms-overflow-style:none; ::-webkit-scrollbar
  {display:none}`) but keep scrolling working.
- Measure a resizable frame's max width against a stable ancestor
  (`.tool-app`), never an element that sizes to the frame itself.

## HEIC support

No browser but Safari decodes HEIC through `<img>`/`<canvas>`, and none
encode it. Tools use `heic2any` (`vendor/heic2any.min.js`), loaded on demand
via `loadHeic2any()` and decoded with the per-file `WeakMap`-cached
`decodeHeicFile()`; each of Convert/Compress/Cleanly keeps its own
byte-identical copy. Detect with `isHeicFile(f)`: MIME **or** `.hei[cf]`
extension (non-Safari browsers report no MIME).
- Thumbnails don't decode by default: Convert/Compress show an opt-in
  "Preview" button (`.result-heic-preview-btn`; once a level is picked it
  previews the *compressed* result); Cleanly shows an "HEIC" label button.
  Previews are cached and persisted in the "Continue" IndexedDB record.
- Output can't stay HEIC: Convert uses `heic2any`'s direct encode; Cleanly
  offers a per-row PNG/JPG segmented toggle (default PNG, always enabled,
  rendered twice for desktop/mobile). `cleanFile()` captures
  `item.heicFormat` once before its `await` so a mid-decode toggle can't
  mismatch bytes and extension.
- Cleanly can't read HEIC metadata (`exif.js` only reads JPEG/TIFF), so
  HEIC always shows the warning tag `HEIC metadata found!`. All found-
  metadata tags follow `"<Category> metadata found!"` without values or
  emoji; `renderList()` adds the ⚠ prefix.

## Failure handling

Show a friendly message **and** never hang; a `try/catch` around a call
site doesn't catch a throw from its async callback.
- Callback APIs (`EXIF.getData`, `<video>`/`<audio>` loading) need an error
  listener, a timeout fallback, or both (Cleanly `readTags()` 3s fallback,
  Congify 8s + `error` handler).
- Status set before `resetGif()`-style resets gets wiped; set it after.
- Never surface raw library errors (Codoc used `err.message`).
- A file filter must run where it can report: "none qualify" when a pick
  filters to nothing, and "N file(s) were skipped" for partial rejection,
  appended after `renderStatus()` (which overwrites status). Compress
  counts non-GIF skips separately from its GIF message.
- Convert warns when an animated GIF/WEBP will flatten to one frame
  (`isAnimatedGif`/`isAnimatedWebp` byte sniff) and doesn't suggest
  Congify (video input only). CMYK and Adobe RGB work through canvas;
  camera RAW is rejected everywhere (`application/octet-stream`).
- Codoc is DOC/DOCX→PDF only. PDF→DOC was rejected: it needs server-side
  layout inference, which breaks the nothing-leaves-your-device guarantee.

## Branching and releases

- `development` is the day-to-day branch; `main` deploys (GitHub Pages).
  For a discrete unit (new tool, redesign, multi-file sync) branch
  `dev-<project>` off `main`, merge when ready, then delete it. A
  single-file bugfix may go straight to `main`. `dev-original` is the
  untouched snapshot of `development` before the Halloween merge — never
  commit to it.
- **Dev-only files — never on `main`:** `CLAUDE.md`, `.release-drafts/`,
  `ads.txt`. So never fast-forward `development` onto `main`
  (`git push origin development:main`) and never merge `main` into
  `development`. Promote with a real merge in a `main` checkout:
  `git merge --no-commit development`, `git rm --cached` + delete any of
  those files that came along, commit, then check
  `git ls-tree -r --name-only HEAD | grep -E "^(CLAUDE.md|ads.txt|.release-drafts)"`
  prints nothing, and push `main` only. Merging a `dev-` branch cut from
  `main` into `development` tries to delete those files: restore them
  before committing.
- **Releases**: tag `YY.MM.N` on `main`, notes in
  `.release-drafts/<tag>.md`, then publish a GitHub Release. **Give the
  release a title**: `.github/workflows/discord-release.yml` announces it on
  Discord, and the stock action fails on an untitled release (the
  workflow now posts untitled releases itself and has a manual
  `workflow_dispatch` re-send by tag).
- Translations: `translations/<lang>.json` (English → text) and
  `python3 tools/build_translations.py <lang>` regenerate `/<lang>/` pages
  and `shared/i18n/<lang>.js` (the `?v=` on it is hardcoded in the build
  script). JS text goes through `bcT()`; the homepage has no `bcT`, so read
  `window.BC_I18N` directly. Keep JSON insertion order (don't re-sort) to
  keep diffs small. Language homepages are built copies of `index.html`:
  rebuild all 12 after changing it. Write English first; add other
  languages when the copy is final. Tool names stay English.

## Seasonal skin (Halloween 2026)

**The skin lives on `main` only; `development` is the original code base
without it** (the old Halloween-era `development` is kept locally as
`development-with-halloween`). While the event runs, build and test every fix
on `development` and do not merge or promote it to `main`.

On `main`, `shared/halloween.css`/`halloween.js` plus a date check in every
page's head script add class `hw` to `<html>` only before **Nov 3 2026,
local midnight** (`?hw=on`/`?hw=off` force it for previews). All skin CSS is
scoped to `html.hw`, the scripts return early without it, and forced dark
mode and the disabled theme button follow it, so the skin ends on its own.

**After the event**, ship `development` to `main` by replacing the tree, not
by merging (a merge conflicts on every page the skin touched): in a `main`
checkout run `git checkout development -- .`, delete the dev-only files that
came along (`CLAUDE.md`, `ads.txt`, `.release-drafts`), check them with the
promotion grep above, restore the permanent bug-leg hover animation
(`shared/report.js` / `shared/report.css` from `main`), rebuild translations
if copy changed, bump versions, and push `main`. That drops the skin files,
the `hw` head-script check and the `hw` theme branches in one commit.

## Cache-busting (non-negotiable)

The dev server sends no `Cache-Control`, so stale files survive hard
refreshes. **Whenever the content of `shared/site.css`, `shared/site.js`,
`shared/report.js` or any `<tool>/<tool>-tool.js` changes, bump its `?v=N`
by 1 on every page that references it** (shared files: all ~31 page types
plus the 12 language copies — compute the new number from the current one
and check it afterwards; an empty variable once turned `294` into `1294`).
- `@import`ed files (`shared/icons.css`, `textures.css`, `halloween.css`)
  need their own `?v=N` on the `@import` line **and** on `index.html`'s own
  `<link>`, bumped together; the browser caches each by its own URL.
- Before editing a tool's `-tool.js`, `ls -d <tool>/*/`: Convert has 16 SEO
  route copies (`convert/jpg-to-png/index.html`…) with their own markup.
  Their `?v=` is meaningless as a sync signal — grep that the markup really
  contains the IDs/classes the new JS needs.

## Before shipping a new tool page

1. Brand colour from the palette above.
2. `data-category` for the card texture.
3. `bcSetupHelpBanner`.
4. `bcSetupBannerDropTarget` for any drop zone.
5. `bcRegisterCombo`/`bcRegisterDropdown` for any pick-one control.
6. Pills sized with the sizing formula when several sit side by side.
7. `.bc-toggle-btn`/`.bc-resize-handle` for pressed buttons / drag handles.
8. `bcFormatFileSize` for every size.
9. Every changed script/stylesheet's `?v=` bumped.
10. A live-browser check in both themes (this project keeps finding real
    stacking/specificity/clipping bugs this way); for any PDF output also
    open it in Adobe Reader.

## Provenance

Context: `.bc-toggle-btn`, `.bc-resize-handle`, `.bc-obj-*` (with Congify),
always-dark-surface pattern. Congify: `.option-change-btn`, the combo-vs-
dropdown swatch exception. Codify: `.bc-editor-input`. Cleanly + Combine:
byte-identical `.bc-file-remove-btn` and `bcFormatFileSize` (an
independent duplicate is a good sign the shape is right). Coudio: per-row
`.tool-primary-btn` variant. Convert: the flip recipe baseline, the
segmented download-mode toggle (with Compress), the HEIC pattern. Colorfy +
Codify: resizable-frame conventions.

## Rules we learned (one line each)

- One real source for shared things (icons, dropdowns, file size, remove
  buttons); a second hand copy always drifts.
- The flip recipe replaced "fixed black tint on banners": black on a light
  brand colour had poor contrast, and `<option>` can't be translucent.
- Don't give a parent and its child competing hover transforms.
- If a fixed bug report doesn't budge, check it's about a different
  element than the one patched (Colorfy's "terminal font" bug was a
  second, differently styled chip).
- Keep the terminal font as the plain `--bc-mono` stack; self-hosting
  Space Mono was tried and reverted.
- Terminal-style confirmations are plain `.tool-status` lines; bespoke
  filled chips kept reintroducing contrast/padding bugs.
