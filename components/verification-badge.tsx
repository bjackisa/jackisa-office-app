'use client'

import { BadgeCheck, ShieldCheck } from 'lucide-react'

/**
 * Verification badge.
 *   - blue  : a verified individual (KYC cleared, or auto-verified from jackisa.com)
 *   - gold  : a verified company (gold badge)
 *
 * Usage:
 *   <VerificationBadge kind="individual" verified={user.kyc_status === 'verified'} />
 *   <VerificationBadge kind="company" verified={company.verified} />
 */
export function VerificationBadge({
  kind,
  verified,
  showLabel = false,
  className = '',
}: {
  kind: 'individual' | 'company'
  verified?: boolean | null
  showLabel?: boolean
  className?: string
}) {
  if (!verified) return null

  const isCompany = kind === 'company'
  const label = isCompany ? 'Verified company' : 'Verified'
  const Icon = isCompany ? ShieldCheck : BadgeCheck

  return (
    <span
      className={`inline-flex items-center gap-1 align-middle ${className}`}
      title={label}
      aria-label={label}
    >
      <Icon
        className={isCompany ? 'w-4 h-4 text-amber-500' : 'w-4 h-4 text-blue-500'}
        fill="currentColor"
        strokeWidth={1.5}
      />
      {showLabel && (
        <span className={`text-[11px] font-semibold ${isCompany ? 'text-amber-600' : 'text-blue-600'}`}>
          {label}
        </span>
      )}
    </span>
  )
}
