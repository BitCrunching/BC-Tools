# Comprio stress tests

Manual browser scenarios for `/comprio/`. Serve the repo (`python3 -m http.server 8001`),
run `sh tools/comprio-stress/make-assets.sh`, open `/comprio/`, and paste `harness.js`
into the console (or `(0,eval)(await (await fetch('/tools/comprio-stress/harness.js')).text())`;
the harness fetches files from `/test-assets/`). `T.load([files])` feeds files to the page,
`T.cards()` / `T.status()` read the result, `T.captureDownloads()` stops real downloads.

## Scenarios and last results (Chrome, Apple Silicon, hardware H.264)

| # | Scenario | Result |
|---|---|---|
| 1 | 20 videos (6 s 720p) loaded + compressed | All estimates instant; all 20 done < 30 s; heap flat |
| 2 | 50 videos loaded + compressed | All 50 done < 35 s; identical 1.4 MB outputs; heap flat |
| 3 | Cancel mid-batch (50 files) | Stops the whole batch ("Canceled."), no more downloads |
| 4 | Remove all mid-batch | Run stops, drop zone returns, no more downloads |
| 5 | Remove one file mid-batch | Batch continues with the rest |
| 6 | 855 MB 4K 60 s clip, Medium | Estimate ~116 MB, result 131 MB, ~30 s, plays at 3840x2160, 60 s |
| 7 | 3 x 855 MB 4K clips in one batch | Peak heap ~600 MB (only latest result kept), ~30 s each |
| 8 | Cancel during a 4K encode | Stops in ~0.1 s |
| 9 | Corrupt: 0-byte, random bytes, text renamed .mov, truncated, zeroed header | Red card each, no hang, one summary status line |
| 10 | Corrupt data inside a readable file | Reads fine, fails fast on compress with a friendly message, no download |
| 11 | Fake RAW (.cr2 .nef .dng .arw), .braw, .r3d, .mp3 | Skipped ("N file(s) weren't a video") |
| 12 | Unsupported video containers (.avi .wmv .flv, no real content) | Red card ("Couldn't read") |
| 13 | WebM and MKV inputs, no-audio 1080p to 480p | All compress to MP4 |
| 14 | Mixed batch: 1 valid + corrupt + RAW | Valid one works, status reports both problems |
| 15 | 571 MB 1080p 120 s clip scaled to 480p | Estimate ~11.4 MB, result 11.5 MB, 8 s |

Known limits: the output is built in memory (`BufferTarget`), so a result above ~2 GB can
fail with a normal "Couldn't compress" card; sessions above 300 MB are not saved for
"Continue where you left off".
