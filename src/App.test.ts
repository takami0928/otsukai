import { describe, expect, it } from 'vitest'
import { parseHashRoute } from './App'

describe('hash routing', () => {
  it('recognizes home, create, products, recovery, about, legacy v1, and compact routes', () => {
    expect(parseHashRoute('#/')).toEqual({ page: 'home' })
    expect(parseHashRoute('#/create')).toEqual({ page: 'create' })
    expect(parseHashRoute('#/products')).toEqual({ page: 'products' })
    expect(parseHashRoute('#/catalog/restore/recovery+data-$')).toEqual({
      page: 'catalogRestore',
      encoded: 'recovery+data-$',
    })
    expect(parseHashRoute('#/about')).toEqual({ page: 'about' })
    expect(parseHashRoute('#/list?data=legacy-data')).toEqual({
      page: 'list',
      encoded: 'legacy-data',
      codec: 'legacy-query',
    })
    expect(parseHashRoute('#/l/v2+data-$')).toEqual({
      page: 'list',
      encoded: 'v2+data-$',
      codec: 'compact-path',
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

  it('routes an empty recovery link to a useful error', () => {
    expect(parseHashRoute('#/catalog/restore/')).toMatchObject({
      page: 'error',
      title: '復旧リンクにデータがありません',
    })
  })

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
      codec: 'compact-path',
    })
  })
})
