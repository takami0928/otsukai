import { useEffect, useMemo, useState } from 'react'
import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { CreateRequestPage } from './pages/CreateRequestPage'
import { ShoppingListPage } from './pages/ShoppingListPage'
import { AboutPage } from './pages/AboutPage'
import { ProductCatalogPage } from './pages/ProductCatalogPage'
import { CatalogRecoveryPage } from './pages/CatalogRecoveryPage'

export type RouteState =
  | { page: 'home' }
  | { page: 'create' }
  | { page: 'products' }
  | { page: 'catalogRestore'; encoded: string }
  | { page: 'about' }
  | { page: 'list'; encoded: string; format: 'v1' | 'v2' }
  | { page: 'error'; title: string; description: string }

export function parseHashRoute(rawHash: string): RouteState {
  rawHash = rawHash || '#/'
  const normalized = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash
  const [pathPart, queryString = ''] = normalized.split('?')
  const path = pathPart || '/'

  if (path === '/' || path === '') {
    return { page: 'home' }
  }

  if (path === '/create') {
    return { page: 'create' }
  }

  if (path === '/products') {
    return { page: 'products' }
  }

  if (path.startsWith('/catalog/restore/')) {
    const encoded = path.slice('/catalog/restore/'.length)
    if (!encoded) {
      return {
        page: 'error',
        title: '復旧リンクにデータがありません',
        description:
          '商品リスト復旧データ付きのURLをもう一度開いてください。',
      }
    }
    return { page: 'catalogRestore', encoded }
  }

  if (path === '/about') {
    return { page: 'about' }
  }

  if (path === '/list') {
    const params = new URLSearchParams(queryString)
    const encoded = params.get('data')

    if (!encoded) {
      return {
        page: 'error',
        title: '共有URLにデータがありません',
        description: '依頼データ付きのURLをもう一度開いてください。',
      }
    }

    return { page: 'list', encoded, format: 'v1' }
  }

  if (path.startsWith('/l/')) {
    const encoded = path.slice('/l/'.length)
    if (!encoded) {
      return {
        page: 'error',
        title: '共有URLにデータがありません',
        description: '依頼データ付きのURLをもう一度開いてください。',
      }
    }
    return { page: 'list', encoded, format: 'v2' }
  }

  return {
    page: 'error',
    title: 'ページが見つかりません',
    description: 'URLを確認してから、もう一度開いてください。',
  }
}

function navigate(hashPath: string) {
  window.location.hash = hashPath
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => parseHashRoute(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHashRoute(window.location.hash))
      window.scrollTo({ top: 0, behavior: 'auto' })
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const page = useMemo(() => {
    switch (route.page) {
      case 'home':
        return (
          <HomePage
            onStartCreate={() => navigate('/create')}
            onOpenProducts={() => navigate('/products')}
            onOpenAbout={() => navigate('/about')}
          />
        )
      case 'create':
        return <CreateRequestPage onBackHome={() => navigate('/')} />
      case 'products':
        return <ProductCatalogPage onBackHome={() => navigate('/')} />
      case 'catalogRestore':
        return (
          <CatalogRecoveryPage
            key={route.encoded}
            encoded={route.encoded}
            onBackHome={() => navigate('/')}
            onOpenProducts={() => navigate('/products')}
          />
        )
      case 'about':
        return <AboutPage onBackHome={() => navigate('/')} />
      case 'list':
        return (
          <ShoppingListPage
            encodedPayload={route.encoded}
            payloadFormat={route.format}
            onBackHome={() => navigate('/')}
            onError={(title, description) => setRoute({ page: 'error', title, description })}
          />
        )
      case 'error':
        return (
          <ErrorPage
            title={route.title}
            description={route.description}
            onBackHome={() => navigate('/')}
          />
        )
      default:
        return null
    }
  }, [route])

  return <div className="app-shell">{page}</div>
}
