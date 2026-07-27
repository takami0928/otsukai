import { describe, expect, it } from 'vitest'
import { resolveHandwritingImportConfig } from './config'

describe('resolveHandwritingImportConfig', () => {
  it('enables the feature only when the flag and both public settings exist', () => {
    expect(
      resolveHandwritingImportConfig({
        VITE_HANDWRITING_IMPORT_ENABLED: 'true',
        VITE_HANDWRITING_IMPORT_ENDPOINT:
          'https://import.example.workers.dev/',
        VITE_TURNSTILE_SITE_KEY: 'site-key',
      }),
    ).toEqual({
      enabled: true,
      diagnosticsEnabled: false,
      endpoint: 'https://import.example.workers.dev/',
      turnstileSiteKey: 'site-key',
    })
  })

  it.each([
    {},
    {
      VITE_HANDWRITING_IMPORT_ENABLED: 'false',
      VITE_HANDWRITING_IMPORT_ENDPOINT:
        'https://import.example.workers.dev/',
      VITE_TURNSTILE_SITE_KEY: 'site-key',
    },
    {
      VITE_HANDWRITING_IMPORT_ENABLED: 'true',
      VITE_TURNSTILE_SITE_KEY: 'site-key',
    },
    {
      VITE_HANDWRITING_IMPORT_ENABLED: 'true',
      VITE_HANDWRITING_IMPORT_ENDPOINT:
        'https://import.example.workers.dev/',
    },
    {
      VITE_HANDWRITING_IMPORT_ENABLED: 'true',
      VITE_HANDWRITING_IMPORT_ENDPOINT: 'javascript:alert(1)',
      VITE_TURNSTILE_SITE_KEY: 'site-key',
    },
  ])('stays safely disabled for incomplete or invalid settings', (environment) => {
    expect(resolveHandwritingImportConfig(environment).enabled).toBe(false)
  })

  it('allows an HTTP localhost endpoint for local development', () => {
    expect(
      resolveHandwritingImportConfig({
        VITE_HANDWRITING_IMPORT_ENABLED: 'TRUE',
        VITE_HANDWRITING_IMPORT_ENDPOINT: 'http://localhost:8787/',
        VITE_TURNSTILE_SITE_KEY: 'site-key',
      }).enabled,
    ).toBe(true)
  })

  it('enables diagnostics only for a diagnostic build and a pre-hash query parameter', () => {
    const environment = {
      VITE_HANDWRITING_IMPORT_ENABLED: 'true',
      VITE_HANDWRITING_DIAGNOSTICS_ENABLED: 'true',
      VITE_HANDWRITING_IMPORT_ENDPOINT:
        'https://import.example.workers.dev/',
      VITE_TURNSTILE_SITE_KEY: 'site-key',
    }
    expect(
      resolveHandwritingImportConfig(
        environment,
        'https://takami0928.github.io/otsukai/?handwritingDiagnostics=1#/create',
      ).diagnosticsEnabled,
    ).toBe(true)
    expect(
      resolveHandwritingImportConfig(
        environment,
        'https://takami0928.github.io/otsukai/#/create?handwritingDiagnostics=1',
      ).diagnosticsEnabled,
    ).toBe(false)
    expect(
      resolveHandwritingImportConfig(
        {
          ...environment,
          VITE_HANDWRITING_DIAGNOSTICS_ENABLED: 'false',
        },
        'https://takami0928.github.io/otsukai/?handwritingDiagnostics=1#/create',
      ).diagnosticsEnabled,
    ).toBe(false)
  })

  it('keeps diagnostics disabled for an invalid location URL', () => {
    expect(
      resolveHandwritingImportConfig(
        {
          VITE_HANDWRITING_DIAGNOSTICS_ENABLED: 'true',
        },
        'not a url',
      ).diagnosticsEnabled,
    ).toBe(false)
  })
})
