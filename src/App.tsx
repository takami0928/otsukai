import { useEffect, useMemo, useState } from 'react'
import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { CreateRequestPage } from './pages/CreateRequestPage'
import { ShoppingListPage } from './pages/ShoppingListPage'

type RouteState =
  | { page: 'home' }
  | { page: 'create' }
  | { page: 'list'; encoded: string }
  | { page: 'error'; title: string; description: string }

function parseHashRoute(): RouteState {
  const rawHash = window.location.hash || '#/'
  const normalized = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash
  const [pathPart, queryString = ''] = normalized.split('?')
  const path = pathPart || '/'

  if (path === '/' || path === '') {
    return { page: 'home' }
  }

  if (path === '/create') {
    return { page: 'create' }
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

    return { page: 'list', encoded }
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
  const [route, setRoute] = useState<RouteState>(() => parseHashRoute())

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHashRoute())
      window.scrollTo({ top: 0, behavior: 'auto' })
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const page = useMemo(() => {
    switch (route.page) {
      case 'home':
        return <HomePage onStartCreate={() => navigate('/create')} />
      case 'create':
        return <CreateRequestPage onBackHome={() => navigate('/')} />
      case 'list':
        return (
          <ShoppingListPage
            encodedPayload={route.encoded}
            onBackHome={() => navigate('/')}
            onOpenCreate={() => navigate('/create')}
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
