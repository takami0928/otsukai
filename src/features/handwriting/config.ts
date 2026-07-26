export type HandwritingImportConfig = {
  enabled: boolean
  endpoint: string
  turnstileSiteKey: string
}

type HandwritingEnvironment = {
  VITE_HANDWRITING_IMPORT_ENABLED?: string
  VITE_OCR_ENDPOINT?: string
  VITE_TURNSTILE_SITE_KEY?: string
}

function isAllowedEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
    )
  } catch {
    return false
  }
}

export function resolveHandwritingImportConfig(
  environment: HandwritingEnvironment,
): HandwritingImportConfig {
  const endpoint = environment.VITE_OCR_ENDPOINT?.trim() ?? ''
  const turnstileSiteKey =
    environment.VITE_TURNSTILE_SITE_KEY?.trim() ?? ''
  const requested =
    environment.VITE_HANDWRITING_IMPORT_ENABLED?.trim().toLowerCase() ===
    'true'

  return {
    enabled:
      requested &&
      Boolean(turnstileSiteKey) &&
      isAllowedEndpoint(endpoint),
    endpoint,
    turnstileSiteKey,
  }
}

export function getHandwritingImportConfig(): HandwritingImportConfig {
  return resolveHandwritingImportConfig(import.meta.env)
}
