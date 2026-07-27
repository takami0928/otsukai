/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HANDWRITING_IMPORT_ENABLED?: string
  readonly VITE_HANDWRITING_DIAGNOSTICS_ENABLED?: string
  readonly VITE_HANDWRITING_IMPORT_ENDPOINT?: string
  readonly VITE_HANDWRITING_MANUAL_TEST_EXPIRES_AT?: string
  readonly VITE_HANDWRITING_MANUAL_TEST_SESSION_ID?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
