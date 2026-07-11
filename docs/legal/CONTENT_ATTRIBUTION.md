# Content Attribution and Licensing

Slonbelka's vocabulary, definitions, example sentences, and audio draw on open-content sources. Each carries its own attribution and, in some cases, share-alike requirements. This notice exists to satisfy those requirements and to document which terms apply so you don't have to re-check them later.

## Wiktionary

- **License**: CC BY-SA 4.0 (and/or GFDL, depending on the entry's edit history).
- **What we use**: word definitions, glosses, and grammatical data.
- **Requirement**: attribution to Wiktionary and its contributors; any adaptation must be shared under the same or a compatible license (share-alike). This means definitions derived from Wiktionary that you display or export in an adapted form should carry the same CC BY-SA terms.
- **In-app attribution**: include a visible line such as "Definitions include data from Wiktionary, used under CC BY-SA 4.0" on any screen or export that surfaces this content, plus a link to https://www.wiktionary.org.

## Wikimedia Commons (audio)

- **License**: varies by file — commonly CC BY-SA, CC BY, or public domain. Each audio file's license must be checked individually at the point of import.
- **What we use**: pronunciation recordings.
- **Requirement**: attribution to the individual uploader/speaker as listed on the file's Commons page, plus the specific license for that file. Because licenses vary per file, your import pipeline should store the license and attribution string per audio asset, not assume one blanket license for all of them.
- **In-app attribution**: a per-word or per-lesson credits view listing speaker name and license for each audio file used, or a consolidated "Audio credits" page linking back to Commons.

## Tatoeba

- **License**: CC BY 2.0 FR (sentences are individually licensed by their contributors; check per-sentence if reusing at scale).
- **What we use**: example sentences.
- **Requirement**: attribution to Tatoeba and the original sentence contributor.
- **In-app attribution**: a line such as "Example sentences from Tatoeba.org, CC BY 2.0 FR" near example sentences or in a general credits page. The app shows this line under the Examples section of the word detail panel, and the sentence artifact produced by `pipeline/sentences.py` records source and license on every sentence row.

## FrequencyWords (hermitdave / OpenSubtitles)

- **License**: CC BY-SA 4.0 for the frequency lists; the underlying corpus is OpenSubtitles.
- **What we use**: word frequency ordering (which words to teach first). The word list itself, not any subtitle text.
- **Requirement**: attribution to the FrequencyWords project and OpenSubtitles.
- **In-app attribution**: covered by a line on this credits page; no per-word attribution needed since only ranking data is used.

## Azure TTS (generated audio)

- **License**: generated output, no third-party attribution required.
- **What we use**: fallback pronunciation where no native recording exists, and (later) example-sentence audio.
- **Requirement**: none externally, but the app labels TTS audio as generated so learners know it is not a native speaker. The `audio_assets` table records `source = "tts"` for these files and the word detail panel shows "Generated pronunciation (TTS)".

## Practical recommendations

1. **Track license metadata per item**, not just per source. Since Commons audio licenses vary file-by-file, store `license` and `attribution_string` fields alongside each imported asset in your content pipeline (`pipeline/`), not as a global constant.
2. **Add a Credits/Licenses screen** in the app (e.g., Settings → About → Licenses) that lists all three sources with links, so attribution is discoverable even if per-word inline attribution is impractical for a good UX.
3. **Share-alike applies to Wiktionary-derived content specifically.** If you only store facts (a word's gender, part of speech) rather than reproducing Wiktionary's actual prose, share-alike obligations are lighter, but attribution is still expected as a norm in the open-content community.
4. **Re-verify before scaling content import.** These are general summaries of common license terms; verify the actual license tag on each source file/entry you import, since terms can differ from the source's overall reputation.

## Pre-launch review checklist (owner)

Work through this before opening the app to a wider audience:

1. For each Commons audio file in the deck, confirm the license tag and uploader on its file page, and load `license` and `attribution` into the `audio_assets` table (the app surfaces both on the word detail panel automatically once present).
2. Spot-check that every TTS file is recorded with `source = "tts"` so it is labeled as generated, not native.
3. Confirm the Wiktionary-derived fields actually displayed (glosses, grammar data) stay within the facts-not-prose boundary described below, or carry share-alike terms if not.
4. Keep this page reachable from Settings (it already is, via Content licenses and attribution) and re-export the bundled copy in `frontend/src/legal/` whenever this source file changes.
5. Have a lawyer confirm the share-alike scope before any paid launch at scale.

## Disclaimer

This document is not legal advice. It reflects a good-faith summary of standard open-content license terms as commonly applied to these sources. Before a public launch, especially at scale, have a lawyer confirm compliance, particularly around share-alike scope for any Wiktionary-derived content you display or redistribute.
