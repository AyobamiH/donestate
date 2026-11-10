#!/usr/bin/env python3
"""Read-only repository foundation check (Python 3.9+). No Git, HOME, dependencies or network."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = 'docs/KNOWLEDGE-BASE.md'
SKILL = ".agents/skills/secure-api-delivery/"
FILES = ["SKILL.md", "agents/openai.yaml", "assets/icon.svg",
         "references/api-checks.md", "references/delivery-controls.md",
         "references/sources.md"]
MARKER = "<!-- agent-foundations:begin -->"


def fail(message):
    raise ValueError(message)


def checked(relative):
    candidate = ROOT / relative
    for part in [candidate, *candidate.parents]:
        if part == ROOT:
            break
        if part.is_symlink():
            fail("Symlink is not portable: " + str(relative))
    resolved = candidate.resolve()
    if not resolved.is_relative_to(ROOT):
        fail("Reference escapes repository: " + str(relative))
    if not resolved.exists():
        fail("Missing reference: " + str(relative))
    return resolved


def main():
    paths = ["AGENTS.md", KNOWLEDGE, ".agents/validate_foundations.py"]
    paths += [SKILL + file for file in FILES]
    for relative in paths:
        path = checked(relative)
        if not path.is_file() or not path.read_bytes():
            fail("Required file is empty or not a file: " + relative)
    metadata = checked(SKILL + "agents/openai.yaml").read_text()
    for icon in re.findall(r"^  icon_(?:small|large):\s*(\S+)", metadata, re.MULTILINE):
        checked(SKILL + icon)
    instructions = (ROOT / "AGENTS.md").read_text()
    for token in [SKILL + "SKILL.md", KNOWLEDGE, "scope", "not applicable"]:
        if token not in instructions:
            fail("Agent discovery missing: " + token)
    for relative in ["AGENTS.md", KNOWLEDGE] + [SKILL + f for f in FILES if f.endswith(".md")]:
        path = checked(relative)
        content = path.read_text()
        if MARKER in content:
            content = content.split(MARKER, 1)[1].split("<!-- agent-foundations:end -->", 1)[0]
        for target in re.findall(r"\]\(([^) ]+)(?: [^)]*)?\)", content):
            if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
                continue
            target = target.split("#", 1)[0]
            if target:
                checked(path.parent.relative_to(ROOT) / target)
    print("Repository-only agent foundations: PASS")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print("Repository-only agent foundations: FAIL: " + str(error), file=sys.stderr)
        sys.exit(1)
