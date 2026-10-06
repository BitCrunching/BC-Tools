#!/usr/bin/env python3
"""Post a release draft to Discord via webhook, with screenshots attached.

  python3 tools/post_release_discord.py 26.10.2 shot1.png shot2.png          # preview only
  python3 tools/post_release_discord.py 26.10.2 shot1.png shot2.png --send   # actually post
  python3 tools/post_release_discord.py 26.10.2 --github [--send]            # use the published GitHub release, images in place

Notes come from .release-drafts/<tag>.md. The webhook URL is read from the
DISCORD_WEBHOOK_URL env var or a gitignored .discord-webhook file in the repo root.
"""
import json, os, re, subprocess, sys, tempfile

LIMIT = 4000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def webhook_url():
    url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not url:
        p = os.path.join(ROOT, ".discord-webhook")
        if os.path.exists(p):
            url = open(p).read().strip()
    return url


def chunks(text):
    parts = re.split(r"(?m)^(?=## )", text)
    out, cur = [], ""
    for part in parts:
        if len(part) > LIMIT:
            part = part[:LIMIT - 1] + "…"
        if len(cur) + len(part) > LIMIT and cur:
            out.append(cur.strip())
            cur = ""
        cur += part
    if cur.strip():
        out.append(cur.strip())
    return out


def github_embeds(tag):
    body = subprocess.run(["gh", "release", "view", tag, "--json", "body", "-q", ".body"],
                          check=True, capture_output=True, text=True).stdout.replace("\r", "")
    body = re.sub(r"(?m)^## v?[\w.]+\s*\n", "", body, count=1)
    body = re.sub(r"(?m)^## ", "### ", body)
    embeds, pending = [], []

    def flush(image=None):
        text = "\n".join(pending).strip()
        pending.clear()
        if not text and not image:
            return
        e = {"color": 0x636363}
        if text:
            e["description"] = text[:LIMIT]
        if image:
            e["image"] = {"url": image}
        embeds.append(e)

    for line in body.split("\n"):
        m = re.search(r'<img [^>]*src="([^"]+)"', line)
        if m:
            flush(m.group(1))
        else:
            pending.append(line)
    flush()
    embeds[0]["title"] = f"BC Tools {tag}"
    return embeds


def batches(embeds):
    out, cur, size = [], [], 0
    for e in embeds:
        n = len(e.get("description", "")) + len(e.get("title", ""))
        if cur and (len(cur) >= 10 or size + n > 5500):
            out.append(cur)
            cur, size = [], 0
        cur.append(e)
        size += n
    if cur:
        out.append(cur)
    return out


def post(url, payload, files):
    cmd = ["curl", "-sS", "-f", "-X", "POST", url, "-F", "payload_json=" + json.dumps(payload)]
    for i, f in enumerate(files):
        cmd += ["-F", f"files[{i}]=@{f}"]
    subprocess.run(cmd, check=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    send = "--send" in sys.argv
    if not args:
        sys.exit(__doc__)
    tag, images = args[0], args[1:]
    if "--github" in sys.argv:
        embeds = github_embeds(tag)
        slots = [e for e in embeds if "image" in e]
        for e, f in zip(slots, images):
            e["image"] = {"url": "attachment://" + os.path.basename(f)}
            e["_file"] = f
        groups = batches(embeds)
        for n, g in enumerate(groups, 1):
            print(f"--- message {n}/{len(groups)}: {len(g)} embed(s) ---")
            for e in g:
                print(("[image: %s] " % os.path.basename(e.get("_file", "github")) if "image" in e else "") + e.get("description", "").replace("\n", " ")[:90])
        if not send:
            print("\nPreview only. Add --send to post.")
            return
        url = webhook_url()
        if not url:
            sys.exit("No webhook: set DISCORD_WEBHOOK_URL or create .discord-webhook")
        for g in groups:
            files = [e["_file"] for e in g if "_file" in e]
            post(url, {"embeds": [{k: v for k, v in e.items() if k != "_file"} for e in g]}, files)
        print("Posted.")
        return
    if len(images) > 10:
        sys.exit("Discord allows at most 10 attachments per message")
    for f in images:
        if not os.path.isfile(f):
            sys.exit(f"Image not found: {f}")
    notes_path = os.path.join(ROOT, ".release-drafts", tag + ".md")
    if not os.path.isfile(notes_path):
        sys.exit(f"No draft at {notes_path}")
    text = open(notes_path).read()
    text = re.sub(r"(?m)^## v[\w.]+\s*\n", "", text, count=1).strip()
    text = re.sub(r"(?m)^## ", "### ", text)
    pieces = chunks(text)

    messages = []
    for i, piece in enumerate(pieces):
        embed = {"description": piece, "color": 0x636363}
        if i == 0:
            embed["title"] = f"BC Tools {tag}"
            if images:
                embed["image"] = {"url": "attachment://" + os.path.basename(images[0])}
        messages.append(({"embeds": [embed]}, images if i == 0 else []))

    for n, (payload, files) in enumerate(messages, 1):
        print(f"--- message {n}/{len(messages)} ({len(payload['embeds'][0]['description'])} chars, {len(files)} image(s)) ---")
        print(payload["embeds"][0]["description"][:600])
    if not send:
        print("\nPreview only. Add --send to post.")
        return
    url = webhook_url()
    if not url:
        sys.exit("No webhook: set DISCORD_WEBHOOK_URL or create .discord-webhook")
    for payload, files in messages:
        post(url, payload, files)
    print("Posted.")


main()
