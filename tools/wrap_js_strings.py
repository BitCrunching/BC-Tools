#!/usr/bin/env python3
"""One-off helper: wrap the simple user-facing string assignments in a tool's
JavaScript with bcT() so they can be translated (see tools/build_translations.py).

    python3 tools/wrap_js_strings.py compress/compress-tool.js [--dry]

Only rewrites single-line statements of these shapes:
    x.textContent = "text";            x.title = "text";
    x.textContent = `text ${a} ${b}`; x.placeholder = "text";
    x.setAttribute("aria-label", "text");
Template values become positional placeholders:  bcT("text {0} {1}", [a, b]).
Anything more complex (ternaries inside the string, innerHTML, nested
backticks) is left alone and has to be wrapped by hand.
"""
import re
import sys

PROPS = r"(?:textContent|title|placeholder|alt)"
STMT_STR = re.compile(r"""^(\s*(?:[\w$.\[\]]+)\.""" + PROPS + r"""\s*=\s*)("(?:[^"\\]|\\.)*")(\s*;.*)$""")
STMT_TPL = re.compile(r"""^(\s*(?:[\w$.\[\]]+)\.""" + PROPS + r"""\s*=\s*)(`[^`]*`)(\s*;.*)$""")
ATTR_STR = re.compile(r"""^(\s*[\w$.\[\]]+\.setAttribute\(\s*["'](?:aria-label|title|placeholder)["']\s*,\s*)("(?:[^"\\]|\\.)*")(\s*\)\s*;.*)$""")


def has_text(s):
    return re.search(r"[A-Za-z]{3}", s) is not None


def wrap_string(lit):
    return f"bcT({lit})"


def wrap_template(lit):
    body = lit[1:-1]
    parts = re.split(r"\$\{([^}]*)\}", body)
    if len(parts) == 1:
        return f'bcT("{body}")' if '"' not in body and "\n" not in body else None
    text, exprs = "", []
    for i, part in enumerate(parts):
        if i % 2 == 0:
            text += part
        else:
            if re.search(r"[`?:]", part) and not re.fullmatch(r"[\w$.\[\]()+\- ]+", part):
                return None  # ternaries etc: do by hand
            text += "{" + str(len(exprs)) + "}"
            exprs.append(part.strip())
    if '"' in text or "\n" in text:
        return None
    return f'bcT("{text}", [{", ".join(exprs)}])'


def main():
    path = sys.argv[1]
    dry = "--dry" in sys.argv
    lines = open(path, encoding="utf-8").read().split("\n")
    changed, skipped = 0, []
    in_block_comment = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if in_block_comment:
            if "*/" in stripped:
                in_block_comment = False
            continue
        if stripped.startswith("/*") and "*/" not in stripped:
            in_block_comment = True
            continue
        if stripped.startswith(("//", "*", "/*")) or "bcT(" in line:
            continue
        for rx, kind in ((STMT_STR, "str"), (ATTR_STR, "str"), (STMT_TPL, "tpl")):
            m = rx.match(line)
            if not m:
                continue
            head, lit, tail = m.groups()
            if not has_text(lit):
                break
            new = wrap_string(lit) if kind == "str" else wrap_template(lit)
            if new is None:
                skipped.append((i + 1, stripped[:110]))
            else:
                lines[i] = head + new + tail
                changed += 1
            break
    if not dry:
        open(path, "w", encoding="utf-8").write("\n".join(lines))
    print(f"{path}: wrapped {changed} statement(s)" + (" (dry run)" if dry else ""))
    for n, s in skipped:
        print(f"  needs hand-wrapping, line {n}: {s}")


if __name__ == "__main__":
    main()
