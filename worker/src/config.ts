export type WorkerEnv = {
  GEMINI_API_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  ALLOWED_ORIGINS?: string
  DIAGNOSTIC_MODE?: string
  PHOTO_API_ENABLED?: string
  SHARED_REQUEST_API_ENABLED?: string
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

type HandwritingConfiguredEnv = WorkerEnv & {
  GEMINI_API_KEY: string
  TURNSTILE_SECRET_KEY: string
  ALLOWED_ORIGINS: string
}

export function hasHandwritingConfiguration(
  env: WorkerEnv,
): env is HandwritingConfiguredEnv {
  return Boolean(
    env.GEMINI_API_KEY?.trim() &&
      env.TURNSTILE_SECRET_KEY?.trim() &&
      env.ALLOWED_ORIGINS?.trim(),
  )
}

export function hasPhotoConfiguration(env: WorkerEnv): boolean {
  return Boolean(
    isEnabled(env.PHOTO_API_ENABLED) &&
      env.TURNSTILE_SECRET_KEY?.trim() &&
      env.ALLOWED_ORIGINS?.trim(),
  )
}

export function hasSharedRequestConfiguration(env: WorkerEnv): boolean {
  return Boolean(
    isEnabled(env.SHARED_REQUEST_API_ENABLED) &&
      env.TURNSTILE_SECRET_KEY?.trim() &&
      env.ALLOWED_ORIGINS?.trim(),
  )
}
