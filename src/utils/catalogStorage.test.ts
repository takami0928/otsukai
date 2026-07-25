import { describe, expect, it } from 'vitest'
import {
  CATALOG_BACKUP_RECEIPT_KEY,
  HOUSEHOLD_CATALOG_KEY,
  HOUSEHOLD_CATALOG_PREVIOUS_KEY,
  loadCatalogBackupReceipt,
  loadHouseholdCatalog,
  saveCatalogBackupReceipt,
  saveHouseholdCatalog,
} from './catalogStorage'
import {
  createEmptyHouseholdCatalog,
  updateBaseProduct,
} from './householdCatalog'

const NOW = '2026-07-26T00:00:00.000Z'

class MemoryStorage implements Storage {
  protected values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

class FailOnceStorage extends MemoryStorage {
  failNextCurrentWrite = false

  override setItem(key: string, value: string) {
    if (key === HOUSEHOLD_CATALOG_KEY && this.failNextCurrentWrite) {
      this.failNextCurrentWrite = false
      throw new Error('quota')
    }
    super.setItem(key, value)
  }
}

describe('household catalog storage', () => {
  it('saves the current catalog, preserves the previous generation, and verifies the write', () => {
    const storage = new MemoryStorage()
    const empty = createEmptyHouseholdCatalog(NOW)
    expect(saveHouseholdCatalog(empty, storage)).toMatchObject({ ok: true })

    const changed = updateBaseProduct(
      empty,
      'milk',
      {
        name: 'いつもの牛乳',
        unit: '本',
        categoryId: 'eggs-dairy',
        hidden: false,
      },
      '2026-07-26T01:00:00.000Z',
    )
    const result = saveHouseholdCatalog(changed, storage)
    expect(result).toMatchObject({ ok: true, catalog: changed })
    expect(
      JSON.parse(storage.getItem(HOUSEHOLD_CATALOG_PREVIOUS_KEY) ?? ''),
    ).toEqual(empty)
    expect(loadHouseholdCatalog(storage)).toEqual({
      catalog: changed,
      source: 'current',
      recovered: false,
    })
  })

  it('restores a valid previous generation when the current value is corrupt', () => {
    const storage = new MemoryStorage()
    const previous = createEmptyHouseholdCatalog(NOW)
    storage.setItem(HOUSEHOLD_CATALOG_KEY, '{broken')
    storage.setItem(
      HOUSEHOLD_CATALOG_PREVIOUS_KEY,
      JSON.stringify(previous),
    )

    expect(loadHouseholdCatalog(storage)).toEqual({
      catalog: previous,
      source: 'previous',
      recovered: true,
    })
    expect(JSON.parse(storage.getItem(HOUSEHOLD_CATALOG_KEY) ?? '')).toEqual(
      previous,
    )
  })

  it('falls back to the base catalog when both generations are absent or invalid', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      HOUSEHOLD_CATALOG_KEY,
      JSON.stringify({ schemaVersion: 2 }),
    )
    storage.setItem(
      HOUSEHOLD_CATALOG_PREVIOUS_KEY,
      JSON.stringify({
        ...createEmptyHouseholdCatalog(NOW),
        overrides: { milk: { categoryId: 'unknown' } },
      }),
    )
    expect(loadHouseholdCatalog(storage, undefined, undefined, NOW)).toEqual({
      catalog: createEmptyHouseholdCatalog(NOW),
      source: 'default',
      recovered: false,
    })
  })

  it('rejects unsafe shapes and does not replace screen state after a failed write', () => {
    const storage = new FailOnceStorage()
    const empty = createEmptyHouseholdCatalog(NOW)
    expect(saveHouseholdCatalog(empty, storage).ok).toBe(true)
    const changed = updateBaseProduct(
      empty,
      'milk',
      {
        name: '変更',
        unit: '本',
        categoryId: 'eggs-dairy',
        hidden: false,
      },
      '2026-07-26T01:00:00.000Z',
    )
    storage.failNextCurrentWrite = true
    expect(saveHouseholdCatalog(changed, storage)).toMatchObject({ ok: false })
    expect(loadHouseholdCatalog(storage).catalog).toEqual(empty)

    const dangerous = JSON.parse(
      `{"schemaVersion":1,"revision":0,"updatedAt":"${NOW}","overrides":{"constructor":{"hidden":true}},"addedProducts":[]}`,
    )
    expect(saveHouseholdCatalog(dangerous, storage)).toMatchObject({ ok: false })
  })

  it('stores only a valid explicit backup confirmation receipt', () => {
    const storage = new MemoryStorage()
    const receipt = {
      catalogFingerprint: 'catalog-v1-0123456789abcdef',
      confirmedAt: NOW,
    }
    expect(loadCatalogBackupReceipt(storage)).toBeNull()
    expect(saveCatalogBackupReceipt(receipt, storage)).toBe(true)
    expect(loadCatalogBackupReceipt(storage)).toEqual(receipt)

    storage.setItem(
      CATALOG_BACKUP_RECEIPT_KEY,
      JSON.stringify({ ...receipt, constructor: 'unsafe' }),
    )
    expect(loadCatalogBackupReceipt(storage)).toBeNull()
  })
})
