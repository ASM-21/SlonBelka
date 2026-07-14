import { expect, test } from "@playwright/test";

// The core loop against the real stack: register, skip the tour, see the
// dashboard, open a lesson, leave, log out, log back in. Selectors lean on
// user-visible copy so the test breaks when the user experience does.

const email = `e2e-${Date.now()}@example.com`;
const password = "password123";

test("register, onboard, open a lesson, log out and back in", async ({ page }) => {
  await page.goto("/");

  // The auth screen defaults to log in; switch to sign up.
  await expect(page.getByText("SLONBELKA")).toBeVisible();
  await page.getByRole("button", { name: /New here/ }).click();
  await page.getByPlaceholder(/email/).fill(email);
  await page.getByPlaceholder(/password/).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Create account/ }).click();

  // First run shows the onboarding tour; skip it.
  await expect(page.getByText(/Добро пожаловать/)).toBeVisible();
  await page.getByRole("button", { name: /skip the tour/ }).click();

  // Home renders the hero tiles.
  await expect(page.getByText("Уроки", { exact: true })).toBeVisible();
  await expect(page.getByText("Повторения", { exact: true })).toBeVisible();

  // A lesson opens on the first new-word card (the dev seed provides words).
  await page.getByText("Уроки", { exact: true }).click();
  await expect(page.getByText(/Новое слово 1/)).toBeVisible();
  await page.getByRole("button", { name: "End lesson" }).click();

  // Log out, log back in with the same credentials.
  await page.getByRole("button", { name: /выйти/ }).click();
  await page.getByPlaceholder(/email/).fill(email);
  await page.getByPlaceholder(/password/).fill(password);
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(page.getByText("Уроки", { exact: true })).toBeVisible();
});
