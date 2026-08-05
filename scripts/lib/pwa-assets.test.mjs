import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(resolve('index.html'), 'utf8')
const manifest = JSON.parse(
  readFileSync(resolve('public', 'manifest.webmanifest'), 'utf8'),
)

describe('PWA static asset paths', () => {
  it.each(['/', '/otsukai/'])(
    'resolves manifest and document icons from base %s',
    (basePath) => {
      const rendered = indexHtml.replaceAll('%BASE_URL%', basePath)
      expect(rendered).toContain(`href="${basePath}manifest.webmanifest"`)
      expect(rendered).toContain(`href="${basePath}icon-192.png"`)
      expect(rendered).not.toContain('%BASE_URL%')
    },
  )

  it.each([
    ['https://app.example/manifest.webmanifest', 'https://app.example/'],
    [
      'https://app.example/otsukai/manifest.webmanifest',
      'https://app.example/otsukai/',
    ],
  ])('keeps manifest paths within %s', (manifestUrl, expectedBase) => {
    expect(new URL(manifest.start_url, manifestUrl).toString()).toBe(expectedBase)
    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, manifestUrl).toString()
      expect(iconUrl.startsWith(expectedBase)).toBe(true)
      expect(iconUrl).not.toContain('//icon-')
    }
  })
})
