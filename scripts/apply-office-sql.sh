#!/usr/bin/env bash
# =============================================================================
# Apply the Jackisa Office SQL set to Supabase, in dependency order.
#
# Usage:
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
#     scripts/apply-office-sql.sh
#
# Get the connection string from Supabase → Project Settings → Database →
# Connection string (URI). Use the session pooler (port 5432) for migrations.
#
# Every file is idempotent, so re-running is safe. `office-backfill-legacy-v1.sql`
# adapts rows created before the licence hub / double-entry ledger existed.
# =============================================================================
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Supabase Postgres connection URI}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Dependency order matters: tables/helpers first, backfill last.
FILES=(
  full-schema.sql
  payment-gateway.sql
  finance-automation-phase1.sql
  finance-automation-phase2.sql
  hr-points-system-upgrade.sql
  hr-points-carry-forward-monthly-balances.sql
  hr-points-account-refill.sql
  hr-interview-module.sql
  education-documents-v1.sql
  licensing-and-platform-v1.sql          # defines jo_is_company_member() + platform_licenses
  industry-education-and-documents-v1.sql
  investment-module-and-ecosystem.sql
  investment-automation-fixes.sql
  payroll-ledger-and-trust-v1.sql
  payments-settlement-v1.sql
  security-rls-hardening-v1.sql
  fix-invoice-status-enum.sql
  office-membership-and-trial-v2.sql
  office-ledger-trust-hardening-v1.sql
  office-unit-trust-ledger-v2.sql
  office-backfill-legacy-v1.sql          # legacy data -> new invariants (run last)
)

for f in "${FILES[@]}"; do
  if [[ ! -f "$DIR/$f" ]]; then
    echo "MISSING $f" >&2
    exit 1
  fi
  printf 'applying %-45s ' "$f"
  if ! psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/$f" 2>/tmp/office-sql-err; then
    echo "FAILED"
    cat /tmp/office-sql-err >&2
    exit 1
  fi
  echo "ok"
done

echo "All office SQL applied."
