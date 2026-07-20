// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AboutPage } from './AboutPage'
import { HomePage } from './HomePage'

describe('home and about pages', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('keeps the create action on home, adds the about action, and removes technical cards', () => {
    const onStartCreate = vi.fn()
    const onOpenAbout = vi.fn()
    act(() => root.render(
      <HomePage onStartCreate={onStartCreate} onOpenAbout={onOpenAbout} />,
    ))

    expect(container.textContent).toContain('依頼を作る')
    expect(container.textContent).toContain('このアプリについて')
    expect(container.textContent).not.toContain('サーバーや外部DB')
    expect(container.textContent).not.toContain('localStorage')

    const aboutButton = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'このアプリについて',
    )
    act(() => aboutButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onOpenAbout).toHaveBeenCalledTimes(1)
    expect(onStartCreate).not.toHaveBeenCalled()
  })

  it('explains URL data, browser-local progress, transfer limits, and server usage', () => {
    const onBackHome = vi.fn()
    act(() => root.render(<AboutPage onBackHome={onBackHome} />))

    expect(container.querySelector('h1')?.textContent).toBe('このアプリについて')
    expect(container.textContent).toContain('依頼内容は共有URLに含まれています。')
    expect(container.textContent).toContain(
      '買い物の進捗は、操作している端末とブラウザ内',
    )
    expect(container.textContent).toContain(
      '別の端末や別のブラウザでは、進捗が引き継がれない場合があります。',
    )
    expect(container.textContent).toContain(
      'アカウント登録やサーバーへの進捗保存は使用していません。',
    )
    expect(container.textContent).toContain('LINE内ブラウザとChrome・Safari')

    const homeButton = container.querySelector('button')
    act(() => homeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onBackHome).toHaveBeenCalledTimes(1)
  })
})
