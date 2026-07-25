import { useMemo, useState } from 'react'
import { products } from '../data/products'
import type { HouseholdCatalogV1 } from '../types/householdCatalog'
import {
  loadCatalogBackupReceipt,
  loadHouseholdCatalog,
  saveHouseholdCatalog,
} from '../utils/catalogStorage'
import { getCatalogBackupStatus } from '../utils/catalogFingerprint'
import {
  buildAllEffectiveProductCatalog,
  buildEffectiveProductCatalog,
} from '../utils/householdCatalog'

export function useHouseholdCatalog() {
  const [catalog, setCatalog] = useState(
    () => loadHouseholdCatalog().catalog,
  )
  const [backupReceipt] = useState(loadCatalogBackupReceipt)
  const effectiveProducts = useMemo(
    () => buildAllEffectiveProductCatalog(products, catalog),
    [catalog],
  )
  const visibleProducts = useMemo(
    () => buildEffectiveProductCatalog(products, catalog),
    [catalog],
  )
  const backupStatus = useMemo(
    () => getCatalogBackupStatus(catalog, backupReceipt),
    [backupReceipt, catalog],
  )

  const updateCatalog = (nextCatalog: HouseholdCatalogV1): boolean => {
    const result = saveHouseholdCatalog(nextCatalog)
    if (!result.ok) {
      return false
    }
    setCatalog(result.catalog)
    return true
  }

  return {
    catalog,
    effectiveProducts,
    visibleProducts,
    backupStatus,
    updateCatalog,
  }
}
