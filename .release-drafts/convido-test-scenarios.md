# Convido — 100 test scenarios

Branch: `dev-Convido` (served at http://localhost:8001/convido/).
Written against `convido/convido-tool.js` and `convido/convido-muxers.js`.

**Output formats:** MP4, WebM, MOV, MKV (muxed by mediabunny) and AVI, FLV (re-encoded to H.264/AAC, then wrapped by `convido-muxers.js`).
**Input formats:** MP4, M4V, MOV, WebM, MKV, 3GP/3GPP/3G2, TS/MTS/M2TS, GIF. AVI, FLV, WMV, MPG and similar are refused on input.
**Rules the scenarios lean on:**
- A video is *re-packed* (fast, lossless) when its video and audio codecs fit the target format, and *re-encoded* otherwise (card shows an "i" note).
- Result name is `<base>.<ext>`, or `<base>-converted.<ext>` when the source already has that extension.
- Downloads: ≤5 files = separate downloads (300 ms apart), 6–20 = Single/ZIP toggle (default ZIP), >20 = ZIP only (`bcconvido-videos.zip`).
- Only the most recently converted entry keeps its result blob in memory; older ones are converted again on the next run.
- Session is saved for "Continue where you left off" only when the files total 300 MB or less.

Mark: **P**ass / **F**ail / **B**locked. "Risk" = I expect this to expose a bug or a gap.

## A. Adding files (1–14)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| CV-001 | Add one MP4 by clicking the drop area | Click banner, pick an H.264 MP4 | Card appears with thumbnail, name, "Orig. size: N"; format-in dropdown auto-selects MP4; convert button still disabled until an output format is chosen |
| CV-002 | Add one file by drag and drop | Drag a MOV onto the banner | Banner highlights while dragging, card appears on drop, input auto-selects MOV |
| CV-003 | Add a file with the (A) keyboard shortcut | Press A, pick a file | File picker opens; file loads as in CV-001 |
| CV-004 | Add several files in one pick | Select 3 mixed MP4/WebM/MOV files | 3 cards, status "3 files loaded", each probes and shows size |
| CV-005 | Add more files after the first batch | Add 1 file, then use the add tile to add 2 more | List grows to 3; first file's result/state untouched |
| CV-006 | Uppercase extension | Add `CLIP.MP4` | Accepted; input auto-detects MP4 |
| CV-007 | File with no extension but video MIME type | Add a video renamed `clip` | Accepted by MIME; input detected from type (MP4/MOV/WebM/MKV) or left unselected if unknown |
| CV-008 | Name with spaces, unicode and emoji | Add `Ferien 🌴 škola.mp4` | Name shows correctly on card; converted file keeps it |
| CV-009 | Very long file name (150+ chars) | Add a video with a very long name | Card name truncates with ellipsis, no layout break; download name keeps full name |
| CV-010 | Non-video file only | Add a `.txt` | Status: "Convido only works with video files — none of the selected file(s) qualify."; no card |
| CV-011 | Mixed valid and non-video files | Add 2 MP4s + 1 PDF | 2 cards; status mentions "1 file(s) weren't a video and were skipped." |
| CV-012 | Refused input formats | Add `a.avi`, `b.flv`, `c.wmv`, `d.mpg` | Status: "N file(s) are in a format Convido can't read (AVI, FLV, WMV, MPG and similar) and were skipped."; no cards |
| CV-013 | Refused + valid mixed | Add 1 AVI + 2 MP4 | 2 cards; AVI counted in the "can't read" sentence |
| CV-014 | Add 25 files at once | Add 25 small videos | All cards appear; probing runs 5 at a time ("Waiting…" on queued ones); no freeze |

## B. Probing and unreadable files (15–24)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| CV-015 | Corrupted MP4 | Add an MP4 with its tail cut off | Card turns red with tooltip "Couldn't read…"; status "Couldn't read <name>. Make sure it's a valid video file." |
| CV-016 | Text file renamed to `.mp4` | Rename notes.txt to notes.mp4, add it | Treated as unreadable (no video track / undecodable), friendly message, no crash |
| CV-017 | Audio-only file renamed `.mov` | Add an audio file as `.mov` | Card error ("no video track"); no raw library message shown |
| CV-018 | Zero-byte file | Add an empty `.mp4` | Card error, status message, tool stays usable |
| CV-019 | Several unreadable files | Add 3 broken videos | Status: "Couldn't read 3 files — they may be corrupted or not a supported video format." |
| CV-020 | One broken among good | Add 2 good + 1 broken | Good ones probe fine; only the broken card is red; convert button enabled |
| CV-021 | Codec the browser can't decode | Add a ProRes `.mov` or HEVC on a browser without HEVC decode | Card error ("undecodable"), others unaffected |
| CV-022 | Probe finishes after the user already picked formats | Add a big file, pick output while "Waiting…" shows | Format choice kept; re-encode note appears once probe completes |
| CV-023 | Remove a file while it is still probing | Add 5 files, remove one mid-probe | Card disappears, no errors in console, others finish |
| CV-024 | Portrait phone video | Add a rotated iPhone clip | Thumbnail upright; dimensions probed correctly; converted video plays upright |

## C. Choosing formats (25–36)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| CV-025 | Output list contents | Open the output dropdown | AVI, FLV, MKV, MOV, MP4, WebM listed; none preselected ("Choose a format") |
| CV-026 | Input list is searchable | Open the input combo, type "mt" | Filters to MTS/M2TS; selecting one sets it; "No matches" shown for gibberish |
| CV-027 | Pick output before adding files | Pick WebM first, then add a file | Controls only appear after a file is added; WebM stays selected |
| CV-028 | Same format in and out | Add MP4, then choose MP4 as output | Input switches to the previously chosen input (or empties); the two never match |
| CV-029 | Change input to equal the output | Output = MKV, set input = MKV | Output reverts to the previous output value |
| CV-030 | Auto-detect only when empty | Choose input GIF manually, then add an MP4 | Input stays GIF; no override |
| CV-031 | Detect by extension first | Add `clip.mov` whose MIME says `video/mp4` | Input = MOV (extension wins) |
| CV-032 | Convert button enablement | Add file → button disabled; pick output → enabled | Disabled until at least one probed file and an output exist |
| CV-033 | Button label on desktop / phone | View at 1000px and 400px | "Convert and download" on desktop, "Download" on phone |
| CV-034 | Info tooltip next to input dropdown | Click the "i" by the input format | Tooltip opens, closes on outside click and on Esc |
| CV-035 | Switch output format twice | Pick MP4 then MKV | Re-encode notes update each time without re-probing |
| CV-036 | Dropdowns close each other | Open input combo, then open output dropdown | Only one menu open at a time |

## D. Conversions: repack vs re-encode (37–56)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| CV-037 | H.264/AAC MP4 → MKV | Convert | No "i" note; nearly instant; plays; sound and picture intact |
| CV-038 | H.264/AAC MP4 → MOV | Convert | Repacked, plays in QuickTime/VLC |
| CV-039 | H.264/AAC MP4 → WebM | Convert | Re-encode note appears (WebM needs VP8/VP9/Opus); output plays in Chrome |
| CV-040 | H.264/AAC MP4 → AVI | Convert | Plays in VLC with audio in sync; file starts with RIFF/AVI |
| CV-041 | H.264/AAC MP4 → FLV | Convert | Plays in VLC; header starts with "FLV"; duration metadata present |
| CV-042 | MP4 → MP4 | Pick MP4 for an MP4 source | Allowed after swapping logic (CV-028) or source/target differ by container; if converted, name ends `-converted.mp4` |
| CV-043 | WebM (VP9/Opus) → MP4 | Convert | Re-encode note; result plays everywhere (H.264/AAC) |
| CV-044 | WebM → MKV | Convert | Repacked, no re-encode note |
| CV-045 | MOV (HEVC/AAC) → MP4 | Convert | Repacked if HEVC allowed in MP4; otherwise re-encode note; plays |
| CV-046 | MKV → MP4 | Convert | Works for H.264/AAC MKV; result plays |
| CV-047 | 3GP → MP4 | Convert a phone 3GP | Works or friendly error; never hangs |
| CV-048 | TS / M2TS → MP4 | Convert a TS capture | Works or friendly "undecodable" card |
| CV-049 | Video with no audio track | Convert any format | No audio-related error; output has no audio |
| CV-050 | Video with multiple audio tracks | Convert | Primary track is kept; no crash |
| CV-051 | High frame rate (60 fps) | Convert MP4 → WebM | Frame rate preserved; size sane |
| CV-052 | 4K video | Convert MP4 → MKV (repack) and → WebM (re-encode) | Repack fast; re-encode slower but finishes or fails with a friendly message |
| CV-053 | Odd dimensions (e.g. 1081×1921) | Convert to MP4/AVI | Succeeds or gives a friendly message; no broken output |
| CV-054 | Variable frame rate screen recording | Convert MOV → MP4 | Audio stays in sync |
| CV-055 | Video with B-frames → AVI / FLV | Convert | No jitter or out-of-order frames (checks `decodeOrderTimes`) |
| CV-056 | Long video (30+ min) → MKV | Convert | Progress status stays "Converting <name>…", finishes, memory stays sane |

## E. GIF input (57–66)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| CV-057 | Animated GIF → MP4 | Add a GIF, output MP4 | Card shows the GIF image; result plays at the GIF's frame timing |
| CV-058 | Animated GIF → WebM | Convert | Uses VP9; result plays |
| CV-059 | GIF → MOV and MKV | Convert each | Both play; no "re-encode" note shown for GIF |
| CV-060 | GIF → AVI and FLV | Convert each | Encoded as H.264 then wrapped; plays in VLC |
| CV-061 | GIF with transparency | Convert | Transparent areas become white, not black |
| CV-062 | GIF with an odd width/height | Convert to MP4 | Padded by 1px; no encoder error |
| CV-063 | Single-frame (static) GIF | Convert | Produces a short valid video, not an error |
| CV-064 | Huge GIF (e.g. 4000×4000) | Convert | Friendly "too large to encode" style error on the card; tool stays usable |
| CV-065 | GIF with zero/tiny frame delays | Convert | Falls back to 0.1 s per frame instead of a zero-length video |
| CV-066 | Browser without `ImageDecoder` | Open in a browser lacking it (older Safari/Firefox), add a GIF | Card shows the unreadable state with a friendly message; non-GIF videos still work |

## F. Several files and downloads (67–80)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| CV-067 | Two files, separate downloads | Convert 2 files | Two downloads, ~300 ms apart; status "Done — 2 videos converted." |
| CV-068 | Five files | Convert 5 | 5 separate downloads; no Single/ZIP toggle choice (only "Single files") |
| CV-069 | Six files | Convert 6 | Toggle shows both choices, ZIP selected by default; one `bcconvido-videos.zip` |
| CV-070 | Six files, switch to "Single files" | Toggle, convert | 6 separate downloads |
| CV-071 | Twenty files | Convert 20 | Toggle still offers both |
| CV-072 | Twenty-one files | Convert 21 | Only ZIP offered and used |
| CV-073 | ZIP contents | Open the ZIP from CV-069 | Every converted file present, correct names and playable |
| CV-074 | Two files with the same name | Add two `clip.mp4` from different folders, convert (ZIP mode) | **Risk:** `zip.file` overwrites the first; expected result is both present as `clip.mp4` and `clip (2).mp4` (Convert handles this, Convido doesn't) |
| CV-075 | Re-download without changing anything | Press convert twice with the same format | Second run reuses the stored result (instant) for the latest file; earlier files are converted again (their blobs were released) |
| CV-076 | Change output format and convert again | MP4 → MKV, then → WebM | Each format converts fresh; file sizes update on the cards |
| CV-077 | Card size line after conversion | Convert one file | Card shows "Orig. size: X" then "> Y" for the new size |
| CV-078 | One file fails in a batch | Mix 3 good + 1 that fails to convert | Status "Done — 3 converted, 1 couldn't be converted."; red card with error tooltip |
| CV-079 | All files fail | Convert only files that cannot be converted | Status "Couldn't convert N files. Try another format." |
| CV-080 | Privacy badge | Convert any file | Network check runs during conversion and the badge reports nothing left the device |

## G. Cancel, remove and reset (81–90)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| CV-081 | Button becomes Cancel while working | Start converting a big file | Button reads "Cancel" and stays clickable |
| CV-082 | Cancel mid-conversion | Click Cancel | Conversion stops, status "Canceled.", no download, button returns to idle label |
| CV-083 | Cancel a GIF encode | Start a large GIF, cancel | Encode stops cleanly, no leftover output |
| CV-084 | Cancel a batch | Convert 4 files, cancel on the 2nd | 1st already downloaded; 2nd–4th skipped; no ZIP built |
| CV-085 | Remove the file being converted | Click × on its card mid-run | Conversion cancelled for that file; the queue continues with the next one |
| CV-086 | Remove a finished file's card | Click × after conversion | Card gone, count in status drops |
| CV-087 | Remove the last file | Remove the only card | Tool resets to the empty drop screen; format selections cleared |
| CV-088 | Red × resets everything | Click the banner's remove button with files loaded | Resets as in CV-087; saved session cleared |
| CV-089 | Close/refresh during conversion | Refresh the tab mid-run | No partial download; "Continue where you left off" offered afterwards if the files are small enough |
| CV-090 | Add files while a conversion runs | Add 2 files mid-run | New cards appear; they are not picked up until the next run (or handled without breaking the current one) |

## H. Saved session, shortcuts and layout (91–100)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| CV-091 | Continue where you left off | Add files, pick formats, reload | Button appears; clicking restores files, input and output formats |
| CV-092 | Session over 300 MB | Add files totalling >300 MB, reload | Nothing saved; no Continue button |
| CV-093 | Continue disappears for a new project | Start a new project instead of continuing | "Continue" button hides |
| CV-094 | Keyboard: D converts | Press D with files + format ready | Starts conversion; ignored while typing in the search box |
| CV-095 | Help banner | Step through, close with the red dot, reload | Banner steps read correctly (mentions the formats supported); stays closed after reload |
| CV-096 | Dark and light themes | Switch theme with cards, errors and the info tooltip visible | Everything readable; error card, tooltip and buttons follow the flip recipe |
| CV-097 | Phone layout (400px) | Load at phone width with 3 files | No horizontal scroll; thumbnails and buttons sized for touch; "Download" label |
| CV-098 | Info tooltip behaviour | Open the "i" on a re-encode card, scroll | Tooltip positions inside the viewport and closes on scroll |
| CV-099 | Translated pages | Open `/nl/convido/`, `/cs/convido/`, `/ja/convido/` and run one conversion | Labels, statuses and errors are in the language (or fall back to English) with no broken markup |
| CV-100 | Double-click wobble and drop-zone feel | Double-click the empty banner, drag a file over it and away | Banner wobbles once; drag highlight clears when the file leaves; no stuck state |

## Quick run order (about 30 minutes)

1. CV-001, 004, 010–013 (loading and refusals)
2. CV-037, 039, 040, 041, 043 (the four main repack/re-encode paths + AVI/FLV)
3. CV-057, 058, 061, 064 (GIF)
4. CV-067, 069, 072, 074 (downloads and the duplicate-name risk)
5. CV-081–085 (cancel and remove)
6. CV-091, 097, 099 (session, phone, translations)

## Likely trouble spots (check these first)

- **CV-074** duplicate file names in a ZIP: Convido has no unique-name step.
- **CV-075 / CV-090** result caching and adding files during a run: only the latest result blob is kept.
- **CV-056 / CV-052** very long or 4K re-encodes: whole result is held in memory (`BufferTarget`).
- **CV-045 / CV-021** HEVC and ProRes depend on what the browser can decode.
- **CV-066** `ImageDecoder` support differs between browsers.

---

# Results: quick run, 2026-11-02 (dev-Convido, Chrome on macOS)

Test files were generated in the page (H.264 and VP9 videos, GIFs) and the real Convido controls were driven. The quick run order has 27 scenarios, plus 3 extra checks I added along the way (CV-069b, CV-069c, CV-071).

| Result | Scenarios |
|---|---|
| **Pass (20 of 27)** | CV-001, 004, 010, 011, 012, 013 · 037, 039, 040*, 041* · 057, 058, 061, 064 · 067, 069 (fresh page), 072 · 081 · 091 · 097 |
| **Fail (2 of 27)** | CV-043 (my expectation, see finding 3), CV-074 (same-name files) |
| **Blocked (4 of 27)** | CV-082, 083, 084, 085 (Chrome's video encoder stalled during the run, see below) |
| **Not applicable (1 of 27)** | CV-099 (no translated Convido pages yet, `/nl/convido/` returns 404 by design) |
| **Extra checks** | CV-071 pass · CV-069b fail · CV-069c fail (ZIP default lost, finding 2) |

\* AVI and FLV were checked structurally (RIFF/AVI header with index and 60 video frames; FLV header, metadata, 61 video tags, tags end exactly at end of file). I could not play them in VLC.

## Findings

1. **CV-074 (real bug): two files with the same name lose one in the ZIP.** Six files, two named `clip.mp4`, ZIP mode: the ZIP held 5 entries (`clip.mkv`, `u3`–`u6`) and the status still said "Done — 6 videos converted." Convert avoids this with `bcUniqueName`; Convido does not.
2. **CV-069b / CV-069c (real bug): the "6–20 files default to ZIP" rule only holds on a fresh page.** `updateDownloadModeToggle` sets the mode to "single" whenever the count is 5 or fewer, including 0 after a reset, and never sets it back for 6–20. After a reset, or after adding 2 files and then 4 more, 6 files download as 6 separate files. Convert and Compress use the same code, so they probably share this (not tested).
3. **CV-043 (design decision): WebM (VP9/Opus) → MP4 is only re-packed.** The tool treats VP9 and Opus as valid in MP4, so no re-encode happens. The result plays in Chrome but VP9/Opus in MP4 does not play in QuickTime, iOS or some Windows players. Decide whether MP4 should always mean H.264/AAC.
4. **CV-082 (not confirmed): Cancel did not respond while the encoder was stalled.** For GIFs the cancel flag is only checked between frames, so a stalled encoder leaves the button on "Cancel" with no way out except removing the file. I could not test this on a healthy encoder.
5. **CV-099:** Convido is not in `PAGES` in `tools/build_translations.py`, so there are no language pages and the sitemap lists only the English URL. Expected until the copy is final.

## What went wrong in the environment

After a long run of test videos, macOS stopped giving Chrome its hardware H.264 encoder and its AAC encoder. From then on, anything that needed encoding or re-encoding hung, so CV-082 to CV-085 could not be run (the stall was also not caused by Convido itself: even my own test-video generator hung). Quitting and reopening Chrome should clear it. Scenarios that only re-pack were unaffected.

## Still to run once Chrome is restarted

CV-082, 083, 084, 085 (cancel and remove during a long conversion), plus the re-encode scenarios outside the quick run (CV-045 HEVC, CV-052 4K, CV-056 long video).
