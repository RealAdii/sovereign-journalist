import { defineConfig } from "@playwright/test";

// UI flow tests with a mocked backend for the routes that need secrets or
// Sepolia. They prove the browser flow, not a Sepolia publication.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3400", trace: "retain-on-failure" },
  webServer: {
    command: "npx next dev -p 3400",
    url: "http://localhost:3400/api/attestation",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "development",
      NEXT_PUBLIC_STARKNET_NETWORK: "sepolia",
      NEXT_PUBLIC_STARKNET_CHAIN_ID: "SN_SEPOLIA",
      ALLOW_DEV_WITHOUT_PRIVATE_BOND: "true",
      SESSION_SECRET: "e2e-session-secret-0123456789abcdef0123456789",
      RATE_LIMIT_SECRET: "e2e-rate-limit-secret-0123456789abcdef0123456",
    },
  },
});
