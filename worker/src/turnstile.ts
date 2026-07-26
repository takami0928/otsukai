const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_ACTION = 'handwriting_ocr'

type TurnstileSiteverifyResponse = {
  success: boolean
  action?: string
  hostname?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSiteverifyResponse(
  value: unknown,
): TurnstileSiteverifyResponse | undefined {
  if (!isRecord(value) || typeof value.success !== 'boolean') {
    return undefined
  }
  return {
    success: value.success,
    ...(typeof value.action === 'string' ? { action: value.action } : {}),
    ...(typeof value.hostname === 'string'
      ? { hostname: value.hostname }
      : {}),
  }
}

export async function verifyTurnstileToken(options: {
  token: string
  secret: string
  origin: string
  remoteIp?: string
  fetchImplementation: typeof fetch
  signal: AbortSignal
}): Promise<boolean> {
  const expectedHostname = new URL(options.origin).hostname
  const body = new URLSearchParams({
    secret: options.secret,
    response: options.token,
    ...(options.remoteIp ? { remoteip: options.remoteIp } : {}),
  })

  let response: Response
  try {
    response = await options.fetchImplementation(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: options.signal,
    })
  } catch (error) {
    if (options.signal.aborted) {
      throw error
    }
    return false
  }
  if (!response.ok) {
    return false
  }

  let parsed: TurnstileSiteverifyResponse | undefined
  try {
    parsed = parseSiteverifyResponse(await response.json())
  } catch {
    return false
  }
  return Boolean(
    parsed?.success &&
      parsed.action === TURNSTILE_ACTION &&
      parsed.hostname === expectedHostname,
  )
}
