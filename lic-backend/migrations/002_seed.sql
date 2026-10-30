-- ============================================================================
-- Jackisa License Hub — seed plans and feature registry.
-- Idempotent: safe to re-run.
-- ============================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Plans: monthly, quarterly (3), biannual (6), annual (12), 2 years, 3 years.
-- Longer commitments carry a discount, applied here as the list price.
-- ---------------------------------------------------------------------------
INSERT INTO plans (id, code, name, tier, interval_months, price, currency, max_employees, max_students, storage_gb, features, sort_order) VALUES
  (UUID(), 'basic_1m',  'Basic Monthly',        'basic',    1,  25000, 'UGX',  10,   0,   5,  '{"education":false,"investment":false,"api_access":false}', 10),
  (UUID(), 'basic_3m',  'Basic Quarterly',      'basic',    3,  72750, 'UGX',  10,   0,   5,  '{"education":false,"investment":false,"api_access":false}', 11),
  (UUID(), 'basic_6m',  'Basic Biannual',       'basic',    6, 141000, 'UGX',  10,   0,   5,  '{"education":false,"investment":false,"api_access":false}', 12),
  (UUID(), 'basic_12m', 'Basic Annual',         'basic',   12, 264000, 'UGX',  10,   0,   5,  '{"education":false,"investment":false,"api_access":false}', 13),
  (UUID(), 'basic_24m', 'Basic 2 Years',        'basic',   24, 492000, 'UGX',  10,   0,   5,  '{"education":false,"investment":false,"api_access":false}', 14),
  (UUID(), 'basic_36m', 'Basic 3 Years',        'basic',   36, 675000, 'UGX',  10,   0,   5,  '{"education":false,"investment":false,"api_access":false}', 15),

  (UUID(), 'pro_1m',  'Pro Monthly',        'pro',    1,  75000, 'UGX',  100,  500,  50,  '{"education":true,"investment":true,"api_access":false}', 20),
  (UUID(), 'pro_3m',  'Pro Quarterly',      'pro',    3, 218250, 'UGX',  100,  500,  50,  '{"education":true,"investment":true,"api_access":false}', 21),
  (UUID(), 'pro_6m',  'Pro Biannual',       'pro',    6, 423000, 'UGX',  100,  500,  50,  '{"education":true,"investment":true,"api_access":false}', 22),
  (UUID(), 'pro_12m', 'Pro Annual',         'pro',   12, 792000, 'UGX',  100,  500,  50,  '{"education":true,"investment":true,"api_access":false}', 23),
  (UUID(), 'pro_24m', 'Pro 2 Years',        'pro',   24, 1476000,'UGX',  100,  500,  50,  '{"education":true,"investment":true,"api_access":false}', 24),
  (UUID(), 'pro_36m', 'Pro 3 Years',        'pro',   36, 2025000,'UGX',  100,  500,  50,  '{"education":true,"investment":true,"api_access":false}', 25),

  (UUID(), 'platinum_1m',  'Platinum Monthly',   'platinum', 1,  150000, 'UGX', 0, 0, 500, '{"education":true,"investment":true,"api_access":true,"unit_trust":true,"dividends":true,"income_tax":true}', 30),
  (UUID(), 'platinum_3m',  'Platinum Quarterly', 'platinum', 3,  436500, 'UGX', 0, 0, 500, '{"education":true,"investment":true,"api_access":true,"unit_trust":true,"dividends":true,"income_tax":true}', 31),
  (UUID(), 'platinum_6m',  'Platinum Biannual',  'platinum', 6,  846000, 'UGX', 0, 0, 500, '{"education":true,"investment":true,"api_access":true,"unit_trust":true,"dividends":true,"income_tax":true}', 32),
  (UUID(), 'platinum_12m', 'Platinum Annual',    'platinum',12, 1584000, 'UGX', 0, 0, 500, '{"education":true,"investment":true,"api_access":true,"unit_trust":true,"dividends":true,"income_tax":true}', 33),
  (UUID(), 'platinum_24m', 'Platinum 2 Years',   'platinum',24, 2952000, 'UGX', 0, 0, 500, '{"education":true,"investment":true,"api_access":true,"unit_trust":true,"dividends":true,"income_tax":true}', 34),
  (UUID(), 'platinum_36m', 'Platinum 3 Years',   'platinum',36, 4050000, 'UGX', 0, 0, 500, '{"education":true,"investment":true,"api_access":true,"unit_trust":true,"dividends":true,"income_tax":true}', 35)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), tier = VALUES(tier), interval_months = VALUES(interval_months),
  price = VALUES(price), currency = VALUES(currency), max_employees = VALUES(max_employees),
  max_students = VALUES(max_students), storage_gb = VALUES(storage_gb),
  features = VALUES(features), sort_order = VALUES(sort_order);

-- ---------------------------------------------------------------------------
-- Feature registry. min_tier is the lowest tier that unlocks the feature.
-- ---------------------------------------------------------------------------
INSERT INTO features (id, slug, name, category, min_tier) VALUES
  (UUID(), 'dashboard',        'Dashboard',                 'core',       'basic'),
  (UUID(), 'payments_hub',     'Payments Hub',              'core',       'basic'),
  (UUID(), 'accounting',       'Accounting & Finance',      'finance',    'basic'),
  (UUID(), 'invoicing',        'Invoicing',                 'finance',    'basic'),
  (UUID(), 'expenses',         'Expenses',                  'finance',    'basic'),
  (UUID(), 'vat',              'VAT Management',            'finance',    'basic'),
  (UUID(), 'bookkeeping',      'Bookkeeping',               'finance',    'basic'),
  (UUID(), 'hr',               'HR & Payroll',              'hr',         'basic'),
  (UUID(), 'payroll',          'Payroll',                   'hr',         'basic'),
  (UUID(), 'paye',             'PAYE & Tax',                'hr',         'basic'),
  (UUID(), 'attendance',       'Attendance',                'hr',         'basic'),
  (UUID(), 'leave',            'Leave Management',          'hr',         'basic'),
  (UUID(), 'performance',      'Performance',               'hr',         'pro'),
  (UUID(), 'hr_points',        'HR Points',                 'hr',         'pro'),
  (UUID(), 'education',        'Education Management',      'education',  'pro'),
  (UUID(), 'students',         'Students',                  'education',  'pro'),
  (UUID(), 'coursework',       'Coursework',                'education',  'pro'),
  (UUID(), 'sales',            'Sales & Marketing',         'sales',      'basic'),
  (UUID(), 'commissions',      'Commissions',               'sales',      'pro'),
  (UUID(), 'affiliate',        'Affiliate Program',         'sales',      'pro'),
  (UUID(), 'investment',       'Investment & Funds',        'investment', 'pro'),
  (UUID(), 'unit_trust',       'Unit Trust',                'investment', 'platinum'),
  (UUID(), 'dividends',        'Dividends',                 'investment', 'platinum'),
  (UUID(), 'income_tax',       'Income Tax Evaluator',      'finance',    'platinum'),
  (UUID(), 'legal',            'Legal Documents',           'legal',      'pro'),
  (UUID(), 'cms',              'CMS',                       'content',    'pro'),
  (UUID(), 'helpdesk',         'Help Desk',                 'support',    'basic'),
  (UUID(), 'kyc',              'KYC Verification',          'compliance', 'platinum'),
  (UUID(), 'api_access',       'API Access',                'platform',   'platinum'),
  (UUID(), 'whapi_alerts',     'WhatsApp Alerts',           'platform',   'pro'),
  (UUID(), 'pdf_reports',      'PDF Reports',               'platform',   'pro')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), category = VALUES(category), min_tier = VALUES(min_tier);
