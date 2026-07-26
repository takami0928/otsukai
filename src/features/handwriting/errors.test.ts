import { describe, expect, it } from 'vitest'
import {
  HandwritingImportError,
  isAbortError,
  toHandwritingErrorMessage,
  type HandwritingImportErrorCode,
} from './errors'

describe('handwriting error messages', () => {
  it.each([
    ['unsupported-format', '対応していない画像形式です。'],
    ['image-too-large', '画像が大きすぎます。'],
    ['image-too-small', '画像が小さすぎます。'],
    ['no-text', '文字を検出できませんでした。'],
    ['auth-failed', '認証確認に失敗しました。'],
    ['rate-limited', 'OCRサービスの利用上限に達しています。'],
    ['service-unavailable', 'OCRサービスへ接続できません。'],
    ['cancelled', '処理をキャンセルしました。'],
    ['processing-failed', '画像を処理できませんでした。'],
  ] satisfies Array<[HandwritingImportErrorCode, string]>)(
    'maps %s to a safe user-facing message',
    (code, expected) => {
      expect(
        toHandwritingErrorMessage(new HandwritingImportError(code)),
      ).toContain(expected)
    },
  )

  it('maps unknown failures to a generic processing message', () => {
    expect(toHandwritingErrorMessage(new Error('internal detail'))).toContain(
      '画像を処理できませんでした。',
    )
  })

  it('recognizes native and wrapped cancellation errors', () => {
    expect(isAbortError(new DOMException('cancelled', 'AbortError'))).toBe(true)
    expect(isAbortError(new HandwritingImportError('cancelled'))).toBe(true)
    expect(isAbortError(new Error('AbortError'))).toBe(false)
  })
})
