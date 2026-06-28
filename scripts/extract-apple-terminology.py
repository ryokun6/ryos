#!/usr/bin/env python3
"""Regenerate the ryOS terminology table from AppleGlot macOS glossaries."""

from __future__ import annotations

import argparse
import collections
import glob
import hashlib
import json
import os
import plistlib
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Counter


SCRIPT_DIR = Path(__file__).resolve().parent
TERMS_FILE = SCRIPT_DIR / "apple-ui-terminology-terms.json"
OUTPUT_FILE = SCRIPT_DIR / "apple-ui-terminology-data.ts"

PACKAGES = {
    "fr": "French.dmg",
    "de": "German.dmg",
    "es": "Spanish.dmg",
    "it": "Italian.dmg",
    "ja": "Japanese.dmg",
    "ko": "Korean.dmg",
    "pt": "Brazilian.dmg",
    "ru": "Russian.dmg",
    "zh-TW": "Traditional_Chinese.dmg",
}

LOCALE_ORDER = ["zh-TW", "ja", "ko", "fr", "de", "es", "pt", "it", "ru"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def attach(dmg: Path) -> tuple[Path, str]:
    process = subprocess.run(
        [
            "hdiutil",
            "attach",
            "-readonly",
            "-nobrowse",
            "-plist",
            str(dmg),
        ],
        check=True,
        capture_output=True,
    )
    data = plistlib.loads(process.stdout)
    entities = data.get("system-entities", [])
    mount_point = next(
        entity.get("mount-point")
        for entity in entities
        if entity.get("mount-point")
    )
    device = next(
        entity.get("dev-entry")
        for entity in reversed(entities)
        if entity.get("dev-entry")
    )
    return Path(mount_point), device


def detach(device: str) -> None:
    subprocess.run(
        ["hdiutil", "detach", device],
        check=False,
        capture_output=True,
    )


def extract_locale(
    *,
    dmg: Path,
    terms: set[str],
) -> dict[str, Counter[str]]:
    mount_point, device = attach(dmg)
    counts = {term: collections.Counter() for term in terms}

    try:
        pattern = os.path.join(mount_point, "**", "*.lg")
        for path in sorted(glob.iglob(pattern, recursive=True)):
            try:
                document = ET.parse(path)
            except ET.ParseError:
                continue

            for translation_set in document.iter("TranslationSet"):
                base = translation_set.find("base")
                translation = translation_set.find("tran")
                if base is None or translation is None:
                    continue

                english = "".join(base.itertext())
                if english not in counts:
                    continue

                localized = "".join(translation.itertext()).strip()
                if not localized:
                    continue
                counts[english][localized] += 1
    finally:
        detach(device)

    return counts


def render_typescript(
    *,
    terminology: dict[str, dict[str, str]],
    hashes: dict[str, str],
) -> str:
    hashes_json = json.dumps(hashes, ensure_ascii=False, indent=2)
    terminology_json = json.dumps(terminology, ensure_ascii=False, indent=2)
    return f"""/**
 * Generated from Apple's downloaded macOS localization glossaries.
 *
 * Source packages: Brazilian, French, German, Italian, Japanese, Korean,
 * Russian, Spanish, and Traditional Chinese. English keys are Apple's base
 * strings; localized values are the dominant trimmed exact-match translations.
 * Regenerate with `bun run i18n:apple-glossary`.
 */

export const APPLE_GLOSSARY_SOURCE_SHA256 = {hashes_json} as const;

export const RAW_APPLE_UI_TERMINOLOGY = {terminology_json} as const;
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--glossary-dir",
        type=Path,
        default=Path.home() / "Downloads" / "Glossaries",
    )
    args = parser.parse_args()

    terms = json.loads(TERMS_FILE.read_text())
    term_set = set(terms)
    if len(term_set) != len(terms):
        raise ValueError(f"{TERMS_FILE} contains duplicate terms")

    package_paths = {
        locale: args.glossary_dir / filename
        for locale, filename in PACKAGES.items()
    }
    missing_packages = [
        str(path) for path in package_paths.values() if not path.is_file()
    ]
    if missing_packages:
        raise FileNotFoundError(
            "Missing Apple glossary packages:\n" + "\n".join(missing_packages)
        )

    extracted = {
        locale: extract_locale(dmg=path, terms=term_set)
        for locale, path in package_paths.items()
    }

    terminology: dict[str, dict[str, str]] = {}
    for term in terms:
        terminology[term] = {}
        for locale in LOCALE_ORDER:
            counts = extracted[locale][term]
            if not counts:
                raise ValueError(f'No "{term}" entry in {PACKAGES[locale]}')

            localized, top_count = min(
                counts.items(),
                key=lambda item: (-item[1], item[0]),
            )
            terminology[term][locale] = localized
            total = sum(counts.values())
            confidence = top_count / total
            if confidence < 0.8:
                print(
                    f'warning: "{term}" in {locale} has '
                    f"{confidence:.0%} dominant-term confidence"
                )

    hashes = {
        PACKAGES[locale]: sha256(package_paths[locale])
        for locale in LOCALE_ORDER
    }
    OUTPUT_FILE.write_text(
        render_typescript(terminology=terminology, hashes=hashes)
    )
    print(f"Wrote {len(terms)} Apple terms to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
