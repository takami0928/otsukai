import { describe, expect, it } from 'vitest'
import { parseHashRoute } from '../App'
import { buildApplicationHashUrl } from './applicationUrls'

describe('application hash URLs', () => {
  it.each([
    ['https://app.example/', 'https://app.example/#/create'],
    ['https://app.example/otsukai/', 'https://app.example/otsukai/#/create'],
  ])('builds direct-open and refresh-safe URLs from %s', (baseUrl, expected) => {
    const url = buildApplicationHashUrl(baseUrl, '/create')
    expect(url).toBe(expected)
    expect(new URL(url).pathname).toBe(new URL(baseUrl).pathname)
    expect(parseHashRoute(new URL(url).hash)).toEqual({ page: 'create' })
  })

  it('preserves pre-hash query parameters without inserting a slash into the query', () => {
    const url = buildApplicationHashUrl(
      'https://app.example/otsukai/?source=test',
      '/catalog/restore/data',
    )
    expect(url).toBe(
      'https://app.example/otsukai/?source=test#/catalog/restore/data',
    )
    expect(parseHashRoute(new URL(url).hash)).toEqual({
      page: 'catalogRestore',
      encoded: 'data',
    })
  })

  it.each(['create', '/bad#fragment', '/bad\nvalue'])(
    'rejects an invalid hash path %s',
    (hashPath) => {
      expect(() =>
        buildApplicationHashUrl('https://app.example/', hashPath),
      ).toThrow()
    },
  )
})
