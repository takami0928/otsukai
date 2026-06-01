import type { CheckedStateMap, CreateDraftState } from '../types/shopping'

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
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadCreateDraft(): CreateDraftState {
  return readJson<CreateDraftState>(CREATE_DRAFT_KEY, {})
}

export function saveCreateDraft(draft: CreateDraftState) {
  writeJson(CREATE_DRAFT_KEY, draft)
}

export function loadCheckedState(requestId: string): CheckedStateMap {
  return readJson<CheckedStateMap>(`otsukai:checked:${requestId}`, {})
}

export function saveCheckedState(requestId: string, state: CheckedStateMap) {
  writeJson(`otsukai:checked:${requestId}`, state)
}

export function loadLastSharedUrl(): string {
  return window.localStorage.getItem(LAST_SHARED_URL_KEY) || ''
}

export function saveLastSharedUrl(url: string) {
  window.localStorage.setItem(LAST_SHARED_URL_KEY, url)
}
