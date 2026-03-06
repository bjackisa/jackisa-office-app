/**
 * Jackisa Office — Investment Engine
 * Client-side calculation helpers for NAV, fees, projections, and signals.
 * All monetary math uses standard JS numbers (sufficient for display-level precision).
 */

// ============================================================================
// Fee Waterfall — Three-Tier Deduction
// ============================================================================

export interface FeeWaterfallResult {
  jackisaFee: number
  mgmtFee: number
  netAmount: number
  totalFees: number
}

export function calculateFeeWaterfall(
  grossAmount: number,
  jackisaRate: number,
  mgmtRate: number
): FeeWaterfallResult {
  const jackisaFee = Math.round(grossAmount * jackisaRate * 100) / 100
  const afterJackisa = grossAmount - jackisaFee
  const mgmtFee = Math.round(afterJackisa * mgmtRate * 100) / 100
  const netAmount = afterJackisa - mgmtFee
  return { jackisaFee, mgmtFee, netAmount, totalFees: jackisaFee + mgmtFee }
}

// ============================================================================
// Contribution Preview
// ============================================================================

export interface ContributionPreview {
  grossAmount: number
  jackisaFee: number
  mgmtFee: number
  netInvested: number
  unitsReceived: number
  navAtPurchase: number
  ownershipPct: number
}

export function previewContribution(
  grossAmount: number,
  nav: number,
  jackisaContribRate: number,
  mgmtContribRate: number,
  existingUnits: number,
  totalFundUnits: number
): ContributionPreview {
  const fees = calculateFeeWaterfall(grossAmount, jackisaContribRate, mgmtContribRate)
  const units = nav > 0 ? fees.netAmount / nav : 0
  const totalUnitsAfter = existingUnits + units
  const totalFundUnitsAfter = totalFundUnits + units
  const ownershipPct = totalFundUnitsAfter > 0 ? (totalUnitsAfter / totalFundUnitsAfter) * 100 : 0

  return {
    grossAmount,
    jackisaFee: fees.jackisaFee,
    mgmtFee: fees.mgmtFee,
    netInvested: fees.netAmount,
    unitsReceived: units,
    navAtPurchase: nav,
    ownershipPct,
  }
}

// ============================================================================
// Redemption Preview
// ============================================================================

export interface RedemptionPreview {
  unitsToSell: number
  grossValue: number
  exitFee: number
  afterFee: number
  costBasis: number
  capitalGain: number
  withholdingTax: number
  netPayout: number
}

export function previewRedemption(
  unitsToSell: number,
  nav: number,
  exitFeeRate: number,
  avgCostBasis: number,
  whtRate: number = 0.15
): RedemptionPreview {
  const grossValue = unitsToSell * nav
  const exitFee = Math.round(grossValue * exitFeeRate * 100) / 100
  const afterFee = grossValue - exitFee
  const costBasis = avgCostBasis * unitsToSell
  const capitalGain = Math.max(0, afterFee - costBasis)
  const withholdingTax = Math.round(capitalGain * whtRate * 100) / 100
  const netPayout = afterFee - withholdingTax

  return { unitsToSell, grossValue, exitFee, afterFee, costBasis, capitalGain, withholdingTax, netPayout }
}

// ============================================================================
// Daily Compounding
// ============================================================================

export function annualToDailyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 365) - 1
}

export function dailyToAnnualRate(dailyRate: number): number {
  return Math.pow(1 + dailyRate, 365) - 1
}

// ============================================================================
// Intraday NAV Estimate
// ============================================================================

export function estimateIntradayNav(
  openingNav: number,
  expectedDailyRate: number,
  todayRevenue: number,
  todayExpenses: number,
  totalUnits: number,
  currentHour: number = new Date().getHours()
): number {
  const fractionOfDay = Math.min(1, Math.max(0, currentHour / 24))
  const baseGrowth = openingNav * expectedDailyRate * fractionOfDay
  const activityImpact = totalUnits > 0 ? (todayRevenue - todayExpenses) / totalUnits : 0
  return openingNav + baseGrowth + activityImpact
}

// ============================================================================
// Signal Score Calculation (mirrors the SQL function)
// ============================================================================

export type SignalCategory = 'strong_buy' | 'consider_buy' | 'hold' | 'consider_sell' | 'strong_sell'

export interface SignalResult {
  compositeScore: number
  signal: SignalCategory
  factors: {
    targetReturn: number
    momentum7d: number
    momentum30d: number
    high52wProximity: number
    low52wProximity: number
  }
}

export function calculateSignal(
  personalReturn: number,
  targetReturn: number,
  currentNav: number,
  nav7dAgo: number | null,
  nav30dAgo: number | null,
  nav52wHigh: number | null,
  nav52wLow: number | null
): SignalResult {
  // Factor 1: Target return achieved (weight 30)
  const f1 = personalReturn >= targetReturn * 1.5 ? -30
    : personalReturn >= targetReturn ? -15
    : personalReturn >= targetReturn * 0.5 ? 0
    : personalReturn >= 0 ? 10
    : 20

  // Factor 2: 7-day momentum (weight 20)
  const f2 = nav7dAgo == null ? 0
    : currentNav > nav7dAgo * 1.02 ? 15
    : currentNav > nav7dAgo ? 5
    : currentNav < nav7dAgo * 0.98 ? -15
    : -5

  // Factor 3: 30-day momentum (weight 20)
  const f3 = nav30dAgo == null ? 0
    : currentNav > nav30dAgo * 1.05 ? 15
    : currentNav > nav30dAgo ? 5
    : currentNav < nav30dAgo * 0.95 ? -15
    : -5

  // Factor 4: 52-week high proximity (weight 15)
  const f4 = nav52wHigh == null || nav52wHigh === 0 ? 0
    : currentNav >= nav52wHigh * 0.95 ? -15
    : currentNav >= nav52wHigh * 0.85 ? -5
    : 5

  // Factor 5: 52-week low proximity (weight 15)
  const f5 = nav52wLow == null || nav52wLow === 0 ? 0
    : currentNav <= nav52wLow * 1.05 ? 15
    : currentNav <= nav52wLow * 1.15 ? 5
    : -5

  const score = f1 + f2 + f3 + f4 + f5

  const signal: SignalCategory =
    score >= 40 ? 'strong_buy'
    : score >= 15 ? 'consider_buy'
    : score > -15 ? 'hold'
    : score > -40 ? 'consider_sell'
    : 'strong_sell'

  return {
    compositeScore: score,
    signal,
    factors: {
      targetReturn: f1,
      momentum7d: f2,
      momentum30d: f3,
      high52wProximity: f4,
      low52wProximity: f5,
    },
  }
}

// ============================================================================
// Projection Calculator
// ============================================================================

export interface ProjectionYear {
  year: number
  nominalValue: number
  realValue: number
  totalContributions: number
}

export function projectInvestment(
  currentValue: number,
  monthlyContribution: number,
  annualReturnRate: number,
  years: number,
  inflationRate: number
): ProjectionYear[] {
  const monthlyRate = Math.pow(1 + annualReturnRate, 1 / 12) - 1
  const result: ProjectionYear[] = []
  let nominal = currentValue
  let totalContributions = currentValue

  for (let m = 1; m <= years * 12; m++) {
    nominal = nominal * (1 + monthlyRate) + monthlyContribution
    totalContributions += monthlyContribution

    if (m % 12 === 0) {
      const yearNum = m / 12
      const real = nominal / Math.pow(1 + inflationRate, yearNum)
      result.push({
        year: yearNum,
        nominalValue: Math.round(nominal),
        realValue: Math.round(real),
        totalContributions: Math.round(totalContributions),
      })
    }
  }

  return result
}

// ============================================================================
// Rule of 72
// ============================================================================

export function rule72(annualRate: number): number {
  if (annualRate <= 0) return Infinity
  return 72 / (annualRate * 100)
}

// ============================================================================
// Average Cost Basis Update
// ============================================================================

export function updateAvgCostBasis(
  existingInvested: number,
  existingUnits: number,
  newInvested: number,
  newUnits: number
): number {
  const totalInvested = existingInvested + newInvested
  const totalUnits = existingUnits + newUnits
  return totalUnits > 0 ? totalInvested / totalUnits : 0
}

// ============================================================================
// NAV Calculation (client-side estimate)
// ============================================================================

export function calculateNav(
  totalAssets: number,
  cashPool: number,
  totalLiabilities: number,
  totalUnitsOutstanding: number
): number {
  if (totalUnitsOutstanding <= 0) return 1.0
  return (totalAssets + cashPool - totalLiabilities) / totalUnitsOutstanding
}

// ============================================================================
// Format Helpers
// ============================================================================

export function formatCurrency(amount: number, currency: string = 'UGX', decimals: number = 0): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export function formatPct(value: number, decimals: number = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function formatUnits(units: number, decimals: number = 4): string {
  return units.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
