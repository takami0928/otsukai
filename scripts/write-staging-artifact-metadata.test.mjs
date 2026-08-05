import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createStagingArtifactMetadata,
  main,
} from './write-staging-artifact-metadata.mjs'

const temporaryDirectories = []
const baseEnvironment = {
  SOURCE_COMMIT_SHA: 'a'.repeat(40),
  BUILD_TARGET: 'cloudflare-pages',
  BASE_PATH: '/',
  VITE_PUBLIC_APP_ORIGIN: '',
  VITE_HANDWRITING_IMPORT_ENDPOINT: '',
  VITE_TURNSTILE_SITE_KEY: '',
  VITE_HANDWRITING_IMPORT_ENABLED: 'false',
  VITE_HANDWRITING_DIAGNOSTICS_ENABLED: 'false',
  VITE_PRODUCT_PHOTOS_ENABLED: 'false',
  VITE_LIVE_REQUESTS_ENABLED: 'false',
  VITE_MANUAL_VALIDATION_ENABLED: 'false',
}

afterEach(async () => {
  for (const path of temporaryDirectories.splice(0)) {
    await rm(path, { recursive: true, force: true })
  }
})

describe('staging artifact metadata', () => {
  it('binds a root build to one exact source commit without public configuration', () => {
    expect(createStagingArtifactMetadata(baseEnvironment)).toEqual({
      schemaVersion: 1,
      sourceCommitSha: 'a'.repeat(40),
      buildTarget: 'cloudflare-pages',
      basePath: '/',
      publicAppOriginConfigured: false,
      apiEndpointConfigured: false,
      turnstileSiteKeyConfigured: false,
      featureFlags: {
        handwritingImport: false,
        handwritingDiagnostics: false,
        productPhotos: false,
        liveRequests: false,
        manualValidation: false,
      },
    })
  })

  it.each([
    { SOURCE_COMMIT_SHA: 'main' },
    { BUILD_TARGET: 'github-pages' },
    { BASE_PATH: '/otsukai/' },
    { VITE_PRODUCT_PHOTOS_ENABLED: 'true' },
    { VITE_LIVE_REQUESTS_ENABLED: ' TRUE ' },
    { VITE_HANDWRITING_IMPORT_ENABLED: 'true' },
  ])('rejects an unsafe artifact environment', (override) => {
    expect(() =>
      createStagingArtifactMetadata({
        ...baseEnvironment,
        ...override,
      }),
    ).toThrow()
  })

  it('writes only allowlisted metadata and never serializes environment values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'otsukai-staging-metadata-'))
    temporaryDirectories.push(root)
    const path = join(root, 'dist', 'staging-artifact-metadata.json')
    await main(
      {
        ...baseEnvironment,
        SECRET_SENTINEL: 'must-not-appear',
        VITE_HANDWRITING_IMPORT_ENDPOINT: 'https://worker.example.invalid/',
        VITE_TURNSTILE_SITE_KEY: 'public-site-key',
      },
      path,
    )
    const serialized = await readFile(path, 'utf8')
    expect(serialized).not.toContain('must-not-appear')
    expect(serialized).not.toContain('worker.example.invalid')
    expect(serialized).not.toContain('public-site-key')
    expect(JSON.parse(serialized)).toMatchObject({
      sourceCommitSha: 'a'.repeat(40),
      apiEndpointConfigured: true,
      turnstileSiteKeyConfigured: true,
    })
  })
})
