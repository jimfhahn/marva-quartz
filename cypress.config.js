const { defineConfig } = require("cypress");

// Allow overriding baseUrl via env; default to local preview used by test:e2e
const baseUrl = process.env.CYPRESS_BASE_URL || "http://localhost:4173";

module.exports = defineConfig({
  e2e: {
    specPattern: "cypress/e2e/**/*.{cy,spec}.{js,jsx,ts,tsx}",
    baseUrl,
  },
});
