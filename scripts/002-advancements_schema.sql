-- ============================================================================
-- Jackisa Office - Advancements Schema
-- This file adds new tables and columns to complement the existing schema
-- in 001-create-schema.sql. Run AFTER the base schema is installed.
-- ============================================================================

-- ============================================================================
-- NEW ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE point_action_type AS ENUM ('gain', 'loss');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE point_redemption_status AS ENUM ('pending', 'approved', 'rejected', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE document_gen_status AS ENUM ('draft', 'generated', 'signed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_status AS ENUM ('draft', 'confirmed', 'invoiced', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cms_content_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- COLUMNS ADDED TO EXISTING TABLES
-- ============================================================================

-- Add created_by to companies if missing (for FK from users)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Add logo and brand colors to companies for PDF/branding
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_primary_color VARCHAR(7) DEFAULT '#0D5BA3';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_secondary_color VARCHAR(7) DEFAULT '#FFFFFF';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_registration_number VARCHAR(50);

-- Add avatar and phone to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add digital signature to company_employees
ALTER TABLE company_employees ADD COLUMN IF NOT EXISTS digital_signature_url TEXT;
ALTER TABLE company_employees ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255);
ALTER TABLE company_employees ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(30);
ALTER TABLE company_employees ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE company_employees ADD COLUMN IF NOT EXISTS termination_date DATE;
ALTER TABLE company_employees ADD COLUMN IF NOT EXISTS termination_reason TEXT;

-- ============================================================================
-- SYSTEM TOOLS REGISTRY (super admin manages these)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  route VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map which tools are available per subscription tier
CREATE TABLE IF NOT EXISTS tier_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier subscription_tier NOT NULL,
  tool_id UUID NOT NULL REFERENCES system_tools(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tier, tool_id)
);

-- Map which tools are assigned to a company role
CREATE TABLE IF NOT EXISTS role_tool_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_role_id UUID NOT NULL REFERENCES company_roles(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES system_tools(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_role_id, tool_id)
);

-- ============================================================================
-- EMPLOYEE INVITATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_role_id UUID NOT NULL REFERENCES company_roles(id),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  department VARCHAR(100),
  position VARCHAR(100),
  salary DECIMAL(15, 2),
  token VARCHAR(255) NOT NULL UNIQUE,
  status invitation_status DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MULTI-COMPANY USER MAPPING (user can belong to multiple companies)
-- ============================================================================
-- This is already handled by company_employees table (user_id + company_id)
-- but we add a preferred/active company tracker

CREATE TABLE IF NOT EXISTS user_active_company (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- HR POINT SYSTEM (detailed rules per company)
-- ============================================================================

CREATE TABLE IF NOT EXISTS point_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  indicator VARCHAR(255) NOT NULL,
  description TEXT,
  point_value DECIMAL(5, 2) NOT NULL,
  action_type point_action_type NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Point transactions (each award/deduction)
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES point_rules(id),
  action_type point_action_type NOT NULL,
  points DECIMAL(5, 2) NOT NULL,
  reason TEXT,
  recorded_by UUID NOT NULL REFERENCES users(id),
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Point balance snapshot (monthly)
CREATE TABLE IF NOT EXISTS point_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  opening_balance DECIMAL(8, 2) DEFAULT 30,
  points_gained DECIMAL(8, 2) DEFAULT 0,
  points_lost DECIMAL(8, 2) DEFAULT 0,
  closing_balance DECIMAL(8, 2) DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, period_month, period_year)
);

-- Point redemption requests
CREATE TABLE IF NOT EXISTS point_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  points_redeemed DECIMAL(8, 2) NOT NULL,
  monetary_value DECIMAL(15, 2) NOT NULL,
  status point_redemption_status DEFAULT 'pending',
  approved_by UUID REFERENCES users(id),
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PAYROLL ENHANCEMENTS
-- ============================================================================

-- Salary structures with allowances/deductions breakdown
CREATE TABLE IF NOT EXISTS salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  basic_salary DECIMAL(15, 2) NOT NULL,
  housing_allowance DECIMAL(15, 2) DEFAULT 0,
  transport_allowance DECIMAL(15, 2) DEFAULT 0,
  medical_allowance DECIMAL(15, 2) DEFAULT 0,
  other_allowances JSONB DEFAULT '{}',
  other_deductions JSONB DEFAULT '{}',
  currency VARCHAR(3) DEFAULT 'UGX',
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PAYE tax bands (configurable per country)
CREATE TABLE IF NOT EXISTS paye_tax_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country VARCHAR(100) NOT NULL DEFAULT 'Uganda',
  band_order INTEGER NOT NULL,
  lower_limit DECIMAL(15, 2) NOT NULL,
  upper_limit DECIMAL(15, 2),
  rate DECIMAL(5, 4) NOT NULL,
  description VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Uganda PAYE bands
INSERT INTO paye_tax_bands (country, band_order, lower_limit, upper_limit, rate, description)
VALUES
  ('Uganda', 1, 0, 235000, 0.00, 'Tax-free threshold'),
  ('Uganda', 2, 235000, 335000, 0.10, '10% band'),
  ('Uganda', 3, 335000, 410000, 0.20, '20% band'),
  ('Uganda', 4, 410000, 10000000, 0.30, '30% band'),
  ('Uganda', 5, 10000000, NULL, 0.40, '40% band (excess)')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- LEAVE MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  max_days_per_year INTEGER NOT NULL DEFAULT 21,
  is_paid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL,
  reason TEXT,
  status leave_status DEFAULT 'pending',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ATTENDANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  clock_in TIME,
  clock_out TIME,
  status VARCHAR(20) DEFAULT 'present',
  late_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, attendance_date)
);

-- ============================================================================
-- SALES MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_number VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(30),
  order_date DATE NOT NULL,
  subtotal DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL,
  status sale_status DEFAULT 'draft',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales commissions
CREATE TABLE IF NOT EXISTS sales_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  commission_rate DECIMAL(5, 2) NOT NULL,
  commission_amount DECIMAL(15, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- HELP DESK / TICKET SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_number VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  priority ticket_priority DEFAULT 'medium',
  status ticket_status DEFAULT 'open',
  assigned_to UUID REFERENCES company_employees(id),
  reported_by UUID NOT NULL REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolution_minutes INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CMS (Content Management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  content TEXT,
  status cms_content_status DEFAULT 'draft',
  author_id UUID NOT NULL REFERENCES users(id),
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, slug)
);

CREATE TABLE IF NOT EXISTS cms_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  content TEXT,
  category VARCHAR(100),
  status cms_content_status DEFAULT 'draft',
  author_id UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, slug)
);

-- ============================================================================
-- KNOWLEDGE BASE (for point system KB articles)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES users(id),
  author_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  link VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STORAGE USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS storage_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  used_storage_bytes BIGINT DEFAULT 0,
  total_storage_bytes BIGINT DEFAULT 10737418240,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_point_transactions_employee ON point_transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_company ON point_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_point_balances_employee ON point_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_invitations_token ON employee_invitations(token);
CREATE INDEX IF NOT EXISTS idx_employee_invitations_email ON employee_invitations(email);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_company ON sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_user_active_company_user ON user_active_company(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_structures_employee ON salary_structures(employee_id);
CREATE INDEX IF NOT EXISTS idx_role_tool_mappings_role ON role_tool_mappings(company_role_id);

-- ============================================================================
-- SEED: Default System Tools
-- ============================================================================

INSERT INTO system_tools (name, slug, description, category, icon, route, sort_order) VALUES
  -- Dashboard
  ('Dashboard', 'dashboard', 'Main dashboard overview', 'Core', 'LayoutDashboard', '/app', 0),
  -- Accounting & Finance
  ('Accounting Dashboard', 'accounting-dashboard', 'Accounting overview', 'Accounting & Finance', 'Calculator', '/app/accounting', 10),
  ('Invoices', 'invoices', 'Create and manage invoices', 'Accounting & Finance', 'FileText', '/app/accounting/invoices', 11),
  ('Expenses', 'expenses', 'Track and manage expenses', 'Accounting & Finance', 'Receipt', '/app/accounting/expenses', 12),
  ('Credit Notes', 'credit-notes', 'Issue credit notes', 'Accounting & Finance', 'FileMinus', '/app/accounting/credit-notes', 13),
  ('Debit Notes', 'debit-notes', 'Issue debit notes', 'Accounting & Finance', 'FilePlus', '/app/accounting/debit-notes', 14),
  ('Chart of Accounts', 'chart-of-accounts', 'Manage chart of accounts', 'Accounting & Finance', 'BookOpen', '/app/accounting/chart-of-accounts', 15),
  ('VAT Management', 'vat-management', 'VAT calculation and filing', 'Accounting & Finance', 'Percent', '/app/accounting/vat', 16),
  ('Bookkeeping', 'bookkeeping', 'Double-entry bookkeeping', 'Accounting & Finance', 'Book', '/app/accounting/bookkeeping', 17),
  -- HR & Payroll
  ('HR Dashboard', 'hr-dashboard', 'HR overview', 'HR & Payroll', 'Users', '/app/hr', 20),
  ('Employee Management', 'employee-management', 'Manage employees', 'HR & Payroll', 'UserCog', '/app/hr/employees', 21),
  ('Salary Structures', 'salary-structures', 'Define salary structures', 'HR & Payroll', 'Wallet', '/app/hr/salary-structures', 22),
  ('Payroll', 'payroll', 'Run payroll and PAYE', 'HR & Payroll', 'Banknote', '/app/hr/payroll', 23),
  ('PAYE & Tax', 'paye-tax', 'PAYE tax calculator', 'HR & Payroll', 'Calculator', '/app/hr/paye', 24),
  ('Attendance', 'attendance', 'Track attendance', 'HR & Payroll', 'Clock', '/app/hr/attendance', 25),
  ('Leave Management', 'leave-management', 'Manage leave requests', 'HR & Payroll', 'CalendarOff', '/app/hr/leave', 26),
  ('Performance Reviews', 'performance-reviews', 'Employee performance', 'HR & Payroll', 'Star', '/app/hr/performance', 27),
  ('HR Points', 'hr-points', 'Point system management', 'HR & Payroll', 'Award', '/app/hr/points', 28),
  -- Education
  ('Education Dashboard', 'education-dashboard', 'Education overview', 'Education', 'GraduationCap', '/app/education', 30),
  ('Modules', 'modules', 'Manage course modules', 'Education', 'BookOpen', '/app/education/modules', 31),
  ('Students', 'students', 'Manage students', 'Education', 'Users', '/app/education/students', 32),
  ('Coursework', 'coursework', 'Manage coursework/days', 'Education', 'ClipboardList', '/app/education/coursework', 33),
  ('Exams', 'exams', 'Manage final exams', 'Education', 'FileCheck', '/app/education/exams', 34),
  ('Final Grades', 'final-grades', 'View and manage grades', 'Education', 'Award', '/app/education/grades', 35),
  ('Lecture Schedules', 'lecture-schedules', 'Create lecture timetables', 'Education', 'Calendar', '/app/education/schedules', 36),
  -- Sales & Marketing
  ('Sales Dashboard', 'sales-dashboard', 'Sales overview', 'Sales & Marketing', 'TrendingUp', '/app/sales', 40),
  ('Sales Orders', 'sales-orders', 'Manage sales orders', 'Sales & Marketing', 'ShoppingCart', '/app/sales/orders', 41),
  ('Commissions', 'commissions', 'Sales commissions', 'Sales & Marketing', 'DollarSign', '/app/sales/commissions', 42),
  -- Business Management
  ('Dividends', 'dividends', 'Manage dividends', 'Business Management', 'PieChart', '/app/dividends', 50),
  ('Affiliate Program', 'affiliate-program', 'Affiliate management', 'Business Management', 'Share2', '/app/affiliate', 51),
  ('Legal Documents', 'legal-documents', 'Generate legal documents', 'Business Management', 'Scale', '/app/legal', 52),
  ('CMS', 'cms', 'Content management', 'Business Management', 'Layout', '/app/cms', 53),
  ('Help Desk', 'help-desk', 'Support ticket system', 'Business Management', 'Headphones', '/app/helpdesk', 54),
  -- Administration
  ('Company Settings', 'company-settings', 'Company configuration', 'Administration', 'Building2', '/app/settings/company', 60),
  ('Team Management', 'team-management', 'Invite and manage team', 'Administration', 'UserPlus', '/app/settings/team', 61),
  ('Roles & Permissions', 'roles-permissions', 'Role and tool mapping', 'Administration', 'Shield', '/app/settings/roles', 62),
  ('Subscription', 'subscription', 'Manage subscription', 'Administration', 'CreditCard', '/app/settings/subscription', 63),
  ('Billing', 'billing', 'Billing and payments', 'Administration', 'Receipt', '/app/settings/billing', 64)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED: Default Subscription Tier Pricing
-- ============================================================================

INSERT INTO subscription_tiers (tier, monthly_price, yearly_price, max_employees, storage_gb, features) VALUES
  ('basic', 5.00, 45.00, 10, 5, '{"tools": ["dashboard", "accounting-dashboard", "invoices", "expenses", "hr-dashboard", "employee-management", "attendance", "company-settings", "team-management", "subscription"], "support": "email", "pdf_exports": true, "csv_exports": true}'),
  ('pro', 15.00, 120.00, 50, 25, '{"tools": ["dashboard", "accounting-dashboard", "invoices", "expenses", "credit-notes", "debit-notes", "chart-of-accounts", "vat-management", "bookkeeping", "hr-dashboard", "employee-management", "salary-structures", "payroll", "paye-tax", "attendance", "leave-management", "performance-reviews", "hr-points", "sales-dashboard", "sales-orders", "commissions", "company-settings", "team-management", "roles-permissions", "subscription", "billing"], "support": "priority_email", "pdf_exports": true, "csv_exports": true, "custom_branding": true}'),
  ('platinum', 25.00, 200.00, 500, 100, '{"tools": ["all"], "support": "dedicated", "pdf_exports": true, "csv_exports": true, "custom_branding": true, "api_access": true, "white_label": true}')
ON CONFLICT (tier) DO NOTHING;
