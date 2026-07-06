<!-- Copied from docs/legal/CONTENT_ATTRIBUTION.md. Keep in sync when the source changes. -->

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
- **In-app attribution**: a line such as "Example sentences from Tatoeba.org, CC BY 2.0 FR" near example sentences or in a general credits page.

## Practical recommendations

1. **Track license metadata per item**, not just per source. Since Commons audio licenses vary file-by-file, store `license` and `attribution_string` fields alongside each imported asset in your content pipeline (`pipeline/`), not as a global constant.
2. **Add a Credits/Licenses screen** in the app (e.g., Settings → About → Licenses) that lists all three sources with links, so attribution is discoverable even if per-word inline attribution is impractical for a good UX.
3. **Share-alike applies to Wiktionary-derived content specifically.** If you only store facts (a word's gender, part of speech) rather than reproducing Wiktionary's actual prose, share-alike obligations are lighter, but attribution is still expected as a norm in the open-content community.
4. **Re-verify before scaling content import.** These are general summaries of common license terms; verify the actual license tag on each source file/entry you import, since terms can differ from the source's overall reputation.

## Disclaimer

This document is not legal advice. It reflects a good-faith summary of standard open-content license terms as commonly applied to these sources. Before a public launch, especially at scale, have a lawyer confirm compliance, particularly around share-alike scope for any Wiktionary-derived content you display or redistribute.
