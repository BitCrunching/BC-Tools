#!/usr/bin/env python3
"""Build translated copies of the site's static pages.

    python3 tools/build_translations.py cs            # write /cs/... pages
    python3 tools/build_translations.py cs --report   # list strings still missing

How it works
  * The English pages stay the single source of truth.
  * translations/<lang>.json maps an English sentence -> its translation.
    Page text is matched per text node (whitespace collapsed); selected
    attributes (title, aria-label, placeholder, alt, <meta content>, ...)
    are matched on their whole value. Anything without an entry stays
    English, so a half-translated page still works.
  * Text built in JavaScript goes through bcT() (shared/site.js) and is
    translated from the same json: it is also written to
    shared/i18n/<lang>.js, which only the translated pages load.
  * Output goes to /<lang>/<same path>. Internal links are rewritten to the
    translated copy when that page exists; hreflang/canonical/lang are set.

Add a page to PAGES below once its copy is final, rebuild, review the diff.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://bitcrunching.com"

# Pages (relative to the repo root) that get a translated copy.
PAGES = [
    "index.html",
    "convert/index.html",
]

SKIP_TEXT_IN = {"script", "style", "code", "pre", "textarea", "svg", "noscript"}
TRANSLATE_ATTRS = {
    "title", "aria-label", "placeholder", "alt", "data-label", "data-preview-name",
    "data-preview-desc", "data-text", "data-tooltip",
}
META_CONTENT_KEYS = {
    ("name", "description"), ("property", "og:title"), ("property", "og:description"),
    ("name", "twitter:title"), ("name", "twitter:description"),
}

TOKEN = re.compile(
    r"(<!--.*?-->)"                      # comments
    r"|(<script\b.*?</script\s*>)"       # scripts (verbatim)
    r"|(<style\b.*?</style\s*>)"         # styles (verbatim)
    r"|(<[^>]+>)"                        # tags
    r"|([^<]+)",                         # text
    re.S | re.I,
)
ATTR = re.compile(r"""([\w:-]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)')""")


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def page_url(rel):
    """index.html -> '/', convert/index.html -> '/convert/'."""
    p = "/" + rel[: -len("index.html")]
    return p


def load(lang):
    path = ROOT / "translations" / f"{lang}.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return {norm(k): v for k, v in data.items() if not k.startswith("_")}


def translate_tag(tag, tr, missing, built_pages, lang):
    name_m = re.match(r"<\s*([\w:-]+)", tag)
    name = name_m.group(1).lower() if name_m else ""
    attrs = {m.group(1).lower(): (m.group(3) if m.group(3) is not None else m.group(4)) for m in ATTR.finditer(tag)}

    def fix(m):
        key = m.group(1).lower()
        val = m.group(3) if m.group(3) is not None else m.group(4)
        quote = '"' if m.group(3) is not None else "'"
        new = val
        if key in TRANSLATE_ATTRS and norm(val):
            new = tr.get(norm(val), val)
            if new == val and re.search(r"[A-Za-z]{3}", val) and not val.startswith(("/", "http", "#", "data:")):
                missing.add(norm(val))
        elif key == "content" and name == "meta":
            for k, v in META_CONTENT_KEYS:
                if attrs.get(k) == v:
                    new = tr.get(norm(val), val)
                    if new == val:
                        missing.add(norm(val))
        elif key == "href" and val in built_pages:
            new = f"/{lang}" + (val if val != "/" else "/")
        elif key == "href" and name == "link" and attrs.get("rel") == "canonical":
            new = val.replace(SITE + "/", f"{SITE}/{lang}/", 1) if val.startswith(SITE) else val
        elif key == "content" and name == "meta" and attrs.get("property") == "og:url":
            new = val.replace(SITE + "/", f"{SITE}/{lang}/", 1)
        return f"{m.group(1)}{m.group(2)}{quote}{new}{quote}"

    out = ATTR.sub(fix, tag)
    if name == "html":
        out = re.sub(r"""\blang\s*=\s*["'][^"']*["']""", f'lang="{lang}"', out)
    if name == "meta" and attrs.get("property") == "og:url":
        out = re.sub(r'content="([^"]*)"', lambda m: f'content="{m.group(1).replace(SITE + "/", SITE + "/" + lang + "/", 1)}"', out)
    return out


def build_page(rel, tr, lang, built_pages, missing):
    html = (ROOT / rel).read_text(encoding="utf-8")
    out, stack = [], []
    void = {"meta", "link", "br", "img", "input", "hr", "source", "path", "circle", "rect", "polygon", "line", "polyline"}
    for m in TOKEN.finditer(html):
        comment, script, style, tag, text = m.groups()
        if comment or style:
            out.append(m.group(0))
        elif script:
            out.append(m.group(0))
        elif tag:
            nm = re.match(r"</?\s*([\w:-]+)", tag)
            name = nm.group(1).lower() if nm else ""
            if tag.startswith("</"):
                if name in stack:
                    while stack and stack.pop() != name:
                        pass
                out.append(tag)
            else:
                out.append(translate_tag(tag, tr, missing, built_pages, lang))
                if name in SKIP_TEXT_IN and not tag.rstrip().endswith("/>"):
                    stack.append(name)
        else:
            if stack or not norm(text):
                out.append(text)
                continue
            key = norm(text)
            new = tr.get(key)
            if new is None:
                if re.search(r"[A-Za-z]{3}", key) and not re.fullmatch(r"[\W\d_]*", key):
                    missing.add(key)
                out.append(text)
            else:
                lead = text[: len(text) - len(text.lstrip())]
                trail = text[len(text.rstrip()):]
                out.append(lead + new + trail)
    result = "".join(out)
    # The English source already lists its translations; regenerate them below.
    result = re.sub(r'[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n?', "", result)

    # <head> additions: alternate links + the language dictionary for bcT()
    en_url = SITE + page_url(rel)
    cs_url = SITE + f"/{lang}" + page_url(rel)
    alternates = (
        f'<link rel="alternate" hreflang="en" href="{en_url}">\n'
        f'<link rel="alternate" hreflang="{lang}" href="{cs_url}">\n'
        f'<link rel="alternate" hreflang="x-default" href="{en_url}">\n'
        f'<script src="/shared/i18n/{lang}.js?v=1"></script>\n'
    )
    result = re.sub(r"(<link rel=\"canonical\"[^>]*>\s*)", lambda mm: mm.group(1) + alternates, result, count=1)
    if alternates not in result:  # no canonical tag on the page
        result = result.replace("</head>", alternates + "</head>", 1)
    return result


def write_js_dictionary(lang, tr, pages):
    out_dir = ROOT / "shared" / "i18n"
    out_dir.mkdir(exist_ok=True)
    body = json.dumps(tr, ensure_ascii=False, indent=1, sort_keys=True)
    built = json.dumps(sorted(page_url(p) for p in pages))
    (out_dir / f"{lang}.js").write_text(
        f"/* Generated by tools/build_translations.py from translations/{lang}.json — do not edit. */\n"
        f"window.BC_LANG = \"{lang}\";\n"
        f"window.BC_LANG_PAGES = {built};\n"
        f"window.BC_I18N = {body};\n",
        encoding="utf-8",
    )


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    lang = sys.argv[1]
    report = "--report" in sys.argv
    tr = load(lang)
    built_pages = {page_url(p) for p in PAGES}
    missing = set()
    for rel in PAGES:
        html = build_page(rel, tr, lang, built_pages, missing)
        if not report:
            dest = ROOT / lang / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(html, encoding="utf-8")
    if not report:
        write_js_dictionary(lang, tr, PAGES)
        print(f"Built {len(PAGES)} page(s) into /{lang}/ and shared/i18n/{lang}.js")
    todo = sorted(s for s in missing if s not in tr)
    print(f"{len(todo)} string(s) without a {lang} translation" + (":" if report else " (run with --report to list)"))
    if report:
        for s in todo:
            print(" -", s)


if __name__ == "__main__":
    main()
