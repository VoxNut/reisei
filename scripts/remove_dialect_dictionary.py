"""Remove 全国方言辞典 from Senren notes through AnkiConnect.

Requires beautifulsoup4. Defaults to a dry run; --apply requires a new local
--backup JSON path. Keep that backup outside Git and sync Anki after applying.
"""

import argparse
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup


DICTIONARY = "全国方言辞典"
QUERY = f'note:Senren+ "{DICTIONARY}"'


def remove_dictionary(html):
    soup = BeautifulSoup(html, "html.parser")
    removed = soup.select(f'li[data-dictionary="{DICTIONARY}"]')
    if not removed:
        return html, 0

    for entry in removed:
        # Broken exports can leave the dialect definition beside its entry.
        sibling = entry.find_next_sibling()
        while sibling is not None and sibling.name == "li" and not sibling.has_attr("data-dictionary"):
            following = sibling.find_next_sibling()
            sibling.decompose()
            sibling = following
        entry.decompose()

    entries = soup.select("li[data-dictionary]")
    if any(entry.find_parent("li", attrs={"data-dictionary": True}) for entry in entries):
        raise ValueError("Nested dictionary entries need manual inspection")
    original_entries = [str(entry) for entry in entries]
    original_wrapper = soup.find("div", class_="yomitan-glossary")
    wrapper = soup.new_tag("div", attrs=dict(original_wrapper.attrs) if original_wrapper else {"class": "yomitan-glossary"})
    listing = soup.new_tag("ol")
    wrapper.append(listing)
    for entry in entries:
        listing.append(entry.extract())

    styles = [style.extract() for style in soup.find_all("style")]
    if soup.get_text(strip=True) or soup.find(["img", "audio", "video", "script", "iframe", "table"]):
        raise ValueError("Unassigned glossary content would be lost; refusing to change it")
    if [str(entry) for entry in listing.find_all("li", recursive=False)] != original_entries:
        raise ValueError("A remaining dictionary entry changed")
    return "".join(map(str, styles)) + str(wrapper), len(removed)


def anki(action, **params):
    payload = json.dumps({"action": action, "version": 6, "params": params}).encode("utf-8")
    request = Request("http://127.0.0.1:8765", data=payload, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    if result["error"]:
        raise RuntimeError(result["error"])
    return result["result"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup", type=Path)
    args = parser.parse_args()
    if args.apply and args.backup is None:
        parser.error("--apply requires --backup pointing to a new local JSON file")

    ids = anki("findNotes", query=QUERY)
    notes = anki("notesInfo", notes=ids) if ids else []
    changes = []
    for note in notes:
        original, updated, count = {}, {}, 0
        for name in ("glossary", "definition", "selectionText"):
            value = note["fields"].get(name, {}).get("value", "")
            if DICTIONARY not in value:
                continue
            cleaned, removed = remove_dictionary(value)
            if removed:
                original[name], updated[name] = value, cleaned
                count += removed
        if updated:
            changes.append({"id": note["noteId"], "word": note["fields"]["word"]["value"], "original": original, "updated": updated})
            print(f'{note["noteId"]} {note["fields"]["word"]["value"]}: remove {count} entries')

    if not args.apply or not changes:
        print(f'{len(changes)} notes; {"nothing to apply" if not changes else "dry run only"}')
        return

    with args.backup.open("x", encoding="utf-8") as backup:
        json.dump({"dictionary": DICTIONARY, "notes": changes}, backup, ensure_ascii=False, indent=2)

    for change in changes:
        current = anki("notesInfo", notes=[change["id"]])[0]
        if any(current["fields"][name]["value"] != value for name, value in change["original"].items()):
            raise RuntimeError(f'Note {change["id"]} changed since the backup; stopping')
        anki("updateNoteFields", note={"id": change["id"], "fields": change["updated"]})
        verified = anki("notesInfo", notes=[change["id"]])[0]
        if any(verified["fields"][name]["value"] != value for name, value in change["updated"].items()):
            raise RuntimeError(f'Note {change["id"]} did not pass readback verification')
    print(f"Updated and verified {len(changes)} notes. Backup: {args.backup}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
