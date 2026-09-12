import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    target: "es2022",
  },
});
