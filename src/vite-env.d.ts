/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HANDWRITING_IMPORT_ENABLED?: string
  readonly VITE_OCR_ENDPOINT?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
