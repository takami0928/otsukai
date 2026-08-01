export type LiveRequestConfig = {
  enabled: boolean
  endpoint: string
  turnstileSiteKey: string
}

type LiveRequestEnvironment = {
  VITE_LIVE_REQUESTS_ENABLED?: string
  VITE_HANDWRITING_IMPORT_ENDPOINT?: string
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

export function resolveLiveRequestConfig(
  environment: LiveRequestEnvironment,
): LiveRequestConfig {
  const endpoint =
    environment.VITE_HANDWRITING_IMPORT_ENDPOINT?.trim() ?? ''
  const turnstileSiteKey =
    environment.VITE_TURNSTILE_SITE_KEY?.trim() ?? ''
  return {
    enabled:
      environment.VITE_LIVE_REQUESTS_ENABLED?.trim().toLowerCase() ===
        'true' &&
      isAllowedEndpoint(endpoint) &&
      Boolean(turnstileSiteKey),
    endpoint,
    turnstileSiteKey,
  }
}

export function getLiveRequestConfig(): LiveRequestConfig {
  return resolveLiveRequestConfig(import.meta.env)
}
