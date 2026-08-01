import { describe, expect, it } from 'vitest'
import type { LiveRequestSnapshot } from './types'
import {
  isLiveRequestEditSecret,
  isLiveRequestToken,
  parseLiveRequestCreateResponse,
  parseLiveRequestEtag,
  parseLiveRequestSnapshot,
} from './validation'

const requestToken = `r1_${'A'.repeat(32)}`

function snapshot(): LiveRequestSnapshot {
  return {
    schemaVersion: 1,
    requestId: `v5-${requestToken}`,
    revision: 2,
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-15T00:00:00.000Z',
    updatesCount: 1,
    items: [
      {
        itemId: 'item-1',
        productId: 'milk',
        productNameSnapshot: '牛乳',
        categoryIdSnapshot: 'drinks',
        categoryNameSnapshot: '飲み物',
        quantity: 2,
        unit: '本',
        memo: '低脂肪',
        iconSnapshot: '🥛',
        sortOrderSnapshot: 1,
        lifecycle: 'active',
        createdRevision: 1,
        updatedRevision: 2,
      },
    ],
  }
}

describe('live request front-end validation', () => {
  it('validates capabilities and matching ETags exactly', () => {
    expect(isLiveRequestToken(requestToken)).toBe(true)
    expect(isLiveRequestToken(`r1_${'A'.repeat(31)}`)).toBe(false)
    expect(isLiveRequestEditSecret(`e1_${'B'.repeat(43)}`)).toBe(true)
    expect(isLiveRequestEditSecret('secret')).toBe(false)
    expect(parseLiveRequestEtag('"revision-2"', 2)).toBe('"revision-2"')
    expect(parseLiveRequestEtag('W/"revision-2"', 2)).toBeUndefined()
    expect(parseLiveRequestEtag('"revision-2"', 3)).toBeUndefined()
  })

  it('parses a strict snapshot and create response', () => {
    expect(parseLiveRequestSnapshot(snapshot(), requestToken)).toEqual(
      snapshot(),
    )
    expect(
      parseLiveRequestCreateResponse({
        requestToken,
        editSecret: `e1_${'B'.repeat(43)}`,
        request: snapshot(),
      }),
    ).toMatchObject({ requestToken, request: { revision: 2 } })
  })

  it.each([
    ['extra key', { ...snapshot(), raw: 'forbidden' }],
    ['wrong request ID', { ...snapshot(), requestId: `v5-r1_${'Z'.repeat(32)}` }],
    ['unknown lifecycle', {
      ...snapshot(),
      items: [{ ...snapshot().items[0], lifecycle: 'deleted' }],
    }],
    ['active cancellation revision', {
      ...snapshot(),
      items: [{ ...snapshot().items[0], cancelledRevision: 2 }],
    }],
    ['future item revision', {
      ...snapshot(),
      items: [{ ...snapshot().items[0], updatedRevision: 3 }],
    }],
    ['duplicate item ID', {
      ...snapshot(),
      items: [snapshot().items[0], snapshot().items[0]],
    }],
  ])('rejects %s', (_name, value) => {
    expect(parseLiveRequestSnapshot(value, requestToken)).toBeUndefined()
  })

  it('accepts a valid cancelled tombstone', () => {
    const value = snapshot()
    value.items = [
      {
        ...value.items[0],
        lifecycle: 'cancelled-by-requester',
        updatedRevision: 2,
        cancelledRevision: 2,
      },
    ]
    expect(parseLiveRequestSnapshot(value, requestToken)).toBeDefined()
  })
})
