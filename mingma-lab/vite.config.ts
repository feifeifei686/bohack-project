import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [tailwindcss()],
  base: './',
  build: {
    rolldownOptions: {
      input: {
        gallery: entry('./index.html'),
        atmosphere: entry('./versions/atmosphere/index.html'),
        lucid: entry('./versions/lucid/index.html'),
        atelier: entry('./versions/atelier/index.html'),
      },
    },
  },
})
