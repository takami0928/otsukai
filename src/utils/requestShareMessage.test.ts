import { describe, expect, it } from 'vitest'
import { buildRequestShareMessage, buildRequestShareText } from './requestShareMessage'

describe('request share message', () => {
  it('builds request text with a trimmed title and no URL', () => {
    expect(buildRequestShareText('  今日のおつかい  ')).toBe(
      [
        '【おつかい依頼】',
        '',
        '今日のおつかい',
        '次のリンクから買い物リストを確認してください。',
      ].join('\n'),
    )
  })

  it('uses a fallback title when the request title is blank', () => {
    expect(buildRequestShareText(' \n ')).toContain('\nおつかい依頼\n')
  })

  it('builds a complete clipboard message with the request URL once', () => {
    const url = 'https://takami0928.github.io/otsukai/#/list?data=abc'
    const message = buildRequestShareMessage('今日のおつかい', url)

    expect(message).toBe(
      [
        '【おつかい依頼】',
        '',
        '今日のおつかい',
        '次のリンクから買い物リストを確認してください。',
        '',
        url,
      ].join('\n'),
    )
    expect(message.split(url)).toHaveLength(2)
  })
})
