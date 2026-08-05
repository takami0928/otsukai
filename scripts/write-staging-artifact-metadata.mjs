import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

function enabled(value) {
  return String(value).trim().toLowerCase() === 'true'
}

export function createStagingArtifactMetadata(environment) {
  const sourceCommitSha = environment.SOURCE_COMMIT_SHA ?? ''
  if (!/^[0-9a-f]{40}$/u.test(sourceCommitSha)) {
    throw new Error('SOURCE_COMMIT_SHA must be an exact lowercase commit SHA.')
  }
  if (
    environment.BUILD_TARGET !== 'cloudflare-pages' ||
    environment.BASE_PATH !== '/'
  ) {
    throw new Error('The staging artifact must be a Cloudflare Pages root build.')
  }

  const featureFlags = {
    handwritingImport: enabled(environment.VITE_HANDWRITING_IMPORT_ENABLED),
    handwritingDiagnostics: enabled(
      environment.VITE_HANDWRITING_DIAGNOSTICS_ENABLED,
    ),
    productPhotos: enabled(environment.VITE_PRODUCT_PHOTOS_ENABLED),
    liveRequests: enabled(environment.VITE_LIVE_REQUESTS_ENABLED),
    manualValidation: enabled(environment.VITE_MANUAL_VALIDATION_ENABLED),
  }
  if (Object.values(featureFlags).some(Boolean)) {
    throw new Error('Normal staging artifact feature flags must remain disabled.')
  }

  return {
    schemaVersion: 1,
    sourceCommitSha,
    buildTarget: 'cloudflare-pages',
    basePath: '/',
    publicAppOriginConfigured: Boolean(
      environment.VITE_PUBLIC_APP_ORIGIN?.trim(),
    ),
    apiEndpointConfigured: Boolean(
      environment.VITE_HANDWRITING_IMPORT_ENDPOINT?.trim(),
    ),
    turnstileSiteKeyConfigured: Boolean(
      environment.VITE_TURNSTILE_SITE_KEY?.trim(),
    ),
    featureFlags,
  }
}

export async function main(
  environment = process.env,
  outputPath = fileURLToPath(
    new URL('../dist/staging-artifact-metadata.json', import.meta.url),
  ),
) {
  const metadata = createStagingArtifactMetadata(environment)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  return metadata
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Command failed.')
    process.exitCode = 1
  })
}
