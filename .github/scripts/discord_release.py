#!/usr/bin/env python3
"""Post a GitHub release to a Discord webhook, screenshots included.

Discord embeds can't render images inside their text, so this strips every
image (<img> tags and ![](...) markdown) out of the release notes and sends
them as image attachments in embeds that share the release URL, which
Discord shows as one gallery under the text.

Usage: discord_release.py release.json            (needs DISCORD_WEBHOOK)
       discord_release.py release.json --dry-run  (prints the payload only)
"""
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile

COLOR = 3066993
USERNAME = "Bitcrouching System"
MAX_DESCRIPTION = 4000
MAX_IMAGES = 10

IMG_TAG = re.compile(r"<img\b[^>]*>", re.I)
IMG_SRC = re.compile(r"""src\s*=\s*["']([^"']+)["']""", re.I)
IMG_MD = re.compile(r"!\[[^\]]*\]\(([^)\s]+)[^)]*\)")
COMMENT = re.compile(r"<!--.*?-->", re.S)


def split_body(body):
    """Return (text without images, [image urls in order of appearance])."""
    body = COMMENT.sub("", body.replace("\r\n", "\n"))
    found = []
    for m in re.finditer(r"<img\b[^>]*>|!\[[^\]]*\]\([^)\s]+[^)]*\)", body, re.I):
        chunk = m.group(0)
        if chunk.startswith("<"):
            src = IMG_SRC.search(chunk)
            url = src.group(1) if src else None
        else:
            url = IMG_MD.match(chunk).group(1)
        if url:
            found.append((m.start(), url))
    text = IMG_MD.sub("", IMG_TAG.sub("", body))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    urls = []
    for _, url in sorted(found):
        if url not in urls:
            urls.append(url)
    return text, urls[:MAX_IMAGES]


def download(url, folder, index):
    """Fetch an image so it can be uploaded directly (always displays)."""
    raw = os.path.join(folder, f"raw{index}")
    result = subprocess.run(
        ["curl", "-sSL", "--max-time", "30", "-o", raw, "-w", "%{content_type}", url],
        capture_output=True, text=True,
    )
    if result.returncode != 0 or not os.path.getsize(raw):
        return None
    ctype = result.stdout.split(";")[0].strip()
    ext = mimetypes.guess_extension(ctype) or ".png"
    if ext == ".jpe":
        ext = ".jpg"
    if not ctype.startswith("image/"):
        return None
    path = os.path.join(folder, f"screenshot{index + 1}{ext}")
    os.replace(raw, path)
    return path


def chunk_text(text, limit=MAX_DESCRIPTION):
    """Pack whole '## ' sections into pieces that fit one embed description."""
    sections = re.split(r"\n(?=## )", text)
    pieces, current = [], ""
    for sec in sections:
        while len(sec) > limit:  # one huge section: break on line boundaries
            cut = sec.rfind("\n", 0, limit) or limit
            if current:
                pieces.append(current)
                current = ""
            pieces.append(sec[:cut])
            sec = sec[cut:].lstrip("\n")
        if current and len(current) + 2 + len(sec) > limit:
            pieces.append(current)
            current = sec
        else:
            current = (current + "\n\n" + sec) if current else sec
    if current:
        pieces.append(current)
    return pieces


def build(release, folder, fetch=True):
    """Return a list of (payload, files) — one Discord message each."""
    text, urls = split_body(release.get("body") or "")
    page = release["html_url"]
    title = (release.get("name") or release["tag_name"]).strip()

    messages = []
    for i, piece in enumerate(chunk_text(text) or [""]):
        embed = {"description": piece, "color": COLOR}
        if i == 0:
            embed["title"], embed["url"] = title, page
        messages.append(({"username": USERNAME, "embeds": [embed]}, []))

    if urls:
        embeds, files = [], []
        for i, url in enumerate(urls):
            path = download(url, folder, i) if fetch else None
            if path:
                files.append(path)
                image = {"url": "attachment://" + os.path.basename(path)}
            else:
                image = {"url": url}  # let Discord try the remote URL itself
            # Embeds sharing one url are shown by Discord as a single gallery.
            embeds.append({"url": page, "color": COLOR, "image": image})
        messages.append(({"username": USERNAME, "embeds": embeds}, files))
    return messages


def send(hook, payload, files):
    cmd = ["curl", "-sS", "-f", "-X", "POST",
           "-F", "payload_json=" + json.dumps(payload, ensure_ascii=False)]
    for i, path in enumerate(files):
        cmd += ["-F", f"files[{i}]=@{path}"]
    cmd.append(hook)
    subprocess.run(cmd, check=True)


def main():
    release = json.load(open(sys.argv[1]))
    dry = "--dry-run" in sys.argv
    with tempfile.TemporaryDirectory() as folder:
        messages = build(release, folder, fetch=not dry)
        if dry:
            print(json.dumps([m[0] for m in messages], indent=2, ensure_ascii=False))
            return
        hook = os.environ["DISCORD_WEBHOOK"]
        for payload, files in messages:
            send(hook, payload, files)
        print(f"Posted {release['tag_name']} to Discord: {len(messages)} message(s), "
              f"{sum(len(f) for _, f in messages)} uploaded image(s).")


if __name__ == "__main__":
    main()
