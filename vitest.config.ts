import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["extensions/web/**/*.test.mjs"],
  },
});
