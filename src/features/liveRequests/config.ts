export type LiveRequestConfig = {
  enabled: boolean
}

type LiveRequestEnvironment = {
  VITE_LIVE_REQUESTS_ENABLED?: string
}

export function resolveLiveRequestConfig(
  environment: LiveRequestEnvironment,
): LiveRequestConfig {
  return {
    enabled:
      environment.VITE_LIVE_REQUESTS_ENABLED?.trim().toLowerCase() ===
      'true',
  }
}
