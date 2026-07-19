import { describe, expect, it } from 'vitest'
import { parseHashRoute } from './App'

describe('hash routing', () => {
  it('recognizes home, create, legacy v1, and compact v2 routes', () => {
    expect(parseHashRoute('#/')).toEqual({ page: 'home' })
    expect(parseHashRoute('#/create')).toEqual({ page: 'create' })
    expect(parseHashRoute('#/list?data=legacy-data')).toEqual({
      page: 'list',
      encoded: 'legacy-data',
      format: 'v1',
    })
    expect(parseHashRoute('#/l/v2+data-$')).toEqual({
      page: 'list',
      encoded: 'v2+data-$',
      format: 'v2',
    })
  })

  it.each(['#/list', '#/list?data=', '#/l/'])(
    'routes empty shared data to the existing error page for %s',
    (hash) => {
      expect(parseHashRoute(hash)).toMatchObject({
        page: 'error',
        title: '共有URLにデータがありません',
      })
    },
  )

  it('routes unknown direct-open paths to a useful error', () => {
    expect(parseHashRoute('#/unknown')).toMatchObject({
      page: 'error',
      title: 'ページが見つかりません',
    })
  })

  it('can be called again with a changed hash, matching hashchange behavior', () => {
    expect(parseHashRoute('#/').page).toBe('home')
    expect(parseHashRoute('#/l/new-data')).toEqual({
      page: 'list',
      encoded: 'new-data',
      format: 'v2',
    })
  })
})
