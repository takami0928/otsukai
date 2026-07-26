export type HandwritingImportErrorCode =
  | 'unsupported-format'
  | 'image-too-large'
  | 'image-too-small'
  | 'no-text'
  | 'auth-failed'
  | 'service-unavailable'
  | 'rate-limited'
  | 'cancelled'
  | 'processing-failed'

export class HandwritingImportError extends Error {
  readonly code: HandwritingImportErrorCode
  readonly cause?: unknown

  constructor(code: HandwritingImportErrorCode, cause?: unknown) {
    super(code)
    this.name = 'HandwritingImportError'
    this.code = code
    this.cause = cause
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof HandwritingImportError && error.code === 'cancelled')
  )
}

export function toHandwritingErrorMessage(error: unknown): string {
  const code = isAbortError(error)
    ? 'cancelled'
    : error instanceof HandwritingImportError
      ? error.code
      : 'processing-failed'

  switch (code) {
    case 'unsupported-format':
      return '対応していない画像形式です。JPEG、PNG、WebPを選んでください。'
    case 'image-too-large':
      return '画像が大きすぎます。別の画像を選んでください。'
    case 'image-too-small':
      return '画像が小さすぎます。メモ全体が大きく写った画像を選んでください。'
    case 'no-text':
      return '文字を検出できませんでした。明るく、文字が大きく写るように撮り直してください。'
    case 'auth-failed':
      return '認証確認に失敗しました。もう一度お試しください。'
    case 'rate-limited':
      return 'OCRサービスの利用上限に達しています。時間をおいてお試しください。'
    case 'service-unavailable':
      return 'OCRサービスへ接続できません。通常の商品選択はそのまま利用できます。'
    case 'cancelled':
      return '処理をキャンセルしました。'
    case 'processing-failed':
      return '画像を処理できませんでした。別の画像でお試しください。'
  }
}
