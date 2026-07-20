import { describe, expect, it } from 'vitest'
import {
  isShareUrlWarning,
  isTotalConditionWarning,
} from './requestBudget'

describe('request limit warning thresholds', () => {
  it('starts the total-condition warning at exactly 800 characters', () => {
    expect(isTotalConditionWarning(799)).toBe(false)
    expect(isTotalConditionWarning(800)).toBe(true)
    expect(isTotalConditionWarning(1_000)).toBe(true)
  })

  it('starts the final share URL warning at exactly 1,760 characters', () => {
    expect(isShareUrlWarning(1_759)).toBe(false)
    expect(isShareUrlWarning(1_760)).toBe(true)
    expect(isShareUrlWarning(2_200)).toBe(true)
  })
})
