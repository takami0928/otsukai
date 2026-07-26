import {
  analyzeHandwritingWithGemini,
  GeminiAnalysisError,
} from './gemini'
import { parseGeminiHandwritingResult } from './resultValidation'
import { verifyTurnstileToken } from './turnstile'
import type { HandwritingImportResult } from './types'
import {
  parseAllowedOrigins,
  RequestValidationError,
  type SupportedImageMime,
  validateHandwritingImportRequest,
} from './validation'

export type WorkerEnv = {
  GEMINI_API_KEY: string
  TURNSTILE_SECRET_KEY: string
  ALLOWED_ORIGINS: string
}

export type WorkerDependencies = {
  fetchImplementation?: typeof fetch
  analyzeImplementation?: typeof analyzeHandwritingWithGemini
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

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
  body: HandwritingImportResult | { code: string },
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
    env.GEMINI_API_KEY?.trim() &&
      env.TURNSTILE_SECRET_KEY?.trim() &&
      env.ALLOWED_ORIGINS?.trim(),
  )
}

function geminiErrorResponse(
  error: GeminiAnalysisError,
  origin?: string,
): Response {
  switch (error.kind) {
    case 'analysis-limit':
      return jsonResponse({ code: 'ANALYSIS_LIMIT' }, 429, origin)
    case 'invalid-response':
      return jsonResponse(
        { code: 'INVALID_ANALYSIS_RESPONSE' },
        502,
        origin,
      )
    case 'safety-blocked':
      return jsonResponse({ code: 'SAFETY_BLOCKED' }, 422, origin)
    case 'unavailable':
      return jsonResponse(
        { code: 'SERVICE_UNAVAILABLE' },
        502,
        origin,
      )
  }
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
  if (!responseOrigin) {
    return jsonResponse({ code: 'ORIGIN_NOT_ALLOWED' }, 403)
  }
  if (!hasRequiredConfiguration(env)) {
    return jsonResponse(
      { code: 'SERVICE_UNAVAILABLE' },
      503,
      responseOrigin,
    )
  }

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const abortForClient = () => controller.abort()
  request.signal.addEventListener('abort', abortForClient, { once: true })
  const fetchImplementation = dependencies.fetchImplementation ?? fetch
  const analyzeImplementation =
    dependencies.analyzeImplementation ?? analyzeHandwritingWithGemini

  try {
    const validated = await validateHandwritingImportRequest(
      request,
      allowedOrigins,
    )
    const verified = await verifyTurnstileToken({
      token: validated.turnstileToken,
      secret: env.TURNSTILE_SECRET_KEY,
      origin: validated.origin,
      remoteIp: validated.remoteIp,
      fetchImplementation,
      signal: controller.signal,
    })
    if (!verified) {
      return jsonResponse(
        { code: 'AUTH_FAILED' },
        403,
        validated.origin,
      )
    }

    const outputText = await analyzeImplementation({
      image: validated.image,
      mimeType: validated.image.type as SupportedImageMime,
      products: validated.products,
      apiKey: env.GEMINI_API_KEY,
      signal: controller.signal,
    })
    const result = parseGeminiHandwritingResult(
      outputText,
      validated.products,
    )
    return jsonResponse(result, 200, validated.origin)
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return jsonResponse(
        { code: error.code },
        error.status,
        responseOrigin,
      )
    }
    if (timedOut || controller.signal.aborted) {
      return jsonResponse({ code: 'TIMEOUT' }, 504, responseOrigin)
    }
    if (error instanceof GeminiAnalysisError) {
      return geminiErrorResponse(error, responseOrigin)
    }
    return jsonResponse(
      { code: 'SERVICE_UNAVAILABLE' },
      500,
      responseOrigin,
    )
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
