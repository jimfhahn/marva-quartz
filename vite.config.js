import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/',
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      'vue-i18n': 'vue-i18n/dist/vue-i18n.cjs.js',
    },
    dedupe: ['vue'] // Ensure Vue is deduplicated
  },
  server: {
    // Ensure navigation routes return index.html
    historyApiFallback: true
    // Removed global headers setting to allow correct MIME types for JS modules.
  },
  optimizeDeps: {
    exclude: ['fsevents']
  },
  build: {
    rollupOptions: {
      external: ['fsevents']
    },
    sourcemap: true, // Add source maps to help with debugging
    commonjsOptions: {
      strictRequires: true // Helps prevent duplicate module imports
    }
  }
});