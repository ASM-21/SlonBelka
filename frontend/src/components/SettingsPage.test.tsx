import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../lib/api";
import {
  cleanup,
  click,
  getButton,
  getByText,
  getField,
  queryByText,
  render,
  typeInto,
} from "../test/dom";
import SettingsPage from "./SettingsPage";

vi.mock("../lib/api", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  setVacation: vi.fn(),
  exportAccount: vi.fn(),
  deleteAccount: vi.fn(),
  token: { get: vi.fn(), getRefresh: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));
vi.mock("../lib/push", () => ({
  pushSupported: () => false,
  enableReminders: vi.fn(),
}));
vi.mock("../lib/theme", () => ({
  getTheme: () => "system",
  setTheme: vi.fn(),
}));

import { deleteAccount, exportAccount, getSettings, setVacation, token, updateSettings } from "../lib/api";

const settings: Settings = {
  daily_lesson_cap: 10,
  autoplay_audio: false,
  keyboard_layout: "jcuken",
  onboarded: true,
  reminders_enabled: true,
  reminder_hour: -1,
  quiet_hours_enabled: false,
  quiet_hours_start: 22,
  quiet_hours_end: 8,
  session_size: 0,
  frozen: false,
};

const noop = () => {};

function setup(over: Partial<Settings> = {}, onAccountDeleted: () => void = noop) {
  vi.mocked(getSettings).mockResolvedValue({ ...settings, ...over });
  return render(
    <SettingsPage
      onDone={noop}
      onShowLegal={noop}
      onAccountDeleted={onAccountDeleted}
      onReplayOnboarding={noop}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("shows an error state with a working retry", async () => {
    vi.mocked(getSettings)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(settings);
    await render(
      <SettingsPage
        onDone={noop}
        onShowLegal={noop}
        onAccountDeleted={noop}
        onReplayOnboarding={noop}
      />,
    );

    getByText(/Couldn't load settings/);
    await click(getButton("Retry"));
    getByText("Daily lesson limit");
  });

  it("persists a toggled setting and reflects the server response", async () => {
    vi.mocked(updateSettings).mockResolvedValue({ ...settings, autoplay_audio: true });
    await setup();

    const toggle = getButton("Autoplay audio");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await click(toggle);

    expect(updateSettings).toHaveBeenCalledWith({ autoplay_audio: true });
    expect(getButton("Autoplay audio").getAttribute("aria-checked")).toBe("true");
  });

  it("turns vacation mode on through the dedicated endpoint", async () => {
    vi.mocked(setVacation).mockResolvedValue({ frozen: true });
    await setup();

    getByText(/Pause reviews while you're away/);
    await click(getButton("Vacation mode"));

    expect(setVacation).toHaveBeenCalledWith(true);
    getByText(/Reviews are paused/);
  });

  it("reveals quiet hours controls only when enabled", async () => {
    vi.mocked(updateSettings).mockResolvedValue({ ...settings, quiet_hours_enabled: true });
    await setup();

    expect(queryByText(/your local time/)).toBeNull();
    await click(getButton("Quiet hours"));

    expect(updateSettings).toHaveBeenCalledWith({ quiet_hours_enabled: true });
    getField("Quiet hours start");
    getField("Quiet hours end");
  });

  it("requires the password for deletion and reports a wrong one", async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new Error("403: Forbidden"));
    await setup();

    await click(getButton("Delete my account"));
    const confirm = getButton("Permanently delete");
    expect(confirm.disabled).toBe(true);

    await typeInto(getField("confirm your password"), "not-my-password");
    await click(getButton("Permanently delete"));
    getByText(/That password is incorrect/);
  });

  it("clears the session and hands off after a successful deletion", async () => {
    vi.mocked(deleteAccount).mockResolvedValue(undefined);
    const onAccountDeleted = vi.fn();
    await setup({}, onAccountDeleted);

    await click(getButton("Delete my account"));
    await typeInto(getField("confirm your password"), "correct horse");
    await click(getButton("Permanently delete"));

    expect(deleteAccount).toHaveBeenCalledWith("correct horse");
    expect(token.clear).toHaveBeenCalled();
    expect(onAccountDeleted).toHaveBeenCalled();
  });

  it("surfaces an export failure", async () => {
    vi.mocked(exportAccount).mockRejectedValue(new Error("500"));
    await setup();

    await click(getButton("Download my data"));
    getByText(/Export failed/);
  });
});
