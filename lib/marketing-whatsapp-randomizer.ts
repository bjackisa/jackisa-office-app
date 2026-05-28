export const WHATSAPP_SUCCESS_DELAY_MINUTES = {
  min: 7,
  max: 16,
} as const

export interface WhatsAppVariantCycleState<VariantId extends string = string> {
  /** Variant ids still available in the current cycle, in the randomized send order. */
  remainingVariantIds: VariantId[]
  /** Last variant selected successfully. Used to avoid immediate repeats at cycle boundaries. */
  lastVariantId: VariantId | null
}

export interface WhatsAppVariantSelection<VariantId extends string = string> {
  variantId: VariantId
  state: WhatsAppVariantCycleState<VariantId>
  delayMs: number
  delayMinutes: number
}

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffle<VariantId extends string>(variantIds: readonly VariantId[]): VariantId[] {
  const shuffled = [...variantIds]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIntInclusive(0, index)
    const currentVariantId = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = currentVariantId
  }

  return shuffled
}

function buildNextCycle<VariantId extends string>(
  variantIds: readonly VariantId[],
  lastVariantId: VariantId | null,
): VariantId[] {
  const nextCycle = shuffle(variantIds)

  if (nextCycle.length > 1 && lastVariantId !== null && nextCycle[0] === lastVariantId) {
    const swapIndex = nextCycle.findIndex((variantId) => variantId !== lastVariantId)
    const firstVariantId = nextCycle[0]
    nextCycle[0] = nextCycle[swapIndex]
    nextCycle[swapIndex] = firstVariantId
  }

  return nextCycle
}

function normalizeState<VariantId extends string>(
  variantIds: readonly VariantId[],
  state?: Partial<WhatsAppVariantCycleState<VariantId>> | null,
): WhatsAppVariantCycleState<VariantId> {
  const variantSet = new Set(variantIds)
  const remainingVariantIds = (state?.remainingVariantIds ?? []).filter((variantId) => variantSet.has(variantId))
  const lastVariantId = state?.lastVariantId && variantSet.has(state.lastVariantId) ? state.lastVariantId : null

  return { remainingVariantIds, lastVariantId }
}

export function getRandomWhatsAppSuccessDelayMinutes(): number {
  return randomIntInclusive(WHATSAPP_SUCCESS_DELAY_MINUTES.min, WHATSAPP_SUCCESS_DELAY_MINUTES.max)
}

export function getRandomWhatsAppSuccessDelayMs(): number {
  return getRandomWhatsAppSuccessDelayMinutes() * 60 * 1000
}

/**
 * Selects one WhatsApp variant from a randomized cycle.
 *
 * Each variant is selected exactly once before a new randomized cycle starts. When a cycle
 * restarts, the first variant in the new cycle is kept different from the last successful
 * variant whenever more than one variant exists, preventing back-to-back duplicate sends.
 */
export function selectNextWhatsAppVariant<VariantId extends string>(
  variantIds: readonly VariantId[],
  state?: Partial<WhatsAppVariantCycleState<VariantId>> | null,
): WhatsAppVariantSelection<VariantId> {
  const uniqueVariantIds = [...new Set(variantIds)]

  if (uniqueVariantIds.length === 0) {
    throw new Error('At least one WhatsApp variant is required.')
  }

  const normalizedState = normalizeState(uniqueVariantIds, state)
  const remainingVariantIds = normalizedState.remainingVariantIds.length > 0
    ? [...normalizedState.remainingVariantIds]
    : buildNextCycle(uniqueVariantIds, normalizedState.lastVariantId)

  const variantId = remainingVariantIds.shift()

  if (!variantId) {
    throw new Error('Unable to select a WhatsApp variant.')
  }

  const delayMinutes = getRandomWhatsAppSuccessDelayMinutes()

  return {
    variantId,
    delayMinutes,
    delayMs: delayMinutes * 60 * 1000,
    state: {
      remainingVariantIds,
      lastVariantId: variantId,
    },
  }
}

export class WhatsAppVariantRandomizer<VariantId extends string = string> {
  private state: WhatsAppVariantCycleState<VariantId>

  constructor(
    private readonly variantIds: readonly VariantId[],
    initialState?: Partial<WhatsAppVariantCycleState<VariantId>> | null,
  ) {
    this.state = normalizeState([...new Set(variantIds)], initialState)
  }

  getState(): WhatsAppVariantCycleState<VariantId> {
    return {
      remainingVariantIds: [...this.state.remainingVariantIds],
      lastVariantId: this.state.lastVariantId,
    }
  }

  selectNext(): WhatsAppVariantSelection<VariantId> {
    const selection = selectNextWhatsAppVariant(this.variantIds, this.state)
    this.state = selection.state
    return selection
  }
}
