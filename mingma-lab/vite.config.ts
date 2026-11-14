import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [tailwindcss()],
  base: './',
  server: {
    proxy: { '/api': { target: process.env.MINGMA_API_URL || 'http://127.0.0.1:5199', changeOrigin: true } },
  },
  build: {
    rolldownOptions: {
      input: {
        lucid: entry('./index.html'),
        legacyLucid: entry('./versions/lucid/index.html'),
      },
    },
  },
})
