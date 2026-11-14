#!/usr/bin/env python3
"""Insert the Forge security-header snippet into live nginx files.

nginx drops server-level add_header inside any location that sets its own
add_header. This puts the snippet at server scope and inside those locations.
"""

from __future__ import annotations

import sys
from pathlib import Path

SNIPPET = "include /etc/nginx/snippets/forge-security-headers.conf;"
SEC_LOC = """    location = /.well-known/security.txt {
        alias /var/www/forge-web/.well-known/security.txt;
        default_type text/plain;
        add_header Cache-Control "public, max-age=86400" always;
        include /etc/nginx/snippets/forge-security-headers.conf;
    }

"""


def patch(text: str) -> str:
    lines = text.splitlines(keepends=True)
    stack: list[int] = []
    blocks: list[tuple[int, int]] = []
    for idx, line in enumerate(lines):
        code = line.split("#", 1)[0]
        for _ in range(code.count("{")):
            stack.append(idx)
        for _ in range(code.count("}")):
            if stack:
                blocks.append((stack.pop(), idx))

    inserts: dict[int, list[str]] = {}

    def add_after(i: int, extra: str) -> None:
        inserts.setdefault(i, []).append(extra if extra.endswith("\n") else extra + "\n")

    for open_i, close_i in blocks:
        body = "".join(lines[open_i : close_i + 1])
        header = lines[open_i]
        if "location" in header and "add_header" in body and SNIPPET not in body:
            indent = header[: len(header) - len(header.lstrip())] + "    "
            add_after(open_i, f"{indent}{SNIPPET}")
        if header.strip().startswith("server") and "server_name" in body:
            first_loc = None
            for j in range(open_i + 1, close_i):
                if lines[j].strip().startswith("location"):
                    first_loc = j
                    break
            region_end = first_loc if first_loc is not None else close_i
            region = "".join(lines[open_i + 1 : region_end])
            if SNIPPET not in region:
                anchor = open_i
                for j in range(open_i + 1, region_end):
                    if "server_name" in lines[j]:
                        anchor = j
                        break
                add_after(anchor, f"    {SNIPPET}")
            if first_loc is not None and "location = /.well-known/security.txt" not in body:
                add_after(first_loc - 1, SEC_LOC)

    if not inserts:
        return text
    out: list[str] = []
    for idx, line in enumerate(lines):
        out.append(line)
        out.extend(inserts.get(idx, []))
    return "".join(out)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: apply-security-headers.py FILE...", file=sys.stderr)
        return 2
    for raw in argv[1:]:
        path = Path(raw)
        original = path.read_text()
        updated = patch(original)
        if updated == original:
            print(f"unchanged {path}")
            continue
        path.write_text(updated)
        print(f"patched {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
