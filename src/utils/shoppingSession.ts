import type {
  ConsultationMap,
  ShoppingRequestPayload,
} from '../types/shopping'
import { decodeCompactRequestV2OrV3 } from './compactRequestV3'
import {
  migrateLegacyConsultingState,
  reconcileConsultations,
} from './consultationState'
import { decodeShoppingRequest } from './encodeRequest'
import {
  getItemStatus,
  isCartStatus,
  reconcileCheckedStateWithIssues,
  reconcileItemIssues,
  type ShoppingStateSnapshot,
} from './shoppingState'
import {
  loadCartOrder,
  loadCheckedState,
  loadConsultations,
  loadItemIssues,
} from './storage'

export type RequestRouteCodec = 'legacy-query' | 'compact-path'

export type LoadedShoppingSession = {
  payload: ShoppingRequestPayload
  shoppingState: ShoppingStateSnapshot
  consultations: ConsultationMap
}

export function decodeShoppingSessionPayload(input: {
  encodedPayload: string
  codec: RequestRouteCodec
}): ShoppingRequestPayload {
  return input.codec === 'compact-path'
    ? decodeCompactRequestV2OrV3(input.encodedPayload)
    : decodeShoppingRequest(input.encodedPayload)
}

export function restoreShoppingSession(
  payload: ShoppingRequestPayload,
): LoadedShoppingSession {
  const migration = migrateLegacyConsultingState(
    loadCheckedState(payload.requestId),
    loadItemIssues(payload.requestId),
    loadConsultations(payload.requestId),
  )
  const checkedState = reconcileCheckedStateWithIssues(
    migration.checkedState,
    migration.itemIssues,
  )
  const itemIssues = reconcileItemIssues(
    migration.itemIssues,
    checkedState,
  )
  const consultations = reconcileConsultations(
    migration.consultations,
    payload.items.map((item) => item.id),
  )
  const cartOrder = loadCartOrder(payload.requestId).filter((itemId) =>
    isCartStatus(getItemStatus(checkedState, itemId)),
  )

  return {
    payload,
    shoppingState: {
      checkedState,
      itemIssues,
      cartOrder,
    },
    consultations,
  }
}

export function loadShoppingSession(input: {
  encodedPayload: string
  codec: RequestRouteCodec
}): LoadedShoppingSession {
  return restoreShoppingSession(decodeShoppingSessionPayload(input))
}
