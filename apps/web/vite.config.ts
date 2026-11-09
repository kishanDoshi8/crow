import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { execSync } from 'node:child_process'
import type { Plugin } from 'vite'

const shouldAnalyze = process.env.ANALYZE === 'true'
// Release builds upload source maps to Sentry so error reports show real
// file names and lines. Needs SENTRY_AUTH_TOKEN, SENTRY_ORG and
// SENTRY_PROJECT; without them nothing is generated or uploaded.
const uploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
)

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
  // compared; `assets` is for the service worker, the rest for people
  // checking what's live.
  // Third-party code in a few long-lived chunks: it rarely changes between
// releases, so after a deploy returning players only download the app's own
// code. Animation code is left to Rollup: grouping it would pull the lazily
// loaded animation features back into the first download.
const VENDOR_CHUNKS: Array<[chunk: string, packages: RegExp]> = [
  ['react', /node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//],
  ['supabase', /node_modules\/@supabase\//],
  ['query', /node_modules\/@tanstack\//],
  ['ui', /node_modules\/(@radix-ui|@base-ui-components|@base-ui|@floating-ui|vaul|sonner|embla-carousel[^/]*|react-remove-scroll[^/]*|lucide-react|tailwind-merge|clsx|class-variance-authority)\//],
]

function vendorChunk(id: string) {
  return VENDOR_CHUNKS.find(([, packages]) => packages.test(id))?.[0]
}

function appVersion(info: ReturnType<typeof buildInfo> | { version: string }): Plugin {
    return {
      name: 'app-version',
      config() {
        return { define: { __APP_VERSION__: JSON.stringify(info.version) } }
      },
      generateBundle(_options, bundle) {
        // Every file of this build, for the service worker to keep a copy of
        // so the app opens offline (public/sw.js). Source maps are never served.
        const assets = Object.keys(bundle)
          .filter((file) => !file.endsWith('.map'))
          .map((file) => `/${file}`)
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ ...info, assets }),
        })
      },
    }
  }

  export default defineConfig(({ command }) => {
    const info = command === 'build' ? buildInfo() : { version: 'dev' }
    return {
    build: {
      // "hidden": maps are made for the upload but browsers aren't pointed at them.
      sourcemap: uploadSourceMaps ? 'hidden' : false,
      rollupOptions: {
        output: { manualChunks: vendorChunk },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      appVersion(info),
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
      ...(uploadSourceMaps
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              // Matches the release the app reports with (__APP_VERSION__).
              release: { name: info.version },
              // Never served: deleted once uploaded.
              sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
              telemetry: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: { '@': '/src' },
    },
  }
})
