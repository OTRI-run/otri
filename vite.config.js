import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

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
  plugins: [react(), tailwindcss()],
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
        main: resolve(import.meta.dirname, 'index.html'),
        prototype: resolve(import.meta.dirname, 'prototype/index.html'),
        organizer: resolve(import.meta.dirname, 'prototype/organizer/index.html'),
      },
    },
  },
})
