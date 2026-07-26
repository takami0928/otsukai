import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CheckedItemStatus,
  ConsultationMap,
  ItemIssue,
  ShoppingStateChange,
} from '../types/shopping'
import {
  applyShoppingStateChange,
  createShoppingStateChange,
  type ShoppingStateSnapshot,
} from '../utils/shoppingState'
import {
  saveCartOrder,
  saveCheckedState,
  saveConsultations,
  saveItemIssues,
} from '../utils/storage'

type PersistedShoppingSessionState = {
  requestId: string | null
  shoppingState: ShoppingStateSnapshot
  consultations: ConsultationMap
}

export type ShoppingSessionReplacement = {
  requestId: string
  shoppingState: ShoppingStateSnapshot
  consultations: ConsultationMap
}

export type CommittedShoppingChange = {
  change: ShoppingStateChange
  previousCartOrder: string[]
}

const EMPTY_SHOPPING_STATE: ShoppingStateSnapshot = {
  checkedState: {},
  itemIssues: {},
  cartOrder: [],
}

const EMPTY_SESSION: PersistedShoppingSessionState = {
  requestId: null,
  shoppingState: EMPTY_SHOPPING_STATE,
  consultations: {},
}

export function usePersistedShoppingSession() {
  const [session, setSession] =
    useState<PersistedShoppingSessionState>(EMPTY_SESSION)
  const sessionRef = useRef<PersistedShoppingSessionState>(EMPTY_SESSION)

  const setCurrentSession = useCallback(
    (nextSession: PersistedShoppingSessionState) => {
      sessionRef.current = nextSession
      setSession(nextSession)
    },
    [],
  )

  const replaceSession = useCallback(
    (replacement: ShoppingSessionReplacement) => {
      setCurrentSession({
        requestId: replacement.requestId,
        shoppingState: replacement.shoppingState,
        consultations: replacement.consultations,
      })
    },
    [setCurrentSession],
  )

  const commitShoppingChange = useCallback(
    (
      itemId: string,
      nextStatus: CheckedItemStatus,
      nextIssue?: ItemIssue,
    ): CommittedShoppingChange | null => {
      const currentSession = sessionRef.current
      const currentState = currentSession.shoppingState
      const change = createShoppingStateChange(
        currentState.checkedState,
        currentState.itemIssues,
        itemId,
        nextStatus,
        nextIssue,
      )

      if (!change) {
        return null
      }

      setCurrentSession({
        ...currentSession,
        shoppingState: applyShoppingStateChange(currentState, change),
      })
      return {
        change,
        previousCartOrder: [...currentState.cartOrder],
      }
    },
    [setCurrentSession],
  )

  const undoShoppingChange = useCallback(
    (change: ShoppingStateChange, previousCartOrder: string[]) => {
      const currentSession = sessionRef.current
      const revertedState = applyShoppingStateChange(
        currentSession.shoppingState,
        change,
        'undo',
      )
      setCurrentSession({
        ...currentSession,
        shoppingState: {
          ...revertedState,
          cartOrder: [...previousCartOrder],
        },
      })
    },
    [setCurrentSession],
  )

  const updateConsultations = useCallback(
    (updater: (current: ConsultationMap) => ConsultationMap) => {
      const currentSession = sessionRef.current
      const nextConsultations = updater(currentSession.consultations)
      if (nextConsultations === currentSession.consultations) {
        return
      }

      setCurrentSession({
        ...currentSession,
        consultations: nextConsultations,
      })
    },
    [setCurrentSession],
  )

  const getCurrentShoppingState = useCallback(
    () => sessionRef.current.shoppingState,
    [],
  )
  const getCurrentConsultations = useCallback(
    () => sessionRef.current.consultations,
    [],
  )

  useEffect(() => {
    if (session.requestId) {
      saveCheckedState(
        session.requestId,
        session.shoppingState.checkedState,
      )
    }
  }, [session.requestId, session.shoppingState.checkedState])

  useEffect(() => {
    if (session.requestId) {
      saveItemIssues(
        session.requestId,
        session.shoppingState.itemIssues,
      )
    }
  }, [session.requestId, session.shoppingState.itemIssues])

  useEffect(() => {
    if (session.requestId) {
      saveCartOrder(
        session.requestId,
        session.shoppingState.cartOrder,
      )
    }
  }, [session.requestId, session.shoppingState.cartOrder])

  useEffect(() => {
    if (session.requestId) {
      saveConsultations(session.requestId, session.consultations)
    }
  }, [session.consultations, session.requestId])

  return {
    shoppingState: session.shoppingState,
    consultations: session.consultations,
    replaceSession,
    commitShoppingChange,
    undoShoppingChange,
    updateConsultations,
    getCurrentShoppingState,
    getCurrentConsultations,
  }
}
