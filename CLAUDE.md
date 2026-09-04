# BC Tools — design system reference

Read this before building or editing ANY tool page. It exists because tools
built without it end up each inventing their own slightly-different version
of the same handful of components — read this first instead of re-deriving
(or re-guessing) these values from scratch.

When a new pattern gets established (a new component, a new rule), add it
here in the same edit — this file only stays useful if it's kept current.

## Convert is the reference tool

`convert/` is the most-edited, most-thought-through tool on the site. When a
rule in this doc doesn't cover a situation, or two tools disagree on how to
do something and it's not already settled here, **default to whatever
Convert does** rather than picking arbitrarily or inventing something new —
then, if that resolves a real ambiguity, add the rule here so it doesn't
have to be re-derived next time.

## Tool icons: `shared/icons.css`

Every tool icon (`--icon-convert`, `--icon-context`, `--icon-compress`,
`--icon-combine`, `--icon-cleanly`, `--icon-gif`, ...) — the base64 SVG data
URI custom properties and the `.icon-X` mask rules that paint them — lives
in one file, `shared/icons.css`, not duplicated per page. Every standalone
tool page gets it automatically via `shared/site.css`'s own
`@import url("icons.css");` at the top of that file. `index.html` (the
homepage SPA) doesn't load the rest of `shared/site.css` (keeps its own
inline `<style>` on purpose), so it links `icons.css` directly instead:
`<link rel="stylesheet" href="/shared/icons.css?v=N">`.

This used to be two hand-duplicated copies of the exact same block — one
in `shared/site.css`, one pasted into `index.html`'s inline styles — kept
in sync by remembering to edit both every time an icon changed. That's
exactly the kind of drift this project has hit repeatedly with duplicated
CSS elsewhere (see `.result`'s dark-navy-as-light-default bug); the fix
here is the same one used there — one real source, everything else points
at it. **Add a new icon or change an existing one only in
`shared/icons.css`** — never re-add a per-file copy. Bump `icons.css`'s own
`?v=N` (on `index.html`'s `<link>`) and `shared/site.css`'s `?v=N`
(everywhere else, since its `@import` picks up icons.css's new content
through the same cache-busted request) whenever `icons.css` changes.

Only 6 tools have a real icon so far (Convert/Compress/Combine/Cleanly/
Context/Congify) — Coudio, Codify, and Colorfy still fall back to
`.gfx-placeholder` (a plain text label) until their `--icon-X` token and
`.icon-X` rule get added here.

## Cache-busting (non-negotiable)

The dev server sends no `Cache-Control` header, so `<script src>` /
`<link rel="stylesheet">` tags can serve stale files through a hard refresh.
**Every time you edit the *content* of `shared/site.css`, `shared/site.js`,
or any `<tool>/<tool>-tool.js`, bump its `?v=N` query param by 1** — on every
page that references it. For `shared/site.css`/`shared/site.js` that's all
~31 pages (`grep -rl "shared/site.css?v=N"` → sed-replace).

**For a tool's own `-tool.js`, check for static SEO route siblings first —
don't assume it's just that tool's `index.html`.** Convert has 16 of these
(`convert/jpg-to-png/index.html`, `convert/webp-to-pdf/index.html`, etc. —
`ls -d convert/*/`), each a separate physical file with its own copy of the
tool markup, that all load the same `convert/convert-tool.js`. These were
found stuck 8 versions behind (`?v=4` while the real file was on `?v=12`)
during the dropdown migration below — silently broken (JS threw on load,
since the markup migration hadn't reached them) despite never having been
touched by whatever edit caused the drift; the version number is genuinely
meaningless as a sync signal once files fork like this; only the *content*
matched-or-not matters, and content only gets found stale by actually
checking. Before any `-tool.js` edit, `ls -d <tool>/*/` for siblings, and
if a markup change (not just a JS/CSS tweak) is involved, verify the sibling
files' markup actually contains what the new JS now expects — grep for the
element IDs/classes the change depends on, don't assume a shared `?v=`
bump alone makes them current.

**`@import`ed files (`shared/icons.css`, `shared/textures.css`) need their
own `?v=N` on the `@import url(...)` line itself, not just on `shared/site.css`'s
own `<link>`.** A browser caches each sub-resource an `@import` pulls in by
*its own* URL, independent of the parent stylesheet's — bumping
`shared/site.css?v=N` forces a fresh fetch of `site.css` itself, but if the
`@import url("icons.css")` line inside it has no version param, a page that
already had `icons.css` cached from an earlier visit keeps rendering the old
icon set even after `site.css`'s version changes (found exactly this way:
a newly-added `--icon-coudio`/`.icon-coudio` rule rendered fine on a fresh
page load but not on a tab that had loaded an older `icons.css` earlier in
the same session). `shared/site.css`'s two `@import` lines
(`icons.css?v=N`, `textures.css?v=N`) and `index.html`'s own separate
`<link>` to each need to move in lockstep — bump both any time either
imported file's content changes, the same way the `<script src>`/`<link>`
rule above already requires for everything else.

## Terminal text — the site's one recurring "readout" motif

Used for: nav copy-link confirmation (`.nav-terminal`), the step-through help
banners on every tool ("CODIFY_GUIDE: STEP 1/4" etc.), Colorfy's copy-strip
toast (`.colorfy-copy-terminal`), About's/the homepage's engine-status card.
This is the site's one deliberately "technical" visual voice — use it for
transient confirmations and diagnostic-flavored copy, nowhere else.

- **Color**: `#4ade80` (green) on a dark/translucent chip — never used on a
  light chip.
- **Font**: `"Courier New", Courier, monospace`.
- **Size**: 14px desktop, drop to 12px under ~640-768px. Never smaller than
  12px, never larger than 14px — it's a readout, not a heading.
- **Weight/spacing**: `font-weight:700; letter-spacing:.02em;`.
- **Cursor**: a trailing `_` or block with
  `animation: copy-toast-blink 1s step-end infinite;` (keyframe already in
  `shared/site.css`) for anything simulating a live terminal line — skip it
  for static readouts like the engine-status card.
- **Chip background**: `rgba(0,0,0,.35)` translucent over whatever's behind
  it — does NOT flip for light/dark site theme. This is now the *only*
  on-banner element that stays fixed (see "On-banner controls flip with
  theme" below) — the terminal readout is a deliberately fixed "technical"
  voice, not a normal control, so it's exempt from the rule everything
  else on a banner follows.
- **Prompt convention**: prefix the line with `>` in its own
  `opacity:.7` span when it reads like a command result (e.g.
  `> copied #F44CCF`).

## Buttons & pills

Two distinct component families — don't blend them:

### `.tool-primary-btn` — the one big CTA per tool (Download / Convert / etc.)

- `height:74px; padding:0 32px; border-radius:26px;`
- `font-weight:900; font-size:20px;` color `var(--text)`.
- Light: `border:1px solid rgba(255,255,255,.5); background:rgba(255,255,255,.35);`
  hover → `rgba(255,255,255,.45)`.
- Dark (`html[data-theme="dark"]`): `border:1px solid rgba(0,0,0,.4);
  background:rgba(0,0,0,.28);` hover → `rgba(0,0,0,.36)`.
- **This one DOES flip with site theme** even though it sits on the tool's
  saturated color banner — this is the settled standard (Convert is the
  reference: `<button class="tool-primary-btn" id="cvConvertBtn">` with no
  per-page override, just the shared class as-is). Every tool's primary CTA
  should do the same — never add a per-tool override that pins it to one
  fixed translucency. This used to be documented as "the one deliberate
  exception" to a fixed-black-tint rule for on-banner controls — that rule
  has been reversed (see "On-banner controls flip with theme" below); this
  is now just the original example of the pattern every on-banner control
  follows, not a special case anymore.

### Picking a dropdown widget: `.bc-combo` vs `.bc-dropdown`

Two shared, reusable components live in `shared/site.js` /
`shared/site.css` — **use one of these for any new "pick one of several
options" control, never hand-roll a third copy**:

- **`bcRegisterCombo(trigger, input, menu, emptyEl, onSelect)`** + `.bc-combo`
  markup — a *searchable* combobox (real `<input>`, typing filters options).
  Reserved for genuinely long lists (10+ options) where search earns its
  keep — Codify's Language/Theme/Template.
- **`bcRegisterDropdown(trigger, menu, onSelect)`** + `.bc-dropdown` markup —
  a plain trigger button + menu, no search box. For everything shorter —
  output formats, FPS, crop ratios, playback speed, font pickers.
- **Rule of thumb: 5+ options → combo, fewer than 5 → dropdown.** (Exception:
  an option needs a custom preview in its row — a color swatch dot, a
  stroke-width line sample — stays on `.bc-dropdown` regardless of count,
  since `.bc-combo`'s trigger only has room for a text label + chevron, no
  custom visual. Congify's two color pickers are the reference example.)

Both close each other's siblings of the same type, close on outside-click
or Escape, and mark the active option. This used to be three-to-four
independently hand-rolled near-duplicates (Congify's original `.gif-dropdown`,
Coudio's `.cd-dropdown`, Colorfy's `.colorfy-format-dropdown`, Codify's own
private copy of the combo logic) — all four now point at the one shared
implementation of each. If you're tempted to copy a dropdown's CSS/JS into
a new tool "just this once," that's the sign to reach for
`bcRegisterCombo`/`bcRegisterDropdown` instead.

### Folding a tool's own trigger-shaped pill onto `.bc-dropdown-trigger`

When a tool-local class (`.context-color-trigger`, `.cf-color-trigger`, etc.)
turns out to be a byte-for-byte (or near enough) copy of `.bc-dropdown-trigger`'s
own recipe — same 40px/12px-radius/border/background/flip/font — add
`bc-dropdown-trigger` as a **second class** on the markup and strip the
duplicate chrome out of the tool-local class, same split pattern as
`.result`/`.bc-editor-input` above. Two things to check before doing this:

- `.bc-dropdown-trigger` defaults to `width:100%`, sized for its usual home
  inside a wrapper that controls the actual width (`.bc-dropdown`/`.bc-combo`
  menus). A button living directly in a flex toolbar row instead (Context's
  Signature/color-swatch/Rename-file pills in `.context-toolbar`) needs its
  own `width:auto` kept as a local override, or it'll try to stretch to fill
  the row. Codify's `.cf-color-trigger` didn't need this (its wrapper already
  constrains it), Context's three did.
- Not every tool-local pill is a real duplicate. Colorfy's `.colorfy-code-btn`
  (36px, 170px min-width, monospace) and Congify's `.gif-results-toggle`
  (26px circle) already use the exact same border/background/hover/flip
  values as the documented formula below, but at genuinely different
  geometry for a genuinely different job (a wide code-swatch button, a small
  circular icon toggle) — leave these as their own classes rather than
  forcing them onto `.bc-dropdown-trigger`'s dropdown-pill shape. Matching
  the *documented flip formula* is the actual bar for "not a separately
  patched layer," not literal class-sharing when the geometry doesn't fit.

### `.bc-combo-trigger` / `.cf-color-trigger` — small dropdown/setting pills

- `height:40px; padding:0 12px; border-radius:12px;`
- Light: `border:1px solid rgba(255,255,255,.5); background:rgba(255,255,255,.35);`
  hover → `rgba(255,255,255,.45)`.
- Dark (`html[data-theme="dark"]`): `border:1px solid rgba(0,0,0,.4);
  background:rgba(0,0,0,.25);` hover → `rgba(0,0,0,.35)`.
- Text: `color:var(--text); font-weight:700; font-size:14px;` (placeholder:
  same color at `opacity:.5; font-weight:600;`) — flips with theme same as
  the background.
- Chevron: 6×6px, `border-right/bottom:1.5px solid currentColor; opacity:.75;
  transform:rotate(45deg);` — `currentColor` follows the trigger's own
  `color`, so it never needs its own theme override.
- **These DO flip with site theme now** (see "On-banner controls flip with
  theme" below) — they used to stay a fixed black tint on the reasoning
  that the banner is always saturated enough for it to read either way, but
  that broke down for a lighter brand color (Compress's cyan-blue): a
  black-tint trigger nearly vanished against it in light theme, reported
  as "buttons stuck in dark mode." Fixed by making these follow the same
  flip `.tool-primary-btn` already used, not by special-casing Compress.
- **Sizing formula** (established for Codify's 4–5 pill row, reuse for any
  tool with multiple side-by-side pills): measure the longest option label
  in the font (14px/700), add ~38px overhead for padding+chevron (or ~52px
  if the pill also carries a small swatch), then set
  `flex:1 1 <mid>; min-width:<that + a few px>; max-width:<longest + a few px>;`
  on the container so every value renders whole with no ellipsis in normal
  use. Keep `overflow:hidden; text-overflow:ellipsis;` on the inner
  `.bc-combo-input` regardless, as a safety net for extreme viewports.

## On-banner controls flip with theme — the general light/dark rule

**Every interactive control, regardless of what surface it sits on, flips
its translucency between a white-tint (light theme) and a black-tint (dark
theme) recipe** via `html[data-theme="dark"] .foo{...}` overrides:

- Light (default, unguarded): `border:1px solid rgba(255,255,255,.5);
  background:rgba(255,255,255,.35);` hover → `rgba(255,255,255,.45)`; text
  `color:var(--text)`.
- Dark (`html[data-theme="dark"] .foo`): `border:1px solid rgba(0,0,0,.4);
  background:rgba(0,0,0,.25);` hover → `rgba(0,0,0,.35)`.

This applies uniformly whether the control sits on the neutral page surface
(nav bar, footer, content cards) or on a tool's own saturated brand-color
banner (`.tool-app::before` fill) — `.tool-primary-btn`, `.bc-dropdown-trigger`/
`.bc-dropdown-menu`/`.bc-dropdown-option`, `.bc-combo-trigger`/`.bc-combo-menu`/
`.bc-combo-option`, `.bc-toggle-btn`, `.bc-url-input`, and every tool's own
on-banner buttons (Congify's results toggle, Combine's file-row remove
button, Context's Add-text/Signature/color-trigger pills, Codify's code
input and color-swatch trigger, Colorfy's copy-code button) all follow this
one recipe now.

**This used to be split**: banner controls stayed a fixed black tint always
(on the reasoning that the banner is vivid/saturated enough for black-on-color
to read fine regardless of site theme), with `.tool-primary-btn` documented
as "the one deliberate exception." That split broke down in practice —
reported as on-banner buttons looking "stuck in dark mode" once light theme
existed — for two independent reasons, both worth knowing before you touch
this again:
1. A fixed black tint genuinely has poor contrast against a *light*-toned
   brand color (Compress's cyan-blue) even though it reads fine against a
   *deep*, saturated one (Convert's purple) — the old rule implicitly
   assumed every brand color was dark enough for black-on-it to pop, which
   isn't true site-wide.
2. `<option>` elements inside a native `<select>` (Convert's mobile format
   picker, `.tool-format-select option`) can't take a translucent
   background at all — it needs to be a solid, explicit light/dark pair,
   which had only ever been given the dark half.

Fixed by making every on-banner control follow the same flip
`.tool-primary-btn` already used, rather than special-casing the specific
tool/component that got reported. When adding a new on-banner control,
default to this flip recipe — don't reach for a fixed black tint "because
it's on a banner."

**The one exception**: the terminal-text readout chip (see "Terminal text"
above) stays a fixed `rgba(0,0,0,.35)` regardless of theme — it's a
deliberately fixed "technical" voice, not a normal interactive control, so
it's exempt from this rule on purpose.

**A "selected/active" state needs its own contrast check, not just the
flip.** `.tool-format-btn.active` (Compress's Low/Medium/High picker) flips
correctly but still nearly vanished in light theme at the same `.35`/`.5`
opacity the plain flip formula above uses — an *active* indicator has to
read as clearly filled against its unselected siblings, and translucent
white blended into an already-light banner doesn't clear that bar the way
it does against a deep one. Bumped to `rgba(255,255,255,.65)` background /
`rgba(255,255,255,.9)` border / `#1d2436` text for the light side
specifically (dark side's `rgba(0,0,0,.28)` was already strong enough,
left as-is). If a future "selected" state looks weak in one theme, raise
its opacity for that theme rather than assuming the base flip recipe covers
it automatically.

**Watch for a control that's ALSO used inside an always-dark surface** (a
fullscreen/focus-mode overlay, a modal, a preview panel that's
intentionally dark regardless of site theme — e.g. Context's
`.context-fullscreen-overlay` and `.context-preview-panel`). A shared class
like `.context-tool-btn` can be used both directly on the normal banner
(should flip) and inside one of these fixed-dark surfaces (should NOT flip,
or it goes light-on-dark and vanishes). Don't just flip the class globally
— add a `.always-dark-surface .the-control{...}` override, unguarded by
`html[data-theme="dark"]`, that forces the dark treatment specifically
inside that surface. See Context's `.context-fullscreen-overlay
.context-tool-btn` etc. for the reference pattern.

### `.result` — the shared "loaded file" preview card, and `.bc-file-remove-btn`

Every tool that lists the file(s) a user has loaded (Convert, Compress,
Congify, Coudio, Context, Cleanly's `.exif-file-item`, Combine's
`.combine-file-item`) now genuinely shares one class, `.result`
(`shared/site.css`) — not just a matching recipe copy-pasted per tool. A
tool-local class stays on the same element as a **second** class, holding
only whatever's genuinely tool-specific (row layout for a drag-reorderable
list, a brand-tinted border color) — `class="exif-file-item result"`,
`class="combine-file-item result"`. `.result`'s own default already covers:

- Background: light default `rgba(255,255,255,.35)`, dark override
  `rgba(0,0,0,.25)` — the same white/black-tint pair as every other
  on-banner control, not a one-off dark-navy tint. This card's default used
  to be a near-invisible `rgba(...,.03)` (with tools like Convert/Compress
  each building their own bolder per-tool override just to compensate,
  and Cleanly/Combine's own file-item classes separately shipping a
  `rgba(29,36,54,...)` light value that read as barely distinct from the
  dark-theme value) — if a "themed" card still looks like it isn't changing
  between light/dark, or a tool has grown its own bespoke override that
  duplicates this recipe instead of adding the `result` class, check for
  this exact mistake before assuming the wiring is broken.
- `border-radius:16px; padding:10px;` — a tool-local class only needs to
  override these if its layout genuinely differs (Cleanly/Combine's file
  rows use their own `padding`/`border-radius`/`gap` for the row layout,
  Convert/Compress leave these as `.result`'s default).
- A per-tool border-color accent (Convert `#d670ff55`, Compress `#68e1ff55`,
  Cleanly `#4ade8055`, Combine `#FF696155`) is the one thing that stays a
  **local, unguarded** `border-color:...` override on the tool's own class
  — a flat hex+alpha reads fine on both the light and dark `.result`
  background, so it doesn't need its own theme guard the way the old
  from-scratch per-tool `.result{}` blocks used to (those needed explicit
  `html[data-theme="light"/"dark"]` pairs only because they were also
  re-declaring `background`, which `.result` now owns).
- `.result-name`/`.exif-file-name` (the filename text): `color:var(--text)`
  — used to be hardcoded `#fff`, silently wrong in light theme even after
  the card itself was fixed, since the card and its text are separate rules
  that both need the flip independently. Check both whenever fixing one.

**`.bc-file-remove-btn`** (`shared/site.css`) is the matching shared "×"
circle for a file-item row — translucent white/black tint (not
`.bc-remove-btn`'s bold solid-red circle, a different family used for small
badges elsewhere). Originated independently, byte-identical, in Cleanly
(`.exif-file-remove`) and Combine (`.combine-file-remove`); both now add
`bc-file-remove-btn` as a second class, keeping their own class only as a
JS-listener addressing hook.

**Exception — don't flip an overlay sitting on top of the thumbnail image
itself**, only the ones sitting on the card's own background. `.result-remove`
(the "×" that fades in over the thumbnail on hover) and
`.context-signature-camera-badge` (an overlay on a live camera feed) stay a
fixed `rgba(0,0,0,.55)`-ish dark circle regardless of site theme on purpose
— their contrast partner is unpredictable image/video content, not the
page background, so flipping them doesn't make sense the way it does for a
control that sits on a known, theme-aware surface.

## Shared typography: `.bc-label`, `.bc-heading`, `.bc-body`

Three shared text classes (`shared/site.css`) for the "one style of
title/paragraph/eyebrow-label across all tools" typography, rather than each
tool growing its own slightly-different recipe (Convert's `.tool-io-label`,
Colorfy's `.colorfy-palette-heading`, Coudio's `.cd-setting-group label` had
each independently converged on nearly the same values before this):

- **`.bc-label`** — small uppercase eyebrow label (e.g. Convert's "IN"/"OUT",
  Coudio's "Output format"/"Bitrate"): `font-size:13px; font-weight:800;
  letter-spacing:.04em; text-transform:uppercase; color:var(--text);
  opacity:.7;`.
- **`.bc-heading`** — a small section heading inside a tool (e.g. Colorfy's
  "Saved colors"): shares the same weight/color intent as `.bc-label` but
  without the uppercase/letter-spacing treatment — check `shared/site.css`
  for the exact current values before assuming.
- **`.bc-body`** — regular in-tool body text: `color:var(--text);
  opacity:.8; font-size:14px; line-height:1.5;`.

Add as a **second class** alongside the tool's own (already-existing)
class — the tool-local class keeps only genuinely distinct layout
(`display`, `margin`, `gap`), the shared class owns the actual type
recipe. E.g. Convert's `class="tool-io-label bc-label"`, Colorfy's
`class="colorfy-palette-heading bc-heading"`. Don't redeclare
`font-size`/`font-weight`/`color`/`opacity`/`letter-spacing` on the
tool-local class once it's carrying one of these — that's exactly the
duplicate-recipe drift this pair of classes exists to end.

## Shared editor input: `.bc-editor-input`

For any textarea/input styled as a code- or text-editor surface (Codify's
code input is the reference), use `.bc-editor-input` (`shared/site.css`) for
all theme-dependent chrome — border, background, text color, placeholder
color, hover/focus states, and hiding the native scrollbar track. Pair it as
a **second class** with a tool-local class that keeps only size/font
specifics (`height`, `padding`, `border-radius`, `font-family`, `font-size`,
`line-height`) — e.g. `class="cf-code-input bc-editor-input"`. This exists
because Codify's editor had grown its own hardcoded-dark `:hover` rule that
didn't flip with site theme (reported directly: "the light theme toggle...
is changing color when mouse hover") — rather than just patching that one
rule, the shared class now owns every theme-dependent piece of an editor
surface so a second editor never has to re-derive them from scratch.

## Tool banner color + category texture

- Every tool has one fixed, fully-saturated brand color, no two tools share
  a hue: Convert `#B84CFF` Purple, Compress `#3FBFE8` Sky Blue, Combine
  `#FF6961` Coral Red, Cleanly `#7ED321` Lime Green, Context `#F6D44A`
  Yellow, Colorfy `#FF8A4C` Orange (Image); Congify `#22D3D0` Teal (Video);
  Coudio `#18C98A` Emerald Green (Sound); Codify `#FF4FD8` Pink (Code). Set
  via `#page-<id>::before{ background:<hex>; }` in the tool's own page, and
  via the matching `#page-mainpage .card.<tool>::before` rule on the
  homepage.
- **Every homepage card carries `title="The color is: <Color Name>"`** on
  its own `.card` div (e.g. `<div class="card convert"
  data-category="image" title="The color is: Purple">`) — the fixed
  `"The color is: "` prefix plus the plain-English name of that tool's
  brand color from the list above, not a repeat of the tool name or a
  description. This is what shows as the native browser tooltip on hover.
  New cards need this added at the same time as their `::before` color
  rule — same rule, two places to apply it (the color itself, and its
  name).
- **Category textures live in `shared/textures.css`** — one shared file,
  not a homepage-only block — so both the homepage card grid and any
  tool's own `.tool-app` banner can use the exact same recipe: Image =
  plain (no texture — it's the largest category, staying plain keeps the
  other three legible as intentional accents), Sound = ripple
  (`repeating-radial-gradient`, concentric rings), Code = mosaic (layered
  14px/28px grid `linear-gradient`s at `opacity:.5`), Video = filmstrip
  perforations on the **top edge only** (bottom row was tried and removed
  on the homepage card — it crowded the "Read more" button). Driven by
  `data-category="image|video|sound|code"` on the card / `.tool-app` —
  the same file's selectors cover both (`#page-mainpage .card[data-category=...]`
  and `.tool-app[data-category=...]`), sharing one background recipe per
  category and splitting out only the z-index (see Layering below).
  `border-radius:inherit` (not a hardcoded px value) is what lets one rule
  fit both surfaces — homepage cards are 28px, `.tool-app` banners are
  36px. This used to be a homepage-only block, hand-duplicable the day a
  tool wanted its own banner textured — same fix as `shared/icons.css`:
  one real source, linked from both surfaces (`shared/site.css`'s own
  `@import url("textures.css");` for every tool page, index.html's own
  `<link>` for the SPA, since it doesn't load the rest of `shared/site.css`).
  No tool actually sets `data-category` on its own `.tool-app` yet — the
  capability exists and is verified working, but turning it on for a
  specific tool's banner is a visual decision nobody's made yet.
- Layering: brand-color `::before` (z-index 0 on homepage / -1 on tool
  pages, since tool banners have no separate content-layer requirement),
  texture `::after` painted after it (same z-index — pseudo-element DOM
  order alone puts it on top), real content above both.

## Homepage card hover — the settled formula

`#page-mainpage .card`/`.card-readmore` (mirrored by hand in `index.html`
itself rather than shared/site.css, since the SPA doesn't load that file —
same reason `--context-yellow` is kept as a manually-synced local copy
there). This went through several iterations before landing here — worth
reading before changing it again:

- **Card**: `transform-origin:bottom center;` + `transform:scale(1.05)` on
  `:hover` (`scale(1.02)` on `:active`), `.17s cubic-bezier(.22,1,.36,1)`.
  A **plain uniform `scale()`** — earlier versions tried a squash-and-
  stretch (`scaleX`/`scaleY` at different values) to feel "livelier", but
  that read as a pinch/squeeze rather than a pop; a uniform scale reads as
  a clean, energetic grow. Anchoring at the bottom means only the top
  visibly moves, so cards keep their bottom edges aligned with their
  neighbors' while hovered.
- **Read More**: plain `background`/`color` transition on `:hover` — no
  `transform` at all. It used to have its own separate scale reaction
  (with `.card:hover` excluded via `:not(:has(.card-readmore:hover))` so
  the two wouldn't stack), but that combination caused a real hover-flicker
  bug: the card's own transform shifting where Read More's hit-box sits
  could flip its `:hover` state on/off mid-transition, right at the
  boundary between the two elements. **Lesson: don't give both a parent
  and a child their own competing `:hover`-triggered `transform` — one of
  them moving is enough to desync the other's hit-test.** If Read More
  ever needs its own visual reaction again, keep it non-transform (e.g. a
  border/glow change) or drive both states from one shared trigger
  (JS-toggled class) instead of two independent `:hover` rules.
- Also explored and explicitly rejected: rotate/wobble on the card itself
  (reads as "jumping", not "growing"); Read More tilting via
  `perspective()+rotateX()`; Read More popping past the card's bottom edge
  (required removing the card's `overflow:hidden`, which is what gives
  Read More its rounded corners for free at rest — technically doable but
  not worth the fragility for a hover flourish).

## Help banner (step-through intro)

Every tool has a dismissible, step-numbered terminal-styled intro banner
("`<TOOL>_GUIDE: STEP 1/N`") — copy this pattern rather than inventing a new
onboarding UI. Dismissal (red dot) persists per-tool via
`localStorage.setItem("bc-help-<tool>-dismissed", "1")`.

## Pressed/toggle buttons: `.bc-toggle-btn`

For any Bold/Italic/Underline-style pressed-state button (or a plain toggle
like "Stroke"), use `.bc-toggle-btn` (`shared/site.css`) — 40px tall,
translucent-black, `[aria-pressed="true"]`/`.active` → white border + darker
fill. Add `.bc-toggle-btn-icon` for a 34px square icon-only variant (single
glyph like B/I/U). Wrap a row of them in `.bc-toggle-btn-group`
(`display:flex; gap:6px`). No shared JS for this one — the actual toggle
action (`btn.classList.toggle(...)`, what it restyles) is different enough
per use that a one-liner in the tool's own file is simpler than forcing an
abstraction. Originated in Context; Congify's `.gif-toggle-btn` used to be
a hand-copied duplicate — now both point at the shared class.

## Drag-to-resize handle: `.bc-resize-handle`

The corner circle-with-arrow handle (21×21px, `#2563eb` fill, white 2px
border) for any drag-to-resize control is `.bc-resize-handle`
(`shared/site.css`) — covers size/shape/color/border/touch-action only.
Position offset (`right`/`bottom`) and cursor direction (`ns-resize` vs
`nwse-resize`) are genuinely per-use and stay as local overrides on the
tool's own class alongside it (e.g.
`class="cf-resize-handle bc-resize-handle"`). Works with either icon
technique in use across the site — an inline `<svg>` child (sized via
`.bc-resize-handle svg`) or a `::before` background-image — pick whichever
matches how the element is created (JS-created small elements tend to use
the inline-svg technique; static markup tends to use `::before`). No shared
JS — like the toggle button, the drag math differs enough per use (frame
resize vs. text-box resize) that sharing only the visual is the right
altitude. Originated in Context (`.context-text-resize-handle`); Congify,
Codify, and Colorfy each independently copied it under their own prefix
before this was shared — all four now point at the one component.

## Drag & drop

Reuse `bcSetupBannerDropTarget(toolApp, opts)` from `shared/site.js`
(`isInScope`, optional `getEnterTarget`/`clearTargets`, `onDrop`) for any
tool that accepts a dropped file onto its banner — don't hand-roll
dragenter/dragleave/drop listeners per tool; the shared helper already
handles nested-child dragenter/dragleave depth-counting correctly.

## Editor / resizable-frame conventions (when a tool has one)

- Auto-fit height to content on input (`scrollHeight`-driven), with a
  min/max clamp (`max-height:80vh` is the standing convention) — the visible
  drag handle is a manual override on top of that, not the primary control.
  See Codify's `autoFitCodeInput` / Colorfy's frame resize for the reference
  implementation.
- Hide the native scrollbar track on an auto-fitting textarea
  (`scrollbar-width:none; -ms-overflow-style:none;` +
  `::-webkit-scrollbar{display:none}`) — auto-fit means it almost never has
  anything to actually scroll, so the track is just visual noise. Keep
  scrolling functional for the rare overflow past the max-height cap.
- When measuring a resizable frame's max width, always measure against a
  stable ancestor (e.g. `.tool-app`), never against an element that itself
  auto-sizes to the thing being measured — that self-referential trap caps
  growth short of the real intended max (see Colorfy's `frameWidthMax` fix).

## Before shipping a new tool page, check it has:

1. Its brand color assigned from the shared palette above (or a genuinely
   new hue, updated in this doc).
2. `data-category` set correctly if it'll get a homepage card texture.
3. The standard help banner.
4. `bcSetupBannerDropTarget` for any drop zone, not a hand-rolled one.
5. `bcRegisterCombo`/`bcRegisterDropdown` for any "pick one of several"
   control, not a hand-rolled one — see the rule of thumb above.
6. Pills sized via the sizing formula above if it has more than one setting
   dropdown side by side.
7. `.bc-toggle-btn`/`.bc-resize-handle` for any pressed-state button or
   drag-to-resize handle, not a hand-rolled one.
8. Every new/changed script or stylesheet's `?v=` bumped, site-wide for
   shared files.
9. A live-browser check (both themes) before calling it done — this project
   consistently catches real bugs this way (stacking/specificity issues,
   clipped native controls, texture/button collisions) that are easy to miss
   from source alone.
