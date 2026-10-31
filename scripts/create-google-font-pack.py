#!/usr/bin/env python3
"""Build an offline font catalog from a checked-out google/fonts revision."""
import json
import re
import shutil
import sys
from pathlib import Path

source = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
entries = []
for licence_group in ("ofl", "apache", "ufl"):
    group = source / licence_group
    if not group.is_dir():
        continue
    for metadata in sorted(group.glob("*/METADATA.pb")):
        text = metadata.read_text(encoding="utf-8")
        family_match = re.search(r'^name:\s*"([^"\n]+)"', text, re.MULTILINE)
        if not family_match:
            continue
        family = family_match.group(1)
        copied = False
        for block in re.findall(r"\bfonts\s*\{([^{}]*)\}", text):
            name = re.search(r'\bfilename:\s*"([^"\n]+)"', block)
            style = re.search(r'\bstyle:\s*"([^"\n]+)"', block)
            weight = re.search(r'\bweight:\s*(\d+)', block)
            if not name or not style:
                continue
            filename = name.group(1)
            if Path(filename).name != filename or Path(filename).suffix.lower() not in (".ttf", ".otf"):
                continue
            src = metadata.parent / filename
            if not src.is_file():
                raise SystemExit(f"missing font: {src}")
            relative = Path("fonts") / licence_group / metadata.parent.name / filename
            dest = target / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            entries.append({"family": family, "style": style.group(1), "weight": int(weight.group(1)) if weight else 400, "path": relative.as_posix()})
            copied = True
        if copied:
            dest_dir = target / "fonts" / licence_group / metadata.parent.name
            shutil.copy2(metadata, dest_dir / "METADATA.pb")
            notices = [metadata.parent / name for name in ("OFL.txt", "LICENSE.txt", "UFL.txt") if (metadata.parent / name).is_file()]
            if not notices:
                raise SystemExit(f"missing license: {metadata.parent}")
            for notice in notices:
                shutil.copy2(notice, dest_dir / notice.name)
if not entries:
    raise SystemExit("no Google Fonts found")
entries.sort(key=lambda entry: (entry["family"].casefold(), "italic" in entry["style"].casefold(), abs(entry["weight"] - 400), entry["path"]))
target.mkdir(parents=True, exist_ok=True)
(target / "catalog.json").write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
print(f"Copied {len(entries)} font files in {len({entry['family'] for entry in entries})} families")
