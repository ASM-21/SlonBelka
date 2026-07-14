"""Sentence-stage unit tests on tiny inline fixtures. No network, no files."""

from __future__ import annotations

import sentences as s


RUS = {
    1: "Я люблю хлеб.",
    2: "Хлеб на столе.",
    3: "Это хлебница.",  # substring, must not match "хлеб"
    4: "Всё хорошо.",
    5: "Все хорошо.",  # е spelling of ё word
    6: "Очень очень очень длинное предложение про хлеб, которое никак не должно пройти лимит длины по умолчанию.",
    7: "Хлеб без перевода.",  # no English translation linked
}
ENG = {
    101: "I love bread.",
    102: "The bread is on the table.",
    103: "That is a bread box.",
    104: "Everything is fine.",
    105: "All good.",
    106: "A very long sentence about bread.",
}
LINKS = [(1, 101), (2, 102), (3, 103), (4, 104), (5, 105), (6, 106)]

TRANSLATIONS = s.build_translation_map(LINKS, ENG)


def _select(items, **kwargs):
    return s.select_sentences(items, RUS, TRANSLATIONS, **kwargs)


def test_word_boundary_no_substring_match():
    records = _select([{"external_id": "noun:хлеб:0", "lemma": "хлеб"}])
    refs = {r["source_ref"] for r in records}
    assert "tatoeba:3" not in refs  # хлебница is not хлеб
    assert refs <= {"tatoeba:1", "tatoeba:2"}
    assert len(records) == 2


def test_yo_folding_matches_both_spellings():
    records = _select([{"external_id": "adv:всё:0", "lemma": "всё"}], per_lemma=5)
    refs = {r["source_ref"] for r in records}
    assert refs == {"tatoeba:4", "tatoeba:5"}


def test_requires_english_translation():
    records = _select([{"external_id": "noun:хлеб:0", "lemma": "хлеб"}], per_lemma=10)
    refs = {r["source_ref"] for r in records}
    assert "tatoeba:7" not in refs


def test_length_cap_and_per_lemma_cap():
    records = _select([{"external_id": "noun:хлеб:0", "lemma": "хлеб"}], per_lemma=10)
    refs = {r["source_ref"] for r in records}
    assert "tatoeba:6" not in refs  # over the default 80-char cap
    shortest = _select([{"external_id": "noun:хлеб:0", "lemma": "хлеб"}], per_lemma=1)
    assert [r["source_ref"] for r in shortest] == ["tatoeba:1"]  # shortest wins


def test_record_and_artifact_shape():
    records = _select([{"external_id": "noun:хлеб:0", "lemma": "хлеб"}], per_lemma=1)
    rec = records[0]
    assert rec == {
        "item_external_id": "noun:хлеб:0",
        "source_ref": "tatoeba:1",
        "ru_text": "Я люблю хлеб.",
        "en_text": "I love bread.",
        "source": "tatoeba",
        "license": "CC-BY 2.0 FR",
    }
    artifact = s.build_artifact(records)
    assert artifact["version"] == 1
    assert artifact["attribution"].startswith("Sentences from Tatoeba")
    assert artifact["sentences"] == records


def test_translation_map_takes_first():
    links = [(1, 101), (1, 102)]
    assert s.build_translation_map(links, ENG)[1] == "I love bread."


def test_tsv_readers(tmp_path):
    sf = tmp_path / "sentences.tsv"
    sf.write_text("1\trus\tПривет.\n2\teng\tHello.\nbad line\n", encoding="utf-8")
    assert s.read_sentences_tsv(str(sf), "rus") == {1: "Привет."}
    assert s.read_sentences_tsv(str(sf), "eng") == {2: "Hello."}

    lf = tmp_path / "links.csv"
    lf.write_text("1\t2\nnot\tnumbers\n3\t4\n", encoding="utf-8")
    assert s.read_links_tsv(str(lf)) == [(1, 2), (3, 4)]
