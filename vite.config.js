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
    // Ensure navigation routes return index.html, but not for static assets
    historyApiFallback: {
      rewrites: [
        { from: /^\/test_files\/.*/, to: context => context.parsedUrl.pathname }
      ]
    },
    proxy: {
      '/scriptshifter': {
        target: 'https://quartz.bibframe.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/scriptshifter/, '/scriptshifter')
      },
      // mcp4rdf-core controller runs on port 5050 (docker-compose maps 5050:5000)
      '/mcp4rdf': {
        target: 'http://localhost:5050',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mcp4rdf/, '')
      },
      // Wikibase proxy - handles cross-origin cookies for authentication
      '/wikibase-api': {
        target: 'https://vibe.bibframe.wiki',
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: 'localhost',
        rewrite: (path) => path.replace(/^\/wikibase-api/, '/w/api.php'),
        configure: (proxy, options) => {
          // Add browser-like headers to avoid bot detection
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            proxyReq.setHeader('Accept', 'application/json, text/plain, */*');
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
            proxyReq.setHeader('Origin', 'https://vibe.bibframe.wiki');
            proxyReq.setHeader('Referer', 'https://vibe.bibframe.wiki/');
            console.log('[Vite Proxy] Proxying:', req.method, req.url, '-> ', proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[Vite Proxy] Response:', proxyRes.statusCode);
          });
        }
      }
    }
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