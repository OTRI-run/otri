import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import legalPages from './scripts/site/legal-pages.mjs'

function gitInfo() {
  try {
    return {
      commit: execSync('git rev-parse --short HEAD').toString().trim(),
      commitFull: execSync('git rev-parse HEAD').toString().trim(),
      commitDate: execSync('git log -1 --format=%cI').toString().trim(),
    }
  } catch {
    // No .git available at build time (e.g. a tarball deploy) — fall back rather than fail the build.
    return { commit: 'unknown', commitFull: '', commitDate: '' }
  }
}

const { commit, commitFull, commitDate } = gitInfo()

export default defineConfig({
  plugins: [react(), tailwindcss(), legalPages({ commitDate })],
  base: './',
  define: {
    __OTRI_COMMIT__: JSON.stringify(commit),
    __OTRI_COMMIT_FULL__: JSON.stringify(commitFull),
    __OTRI_COMMIT_DATE__: JSON.stringify(commitDate),
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    rollupOptions: {
      input: {
        // The HTML entry points sit where the pages are served; their code lives under prototype/.
        main: resolve(import.meta.dirname, 'index.html'),
        organizer: resolve(import.meta.dirname, 'organizer/index.html'),
        // The calculator for other websites to put in an iframe (see the API page).
        embed: resolve(import.meta.dirname, 'embed/index.html'),
      },
    },
  },
})
