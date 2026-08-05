import { describe, expect, it } from 'vitest'
import { resolveBuildConfiguration } from './vite.config'

describe('Vite build target configuration', () => {
  it.each([
    ['github-pages', '/otsukai/'],
    ['cloudflare-pages', '/'],
  ])('maps %s to %s', (buildTarget, basePath) => {
    expect(resolveBuildConfiguration({ BUILD_TARGET: buildTarget })).toEqual({
      buildTarget,
      basePath,
    })
  })

  it('preserves the current root default and a valid explicit legacy base', () => {
    expect(resolveBuildConfiguration({})).toEqual({ basePath: '/' })
    expect(resolveBuildConfiguration({ BASE_PATH: '/otsukai/' })).toEqual({
      basePath: '/otsukai/',
    })
  })

  it.each([
    { BUILD_TARGET: 'unknown' },
    { BUILD_TARGET: 'github-pages', BASE_PATH: '/' },
    { BUILD_TARGET: 'cloudflare-pages', BASE_PATH: '/otsukai/' },
    { BASE_PATH: 'otsukai/' },
    { BASE_PATH: '/otsukai' },
    { BASE_PATH: '/otsukai//' },
    { VITE_PUBLIC_APP_ORIGIN: 'https://example.test/path' },
    { VITE_PUBLIC_APP_ORIGIN: 'http://example.test/' },
    { VITE_PUBLIC_APP_ORIGIN: 'javascript:alert(1)' },
  ])('rejects invalid or contradictory build configuration', (environment) => {
    expect(() => resolveBuildConfiguration(environment)).toThrow()
  })

  it('accepts an HTTPS origin or local HTTP origin without selecting a future domain', () => {
    expect(() =>
      resolveBuildConfiguration({
        VITE_PUBLIC_APP_ORIGIN: 'https://app.example.test/',
      }),
    ).not.toThrow()
    expect(() =>
      resolveBuildConfiguration({
        VITE_PUBLIC_APP_ORIGIN: 'http://localhost:5173/',
      }),
    ).not.toThrow()
  })
})
