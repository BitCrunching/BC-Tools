#!/usr/bin/env python3
"""Regenerate sitemap.xml: keeps the English URLs and adds every translated copy
(with hreflang alternates) for the pages listed in tools/build_translations.py."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_translations as B

path = B.ROOT / "sitemap.xml"
xml = path.read_text(encoding="utf-8")
english = re.findall(r"<loc>https://bitcrunching\.com([^<]*)</loc>", xml)
english = [u for u in english if not re.match(r"/(" + "|".join(B.all_langs()) + r")/", u)]
built = {B.page_url(p) for p in B.PAGES}
langs = B.all_langs()

def entry(url, lang=None):
    loc = B.SITE + (f"/{lang}" if lang else "") + url
    out = f"  <url><loc>{loc}</loc>"
    if url in built:
        out += f'<xhtml:link rel="alternate" hreflang="en" href="{B.SITE}{url}"/>'
        for l in langs:
            out += f'<xhtml:link rel="alternate" hreflang="{l}" href="{B.SITE}/{l}{url}"/>'
        out += f'<xhtml:link rel="alternate" hreflang="x-default" href="{B.SITE}{url}"/>'
    return out + "</url>"

lines = [entry(u) for u in english]
for l in langs:
    lines += [entry(u, l) for u in english if u in built]
path.write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + "\n".join(lines) + "\n</urlset>\n",
    encoding="utf-8",
)
print(len(lines), "urls")
