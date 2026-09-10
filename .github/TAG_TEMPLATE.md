# Release tag template

## Naming: `YY.MM.N`

- `YY` — two-digit year (`26`)
- `MM` — two-digit month (`09`)
- `N` — release number **within that month**, starting at `1` and incrementing
  (`26.09.1`, `26.09.2`, `26.09.3`, …). Resets to `1` each new month.

Check the last one before picking the next:

```bash
git tag -l --sort=-v:refname | head -3
```

## Annotation message

```
<tag name>

<one-paragraph plain-English summary of what shipped — what a user
would notice, not the file list. Present tense, no "this release".>

Tools: <comma-separated list of tools touched, or "site-wide">
```

The first line **is** the tag name (matches every existing tag). Blank
line, then the summary — this becomes the GitHub Release body, which the
Discord workflow (`.github/workflows/discord-release.yml`) posts verbatim
on publish, so write it for that audience.

Keep it short. One paragraph. Skip the body only for a trivial
bump-nothing-visible tag.

## Creating it

```bash
# 1. make sure main is up to date and pushed
git checkout main && git push origin main

# 2. tag (annotated, from a file so the body is clean)
git tag -a 26.09.N -F .github/tag-msg.txt   # write the message into tag-msg.txt first
git push origin 26.09.N

# 3. publish the GitHub Release from that tag (fires the Discord announce)
gh release create 26.09.N --title 26.09.N --notes-file .github/tag-msg.txt
rm .github/tag-msg.txt
```

Or inline for a quick one:

```bash
git tag -a 26.09.N -m "26.09.N" -m "Summary paragraph here." -m "Tools: convert, compress"
```

## Example (fill in and use)

```
26.09.3

Convert and Compress both gained a persistent "add more files" tile in
the results row, a cleaner layout with the primary button on its own
full-width line, and a fix for the tool getting stuck in a half-loaded
state after removing the last file. Compress now rejects GIFs with a
pointer to Congify. Mobile drop zones read "Drop zone" across the site.

Tools: convert, compress
```
