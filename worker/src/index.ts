import {
  GoogleVisionError,
  recognizeWithGoogleVision,
  type OcrLine,
} from './googleVision'
import { verifyTurnstileToken } from './turnstile'
import {
  parseAllowedOrigins,
  RequestValidationError,
  validateOcrRequest,
} from './validation'

export type WorkerEnv = {
  GOOGLE_VISION_API_KEY: string
  TURNSTILE_SECRET_KEY: string
  ALLOWED_ORIGINS: string
  GOOGLE_VISION_LANGUAGE_HINTS?: string
}

export type WorkerDependencies = {
  fetchImplementation?: typeof fetch
  timeoutMs?: number
}

type OcrResponse = {
  lines: OcrLine[]
}

const DEFAULT_TIMEOUT_MS = 15_000

function languageHints(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((hint) => hint.trim())
    .filter(Boolean)
    .slice(0, 10)
}

function corsHeaders(origin?: string): HeadersInit {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(origin
      ? {
          'Access-Control-Allow-Origin': origin,
          Vary: 'Origin',
        }
      : {}),
  }
}

function jsonResponse(
  body: OcrResponse | { code: string },
  status: number,
  origin?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  })
}

function hasRequiredConfiguration(env: WorkerEnv): boolean {
  return Boolean(
    env.GOOGLE_VISION_API_KEY?.trim() &&
      env.TURNSTILE_SECRET_KEY?.trim() &&
      env.ALLOWED_ORIGINS?.trim(),
  )
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  dependencies: WorkerDependencies = {},
): Promise<Response> {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS ?? '')
  const requestOrigin = request.headers.get('Origin') ?? ''
  const responseOrigin = allowedOrigins.has(requestOrigin)
    ? requestOrigin
    : undefined

  if (request.method !== 'POST') {
    return jsonResponse(
      { code: 'METHOD_NOT_ALLOWED' },
      405,
      responseOrigin,
    )
  }

  if (!hasRequiredConfiguration(env)) {
    return jsonResponse(
      { code: 'SERVICE_UNAVAILABLE' },
      503,
      responseOrigin,
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
  const abortForClient = () => controller.abort()
  request.signal.addEventListener('abort', abortForClient, { once: true })
  const fetchImplementation = dependencies.fetchImplementation ?? fetch

  try {
    const validated = await validateOcrRequest(request, allowedOrigins)
    const verified = await verifyTurnstileToken({
      token: validated.turnstileToken,
      secret: env.TURNSTILE_SECRET_KEY,
      origin: validated.origin,
      remoteIp: validated.remoteIp,
      fetchImplementation,
      signal: controller.signal,
    })
    if (!verified) {
      return jsonResponse({ code: 'AUTH_FAILED' }, 403, validated.origin)
    }

    const lines = await recognizeWithGoogleVision({
      image: validated.image,
      apiKey: env.GOOGLE_VISION_API_KEY,
      languageHints: languageHints(env.GOOGLE_VISION_LANGUAGE_HINTS),
      fetchImplementation,
      signal: controller.signal,
    })
    return jsonResponse({ lines }, 200, validated.origin)
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return jsonResponse(
        { code: error.code },
        error.status,
        responseOrigin,
      )
    }
    if (controller.signal.aborted) {
      return jsonResponse({ code: 'OCR_TIMEOUT' }, 504, responseOrigin)
    }
    if (error instanceof GoogleVisionError) {
      return error.kind === 'rate-limited'
        ? jsonResponse({ code: 'OCR_LIMIT' }, 429, responseOrigin)
        : jsonResponse(
            { code: 'OCR_UNAVAILABLE' },
            502,
            responseOrigin,
          )
    }
    return jsonResponse({ code: 'INTERNAL_ERROR' }, 500, responseOrigin)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', abortForClient)
  }
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env)
  },
}
