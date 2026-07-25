// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductCatalogPage } from './ProductCatalogPage'

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  if (!setter) {
    throw new Error('HTMLInputElement.value setter is unavailable')
  }
  setter.call(input, value)
}

describe('ProductCatalogPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    window.localStorage.clear()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.localStorage.clear()
    delete (window as unknown as Record<string, unknown>).confirm
    vi.restoreAllMocks()
  })

  async function renderPage() {
    await act(async () => {
      root.render(<ProductCatalogPage onBackHome={() => undefined} />)
      await Promise.resolve()
    })
  }

  function button(label: string): HTMLButtonElement {
    const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    )
    if (!found) {
      throw new Error(`Button was not rendered: ${label}`)
    }
    return found
  }

  async function click(element: Element) {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
  }

  async function inputText(selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(selector)
    if (!input) {
      throw new Error(`Input was not rendered: ${selector}`)
    }
    await act(async () => {
      setNativeInputValue(input, value)
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: value,
          inputType: 'insertText',
        }),
      )
      await Promise.resolve()
    })
  }

  async function selectCategory(value: string) {
    const select = container.querySelector<HTMLSelectElement>(
      '.catalog-editor-fields select',
    )
    if (!select) {
      throw new Error('Category select was not rendered')
    }
    await act(async () => {
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
  }

  function savedCatalog() {
    return JSON.parse(
      window.localStorage.getItem('otsukai:householdCatalog:v1') ?? '{}',
    ) as {
      overrides: Record<string, unknown>
      addedProducts: Array<{
        id: string
        name: string
        unit: string
        categoryId: string
        hidden: boolean
      }>
    }
  }

  it('opens product editing through an accessible dialog', async () => {
    await renderPage()
    expect(container.querySelector('h1')?.textContent).toBe(
      '商品リストを編集',
    )
    expect(container.textContent).toContain('変更済み 0件')
    await inputText('input[type="search"]', 'キャベツ')
    expect(container.querySelector('[aria-label="牛乳を編集"]')).toBeNull()

    const edit = container.querySelector<HTMLButtonElement>(
      '[aria-label="キャベツを編集"]',
    )
    if (!edit) {
      throw new Error('Cabbage edit button was not rendered')
    }
    await click(edit)
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement?.textContent).toContain('キャベツを編集')
  })

  it('persists base edits, moves categories, hides and restores without changing IDs', async () => {
    await renderPage()
    const edit = container.querySelector<HTMLButtonElement>(
      '[aria-label="キャベツを編集"]',
    )
    if (!edit) {
      throw new Error('Cabbage edit button was not rendered')
    }
    await click(edit)
    await inputText(
      '[aria-describedby="catalog-product-name-count"]',
      '春キャベツ',
    )
    await inputText(
      '[aria-describedby="catalog-product-unit-count"]',
      '玉',
    )
    await selectCategory('fruits')
    await click(button('変更を保存'))

    expect(savedCatalog().overrides.cabbage).toEqual({
      name: '春キャベツ',
      unit: '玉',
      categoryId: 'fruits',
    })
    expect(container.textContent).toContain('変更済み 1件')
    const editedButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="春キャベツを編集"]',
    )
    if (!editedButton) {
      throw new Error('Edited product was not rendered')
    }
    await click(editedButton)
    await click(button('商品リストから外す'))
    expect(savedCatalog().overrides.cabbage).toEqual({
      name: '春キャベツ',
      unit: '玉',
      categoryId: 'fruits',
      hidden: true,
    })
    expect(container.textContent).toContain('非表示 1件')
    await click(button('リストに戻す'))
    expect(savedCatalog().overrides.cabbage).not.toHaveProperty('hidden')

    const restoredEdit = container.querySelector<HTMLButtonElement>(
      '[aria-label="春キャベツを編集"]',
    )
    if (!restoredEdit) {
      throw new Error('Restored product was not rendered')
    }
    await click(restoredEdit)
    await click(button('標準に戻す'))
    expect(savedCatalog().overrides).not.toHaveProperty('cabbage')
    expect(container.querySelector('[aria-label="キャベツを編集"]')).not.toBeNull()
  })

  it('adds a household product with a unique persistent ID and restores it after remount', async () => {
    await renderPage()
    await click(button('新しい商品を追加'))
    await inputText(
      '[aria-describedby="catalog-product-name-count"]',
      '麦茶パック',
    )
    await inputText(
      '[aria-describedby="catalog-product-unit-count"]',
      '袋',
    )
    await selectCategory('drinks')
    await click(button('商品を追加'))

    const added = savedCatalog().addedProducts[0]
    expect(added).toMatchObject({
      name: '麦茶パック',
      unit: '袋',
      categoryId: 'drinks',
      hidden: false,
    })
    expect(added.id).toMatch(/^household:[0-9a-f-]{36}$/)

    act(() => root.unmount())
    container.replaceChildren()
    root = createRoot(container)
    await renderPage()
    const edit = container.querySelector<HTMLButtonElement>(
      '[aria-label="麦茶パックを編集"]',
    )
    if (!edit) {
      throw new Error('Added product was not restored')
    }
    await click(edit)
    await inputText(
      '[aria-describedby="catalog-product-name-count"]',
      '水出し麦茶',
    )
    await click(button('変更を保存'))
    const edited = container.querySelector<HTMLButtonElement>(
      '[aria-label="水出し麦茶を編集"]',
    )
    if (!edited) {
      throw new Error('Edited household product was not rendered')
    }
    await click(edited)
    await click(button('商品リストから外す'))
    expect(savedCatalog().addedProducts[0].hidden).toBe(true)
    await click(button('リストに戻す'))
    expect(savedCatalog().addedProducts[0].hidden).toBe(false)
  })

  it('asks before changing the unit of a selected draft product', async () => {
    window.localStorage.setItem(
      'otsukai:createDraft',
      JSON.stringify({ milk: { quantity: 2, memo: '低脂肪' } }),
    )
    const confirm = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: confirm,
    })
    await renderPage()
    const edit = container.querySelector<HTMLButtonElement>(
      '[aria-label="牛乳を編集"]',
    )
    if (!edit) {
      throw new Error('Milk edit button was not rendered')
    }
    await click(edit)
    await inputText(
      '[aria-describedby="catalog-product-unit-count"]',
      'パック',
    )
    await click(button('変更を保存'))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(savedCatalog().overrides?.milk).toBeUndefined()

    await click(button('変更を保存'))
    expect(confirm).toHaveBeenLastCalledWith(
      'この商品は作成中の依頼で2本選択されています。\n単位を「パック」に変更すると、2パックとして表示されます。',
    )
    expect(savedCatalog().overrides.milk).toEqual({ unit: 'パック' })
  })

  it('closes with Escape and restores focus to the opening control', async () => {
    await renderPage()
    const add = button('新しい商品を追加')
    add.focus()
    await click(add)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      await Promise.resolve()
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(add)
  })
})
