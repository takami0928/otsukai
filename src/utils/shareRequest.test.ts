import { describe, expect, it } from 'vitest'
import { buildRequestShareMessage, REQUEST_SHARE_TITLE } from './requestShareMessage'
import {
  createRequestShareLock,
  isRequestUrlWithinShareLimit,
  shareRequest,
} from './shareRequest'

const requestUrl =
  'https://takami0928.github.io/otsukai/#/l/raw+#?&日本語😀'

describe('request share message', () => {
  it('places one unchanged URL after a blank line as the independent final line', () => {
    const message = buildRequestShareMessage(requestUrl)
    expect(message).toBe(`今日のおつかいをお願いします。\n\n${requestUrl}`)
    expect(message.split(requestUrl)).toHaveLength(2)
    expect(message.split('\n').at(-1)).toBe(requestUrl)
    expect(message).not.toContain(encodeURIComponent(requestUrl))
  })
})

describe('shareRequest', () => {
  it('blocks a URL over 2,200 characters before a share call can start', () => {
    expect(isRequestUrlWithinShareLimit('x'.repeat(2200))).toBe(true)
    expect(isRequestUrlWithinShareLimit('x'.repeat(2201))).toBe(false)
  })

  it('provides a single-flight lock for repeated button presses', () => {
    const lock = createRequestShareLock()
    expect(lock.tryAcquire()).toBe(true)
    expect(lock.isActive()).toBe(true)
    expect(lock.tryAcquire()).toBe(false)
    lock.release()
    expect(lock.isActive()).toBe(false)
    expect(lock.tryAcquire()).toBe(true)
  })

  it('uses Web Share with title and text only and never passes a url property', async () => {
    const shared: ShareData[] = []
    const message = buildRequestShareMessage(requestUrl)
    const result = await shareRequest(
      REQUEST_SHARE_TITLE,
      message,
      async (data) => {
        shared.push(data)
      },
      async () => {
        throw new Error('clipboard must not be used')
      },
    )

    expect(result).toBe('shared')
    expect(shared).toEqual([{ title: 'おつかい依頼', text: message }])
    expect(Object.keys(shared[0]).sort()).toEqual(['text', 'title'])
    expect('url' in shared[0]).toBe(false)
  })

  it('returns cancelled and does not copy after AbortError', async () => {
    let copied = false
    const result = await shareRequest(
      REQUEST_SHARE_TITLE,
      buildRequestShareMessage(requestUrl),
      async () => {
        throw { name: 'AbortError' }
      },
      async () => {
        copied = true
      },
    )
    expect(result).toBe('cancelled')
    expect(copied).toBe(false)
  })

  it('copies the identical message when Web Share is unavailable', async () => {
    const copied: string[] = []
    const message = buildRequestShareMessage(requestUrl)
    const result = await shareRequest(
      REQUEST_SHARE_TITLE,
      message,
      undefined,
      async (text) => {
        copied.push(text)
      },
    )
    expect(result).toBe('copied')
    expect(copied).toEqual([message])
  })

  it('falls back to copying after a non-cancellation share error', async () => {
    const copied: string[] = []
    const message = buildRequestShareMessage(requestUrl)
    const result = await shareRequest(
      REQUEST_SHARE_TITLE,
      message,
      async () => {
        throw new Error('share failed')
      },
      async (text) => {
        copied.push(text)
      },
    )
    expect(result).toBe('copied')
    expect(copied).toEqual([message])
  })

  it('returns failed when sharing and copying are both unavailable or fail', async () => {
    expect(await shareRequest(REQUEST_SHARE_TITLE, 'message', undefined, undefined)).toBe(
      'failed',
    )
    expect(
      await shareRequest(
        REQUEST_SHARE_TITLE,
        'message',
        async () => {
          throw new Error('share failed')
        },
        async () => {
          throw new Error('clipboard failed')
        },
      ),
    ).toBe('failed')
  })
})
