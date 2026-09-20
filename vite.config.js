import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
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
  plugins: [preact()],
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
    // Remove obsolete HTML entries as well as old assets on rebuild.
    emptyOutDir: true,
    // Country flags load only when displayed, instead of embedding every flag in CSS.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        prototype: resolve(import.meta.dirname, 'prototype/index.html'),
        organizer: resolve(import.meta.dirname, 'prototype/organizer/index.html'),
        // The calculator for other websites to put in an iframe (see the API page).
        embed: resolve(import.meta.dirname, 'prototype/embed/index.html'),
      },
    },
  },
})
