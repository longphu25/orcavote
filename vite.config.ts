import path from "node:path"
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/orcavote/' : '/',
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        orcavote: path.resolve(__dirname, 'orcavote.html'),
      },
      external: ['gsap', 'motion'],
      preserveEntrySignatures: 'exports-only',
      output: {
        globals: {
          gsap: 'gsap',
          motion: 'Motion',
        },
        // Keep plugin entry points at predictable paths (no hash)
        entryFileNames(chunk) {
          if (chunk.name.startsWith('plugins/')) {
            return `assets/${chunk.name}.js`
          }
          return 'assets/[name]-[hash].js'
        },
        manualChunks(id) {
          // Heavy @mysten/* deps → dedicated chunk, loaded only when a Sui plugin is used
          if (id.includes('node_modules/@mysten/')) {
            return 'vendor-mysten'
          }
        },
      },
    },
  },
})
