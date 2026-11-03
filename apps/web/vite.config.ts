import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { execSync } from 'node:child_process'
import type { Plugin } from 'vite'

const shouldAnalyze = process.env.ANALYZE === 'true'

function git(args: string) {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    // No git, or no tags yet.
    return null
  }
}

// Identifies each build as release + build time, e.g. "v0.5.0+m3k9x2".
// The release comes from `git describe`: the tag on a tagged commit
// ("v0.5.0"), commits since the last tag otherwise ("v0.5.0-3-gabc1234"),
// or the bare commit before the first tag. The build time makes rebuilding
// the same commit still count as a new version.
function buildInfo() {
  const commit = git('rev-parse --short HEAD') ?? 'local'
  const release = git('describe --tags --always --dirty') ?? commit
  const builtAt = new Date()
  return {
    version: `${release}+${builtAt.getTime().toString(36)}`,
    release,
    commit,
    builtAt: builtAt.toISOString(),
  }
}

// Bakes the build ID into the app and publishes it as /version.json, so an
// open app can tell when a newer build has been deployed. Only `version` is
// compared; the other fields are for people checking what's live.
function appVersion(): Plugin {
  let info: ReturnType<typeof buildInfo> | { version: string } = { version: 'dev' }
  return {
    name: 'app-version',
    config(_, { command }) {
      if (command === 'build') info = buildInfo()
      return { define: { __APP_VERSION__: JSON.stringify(info.version) } }
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(info),
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    appVersion(),
    ...(shouldAnalyze
      ? [
          visualizer({
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
