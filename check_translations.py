#!/usr/bin/env python3
"""
Build-time translation completeness check.

Parses the `translations` object in index.html and fails (non-zero exit)
if any non-English language is missing a key that English has, or has an
extra key not present in English (usually a typo or leftover). This is
the same check checkTranslationCompleteness() does at runtime in the
browser console, but as a hard build-time gate instead of a warning
someone has to notice.

Usage: python3 check_translations.py
Run this before committing, or wire it into CI / build_static_routes.py.
Exits 0 if every language matches English's key set, exits 1 otherwise.
"""

import re
import sys

SOURCE = "index.html"


def load_translations(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()

    start = content.index("const translations = {")
    end = content.index("\n};\n", start) + 3
    block = content[start:end]

    lang_starts = [(m.start(), m.group(1)) for m in re.finditer(r"\n  (\w+): \{", block)]
    langs = {}
    for i, (pos, lang) in enumerate(lang_starts):
        end_pos = lang_starts[i + 1][0] if i + 1 < len(lang_starts) else len(block)
        chunk = block[pos:end_pos]
        keys = set(re.findall(r"\n\s+(\w+):", chunk))
        # The regex above also matches the language block's own opening
        # line (e.g. "en: {") since it looks like a key — drop it.
        keys.discard(lang)
        langs[lang] = keys
    return langs


def main():
    langs = load_translations(SOURCE)
    if "en" not in langs:
        print("ERROR: no 'en' language block found — can't check completeness.")
        return 1

    reference = langs["en"]
    ok = True
    for lang, keys in langs.items():
        if lang == "en":
            continue
        missing = sorted(reference - keys)
        extra = sorted(keys - reference)
        if missing:
            ok = False
            print(f"[{lang}] missing {len(missing)} key(s):")
            for k in missing:
                print(f"  - {k}")
        if extra:
            ok = False
            print(f"[{lang}] has {len(extra)} extra key(s) not in 'en' (typo or leftover?):")
            for k in extra:
                print(f"  - {k}")

    if ok:
        print(f"OK: all {len(langs) - 1} non-English language(s) match 'en' ({len(reference)} keys each).")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
