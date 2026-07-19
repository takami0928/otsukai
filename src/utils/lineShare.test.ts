import { describe, expect, it } from 'vitest'
import {
  LINE_SHARE_ENDPOINT,
  buildLineShareUrl,
  copyRequestShareMessage,
} from './lineShare'

const requestUrl =
  'https://takami0928.github.io/otsukai/#/list?data=value=1&next=/aisle:2'
const requestText = [
  '【おつかい依頼】',
  '',
  '今日 のおつかい・特売',
  '次のリンクから買い物リストを確認してください。',
].join('\n')

describe('buildLineShareUrl', () => {
  it('uses the LINE endpoint with one URL parameter and one text parameter', () => {
    const lineShareUrl = buildLineShareUrl(requestUrl, requestText)
    const parsed = new URL(lineShareUrl)

    expect(`${parsed.origin}${parsed.pathname}`).toBe(LINE_SHARE_ENDPOINT)
    expect(parsed.searchParams.getAll('url')).toEqual([requestUrl])
    expect(parsed.searchParams.getAll('text')).toEqual([requestText])
    expect([...parsed.searchParams.keys()].sort()).toEqual(['text', 'url'])
  })

  it('round-trips URL and Japanese text containing reserved and special characters', () => {
    const parsed = new URL(buildLineShareUrl(requestUrl, requestText))

    expect(parsed.searchParams.get('url')).toBe(requestUrl)
    expect(parsed.searchParams.get('text')).toBe(requestText)
  })

  it('encodes both values exactly once with encodeURIComponent', () => {
    const lineShareUrl = buildLineShareUrl(requestUrl, requestText)

    expect(lineShareUrl).toBe(
      `${LINE_SHARE_ENDPOINT}?url=${encodeURIComponent(requestUrl)}` +
        `&text=${encodeURIComponent(requestText)}`,
    )
    expect(lineShareUrl).toContain('%23')
    expect(lineShareUrl).toContain('%3F')
    expect(lineShareUrl).toContain('%3D')
    expect(lineShareUrl).toContain('%26')
    expect(lineShareUrl).toContain('%2F')
    expect(lineShareUrl).toContain('%3A')
    expect(lineShareUrl).toContain('%20')
    expect(lineShareUrl).toContain('%0A')
    expect(lineShareUrl).not.toContain('%2523')
    expect(lineShareUrl).not.toContain('+')
  })

  it('does not add the purchase URL to the request text', () => {
    const parsed = new URL(buildLineShareUrl(requestUrl, requestText))
    const decodedText = parsed.searchParams.get('text')

    expect(decodedText).toBe(requestText)
    expect(decodedText).not.toContain(requestUrl)
  })
})

describe('copyRequestShareMessage', () => {
  it('copies the complete request message with the injected writer', async () => {
    const copied: string[] = []
    const message = `${requestText}\n\n${requestUrl}`

    const result = await copyRequestShareMessage(message, async (text) => {
      copied.push(text)
    })

    expect(result).toBe('copied')
    expect(copied).toEqual([message])
  })

  it('returns failed when copying throws or no writer is available', async () => {
    expect(
      await copyRequestShareMessage(requestText, async () => {
        throw new Error('clipboard denied')
      }),
    ).toBe('failed')
    expect(await copyRequestShareMessage(requestText)).toBe('failed')
  })
})
