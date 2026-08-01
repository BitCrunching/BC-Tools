#!/usr/bin/env python3
"""
Generates real, crawlable static pages for specific routes (e.g. /terms) from
the single master index.html, so bots that don't run JS (or check the HTTP
status before running it) see genuine 200-OK pages with the real content
already visible, instead of hitting a 404 + client-side redirect.

Usage: python3 build_static_routes.py
Run this after editing index.html and before pushing, for every route listed
in ROUTES below. Each entry generates <slug>/index.html.
"""

import os
import re

SOURCE = "index.html"
SITE_URL = "https://bitcrunching.com"

ROUTES = {
    "terms": {
        "page_id": "page-terms",
        "title": "Terms of Use – BC Tools",
        "description": "Terms of Use for BC Tools: free, browser-based, server-free image tools. Read how the service works and what using it means for you.",
    },
    "privacy": {
        "page_id": "page-privacy",
        "title": "Privacy Policy – BC Tools",
        "description": "Privacy Policy for BC Tools: free, browser-based, server-free image tools. Learn what data is (and isn't) collected when you use the service.",
    },
    "cookies": {
        "page_id": "page-cookies",
        "title": "Cookie Policy – BC Tools",
        "description": "Cookie Policy for BC Tools: free, browser-based, server-free image tools. Learn how cookies are used on the site.",
    },
    "about": {
        "page_id": "page-about",
        "title": "About Us – BC Tools",
        "description": "About BC Tools: free, browser-based, server-free image tools built to work fast without uploading your files anywhere.",
    },
    "faq": {
        "page_id": "page-faq",
        "title": "FAQ – BC Tools",
        "description": "Frequently asked questions about BC Tools: free, browser-based, server-free image tools.",
    },
    "golden-rules": {
        "page_id": "page-golden-rules",
        "title": "Golden Rules – BC Tools",
        "description": "Golden Rules for choosing image formats, compression, and settings with BC Tools.",
    },
}


def build_route(html, slug, page_id, title, description):
    # Deactivate the default mainpage section, activate the target page instead.
    html = html.replace(
        '<section class="page active" id="page-mainpage">',
        '<section class="page" id="page-mainpage">',
    )
    old_section = f'<section class="page" id="{page_id}">'
    new_section = f'<section class="page active" id="{page_id}">'
    if old_section not in html:
        raise ValueError(f"page id {page_id!r} not found in source")
    html = html.replace(old_section, new_section)

    # This file will live one directory deep (e.g. terms/index.html), so
    # relative asset paths need to become root-relative.
    html = html.replace('src="vendor/', 'src="/vendor/')

    # Unique <title> and <meta name="description"> per route, for real SEO
    # value and so a crawler doesn't see the generic homepage title everywhere.
    html = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", html, count=1)
    html = re.sub(
        r'<meta name="description"[^>]*>',
        f'<meta name="description" content="{description}">',
        html,
        count=1,
    )

    # Canonical URL + Open Graph/Twitter overrides, so each route points to
    # itself (not the homepage) and social link previews show the right
    # title/description instead of the generic mainpage copy.
    page_url = f"{SITE_URL}/{slug}/"
    html = re.sub(
        r'<link rel="canonical"[^>]*>',
        f'<link rel="canonical" href="{page_url}">',
        html,
        count=1,
    )
    html = re.sub(
        r'<meta property="og:title"[^>]*>',
        f'<meta property="og:title" content="{title}">',
        html,
        count=1,
    )
    html = re.sub(
        r'<meta property="og:description"[^>]*>',
        f'<meta property="og:description" content="{description}">',
        html,
        count=1,
    )
    html = re.sub(
        r'<meta property="og:url"[^>]*>',
        f'<meta property="og:url" content="{page_url}">',
        html,
        count=1,
    )
    html = re.sub(
        r'<meta name="twitter:title"[^>]*>',
        f'<meta name="twitter:title" content="{title}">',
        html,
        count=1,
    )
    html = re.sub(
        r'<meta name="twitter:description"[^>]*>',
        f'<meta name="twitter:description" content="{description}">',
        html,
        count=1,
    )

    return html


def build_sitemap(slugs):
    urls = [f"{SITE_URL}/"] + [f"{SITE_URL}/{slug}/" for slug in slugs]
    entries = "\n".join(f"  <url><loc>{url}</loc></url>" for url in urls)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</urlset>\n"
    )


def main():
    with open(SOURCE, encoding="utf-8") as f:
        source_html = f.read()

    for slug, cfg in ROUTES.items():
        out_html = build_route(source_html, slug, cfg["page_id"], cfg["title"], cfg["description"])
        os.makedirs(slug, exist_ok=True)
        out_path = os.path.join(slug, "index.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(out_html)
        print(f"built {out_path} ({len(out_html)} bytes)")

    sitemap = build_sitemap(ROUTES.keys())
    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(sitemap)
    print("built sitemap.xml")


if __name__ == "__main__":
    main()
