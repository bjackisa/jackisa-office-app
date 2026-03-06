export function getEffectiveFundNav(fund: {
  nav_per_unit?: number | null
  total_assets?: number | null
  total_liabilities?: number | null
  total_units_outstanding?: number | null
}) {
  const explicitNav = Number(fund?.nav_per_unit || 0)
  if (explicitNav > 0) return explicitNav

  const totalAssets = Number(fund?.total_assets || 0)
  const totalLiabilities = Number(fund?.total_liabilities || 0)
  const totalUnits = Number(fund?.total_units_outstanding || 0)

  if (totalUnits > 0) {
    return Math.max((totalAssets - totalLiabilities) / totalUnits, 0)
  }

  return 1
}
