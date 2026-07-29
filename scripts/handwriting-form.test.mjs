import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const formHtml = readFileSync(
  new URL('../public/handwriting-form-v1.html', import.meta.url),
  'utf8',
)

describe('printable handwriting form', () => {
  it('defines the v1 A4 portrait form with twelve numbered rows', () => {
    expect(formHtml).toContain('OTSUKAI FORM V1')
    expect(formHtml).toMatch(/@page\s*\{[\s\S]*size:\s*A4 portrait;/u)
    expect(formHtml).toContain('商品名')
    expect(formHtml).toContain('個数')
    expect(formHtml).toContain('条件')

    const body = /<tbody>([\s\S]*?)<\/tbody>/u.exec(formHtml)?.[1] ?? ''
    expect(body.match(/<tr>/gu)).toHaveLength(12)
    for (let row = 1; row <= 12; row += 1) {
      expect(body).toContain(`<td class="row-number">${row}</td>`)
    }
  })

  it('has four printable vector markers and hides screen controls in print', () => {
    expect(formHtml.match(/class="alignment-marker /gu)).toHaveLength(4)
    expect(formHtml.match(/<rect width="10" height="10" fill="#000"/gu)).toHaveLength(
      4,
    )
    expect(formHtml).toMatch(
      /@media print\s*\{[\s\S]*\.screen-only\s*\{[\s\S]*display:\s*none !important;/u,
    )
    expect(formHtml).toContain('A4・縦向き・倍率100%')
  })

  it('contains no personal-information fields or external resources', () => {
    for (const forbiddenLabel of [
      '氏名',
      '住所',
      '電話番号',
      '価格',
      '店舗',
    ]) {
      expect(formHtml).not.toContain(forbiddenLabel)
    }
    expect(formHtml).not.toMatch(/<(?:link|script|img)\b[^>]*\b(?:href|src)=/iu)
    expect(formHtml).not.toMatch(/url\s*\(/iu)
  })
})
