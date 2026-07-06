import type { CartOrderList, CheckedStateMap, CreateDraftState } from '../types/shopping'
import { normalizeCartOrder, normalizeCheckedState } from './shoppingState'

const CREATE_DRAFT_KEY = 'otsukai:createDraft'
const LAST_SHARED_URL_KEY = 'otsukai:lastSharedUrl'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn(`Failed to write localStorage key: ${key}`, error)
  }
}

export function loadCreateDraft(): CreateDraftState {
  return readJson<CreateDraftState>(CREATE_DRAFT_KEY, {})
}

export function saveCreateDraft(draft: CreateDraftState) {
  writeJson(CREATE_DRAFT_KEY, draft)
}

export function loadCheckedState(requestId: string): CheckedStateMap {
  return normalizeCheckedState(readJson<unknown>(`otsukai:checked:${requestId}`, {}))
}

export function saveCheckedState(requestId: string, state: CheckedStateMap) {
  writeJson(`otsukai:checked:${requestId}`, normalizeCheckedState(state))
}

export function loadCartOrder(requestId: string): CartOrderList {
  return normalizeCartOrder(readJson<unknown>(`otsukai:cartOrder:${requestId}`, []))
}

export function saveCartOrder(requestId: string, order: CartOrderList) {
  writeJson(`otsukai:cartOrder:${requestId}`, normalizeCartOrder(order))
}

export function loadLastSharedUrl(): string {
  try {
    return window.localStorage.getItem(LAST_SHARED_URL_KEY) || ''
  } catch {
    return ''
  }
}

export function saveLastSharedUrl(url: string) {
  try {
    window.localStorage.setItem(LAST_SHARED_URL_KEY, url)
  } catch (error) {
    console.warn(`Failed to write localStorage key: ${LAST_SHARED_URL_KEY}`, error)
  }
}
