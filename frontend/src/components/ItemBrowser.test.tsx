import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemDetail, ItemSummary, LevelSummary } from "../lib/api";
import {
  cleanup,
  click,
  getButton,
  getByText,
  getField,
  queryByText,
  render,
  typeInto,
  wait,
} from "../test/dom";
import ItemBrowser from "./ItemBrowser";

vi.mock("../lib/api", () => ({
  getLevels: vi.fn(),
  browseItems: vi.fn(),
  getItem: vi.fn(),
  addSynonym: vi.fn(),
  removeSynonym: vi.fn(),
  resurrect: vi.fn(),
}));

import { addSynonym, browseItems, getItem, getLevels, removeSynonym, resurrect } from "../lib/api";

const levels: LevelSummary[] = [
  { level: 1, total: 50, guru: 12, threshold: 45, cleared: false, accessible: true, current: true },
  { level: 2, total: 50, guru: 0, threshold: 45, cleared: false, accessible: false, current: false },
];

const summary = (id: number, over: Partial<ItemSummary> = {}): ItemSummary => ({
  id,
  lemma: `слово${id}`,
  stressed_form: `сло́во${id}`,
  translation_primary: `word ${id}`,
  part_of_speech: "noun",
  level: 1,
  status: "apprentice",
  is_leech: false,
  accessible: true,
  ...over,
});

const detail: ItemDetail = {
  ...summary(1, { status: "burned" }),
  translations: ["word 1"],
  synonyms: ["term"],
  ipa: "slova",
  sentences: [{ ru: "Это слово.", en: "This is a word." }],
  mnemonic: null,
  state: {
    srs_stage: 9,
    srs_band: "burned",
    correct_count: 20,
    incorrect_count: 2,
    correct_streak: 8,
    is_leech: false,
    leech_score: 0,
  },
};

const page = (items: ItemSummary[], total = items.length) => ({
  total,
  limit: 50,
  offset: 0,
  items,
});

function setup() {
  vi.mocked(getLevels).mockResolvedValue(levels);
  return render(<ItemBrowser onDone={() => {}} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ItemBrowser", () => {
  it("shows the level grid with locked levels marked", async () => {
    vi.mocked(browseItems).mockResolvedValue(page([]));
    await setup();

    getByText(/Росток · Sprout/);
    getByText("12/50"); // accessible level progress
    getByText(/🔒 50/); // locked level shows a lock, not progress
  });

  it("opens a level's word list from the grid", async () => {
    vi.mocked(browseItems).mockResolvedValue(page([summary(1)]));
    await setup();

    await click(getByText("12/50")); // the level 1 tile
    getByText("сло́во1");
    getByText("1 words");
    const last = vi.mocked(browseItems).mock.calls.at(-1)![0];
    expect(last).toMatchObject({ level: 1, limit: 50, offset: 0 });
  });

  it("searches after the debounce and switches to the list view", async () => {
    vi.mocked(browseItems).mockResolvedValue(page([summary(3)]));
    await setup();

    await typeInto(getField(/search word or meaning/), "сло");
    await wait(300); // past the 250ms debounce
    getByText("сло́во3");
    const last = vi.mocked(browseItems).mock.calls.at(-1)![0];
    expect(last).toMatchObject({ search: "сло" });
  });

  it("loads the next page and appends it", async () => {
    const first = Array.from({ length: 50 }, (_, i) => summary(i + 1));
    vi.mocked(browseItems)
      .mockResolvedValueOnce(page(first, 51))
      .mockResolvedValueOnce({ total: 51, limit: 50, offset: 50, items: [summary(51)] });
    await setup();

    await click(getButton(/Все слова/));
    getByText("сло́во1");
    expect(queryByText("сло́во51")).toBeNull();

    await click(getButton("Load more"));
    getByText("сло́во51");
    const last = vi.mocked(browseItems).mock.calls.at(-1)![0];
    expect(last).toMatchObject({ offset: 50 });
  });

  it("shows word details with synonyms, resurrect, and progress", async () => {
    vi.mocked(browseItems).mockResolvedValue(page([summary(1, { status: "burned" })]));
    vi.mocked(getItem).mockResolvedValue(detail);
    vi.mocked(addSynonym).mockResolvedValue({ synonyms: ["term", "extra"] });
    vi.mocked(removeSynonym).mockResolvedValue({ synonyms: ["extra"] });
    vi.mocked(resurrect).mockResolvedValue({ item_id: 1, srs_stage: 4 });
    await setup();

    await click(getByText("12/50"));
    await click(getByText("сло́во1"));

    getByText("Это слово.");
    getByText("term");

    await typeInto(getField("add a synonym"), "extra");
    await click(getButton("Add"));
    expect(addSynonym).toHaveBeenCalledWith(1, "extra");
    getByText("extra");

    await click(getButton("remove term"));
    expect(removeSynonym).toHaveBeenCalledWith(1, "term");
    expect(queryByText(/^term$/)).toBeNull();

    await click(getButton("Resurrect"));
    expect(resurrect).toHaveBeenCalledWith(1);
    expect(getItem).toHaveBeenCalledTimes(2); // the detail refetches after resurrect
  });
});
