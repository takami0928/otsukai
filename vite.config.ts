import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

const BUILD_TARGET_BASE_PATHS = {
  'github-pages': '/otsukai/',
  'cloudflare-pages': '/',
} as const

type BuildTarget = keyof typeof BUILD_TARGET_BASE_PATHS

function isBuildTarget(value: string): value is BuildTarget {
  return Object.prototype.hasOwnProperty.call(BUILD_TARGET_BASE_PATHS, value)
}

function isValidBasePath(value: string): boolean {
  return (
    value === '/' ||
    (/^\/(?:[A-Za-z0-9._~-]+\/)+$/.test(value) && !value.includes('//'))
  )
}

function isValidPublicOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    const isLocalHttp =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    return (
      (url.protocol === 'https:' || isLocalHttp) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

export function resolveBuildConfiguration(
  environment: Record<string, string | undefined>,
): { basePath: string; buildTarget?: BuildTarget } {
  const requestedTarget = environment.BUILD_TARGET?.trim() ?? ''
  if (requestedTarget && !isBuildTarget(requestedTarget)) {
    throw new Error(`Unsupported BUILD_TARGET: ${requestedTarget}`)
  }

  const buildTarget = isBuildTarget(requestedTarget)
    ? requestedTarget
    : undefined
  const targetBasePath = buildTarget
    ? BUILD_TARGET_BASE_PATHS[buildTarget]
    : undefined
  const basePath = environment.BASE_PATH?.trim() || targetBasePath || '/'
  if (!isValidBasePath(basePath)) {
    throw new Error(`Invalid BASE_PATH: ${basePath}`)
  }
  if (targetBasePath && basePath !== targetBasePath) {
    throw new Error(
      `BASE_PATH ${basePath} does not match BUILD_TARGET ${buildTarget}.`,
    )
  }

  const publicOrigin = environment.VITE_PUBLIC_APP_ORIGIN?.trim() ?? ''
  if (publicOrigin && !isValidPublicOrigin(publicOrigin)) {
    throw new Error('VITE_PUBLIC_APP_ORIGIN must be an HTTPS origin or local HTTP origin.')
  }

  return {
    basePath,
    ...(buildTarget ? { buildTarget } : {}),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const build = resolveBuildConfiguration(env)

  return {
    base: build.basePath,
    resolve: {
      alias: {
        'cloudflare:workers': fileURLToPath(
          new URL('./worker/test/cloudflareWorkersMock.ts', import.meta.url),
        ),
      },
    },
    plugins: [react()],
    test: {
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/main.tsx',
          'src/vite-env.d.ts',
          'src/data/**',
          'src/testFixtures/**',
          'src/types/**',
        ],
        thresholds: {
          statements: 90,
          branches: 84,
          functions: 93,
          lines: 90,
        },
      },
    },
  }
})
