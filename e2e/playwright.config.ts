import { defineConfig } from "@playwright/test";

// Drives the real stack: the FastAPI backend on sqlite (seeded by the CI
// step) and the built frontend served by vite preview. Playwright starts
// and waits for both servers.
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "python -m uvicorn app.main:app --port 8000",
      cwd: "../backend",
      port: 8000,
      env: {
        DATABASE_URL: "sqlite:///./e2e.db",
        FRONTEND_ORIGIN: "http://localhost:4173",
        JWT_SECRET: "e2e-secret",
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run preview -- --port 4173 --strictPort",
      cwd: "../frontend",
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
