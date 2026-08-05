type ApplicationEnvironment = {
  BASE_URL?: string
  VITE_PUBLIC_APP_ORIGIN?: string
}

function validBasePath(value: string): string | undefined {
  return value === '/' ||
    (/^\/(?:[A-Za-z0-9._~-]+\/)+$/u.test(value) && !value.includes('//'))
    ? value
    : undefined
}

function validPublicOrigin(value: string): string | undefined {
  try {
    const url = new URL(value)
    const isLocalHttp =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if (
      (url.protocol !== 'https:' && !isLocalHttp) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

export function resolveApplicationBaseUrl(
  environment: ApplicationEnvironment,
  browserOrigin: string,
): string {
  const basePath = validBasePath(environment.BASE_URL?.trim() ?? '') ?? '/'
  const configuredOrigin = validPublicOrigin(
    environment.VITE_PUBLIC_APP_ORIGIN?.trim() ?? '',
  )
  const runtimeOrigin = validPublicOrigin(browserOrigin)
  const publicOrigin = configuredOrigin ?? runtimeOrigin
  if (!publicOrigin) {
    throw new Error('A valid public application origin is required.')
  }
  return new URL(basePath, `${publicOrigin}/`).toString()
}

export function getApplicationBaseUrl(): string {
  return resolveApplicationBaseUrl(import.meta.env, window.location.origin)
}
