export type ServiceWorkerLocation = {
  scriptUrl: string
  scope: string
}

function validBasePath(value: string): boolean {
  return (
    value === '/' ||
    (/^\/(?:[A-Za-z0-9._~-]+\/)+$/u.test(value) && !value.includes('//'))
  )
}

export function resolveServiceWorkerLocation(
  basePath: string,
): ServiceWorkerLocation {
  if (!validBasePath(basePath)) {
    throw new Error('Invalid service worker base path.')
  }
  return {
    scriptUrl: `${basePath}service-worker.js`,
    scope: basePath,
  }
}

export async function registerServiceWorker(
  serviceWorker: Pick<ServiceWorkerContainer, 'register'>,
  basePath = import.meta.env.BASE_URL,
): Promise<void> {
  const location = resolveServiceWorkerLocation(basePath)
  try {
    await serviceWorker.register(location.scriptUrl, {
      scope: location.scope,
    })
  } catch {
    // PWA registration failure must not affect the Stable Free Core.
  }
}
