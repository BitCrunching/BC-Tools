# BC Tools — design system reference

Read this before building or editing ANY tool page. It exists because tools
built without it end up each inventing their own slightly-different version
of the same handful of components — read this first instead of re-deriving
(or re-guessing) these values from scratch.

When a new pattern gets established (a new component, a new rule), add it
here in the same edit — this file only stays useful if it's kept current.

**Comments are rare, not default.** Only write one when the code can't
explain itself — a genuinely non-obvious *why*. No comment for what the
code already says. If you do write one, one line. This file is the
exception (it's the reference, meant to be read in full); comments inline
in the actual site files are not.

**Layout of this file**: "Reference tools" below, then the component
reference (current rules/values only — read this section day-to-day), then
operational mechanics (cache-busting, shipping checklist), then two
appendices — **Provenance** (which tool originated which shared component)
and **Lessons learned** (the "we tried X, it broke, fixed with Y" stories
behind the non-obvious rules above, linked from the relevant component
instead of inlined into it). If a rule above looks arbitrary, its reasoning
is very likely in Lessons Learned — check there before re-deriving it.

## Reference tools

There is no single "when in doubt, copy this tool" answer anymore — three
tools each anchor a different axis, use whichever fits the situation:

- **Convert** (`convert/`) — the cleanest baseline. It carries zero
  undocumented per-tool overrides on any shared component (its
  `.tool-primary-btn`, e.g., is the shared class with no local patch at
  all). Default to Convert when you want to see a shared component used
  exactly as documented, with nothing tool-specific mixed in.
- **Context** (`context/`) — the most component-rich tool on the site, and
  the largest (`context-tool.js` is ~2,200 lines, more than 2x Convert's).
  It originated `.bc-toggle-btn`, `.bc-resize-handle`, the `.bc-obj-*`
  in-canvas-object family, and is the reference example for the
  always-dark-surface override pattern (see below). Default to Context for
  anything involving in-canvas objects, toggle buttons, or an
  always-dark surface inside an otherwise theme-aware page.
- **Codify** (`codify/`) — the most-edited tool by commit count (roughly
  1.7x Convert's), and the reference for `.bc-editor-input` and the
  auto-fit resizable-frame conventions. Default to Codify for anything
  involving a text/code editor surface or a resizable preview frame.

When a rule in this doc doesn't cover a situation, or two tools disagree on
how to do something and it's not already settled here, pick whichever of
the three above is closest to the situation, follow what it does, then add
the rule here so it doesn't have to be re-derived next time.

## Tool icons: `shared/icons.css`

Every tool icon (`--icon-convert`, `--icon-context`, `--icon-compress`,
`--icon-combine`, `--icon-cleanly`, `--icon-gif` (Congify), `--icon-coudio`,
...) — the base64 SVG data URI custom properties and the `.icon-X` mask
rules that paint them — lives in one file, `shared/icons.css`, not
duplicated per page. Every standalone tool page gets it automatically via
`shared/site.css`'s own `@import url("icons.css");` at the top of that
file. `index.html` (the homepage SPA) doesn't load the rest of
`shared/site.css` (keeps its own inline `<style>` on purpose), so it links
`icons.css` directly instead: `<link rel="stylesheet"
href="/shared/icons.css?v=N">`.

**Add a new icon or change an existing one only in `shared/icons.css`** —
never re-add a per-file copy (see Lessons Learned: "icons.css dedup" for
why). Bump `icons.css`'s own `?v=N` (on `index.html`'s `<link>`) and
`shared/site.css`'s `?v=N` (everywhere else, since its `@import` picks up
icons.css's new content through the same cache-busted request) whenever
`icons.css` changes.

**8 tools have a real icon today: Convert, Compress, Combine, Cleanly,
Context, Congify, Coudio, Codify.** Colorfy still falls back to
`.gfx-placeholder` (a plain text label) until its `--icon-X` token and
`.icon-X` rule get added here.

## Buttons & pills

Two distinct component families — don't blend them:

### `.tool-primary-btn` — the one big CTA per tool (Download / Convert / etc.)

- `height:74px; padding:0 32px; border-radius:26px;`
- `font-weight:900; font-size:20px;` color `var(--text)`.
- Follows the general on-banner flip recipe below (light `rgba(255,255,255,
  .35)` / dark `rgba(0,0,0,.28)`) — no per-tool override needed; Convert's
  `<button class="tool-primary-btn" id="cvConvertBtn">` is the reference:
  the shared class as-is, nothing local.
- `:disabled` — light `rgba(255,255,255,.2)`, dark `rgba(0,0,0,.14)`.
- Used by 7 of 9 tools as one single global CTA (Colorfy has no single
  global CTA at all — its action model is per-swatch copy buttons instead —
  and Cleanly/Coudio use the *per-row* variant below rather than one global
  button).
- **Every tool also gets `.tool-primary-btn.tool-continue-btn`** — a
  compound-selector override in `shared/site.css` for the "Continue where
  you left off" button. This is a real, documented exception, not drift.
- **A tool with N independent per-item actions (not one global CTA) still
  reuses this class, just smaller.** Coudio's redesign gave every loaded
  file its own row with its own Convert/download button — genuinely N
  buttons, not "the one CTA," so `height:74px` doesn't fit. Rather than
  hand-rolling a new button family, it adds a second local class
  (`class="tool-primary-btn cd-row-convert-btn"`) that only overrides
  `height`/`padding`/`font-size` down to a compact 40px — still inheriting
  `.tool-primary-btn`'s color/border/flip recipe as-is. This is the one
  documented exception to "no ad-hoc height-only override" (see the `-lg`
  variants below): it applies specifically when the *number* of
  primary-style buttons on screen has genuinely changed from one to many,
  not when a single CTA just needs a different size — that case still gets
  a real variant class, not a local override. **Cleanly followed the same
  template directly** — its clean/download actions moved from one global
  `.exif-actions` CTA below the file list to per-row buttons (wrapped in
  `.exif-file-actions`, `shared/site.css`) sitting right next to each
  row's own `.bc-file-remove-btn` ("the beta remove btn"). All of them
  share one local class trio (`.ex-row-strip-btn`/`.ex-row-clean-
  download-btn`/`.ex-row-download-btn`, `cleanly/index.html`) for sizing —
  `height:40px; padding:0 18px; font-size:14px;`, same values as Coudio's
  own local class. Several genuine differences from Coudio's
  `convertEntry()`:

  1. **A row shows two buttons before it's cleaned, one after — and that
     one stays enabled forever.** Before `item.stripped` is true: "Clean
     first" (`stripEntry()`, no download) and "Clean and download"
     (`stripEntry(item, row, { thenDownload: true })`, cleans then
     immediately calls `downloadEntry()` once) sit side by side — one lets
     a visitor check the result first, the other is the one-click path for
     anyone who doesn't care to. Either path lands on the same place once
     `item.stripped` is true: a single "Download" button
     (`renderList()`'s `actionButtonsHtml`) that never gets disabled or
     swapped out — clicking it just re-downloads the same already-cleaned
     blob (`downloadEntry()`) as many times as wanted. There's no
     "already downloaded, don't offer it again" state at all: downloading
     is not a one-shot action here, unlike e.g. Congify's result download.
     `stripEntry()`'s own `row.querySelectorAll(".ex-row-strip-btn,
     .ex-row-clean-download-btn")` disables whichever of the two clean
     buttons is currently showing only while the clean itself is in
     flight, re-enabling on failure — this is a working-state disable, not
     a used-once one.
  2. **Cleaning and downloading are deliberately separate actions, not
     one**, even from "Clean and download" — that button still calls
     `stripEntry()` first and lets it call `downloadEntry()` internally,
     rather than duplicating the strip+download logic inline. `stripEntry()`
     marks `item.stripped = true`, clears `item.tags` to `[]`, and stashes
     the blob/output-name on the item (`item.strippedBlob`/`strippedName`),
     then re-renders the row so it reads as an always-clean file would
     (the same `.exif-status-icon-clean` "No dangerous metadata found"
     pill). Only `downloadEntry()` gets a `startPrivacyCheck()`/
     `finishPrivacyCheck()` pair — cleaning itself never touches the
     network (it's pure canvas/`heic2any`/SVG-string work), so the privacy
     badge, which is about outbound requests, has nothing to report for
     that step and stays silent until a file is actually downloaded.
  3. **None of these buttons' own text ever shows a working/done/failed
     state** — unlike Coudio's Convert button, which cycles its own label
     through "Convert" → "Converting…" → "Done"/"Failed" → back to
     "Convert". Cleanly's buttons read only "Clean first" / "Clean and
     download" / "Download", full stop (disabled while a clean is in
     flight); every transient status ("Removing metadata from X…" /
     "Done — X cleaned. Click Download to save it." / "Downloaded X." /
     "Couldn't clean X…") goes to the shared `#exStatus` line below the
     file list instead — the one place every other status message in this
     tool already goes, rather than making the button a visitor is
     looking at relabel itself mid-action.
  4. **Each of the three buttons carries its own `data-ga-action`**
     (`"clean_first"` / `"clean_and_download"` / `"download"`) alongside
     the `data-ga-event="tool_primary_action"`/`data-ga-tool="cleanly"`
     pair every `.tool-primary-btn` already uses — `data-ga-action` isn't
     a new tracked field shared/site.js has to know about, it's just
     another `data-ga-*` attribute, and the existing delegated click
     listener (`shared/site.js`) already turns any `data-ga-<param>` into
     a GA4 event param automatically. Reach for the same
     `data-ga-<param>` pattern any time two-or-more buttons share one
     `data-ga-event` name and GA needs to tell them apart.

  No ZIP path is needed any more either way, once every file has its own
  independent download.

  5. **Mobile drops the per-row buttons entirely and falls back to one
     global button below the list.** Two/three buttons plus the row's own
     remove-× never fit next to a filename/tags column at phone widths —
     confirmed directly, in every labeling tried (full text, shortened
     text). Below `768px`, `.exif-file-actions` (each row's button
     wrapper) is hidden via CSS and `.ex-mobile-download-btn`
     (`#exMobileDownloadBtn`, `cleanly/index.html`) takes over — a single
     `.tool-primary-btn` sitting below `#exFileList`, always reading
     "Clean & download". Clicking it calls `mobileDownloadAll()`
     (`cleanly-tool.js`), which loops every loaded file sequentially
     (cleaning it first via the shared `cleanFile()` helper if it hasn't
     been already, then calling `downloadEntry()` — every file, every
     click, since downloads aren't a one-shot action here either), with a
     `300ms` pause
     between downloads so the browser doesn't treat a download burst as
     spam and block them — this is genuinely the pre-redesign single-
     global-CTA model, kept alive specifically for the mobile breakpoint
     while desktop uses the per-row system above. `stripEntry()` and
     `mobileDownloadAll()` both call the same `cleanFile(item)` (no row/
     button bookkeeping) rather than duplicating the strip logic — only
     `stripEntry()` needs to know about row buttons to disable, since
     mobile has none.

     **A real bug found and fixed here on audit**:
     `mobileDownloadAll()`'s loop calls `downloadEntry()` every iteration,
     which itself calls `renderList()`, which sets
     `#exMobileDownloadBtn.disabled` purely from `files.length` — with
     nothing else guarding it, that re-enabled the button (letting a
     second overlapping run start on a stray double-click) the instant
     the *first* file in a multi-file batch finished downloading, not
     after the whole batch did. Fixed with a `mobileDownloadRunning`
     module-level flag: set before the loop starts, checked by both
     `mobileDownloadAll()`'s own early-return guard and by
     `renderList()`'s disabled check
     (`files.length === 0 || mobileDownloadRunning`), so every mid-loop
     render still keeps the button correctly disabled until the whole
     run actually finishes.

### Picking a dropdown widget: `.bc-combo` vs `.bc-dropdown`

Two shared, reusable components live in `shared/site.js` /
`shared/site.css` — **use one of these for any new "pick one of several
options" control, never hand-roll a third copy**:

- **`bcRegisterCombo(trigger, input, menu, emptyEl, onSelect)`** + `.bc-combo`
  markup — a *searchable* combobox (real `<input>`, typing filters options).
  Reserved for genuinely long lists (10+ options) where search earns its
  keep — Codify's Language/Theme/Template, Context's and Coudio's longer
  pickers.
- **`bcRegisterDropdown(trigger, menu, onSelect)`** + `.bc-dropdown` markup —
  a plain trigger button + menu, no search box. For everything shorter —
  Convert's output format, FPS, crop ratios, playback speed, font pickers.
  Congify is the heaviest adopter (dozens of instances across its various
  pickers).
- **Rule of thumb: 5+ options → combo, fewer than 5 → dropdown.** (Exception:
  an option needs a custom preview in its row — a color swatch dot, a
  stroke-width line sample — stays on `.bc-dropdown` regardless of count,
  since `.bc-combo`'s trigger only has room for a text label + chevron, no
  custom visual. Congify's two color pickers are the reference example.)
- Compress, Combine, and Cleanly use neither — they have no "pick one of
  several" control at all (Compress's Low/Medium/High is three plain
  buttons, not a dropdown). That's a legitimate absence, not a gap to fill.

Both close each other's siblings of the same type, close on outside-click
or Escape, and mark the active option. If you're tempted to copy a
dropdown's CSS/JS into a new tool "just this once," that's the sign to
reach for `bcRegisterCombo`/`bcRegisterDropdown` instead (see Lessons
Learned: "dropdown dedup").

### Folding a tool's own trigger-shaped pill onto `.bc-dropdown-trigger`

When a tool-local class (`.context-color-trigger`, `.cf-color-trigger`, etc.)
turns out to be a byte-for-byte (or near enough) copy of `.bc-dropdown-trigger`'s
own recipe — same 40px/12px-radius/border/background/flip/font — add
`bc-dropdown-trigger` as a **second class** on the markup and strip the
duplicate chrome out of the tool-local class, same split pattern as
`.result`/`.bc-editor-input` below. Two things to check before doing this:

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
  values as the formula below, but at genuinely different geometry for a
  genuinely different job — leave these as their own classes rather than
  forcing them onto `.bc-dropdown-trigger`'s dropdown-pill shape. Matching
  the *documented flip formula* is the actual bar for "not a separately
  patched layer," not literal class-sharing when the geometry doesn't fit.

### `.bc-segmented-toggle` — joined-pill format/mode toggle

A row of `[aria-pressed]` buttons sharing one continuous outline (only
the outer corners round; interior borders merge into a single shared
divider), selected segment filled via the on-banner flip recipe below.
`shared/site.css` — covers segment chrome only; width/max-width/margin
stay a local per-use override, same split as every other shared
component here.

```html
<div class="bc-segmented-toggle"><button aria-pressed="true">A</button><button aria-pressed="false">B</button></div>
```

Optional modifiers, both animated (`.2s`–`.3s` `cubic-bezier(.4,0,.2,1)`
transitions, not instant snaps): `.bc-segmented-toggle-collapsed` on a
segment that's no longer a valid choice (collapses its flex share/
padding/opacity to 0 in place, rather than `[hidden]`'s un-transitionable
`display:none` — pair with `aria-hidden="true"`/`tabindex="-1"` in JS,
since `pointer-events:none` alone doesn't stop keyboard focus);
`.bc-segmented-toggle-solo` on the one segment left after a sibling
collapses (rounds both its corners instead of just the one its DOM
position owns — see the download-mode toggle below for the reference
usage of both).

This recipe existed independently twice before being promoted — Codify's
`.cf-format-toggle` (PNG/SVG/Copy) and Congify's `.gif-mode-toggle`
(Basic/Custom) — both left as-is (not worth the regression risk of
migrating working tools just for this), but Convert's and Compress's
newer Single-files/`.zip` download-mode toggle (below) is the reference
adopter for any *future* segmented-toggle need — reach for this class,
not a third hand-rolled copy.

**Single files / `.zip` download-mode toggle** (Convert, Compress): both
tools batch-download multiple converted/compressed files, historically
always as a ZIP once there were more than 5 (`useZip = files.length > 5`,
no user choice). Replaced with a real toggle — visible the whole time
once any file's loaded, but **solo-ing down to whichever single option
is actually valid** at the extremes rather than hiding the whole control:

- **≤5 files**: only "Single files" shows — the `.zip` segment collapses
  away, not just made inert, since a ZIP is pointless overhead for a
  couple of files.
- **6–20 files**: both segments show as a real, mostly-arbitrary choice,
  defaulting to `.zip` (matches the old behavior when nobody touches it).
- **>20 files**: only `.zip` shows — the "Single files" segment is
  removed, since letting someone fire off 21+ individual downloads at
  once is the exact problem a ZIP solves, no real reason to let them opt
  out at that scale.

`effectiveUseZip(count)` in each tool's own `-tool.js` centralizes the
actual download decision — always call it instead of re-deriving the
threshold logic inline. `updateDownloadModeToggle(count)` (called from
each tool's existing `renderStatus()`, already run on every add/remove/
reset of the file list — no new hook needed) toggles each segment via
the shared `.bc-segmented-toggle-collapsed` class (shared/site.css)
rather than the `[hidden]` attribute — `[hidden]` snaps straight to
`display:none` with no way to transition, `.bc-segmented-toggle-collapsed`
animates the segment's flex share/padding/opacity down to 0 instead, so
the pill visibly grows/shrinks between one and two segments rather than
popping. It also sets `aria-hidden`/`tabindex="-1"` on the collapsed
segment, since `pointer-events:none` alone stops clicks but not keyboard
focus. Adds the shared `.bc-segmented-toggle-solo` modifier class to
whichever segment is left standing alone so it renders as a complete
rounded pill instead of half of one (`:first-child`/`:last-child`
corner-rounding is DOM-position-based, not visibility-based, so a soloed
segment needs the explicit override — see `.bc-segmented-toggle-solo`
above, which also carries its own transition so the corners round in
smoothly rather than snapping). Also force-sets `downloadMode` to match
the soloed segment, so `effectiveUseZip` and the visible pressed-state
never disagree.

**Convert's 16 SEO route siblings (`convert/jpg-to-png/index.html` etc.)
don't carry this toggle's markup** — every DOM lookup for it is
null-guarded, so those pages just silently keep the old toggle-less "zip
above 5" behavior rather than throwing. Worth adding the markup there
too if those pages are ever revisited for something else, but not broken
as shipped.

### `.bc-combo-trigger` / `.cf-color-trigger` — small dropdown/setting pills

- `height:40px; padding:0 12px; border-radius:12px;`
- Follows the general on-banner flip recipe below.
- Text: `color:var(--text); font-weight:700; font-size:14px;` (placeholder:
  same color at `opacity:.5; font-weight:600;`) — flips with theme same as
  the background.
- Chevron: 6×6px, `border-right/bottom:1.5px solid currentColor; opacity:.75;
  transform:rotate(45deg);` — `currentColor` follows the trigger's own
  `color`, so it never needs its own theme override.
- **`.bc-combo-trigger-lg` / `.bc-dropdown-trigger-lg`** — larger size
  variants of both triggers, in `shared/site.css`. First used by Coudio's
  Output format picker. Reach for these instead of a one-off height
  override when a trigger genuinely needs to be bigger, same reasoning as
  Coudio's `cd-row-convert-btn` above.
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
theme) recipe** via `html[data-theme="dark"] .foo{...}` overrides. This is
the one recipe nearly every component above and below points back to —
memorize these four numbers once:

- Light (default, unguarded): `border:1px solid rgba(255,255,255,.5);
  background:rgba(255,255,255,.35);` hover → `rgba(255,255,255,.45)`; text
  `color:var(--text)`.
- Dark (`html[data-theme="dark"] .foo`): `border:1px solid rgba(0,0,0,.4);
  background:rgba(0,0,0,.25);` hover → `rgba(0,0,0,.35)`.
  (`.tool-primary-btn`'s own dark background is slightly stronger —
  `rgba(0,0,0,.28)`, hover `rgba(0,0,0,.36)` — everything else uses the
  `.25`/`.35` pair above.)

This applies uniformly whether the control sits on the neutral page surface
(nav bar, footer, content cards) or on a tool's own saturated brand-color
banner (`.tool-app::before` fill) — `.tool-primary-btn`, `.bc-dropdown-trigger`/
`.bc-dropdown-menu`/`.bc-dropdown-option`, `.bc-combo-trigger`/`.bc-combo-menu`/
`.bc-combo-option`, `.bc-toggle-btn`, `.bc-url-input`, and every tool's own
on-banner buttons (Congify's results toggle, Combine's file-row remove
button, Context's Add-text/Signature/color-trigger pills, Codify's code
input and color-swatch trigger, Colorfy's copy-code button) all follow this
one recipe. When adding a new on-banner control, default to this flip —
don't reach for a fixed black tint "because it's on a banner" (see Lessons
Learned: "on-banner flip reversal" for why that used to be the rule and
isn't anymore).

**The one exception**: the terminal-text readout chip (see "Terminal text"
below) stays a fixed `rgba(0,0,0,.35)` regardless of theme — it's a
deliberately fixed "technical" voice, not a normal interactive control, so
it's exempt from this rule on purpose.

**A "selected/active" state needs its own contrast check, not just the
flip.** `.tool-format-btn.active` (Compress's Low/Medium/High picker):
light side bumped to `rgba(255,255,255,.65)` background /
`rgba(255,255,255,.9)` border / `#1d2436` text (dark side's `rgba(0,0,0,
.28)` was already strong enough at the base flip values, left as-is). If a
future "selected" state looks weak in one theme, raise its opacity for
that theme rather than assuming the base flip recipe covers it
automatically — see Lessons Learned: "active-state contrast" for why the
plain flip wasn't enough here.

**Watch for a control that's ALSO used inside an always-dark surface** (a
fullscreen/focus-mode overlay, a modal, a preview panel that's
intentionally dark regardless of site theme — e.g. Context's
`.context-fullscreen-overlay` and `.context-preview-panel`, the reference
example). A shared class like `.context-tool-btn` can be used both
directly on the normal banner (should flip) and inside one of these
fixed-dark surfaces (should NOT flip, or it goes light-on-dark and
vanishes). Don't just flip the class globally — add a
`.always-dark-surface .the-control{...}` override, unguarded by
`html[data-theme="dark"]`, that forces the dark treatment specifically
inside that surface. See Context's `.context-fullscreen-overlay
.context-tool-btn` etc. for the reference pattern.

## `.result` — the shared "loaded file" preview card, and `.bc-file-remove-btn`

Every tool that lists the file(s) a user has loaded (Convert, Compress,
Congify, Coudio, Context, Cleanly's `.exif-file-item`, Combine's
`.combine-file-item`) shares one class, `.result` (`shared/site.css`) — not
just a matching recipe copy-pasted per tool. A tool-local class stays on
the same element as a **second** class, holding only whatever's genuinely
tool-specific (row layout for a drag-reorderable list, a brand-tinted
border color) — `class="exif-file-item result"`, `class="combine-file-item
result"`. `.result`'s own default already covers:

- Background: light default `rgba(255,255,255,.35)`, dark override
  `rgba(0,0,0,.25)` — the same white/black-tint pair as every other
  on-banner control, not a one-off dark-navy tint (see Lessons Learned:
  "`.result`'s dark-navy bug" if a "themed" card still looks like it isn't
  changing between light/dark — that exact mistake has happened before).
- `border-radius:16px; padding:10px;` — a tool-local class only needs to
  override these if its layout genuinely differs (Cleanly/Combine's file
  rows use their own `padding`/`border-radius`/`gap` for the row layout,
  Convert/Compress leave these as `.result`'s default).
- A per-tool border-color accent (Convert `#d670ff55`, Compress `#68e1ff55`,
  Cleanly `#4ade8055`, Combine `#FF696155`) is the one thing that stays a
  **local, unguarded** `border-color:...` override on the tool's own
  class — a flat hex+alpha reads fine on both the light and dark `.result`
  background, so it doesn't need its own theme guard.
- `.result-name`/`.exif-file-name` (the filename text): `color:var(--text)`
  — the card and its text are separate rules that both need the flip
  independently. Check both whenever fixing one.

**`.bc-file-remove-btn`** (`shared/site.css`) — aka **"the beta remove
btn"** (the user-facing nickname for it in this doc/conversation, since
it's the deliberately lower-key, non-red sibling of `.bc-remove-btn`'s
bold "delete everything" look) — is the matching shared "×" circle for a
file-item row: translucent white/black tint, 28×28px, flips with theme
(not `.bc-remove-btn`'s bold solid-red circle, a different family used
for small badges elsewhere). Originated in Cleanly (`.exif-file-remove`)
and Combine (`.combine-file-remove`); also now used by Colorfy's saved-
color palette chip (`.colorfy-palette-remove-btn`, resized locally to
25×25px), and by Convert/Compress/Coudio's per-file-row remove ("×"),
which used to be `.result-remove` instead (see the Lessons Learned entry
below for why that changed). Every adopter adds `bc-file-remove-btn` as a
second class, keeping its own class only as a JS-listener addressing
hook (and, where the button is absolutely positioned over a card/row,
for the position override — `.bc-file-remove-btn` itself owns visual
chrome only, same split as every other shared component here).

**Every adopter also carries a `title` alongside its `aria-label`** —
`title="Remove file"` for the genuine per-file cases (Cleanly, Combine,
Compress, Convert, Coudio), matching whatever the item actually is for
Colorfy's two non-file cases instead (`title="Remove picker N"` /
`title="Remove saved color"`, mirroring their own `aria-label` text
rather than a literal "Remove file" that wouldn't fit). This gives every
instance a native hover tooltip, not just a screen-reader label.

**Exception — don't flip an overlay sitting on top of the thumbnail image
itself**, only the ones sitting on the card's own background. `.result-remove`
(the on-image hover-fade "×", still used where a card's remove control
should stay out of the way until hovered) and
`.context-signature-camera-badge` (an overlay on a live camera feed) stay a
fixed `rgba(0,0,0,.55)`-ish dark circle regardless of site theme on purpose
— their contrast partner is unpredictable image/video content, not the
page background, so flipping them doesn't make sense the way it does for a
control that sits on a known, theme-aware surface.

## `.bc-remove-btn` / `.bc-canvas-back-btn` — the "remove all" corner pair

Every tool's own "clear everything and go back to the intro" red × button
(`.bc-remove-btn`) plus its mobile-only back-to-Hub companion
(`.bc-canvas-back-btn`) share one settled position now, standardized
2026-09-22 after they'd drifted per tool: **`top:16px; right:16px`** for
Remove, **`top:16px; right:52px`** for Back — both direct children of
`.tool-app` (not nested inside the revealed-content box), toggled with
`display:none` / `.tool-app:has(#xxAfterDrop:not([hidden])) .xx-remove-btn{
display:flex; }` rather than relying on a hidden ancestor. Cleanly's
`.ex-remove-btn`/Combine's `.cb-remove-btn` originated this exact recipe
(see Lessons Learned: "remove-all button position standardization" for
why the others didn't already match it, and what changed to bring them in
line). Codify keeps its own `hidden`-attribute toggle instead of the
`:has()` pattern (its own remove button isn't tied to an "after drop" box
the way the others are) but uses the identical `16px`/`16px`/`52px`
values.

## Shared typography: `.bc-label`, `.bc-heading`, `.bc-body`

Three shared text classes (`shared/site.css`) for "one style of
title/paragraph/eyebrow-label across all tools":

- **`.bc-label`, `.bc-heading`** — share one combined selector, so they are
  currently **identical**: `font-size:13px; font-weight:800;
  letter-spacing:.04em; text-transform:uppercase; color:var(--text);
  opacity:.7;`. (If you need a heading *without* the uppercase/
  letter-spacing treatment, that doesn't exist yet as a shared class —
  don't assume `.bc-heading` gives you that; check `shared/site.css`
  directly before relying on any distinction between the two.)
- **`.bc-body`** — regular in-tool body text: `color:var(--text);
  opacity:.8; font-size:14px; line-height:1.5;`.

Add as a **second class** alongside the tool's own (already-existing)
class — the tool-local class keeps only genuinely distinct layout
(`display`, `margin`, `gap`), the shared class owns the actual type
recipe. Current real adoption is thin: `.bc-label` is used in Convert
(the IN/OUT labels) and `.bc-heading` in Colorfy ("Saved colors") —
`.bc-body` has no adopters yet anywhere on the site. Don't take "shared
class" as a signal it's widely battle-tested; it's the *intended* recipe
for this kind of text, worth reaching for on new work, not yet a pattern
proven across many tools.

## Shared editor input: `.bc-editor-input`

For any textarea/input styled as a code- or text-editor surface (Codify's
code input is the reference and, as of now, the only adopter), use
`.bc-editor-input` (`shared/site.css`) for all theme-dependent chrome —
border, background, text color, placeholder color, hover/focus states, and
hiding the native scrollbar track. Pair it as a **second class** with a
tool-local class that keeps only size/font specifics (`height`, `padding`,
`border-radius`, `font-family`, `font-size`, `line-height`) — e.g.
`class="cf-code-input bc-editor-input"`. The shared class exists so a
second editor surface never has to re-derive its own theme-dependent chrome
from scratch (see Lessons Learned: "editor hover bug").

## Tool banner color + category texture

- Every tool has one fixed, saturated brand color, no two tools share a
  hue: Convert `#B84CFF` Purple, Compress `#3FBFE8` Sky Blue, Combine
  `#FF6961` Coral Red, Cleanly `#7ED321` Lime Green, Context `#F6D44A`
  Yellow (`var(--context-yellow)`), Colorfy `#FF8A4C` Orange (Image);
  Congify `#22D3D0` Teal (Video); Coudio `#18C98A` Emerald Green (Sound);
  Codify `#C81C86` Pink (Code — a deep raspberry, deliberately pulled back
  from the original near-neon `#FF4FD8` magenta, which read as a kids/toy
  tool at full brightness).
- Set via a `::before` background fill in the tool's own page, and the
  matching `#page-mainpage .card.<tool>::before` rule on the homepage.
  **Two different selector forms are in live use for the tool-page half —
  check which a given tool actually uses before assuming**: Compress,
  Cleanly, Context, and Convert key it off `.tool-app::before`; Colorfy,
  Coudio, and Codify key it off `#page-<id>::before`. Both work identically
  (same specificity story, same pseudo-element), it's just not one single
  convention — don't be surprised to find either form.
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
  on the homepage card — it crowded the "Read more" button), Special =
  sparse diagonal sparkle dots (`radial-gradient` dot repeated on a 24px
  grid) — the catch-all category for a tool that doesn't fit
  Image/Video/Sound/Code (e.g. a document-conversion tool), added
  2026-09-21. Driven by `data-category="image|video|sound|code|special"`
  on the card / `.tool-app` — the
  same file's selectors cover both (`#page-mainpage
  .card[data-category=...]` and `.tool-app[data-category=...]`), sharing
  one background recipe per category and splitting out only the z-index
  (see Layering below). `border-radius:inherit` (not a hardcoded px value)
  is what lets one rule fit both surfaces — homepage cards are 28px,
  `.tool-app` banners are 36px. Linked from both surfaces
  (`shared/site.css`'s own `@import url("textures.css");` for every tool
  page, `index.html`'s own `<link>` for the SPA, since it doesn't load the
  rest of `shared/site.css`). **No tool actually sets `data-category` on
  its own `.tool-app` yet** — the capability exists and is verified
  working, but turning it on for a specific tool's banner is a visual
  decision nobody's made yet.
- Layering: brand-color `::before` (z-index 0 on homepage / -1 on tool
  pages, since tool banners have no separate content-layer requirement),
  texture `::after` painted after it (same z-index — pseudo-element DOM
  order alone puts it on top), real content above both.

## Homepage card hover — the settled formula

`#page-mainpage .card`/`.card-readmore` (mirrored by hand in `index.html`
itself rather than `shared/site.css`, since the SPA doesn't load that file
— same reason `--context-yellow` is kept as a manually-synced local copy
there):

- **Card**: `transform-origin:bottom center;` + `transform:scale(1.05)` on
  `:hover` (`scale(1.02)` on `:active`), `.17s cubic-bezier(.22,1,.36,1)`.
  A plain uniform `scale()` — anchoring at the bottom means only the top
  visibly moves, so cards keep their bottom edges aligned with their
  neighbors' while hovered.
- **Read More**: plain `background`/`color` transition on `:hover` — no
  `transform` at all (see Lessons Learned: "homepage hover flicker" for
  why giving it its own transform reaction broke).

## Terminal text — the site's one recurring "readout" motif

Used for: nav copy-link confirmation (`.nav-terminal`), the step-through
help banners on every tool ("CODIFY_GUIDE: STEP 1/4" etc.), About's/the
homepage's engine-status card. This is the site's one deliberately
"technical" visual voice — use it for transient confirmations and
diagnostic-flavored copy, nowhere else. (Colorfy's copy/save confirmations
used to have their own separate floating dark-chip toast,
`.colorfy-copy-terminal` — retired, see Lessons Learned: "terminal font
fallback"; they're plain `.tool-status` lines now, not this component.)

- **Color**: `#4ade80` (green) on a dark/translucent chip — never used on a
  light chip.
- **Font**: `"Space Mono","Courier New", Courier, "Liberation Mono",
  "DejaVu Sans Mono", Consolas, Menlo, monospace` — a self-hosted webfont
  (`@font-face` in `shared/site.css`, files in `vendor/fonts/`) leads the
  stack now, with the old system-font names kept only as a fallback for
  the vanishingly rare case the webfont fails to load. See Lessons
  Learned: "terminal font fallback" for why a system-font stack alone
  wasn't reliable enough.
- **Size**: 14px desktop, drop to 12px under ~640-768px. Never smaller than
  12px, never larger than 14px — it's a readout, not a heading.
- **Weight/spacing**: `font-weight:700; letter-spacing:.02em;`.
- **Cursor**: a trailing `_` or block with
  `animation: copy-toast-blink 1s step-end infinite;` (keyframe already in
  `shared/site.css`) for anything simulating a live terminal line — skip it
  for static readouts like the engine-status card.
- **Chip background**: `rgba(0,0,0,.35)` translucent over whatever's behind
  it — does NOT flip for light/dark site theme (see the flip-rule section
  above for why this is the one deliberate exception).
- **Prompt convention**: prefix the line with `>` in its own
  `opacity:.7` span when it reads like a command result (e.g.
  `> copied #F44CCF`).

## Help banner (step-through intro): `bcSetupHelpBanner`

Every tool has a dismissible, step-numbered terminal-styled intro banner
("`<TOOL>_GUIDE: STEP 1/N`"). This is centralized shared logic, not a
copy-this-pattern convention — call `bcSetupHelpBanner(toolName, idPrefix,
steps)` from `shared/site.js`, passing an array of `[STEP_LABEL, body
text]` pairs. All 9 tools call it:
`bcSetupHelpBanner("codify", "cf", [...])`,
`bcSetupHelpBanner("context", "ct", [...])`, etc. — `toolName` is the
lowercase folder name, `idPrefix` is that tool's own element-ID prefix.
Dismissal (red dot) persists per-tool via `localStorage.setItem("bc-help-"
+ toolName + "-dismissed", "1")`, generated by the shared function from
`toolName` — don't hand-write this key.

## Pressed/toggle buttons: `.bc-toggle-btn`

For any Bold/Italic/Underline-style pressed-state button (or a plain toggle
like "Stroke"), use `.bc-toggle-btn` (`shared/site.css`) — 40px tall,
translucent-black, `[aria-pressed="true"]`/`.active` → white border +
darker fill. Add `.bc-toggle-btn-icon` for a 34px square icon-only variant
(single glyph like B/I/U). Wrap a row of them in `.bc-toggle-btn-group`
(`display:flex; gap:6px`). No shared JS for this one — the actual toggle
action (`btn.classList.toggle(...)`, what it restyles) is different enough
per use that a one-liner in the tool's own file is simpler than forcing an
abstraction. Current adopters: Context (originated it) and Congify only.

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
the inline-svg technique; static markup tends to use `::before`). No
shared JS — like the toggle button, the drag math differs enough per use
(frame resize vs. text-box resize) that sharing only the visual is the
right altitude. Current adopters (canvas/frame-level only — see below):
Context (originated it), Congify, Codify, Colorfy. Not used by Convert,
Compress, Coudio, Cleanly, or Combine — none of those have a
drag-resizable frame/canvas, so that's a legitimate absence.

**This is the canvas/frame-level handle only** (resizing the loaded file's
own preview — Convert/Compress/Congify/Codify/Colorfy's own preview-size
sliders). An in-canvas *object* (a text box, caption, or signature placed
on top of the canvas) uses a separate family instead — see
`.bc-obj-resize-handle` below — even though the visual recipe looks close;
don't reach for `.bc-resize-handle` for a new object-level control.

## In-canvas object controls: `.bc-obj-remove-btn` / `.bc-obj-resize-handle` / `.bc-obj-drag-handle`

For a text box, caption, or signature placed ON a tool's canvas (not the
canvas/frame itself), use this family (`shared/site.css`) rather than
`.bc-remove-btn`/`.bc-resize-handle` above, which are reserved for the
canvas/frame's own controls:

- **`.bc-obj-remove-btn`** — 25×25px red circle, white 2px border,
  `#e11d48` fill, centered "×".
- **`.bc-obj-resize-handle`** — 25×25px blue (`#2563eb`) circle, white 2px
  border; icon sized via `.bc-obj-resize-handle svg` (16×16) or a local
  `::before` background-image, same either-technique rule as
  `.bc-resize-handle`.
- **`.bc-obj-drag-handle`** — 25×25px yellow (`var(--context-yellow)`)
  circle, white 2px border, `cursor:move`; icon via
  `.bc-obj-drag-handle svg` (16×16).

All three cover only size/shape/color/border — position offsets
(`top`/`right`/`bottom`/`left`) and any per-tool z-index stay local on the
tool's own class alongside it (e.g. `class="context-text-remove
bc-obj-remove-btn"`, `class="gif-caption-drag-handle bc-obj-drag-handle"`).
Set dynamically via JS in both current adopters — Context
(`context-tool.js`) and Congify (`congify-tool.js`), applied when a text
box/caption is created, not present as static markup. Use these (not
`.bc-remove-btn`/`.bc-resize-handle`) for any future in-canvas object
control.

## Drag & drop: `bcSetupBannerDropTarget`

Reuse `bcSetupBannerDropTarget(toolApp, opts)` from `shared/site.js`
(`isInScope`, optional `getEnterTarget`/`clearTargets`, `onDrop`) for any
tool that accepts a dropped file onto its banner — don't hand-roll
dragenter/dragleave/drop listeners per tool; the shared helper already
handles nested-child dragenter/dragleave depth-counting correctly. Called
by 8 of 9 tools (Convert, Compress, Combine, Cleanly, Context, Colorfy,
Congify, Coudio). Codify doesn't call it — its only file input is a
background-image picker, not a drop-target-on-banner pattern, since its
primary input is typed code rather than a dropped file. That's a
legitimate absence, not a gap.

## Capping concurrent heavy work: `runWithConcurrencyLimit`

Any per-file operation that's genuinely expensive (a canvas encode, a WASM
decode) needs a concurrency cap once a tool lets someone load an unbounded
number of files — firing all of them at once via a plain `forEach`/
`Promise.all` is fine for a handful of files but can bog down a lower-end
device once a batch gets into the double digits. **Compress's live
estimate recalculation** (`updateEstimateForEntry`, run once per loaded
file on initial load and again on every level-button change) is the
reference example: it used to fire every file's `compressImageFile` canvas
encode simultaneously via `previewEntries.forEach(updateEstimateForEntry)`,
with no cap at all. Fixed with a small local helper,
`runWithConcurrencyLimit(items, limit, worker)` (`compress-tool.js`) — `limit`
workers pull from a shared index until the list is exhausted — capped at
`ESTIMATE_CONCURRENCY = 5`. This only throttles the *calculation* pass;
the number of files someone can actually load and eventually compress is
unlimited either way, same as before — the cap only slows how many
estimates are being crunched at once, not what fits in the file list.
Each entry's own `token` field (already existed, for discarding stale
results when a level change interrupts an in-flight estimate) still works
unchanged under the cap. **A queued file that hasn't been picked up by one
of the 5 workers yet shows a `"Waiting..."` label** (`queueEstimates()`,
set on every entry before the pool starts, only overwritten once
`updateEstimateForEntry` actually dequeues that entry) — confirmed
directly (iPhone 13 mini testing) that the cap alone wasn't legible enough
on its own: without a distinct queued state, a large batch's still-pending
rows just sat there showing their plain original size with no visual
difference from an already-finished row, reading as stalled/broken rather
than "working through these." No shared JS module for this — same reasoning as
`.bc-resize-handle`/HEIC decode above: cheap enough to duplicate into
another tool's own `-tool.js` if a similar unbounded-batch performance
problem shows up there, rather than inventing a shared import for one
eight-line helper.

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
  growth short of the real intended max (see Colorfy's `frameWidthMax` fix,
  Lessons Learned).

## HEIC support: `loadHeic2any` / `decodeHeicFile`

No browser but Safari can decode HEIC/HEIF through `<img>`/`<canvas>`, and
none can *encode* it back out — there is no in-browser HEIC writer at all.
Every tool that accepts HEIC input works around both halves of that with
`heic2any` (`vendor/heic2any.min.js`, a ~1.3MB WASM HEVC decoder), loaded
on demand rather than as a static `<script>` tag since most visitors never
touch a HEIC file:

```js
let heic2anyLoadPromise = null;
function loadHeic2any(){
  if (window.heic2any) return Promise.resolve();
  if (!heic2anyLoadPromise){
    heic2anyLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/heic2any.min.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load the HEIC decoder."));
      document.head.appendChild(script);
    });
  }
  return heic2anyLoadPromise;
}
```

- **Detection**: `isHeicFile(f)` checks `f.type === "image/heic"` /
  `"image/heif"` **or** a `.hei[cf]` filename extension — every browser but
  Safari fails to report a MIME type for HEIC at all, so the extension
  check is required, not just a nice-to-have fallback the way it is for
  `.svg`.
- **Thumbnails skip the decode by default**: an `<img>` pointed straight
  at raw HEIC bytes just shows a broken image icon in every browser but
  Safari, and running the full WASM decode for every file in a batch is
  the slow part a visitor actually notices. Convert/Compress make it
  opt-in — a "Preview" button (`.result-heic-preview-btn`, local to each
  tool's own `<style>`) that decodes just that one file on click. Cleanly's
  file-row thumb is too small (56px) for that button treatment, so it
  reuses the same opt-in-decode idea at that size instead —
  `.exif-file-heic-preview` (`shared/site.css`, since it's namespaced
  under the already-shared `.exif-*` family) fills the thumb slot with a
  plain "HEIC" label button, replaced in place by a real `<img>` once
  clicked.
- **Decoding is cached per file** (`WeakMap`) so a preview click and the
  real convert/strip operation that follows don't pay for the same decode
  twice.
- **No shared JS module** — same reasoning as `.bc-resize-handle`/
  `.bc-toggle-btn` above: each adopter (Convert, Compress, Cleanly) keeps
  its own copy of `loadHeic2any`/`decodeHeicFile`, byte-for-byte identical,
  because there's no shared state to actually centralize (no DOM registry,
  no cross-tool event wiring) — just a loader and a cache, cheap enough to
  duplicate and simpler than inventing an import for it.
- **Cleanly can't read a HEIC file's real metadata before stripping** —
  `exif.js` (`vendor/exif.js`) only understands JPEG/TIFF's APP1 segment,
  not HEIC's ISOBMFF metadata box, so there's no accurate "found tags"
  list the way there is for JPEG/PNG. Rather than wrongly claim
  `.exif-status-icon-clean` ("No dangerous metadata found") for a file that
  almost certainly has some (HEIC is the iPhone default, GPS/camera/
  timestamp and all), it always shows the warning state with a fixed
  disclaimer tag (`HEIC metadata found!`). Stripping still genuinely works
  despite the unscanned claim — decoding through `heic2any` to PNG
  produces a brand-new file with none of the original's metadata attached,
  scanned or not. Every found-metadata tag (`summarizeTags`/
  `heicFindings`/`readSvgFindings` in `cleanly-tool.js`) follows the same
  `"<Category> metadata found!"` template (`"GPS metadata found!"`,
  `"Camera metadata found!"`, `"Date metadata found!"`, `"Software
  metadata found!"`, `"Embedded metadata found!"`, etc.) rather than
  interpolating the tag's actual value into the label — no emoji either,
  plain text only. The leading tag in a warn row still gets the ⚠ status
  glyph prefixed in front of this text by `renderList()` (e.g.
  `"⚠ - Camera metadata found!"`), not baked into the string itself.
- **Output can't stay HEIC**: since there's no in-browser HEIC encoder,
  Convert's HEIC→JPEG/PNG targets use `heic2any`'s direct encode as a fast
  path (skips an extra decode→canvas→encode round trip through
  `decodeHeicFile`'s cached PNG). Cleanly's strip output picks between the
  two instead of hardcoding one — a per-row PNG/JPG `.bc-segmented-toggle`
  only renders for HEIC rows (`isHeicFile(item.file)` in `renderList()`),
  since every other input format keeps its own original format untouched
  and has nothing to choose. Defaults to PNG (`item.heicFormat`, set in
  `addFiles()`), disables once the row's been cleaned (the choice can't
  retroactively change an already-baked `item.strippedBlob`). Unlike the
  per-row action buttons, the format choice still needs making regardless
  of which button ends up doing the actual cleaning — so it's rendered
  **twice**, not once: `.ex-heic-format-toggle-desktop` sits inside
  `.exif-file-actions`, right next to "Clean first"; `.ex-heic-format-
  toggle-mobile` sits in the info column instead. Only one is ever visible
  — the desktop copy disappears below `768px` for free since its parent
  `.exif-file-actions` is hidden outright there (see point 5 above), while
  the mobile copy needs its own explicit `@media (min-width:769px){
  display:none }` (`cleanly/index.html`) since it isn't inside anything
  already hidden. Both stay in sync purely because `renderList()` rebuilds
  every row's markup from `item.heicFormat` on every change — there's no
  separate state to keep the two copies aligned, and `el.querySelectorAll
  (".ex-heic-format-toggle")` wires click handlers onto both identically.
  `stripHeic(file, format)` picks `heic2any`'s `toType` accordingly, and
  the download filename swaps the `.hei[cf]` extension to `.png`/`.jpg` to
  match rather than shipping the wrong bytes under a mismatched extension.

  **A real race condition found and fixed here on audit**: `item.cleaning`
  (set by `stripEntry()`/`mobileDownloadAll()` for the duration of
  `cleanFile()`) now also disables the toggle, on top of `item.stripped` —
  without it, a visitor could flip PNG→JPG mid-decode, after `stripHeic()`
  had already started encoding to the *old* format, and end up with a
  downloaded file whose extension doesn't match its actual bytes.
  `cleanFile()` also defends against this at the data level regardless of
  whether that UI lock ever has a gap: it captures `item.heicFormat` into
  a local `const` once, before its own `await`, and uses that captured
  value for both the encode and the output filename — reading
  `item.heicFormat` fresh a second time after the `await` would still be
  wrong, since the bytes `stripHeic()` actually produced are fixed by
  whatever format was current when the encode *started*, not whatever the
  toggle says by the time a (possibly slow) decode finishes.

## Branching: `main` vs `development` vs `dev-<project>`

`development` is the default day-to-day branch — nearly everything happens
there. `main` is what actually deploys (GitHub Pages), and by 2026-09-17 had
drifted ~150 commits behind `development`, missing entire tools (Codify,
Colorfy weren't on it at all) — untangling that gap after the fact, to ship
one `development` bugfix to `main`, was real, avoidable work.

**For anything meant to ship to `main` as a discrete unit** (a new tool
launch, a redesign, a multi-file sync like the 2026-09-17 chrome sync) —
branch as `dev-<project-name>` off **`main`**, not off `development` (branching
off `development` drags in everything else already ahead of `main`). Build
and test it there, merge to `main` and push only when it's ready, then
delete the branch. A single-file, single-fix bugfix (like the encrypted-PDF
Context fix) is low-risk enough to apply on `main` directly without a
branch — reserve `dev-<project-name>` for anything touching more than a
couple of files.

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
tool markup, that all load the same `convert/convert-tool.js`. The version
number is genuinely meaningless as a sync signal once files fork like
this (see Lessons Learned: "SEO route sibling drift") — only the *content*
matched-or-not matters, and content only gets found stale by actually
checking. Before any `-tool.js` edit, `ls -d <tool>/*/` for siblings, and
if a markup change (not just a JS/CSS tweak) is involved, verify the sibling
files' markup actually contains what the new JS now expects — grep for the
element IDs/classes the change depends on, don't assume a shared `?v=`
bump alone makes them current.

**`@import`ed files (`shared/icons.css`, `shared/textures.css`) need their
own `?v=N` on the `@import url(...)` line itself, not just on
`shared/site.css`'s own `<link>`.** A browser caches each sub-resource an
`@import` pulls in by *its own* URL, independent of the parent
stylesheet's — bumping `shared/site.css?v=N` forces a fresh fetch of
`site.css` itself, but if the `@import url("icons.css")` line inside it
has no version param, a page that already had `icons.css` cached from an
earlier visit keeps rendering the old icon set even after `site.css`'s
version changes (see Lessons Learned: "`@import` cache independence").
`shared/site.css`'s two `@import` lines (`icons.css?v=N`,
`textures.css?v=N`) and `index.html`'s own separate `<link>` to each need
to move in lockstep — bump both any time either imported file's content
changes, the same way the `<script src>`/`<link>` rule above already
requires for everything else.

## Before shipping a new tool page, check it has:

1. Its brand color assigned from the shared palette above (or a genuinely
   new hue, updated in this doc).
2. `data-category` set correctly if it'll get a homepage card texture.
3. The standard help banner, via `bcSetupHelpBanner`.
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

## Appendix: provenance — which tool originated which shared component

Useful when deciding which tool to read as the reference implementation of
something, or when two tools disagree and you need to know which one came
first:

- **Context**: `.bc-toggle-btn`, `.bc-resize-handle`
  (`.context-text-resize-handle`), the `.bc-obj-*` family jointly with
  Congify, the always-dark-surface override pattern
  (`.context-fullscreen-overlay .context-tool-btn`).
- **Congify**: joint origin of the `.bc-obj-*` family with Context; the
  reference example for the combo-vs-dropdown color-swatch exception.
- **Codify**: `.bc-editor-input`; joint reference (with Colorfy) for the
  auto-fit resizable-frame conventions.
- **Cleanly** and **Combine**: independently, byte-identically originated
  `.bc-file-remove-btn` ("the beta remove btn" — `.exif-file-remove` /
  `.combine-file-remove`); later also adopted by Colorfy's saved-color
  chip and by Convert/Compress/Coudio's per-file remove (moved off
  `.result-remove` for this specific use — see Lessons Learned:
  "beta remove btn adoption"). Cleanly later also adopted Coudio's own
  per-row `.tool-primary-btn` variant (`.ex-row-strip-btn`, mirroring
  `.cd-row-convert-btn`) once its Strip action moved from one global CTA
  to one independent button per file (see `.tool-primary-btn` above).
- **Coudio**: originated the per-row `.tool-primary-btn` variant pattern
  (`.cd-row-convert-btn`) for tools with N independent per-item actions
  instead of one global CTA — see `.tool-primary-btn` above; later
  adopted by Cleanly.
- **Colorfy**: joint reference (with Codify) for resizable-frame
  conventions (`frameWidthMax` measurement fix).
- **Convert**: original example of the on-banner flip recipe via
  `.tool-primary-btn`; the "zero undocumented overrides" clean baseline
  (see Reference tools above); joint reference (with Compress) for
  `.bc-segmented-toggle`'s promotion to a shared component, via the
  Single-files/`.zip` download-mode toggle; originated the
  `loadHeic2any`/`decodeHeicFile` HEIC decode pattern (see its own section
  above), later duplicated byte-for-byte into Compress and Cleanly.

## Appendix: lessons learned / rejected approaches

The reasoning behind rules above that would otherwise look arbitrary.
Referenced by name from the relevant component section — read the specific
entry you were pointed at rather than this whole appendix top to bottom.

**icons.css dedup**: Tool icons used to be two hand-duplicated copies of
the exact same block — one in `shared/site.css`, one pasted into
`index.html`'s inline styles — kept in sync by remembering to edit both
every time an icon changed. That's the same class of bug as `.result`'s
dark-navy default below; the fix is the same one used there — one real
source, everything else points at it.

**dropdown dedup**: `.bc-combo`/`.bc-dropdown` used to be three-to-four
independently hand-rolled near-duplicates (Congify's original
`.gif-dropdown`, Coudio's `.cd-dropdown`, Colorfy's
`.colorfy-format-dropdown`, Codify's own private copy of the combo logic)
— all now point at the one shared implementation of each.

**on-banner flip reversal**: Banner controls used to stay a fixed black
tint always (on the reasoning that the banner is vivid/saturated enough
for black-on-color to read fine regardless of site theme), with
`.tool-primary-btn` documented as "the one deliberate exception." That
split broke down in practice — reported as on-banner buttons looking
"stuck in dark mode" once light theme existed — for two independent
reasons:
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
tool/component that got reported.

**active-state contrast**: `.tool-format-btn.active` (Compress's
Low/Medium/High picker) flipped correctly but still nearly vanished in
light theme at the same `.35`/`.5` opacity the plain flip formula uses —
an *active* indicator has to read as clearly filled against its unselected
siblings, and translucent white blended into an already-light banner
doesn't clear that bar the way it does against a deep one.

**`.result`'s dark-navy bug**: This card's default used to be a
near-invisible `rgba(...,.03)` (with tools like Convert/Compress each
building their own bolder per-tool override just to compensate, and
Cleanly/Combine's own file-item classes separately shipping a
`rgba(29,36,54,...)` light value that read as barely distinct from the
dark-theme value). `.result-name`'s text color used to be hardcoded `#fff`
too, silently wrong in light theme even after the card itself was fixed —
the card and its text are separate rules that both need the flip
independently.

**editor hover bug**: Codify's editor had grown its own hardcoded-dark
`:hover` rule that didn't flip with site theme (reported directly: "the
light theme toggle... is changing color when mouse hover") — rather than
just patching that one rule, `.bc-editor-input` now owns every
theme-dependent piece of an editor surface so a second editor never has to
re-derive them from scratch.

**homepage hover flicker**: Read More used to have its own separate scale
reaction on hover (with `.card:hover` excluded via
`:not(:has(.card-readmore:hover))` so the two wouldn't stack), but that
combination caused a real hover-flicker bug: the card's own transform
shifting where Read More's hit-box sits could flip its `:hover` state
on/off mid-transition, right at the boundary between the two elements.
**Lesson: don't give both a parent and a child their own competing
`:hover`-triggered `transform` — one of them moving is enough to desync
the other's hit-test.** If Read More ever needs its own visual reaction
again, keep it non-transform (e.g. a border/glow change) or drive both
states from one shared trigger (JS-toggled class) instead of two
independent `:hover` rules. Also explored and explicitly rejected for the
card itself: rotate/wobble (reads as "jumping," not "growing"); Read More
tilting via `perspective()+rotateX()`; Read More popping past the card's
bottom edge (required removing the card's `overflow:hidden`, which is
what gives Read More its rounded corners for free at rest — technically
doable but not worth the fragility for a hover flourish).

**SEO route sibling drift**: Convert's 16 static SEO route files
(`convert/jpg-to-png/index.html` etc.) were found stuck 8 versions behind
(`?v=4` while the real file was on `?v=12`) during a dropdown migration —
silently broken (JS threw on load, since the markup migration hadn't
reached them) despite never having been touched by whatever edit caused
the drift.

**`@import` cache independence**: A newly-added `--icon-coudio`/
`.icon-coudio` rule rendered fine on a fresh page load but not on a tab
that had loaded an older `icons.css` earlier in the same session — because
an `@import`ed file is cached by its own URL, independent of the parent
stylesheet that imports it.

**Colorfy's `frameWidthMax` fix**: When measuring a resizable frame's max
width, measuring against an element that itself auto-sizes to the thing
being measured creates a self-referential trap that caps growth short of
the real intended max — fixed by measuring against a stable ancestor
(`.tool-app`) instead.

**Codoc scoped to DOC→PDF only — PDF→DOC rejected, not deferred**: Codoc
(`codoc/`, the first "special"-category tool) converts DOC/DOCX→PDF via
`mammoth.browser.min.js` (parse to HTML) + `html2canvas` + `jspdf.umd.min.js`
(paginate to A4), all self-hosted in `/vendor/`, fully client-side like
every other tool. The reverse direction, PDF→DOC, was explicitly considered
and rejected rather than left as a "later" TODO:

- PDF has no structural concept of paragraph/table/column — only
  positioned glyphs. A client-side reconstruction (`pdf.js` text-position
  extraction + gap heuristics + the `docx` npm package to write real
  OOXML) is possible, but produces a document that only *looks* editable —
  tables, multi-column layouts, and font/style fidelity all degrade badly,
  on exactly the documents people most want converted.
- The only way to genuinely close that quality gap is server-side (headless
  LibreOffice or a commercial API like Adobe PDF Services) — real layout
  inference and OCR, not geometry guessing. That means the file leaves the
  user's device, which breaks the one guarantee every other tool's privacy
  badge advertises (nothing uploads, nothing leaves the browser) — a
  brand/trust decision, not just an engineering one, and not worth making
  quietly for one tool's missing half-feature.
- A "best effort" middle ground (ship the client-side reconstruction with a
  visible quality caveat) was also rejected: it would undersell the site's
  usual "just works" reliability rather than reinforce it.

If PDF→DOC is ever revisited, it needs an explicit decision to make Codoc
(or a new tool) the deliberate exception to the local-only model, not a
bolt-on to the existing client-side pipeline.

**Terminal font fallback**: a user reported Colorfy's copy-confirmation
chip (`.colorfy-copy-terminal`) rendering in a rounded sans-serif instead
of a monospace "terminal" look, on some unidentified device/browser.
Every check on a normal desktop Chrome came back clean — computed
`font-family` on both the chip and its text span correctly resolved to
`"Courier New", Courier, monospace`, matching every other terminal-styled
element site-wide, and a forced-visible screenshot rendered it correctly.
Since it couldn't be reproduced, the fix was defensive rather than
diagnostic: widened the shared font stack (site-wide, not just Colorfy) to
`"Courier New", Courier, "Liberation Mono", "DejaVu Sans Mono", Consolas,
Menlo, monospace` — more real, named monospace fonts before the bare
`monospace` generic keyword, in case whatever platform the user was on
doesn't carry "Courier New"/"Courier" and its own generic-monospace
default isn't a true fixed-width font. Left the canvas-drawn "certificate"
easter egg's own `ctx.font` strings (index.html, the asteroid-catch
easter egg) alone — a separate, self-contained decorative feature, not
part of this shared component.

The widened system-font stack alone turned out not to be enough — the
user reported the exact same rounded-sans rendering afterward. Escalated
to self-hosting an actual webfont instead of guessing at more system-font
names: **Space Mono** (Google Fonts, latin subset, regular + bold woff2
only — this motif never renders non-latin text), vendored at
`vendor/fonts/space-mono-{regular,bold}.woff2`, declared via `@font-face`
in `shared/site.css` and placed first in the stack, old names kept after
it as a last-resort fallback. This removes the font-availability
guesswork entirely for the shared Terminal text motif generally (the same
font file now ships to every visitor regardless of what's installed
locally) — genuinely worth keeping.

But the user's screenshot after that fix *still* showed the same rounded,
un-monospaced rendering, unchanged — proving the font stack was never
actually the bug for this specific element. The real issue: Colorfy's
copy/save confirmations were split across two different, inconsistent
UI treatments — `copyCode`/`saveToPalette` already used the plain
`.tool-status` line, but `copySwatch` (the saved-colors palette swatch)
still used its own separate component, a floating dark chip with green
text (`.colorfy-copy-terminal`) sitting on top of the banner. The user's
screenshots were always of *that* component, and no amount of font-stack
fixing could make it look like the plain status line because it's a
different element with deliberately different styling (dark background,
green color) by original design. Fixed by retiring
`.colorfy-copy-terminal` entirely (markup, CSS, and its dedicated JS
show/hide logic) and routing all three confirmations (`copyCode`,
`saveToPalette`, `copySwatch`) through one shared `flashStatus()` helper
that just writes to `#cyStatus` — the same plain, themed, "> "-prefixed
readout every other tool's status line already uses. Confirmed against
the user's own reference screenshot afterward.

**Lesson**: when a visual bug report doesn't budge after a fix that
checks out correct in every direct test (computed styles, forced-visible
renders, live screenshots), stop re-testing the same fix harder and
check whether the report is actually about a *different element* than
the one being patched — chasing a font-rendering theory across two
escalations here was solving a real problem (the font stack was
genuinely worth hardening) that just wasn't *this* bug.

**Beta remove btn adoption (`.bc-file-remove-btn`) on Convert/Compress/
Coudio**: requested directly — reuse Cleanly's non-red file-remove button
("the beta remove btn") for Colorfy's saved-color chip, and connect
Convert/Compress/Coudio's own per-file remove "×" to the same shared
class. The first part (Colorfy) was a straightforward class swap
(`bc-remove-btn` → `bc-file-remove-btn`, keeping the tool's own 25×25px
local size override). The second part was a real, deliberate design
change, not just a rename: Convert/Compress/Coudio's per-file remove had
always been `.result-remove` — a *different* shared class, documented
above as the on-purpose exception that stays a fixed dark circle and
fades in only on hover, because it overlays a thumbnail image rather
than sitting on a card's own themed background. Switching to
`.bc-file-remove-btn` makes it always-visible and theme-flipping instead
of hover-reveal-and-fixed-dark. Went ahead with it since it was asked
for directly and by name across all three tools, but flagging the
tradeoff here since it reverses that earlier documented reasoning:
Convert/Compress's remove button no longer stays out of the way until
hovered, and now visually competes with the thumbnail underneath it more
than before. `.result-remove` itself is untouched and still exists for
any future on-image-overlay use — only these three tools' specific
buttons moved to the new class, each keeping a local class
(`.cv-file-remove-btn` / `.cp-file-remove-btn` / `.cd-file-remove-btn`)
purely for the position override (`.bc-file-remove-btn` isn't
`position:absolute` by default, since Cleanly/Combine use it inline in a
flex row, not overlaid on a card).

**Remove-all button position standardization (`.bc-remove-btn`/
`.bc-canvas-back-btn`)**: requested directly — visually match Cleanly's
red "remove all" button position across Convert, Compress, Combine,
Coudio, and Codify. Before this, three genuinely different recipes were
in live use for the exact same visual result (top-right corner, next to
the tool logo):

1. **Cleanly/Combine** — `top:16px; right:16px`, a direct child of
   `.tool-app`, shown via `.tool-app:has(#xxAfterDrop:not([hidden]))`.
2. **Convert/Compress/Coudio** — nested *inside* their own revealed-
   content box (`#cvAfterDrop`/`#cpAfterDrop`/`#cdEditor`), pulled back
   up out of it with a large negative `top` (`-85px`, `-85px`, `-160px`
   respectively) plus `right:-25px` — each value hand-tuned per tool to
   compensate for that tool's own header height, since the box starts at
   a different distance from the top depending on what's above it.
3. **Codify** — already a direct child of `.tool-app` like #1, but at
   `top:36px; right:36px` (`12px`/`12px` on mobile), toggled via the
   `hidden` attribute directly rather than a `:has()` rule, with the
   privacy badge carrying its own `margin-right:70px` to avoid the two
   overlapping.

Recipe #2 wasn't a bug — each tool's own comment explained exactly why
the negative offset was there and wasn't a value that could be shared
verbatim — but it meant three tools each carried a bespoke, layout-
dependent pixel value for something that reads identically on screen
everywhere else. Converted all of them to recipe #1: moved the
button markup out of the nested box to sit as a direct sibling of
`.tool-header` (Convert/Compress/Coudio), added the matching
`.tool-app:has(...)` (or, for Coudio, `#page-coudio:has(...)`, matching
that page's existing `:has()` selector convention) reveal rule, and
landed every tool on the identical `16px`/`16px`/`52px` values. Codify
needed no markup move (already anchored correctly) — just the pixel
values changed, plus the privacy badge's margin trimmed from `70px` to
`50px` to match the smaller footprint. Verified live via
`getBoundingClientRect()` diffed against `.tool-app` on all five tools
post-change — all land at the identical `16`/`16` (Remove) and
implicit `52` (Back) offsets now. Convert's 16 SEO route siblings
weren't touched — same reasoning as the download-mode toggle above, they
keep their own pre-existing (still-working) copy of the old recipe.

**Colorfy** was a follow-up round of the same fix, requested separately:
its own remove/back buttons (`.colorfy-remove-btn`/`.colorfy-back-btn`)
were nested inside `.colorfy-frame` (the image-preview box itself, not
a revealed-content box like recipe #2 above) at `top:10px; right:10px`/
`right:46px` — a fourth, still-different recipe, since Colorfy's "loaded
content" IS the frame rather than a list/editor sitting below the
header. Same fix: moved the markup out of `.colorfy-frame` to sit as a
direct sibling of `.tool-header`, added
`.tool-app:has(#cyAfterDrop:not([hidden]))` reveal rules, landed on the
same `16px`/`16px`/`52px` values as everything else.
