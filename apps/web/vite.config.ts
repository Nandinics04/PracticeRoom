import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "kokoro-js", replacement: fileURLToPath(new URL("./node_modules/kokoro-js/dist/kokoro.web.js", import.meta.url)) },
      { find: /^pdfjs-dist$/, replacement: fileURLToPath(new URL("./node_modules/pdfjs-dist/build/pdf.mjs", import.meta.url)) },
    ],
  },
  worker: { format: "es" },
  build: { target: "esnext" },
  optimizeDeps: { exclude: ["kokoro-js"] },
})
