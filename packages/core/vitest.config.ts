import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    alias: {
      "@aegis/types": path.resolve(__dirname, "../types/src"),
    },
  },
});
