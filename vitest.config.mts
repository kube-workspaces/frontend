import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/components/**/*.test.tsx", "src/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    env: { NEXT_PUBLIC_API_URL: "" },
    restoreMocks: true,
  },
});
