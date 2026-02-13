-- Jackisa Office Database Schema
-- Comprehensive schema for multi-tenant office management system

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role_type AS ENUM (
  'super_admin',
  'company_admin',
  'employee'
);

CREATE TYPE subscription_tier AS ENUM (
  'basic',
  'pro',
  'platinum'
);

CREATE TYPE subscription_status AS ENUM (
  'active',
  'expired',
  'cancelled',
  'pending'
);

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled'
);

CREATE TYPE expense_category AS ENUM (
  'utilities',
  'salaries',
  'rent',
  'equipment',
  'travel',
  'supplies',
  'marketing',
  'maintenance',
  'other'
);

CREATE TYPE debit_credit_type AS ENUM (
  'debit',
  'credit'
);

CREATE TYPE employee_status AS ENUM (
  'pending_invitation',
  'active',
  'suspended',
  'terminated'
);

CREATE TYPE hr_point_type AS ENUM (
  'attendance',
  'performance',
  'behavior',
  'achievement',
  'penalty'
);

CREATE TYPE result_grade_type AS ENUM (
  'A',
  'B',
  'C',
  'D',
  'E',
  'F'
);

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Super Admin Users (System Admins)
CREATE TABLE super_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Companies (Tenants)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  website VARCHAR(255),
  industry VARCHAR(100),
  size VARCHAR(50),
  country VARCHAR(100) DEFAULT 'Uganda',
  phone VARCHAR(20),
  address TEXT,
  logo_url TEXT,
  company_stamp_url TEXT,
  digital_signature_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription Plans
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier subscription_tier NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  monthly_price DECIMAL(10, 2) NOT NULL,
  yearly_price DECIMAL(10, 2) NOT NULL,
  max_employees INTEGER,
  storage_gb INTEGER,
  features JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Company Subscriptions
CREATE TABLE company_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  tier subscription_tier NOT NULL,
  status subscription_status DEFAULT 'active',
  billing_cycle VARCHAR(20) DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE,
  renewal_date DATE,
  payment_method VARCHAR(50),
  stripe_subscription_id VARCHAR(255),
  amount_paid DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, status)
);

-- Coupons for Free Access
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES super_admins(id),
  company_id UUID REFERENCES companies(id),
  discount_percent INTEGER,
  free_days INTEGER,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users (Combined: Super Admin, Company Admin, Employees)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role user_role_type NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  profile_picture_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Multi-Company Access
CREATE TABLE user_company_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role user_role_type NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, company_id)
);

-- ============================================================================
-- ROLE & PERMISSION MANAGEMENT
-- ============================================================================

-- System Roles (for assigning to employees)
CREATE TABLE system_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, name)
);

-- Available Tools/Modules
CREATE TABLE available_tools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  icon_url TEXT,
  requires_tier subscription_tier,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role-Tool Mappings
CREATE TABLE role_tool_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_role_id UUID NOT NULL REFERENCES system_roles(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES available_tools(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(system_role_id, tool_id)
);

-- ============================================================================
-- EMPLOYEE MANAGEMENT
-- ============================================================================

-- Employees
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  date_of_birth DATE,
  national_id VARCHAR(50),
  position VARCHAR(100),
  system_role_id UUID REFERENCES system_roles(id),
  department VARCHAR(100),
  employment_type VARCHAR(50),
  hire_date DATE,
  status employee_status DEFAULT 'pending_invitation',
  invitation_token VARCHAR(255),
  invitation_sent_at TIMESTAMP,
  invitation_expires_at TIMESTAMP,
  salary DECIMAL(12, 2),
  bank_account VARCHAR(50),
  nssf_number VARCHAR(50),
  tin VARCHAR(50),
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, email)
);

-- Employee Termination Records
CREATE TABLE employee_terminations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  terminated_by UUID NOT NULL REFERENCES users(id),
  termination_date DATE NOT NULL,
  reason TEXT,
  termination_letter_url TEXT,
  final_settlement_amount DECIMAL(12, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ACCOUNTING & FINANCE
-- ============================================================================

-- Chart of Accounts
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_number VARCHAR(50) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, account_number)
);

-- General Ledger Entries
CREATE TABLE general_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  debit_amount DECIMAL(12, 2) DEFAULT 0,
  credit_amount DECIMAL(12, 2) DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id VARCHAR(100),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255),
  client_phone VARCHAR(20),
  client_address TEXT,
  invoice_date DATE NOT NULL,
  due_date DATE,
  status invoice_status DEFAULT 'draft',
  subtotal DECIMAL(12, 2),
  vat_amount DECIMAL(12, 2),
  total_amount DECIMAL(12, 2),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, invoice_number)
);

-- Invoice Items
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2),
  unit_price DECIMAL(12, 2),
  line_amount DECIMAL(12, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit Notes
CREATE TABLE credit_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id),
  credit_number VARCHAR(50) NOT NULL,
  credit_date DATE NOT NULL,
  reason TEXT,
  amount DECIMAL(12, 2),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, credit_number)
);

-- Debit Notes
CREATE TABLE debit_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id),
  debit_number VARCHAR(50) NOT NULL,
  debit_date DATE NOT NULL,
  reason TEXT,
  amount DECIMAL(12, 2),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, debit_number)
);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  expense_date DATE NOT NULL,
  payment_method VARCHAR(50),
  receipt_url TEXT,
  approved_by UUID REFERENCES users(id),
  is_approved BOOLEAN DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VAT Transactions (For Uganda VAT Calculation)
CREATE TABLE vat_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_month DATE NOT NULL,
  output_sales DECIMAL(12, 2) DEFAULT 0,
  input_purchases DECIMAL(12, 2) DEFAULT 0,
  output_vat DECIMAL(12, 2) DEFAULT 0,
  input_vat DECIMAL(12, 2) DEFAULT 0,
  net_vat_payable DECIMAL(12, 2),
  is_submitted BOOLEAN DEFAULT false,
  submitted_by UUID REFERENCES users(id),
  submitted_date TIMESTAMP,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, transaction_month)
);

-- PAYE Calculations (For Uganda PAYE)
CREATE TABLE paye_calculations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  payroll_month DATE NOT NULL,
  gross_salary DECIMAL(12, 2) NOT NULL,
  nssf_contribution DECIMAL(12, 2),
  taxable_amount DECIMAL(12, 2),
  paye_amount DECIMAL(12, 2),
  net_salary DECIMAL(12, 2),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, employee_id, payroll_month)
);

-- Bookkeeping Records
CREATE TABLE bookkeeping_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2),
  category VARCHAR(100),
  account_id UUID REFERENCES chart_of_accounts(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PAYROLL & HR POINTS
-- ============================================================================

-- HR Point System
CREATE TABLE hr_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  point_type hr_point_type NOT NULL,
  points_value INTEGER NOT NULL,
  description TEXT,
  recorded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HR Point Aggregation (Monthly Summary)
CREATE TABLE hr_point_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  summary_month DATE NOT NULL,
  total_points INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, employee_id, summary_month)
);

-- Salary Management
CREATE TABLE salary_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  basic_salary DECIMAL(12, 2) NOT NULL,
  allowances JSONB DEFAULT '{}'::jsonb,
  deductions JSONB DEFAULT '{}'::jsonb,
  effective_from DATE,
  effective_to DATE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payroll Records
CREATE TABLE payroll_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  payroll_month DATE NOT NULL,
  gross_salary DECIMAL(12, 2),
  nssf_deduction DECIMAL(12, 2),
  paye_tax DECIMAL(12, 2),
  other_deductions DECIMAL(12, 2),
  net_salary DECIMAL(12, 2),
  payment_date DATE,
  payment_method VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, employee_id, payroll_month)
);

-- ============================================================================
-- SALES & AFFILIATE MANAGEMENT
-- ============================================================================

-- Sales Records
CREATE TABLE sales_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sales_person_id UUID REFERENCES employees(id),
  client_name VARCHAR(255),
  product_service VARCHAR(255),
  amount DECIMAL(12, 2),
  sale_date DATE,
  commission_percent DECIMAL(5, 2),
  commission_amount DECIMAL(12, 2),
  status VARCHAR(50),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Affiliate Program
CREATE TABLE affiliate_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  affiliate_name VARCHAR(255),
  affiliate_email VARCHAR(255),
  commission_rate DECIMAL(5, 2),
  total_earnings DECIMAL(12, 2),
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- EDUCATIONAL INSTITUTION TOOLS
-- ============================================================================

-- Modules/Courses
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  credits INTEGER,
  instructor_id UUID REFERENCES employees(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code)
);

-- Students
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  admission_number VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  date_of_birth DATE,
  enrollment_date DATE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, admission_number)
);

-- Student-Module Enrollment
CREATE TABLE student_module_enrollment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  enrollment_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, module_id)
);

-- Course Work/Days
CREATE TABLE coursework_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  title VARCHAR(255),
  description TEXT,
  max_marks INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(module_id, day_number)
);

-- Coursework Grades
CREATE TABLE coursework_grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id),
  coursework_day_id UUID NOT NULL REFERENCES coursework_days(id),
  marks_obtained DECIMAL(5, 2),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, coursework_day_id)
);

-- Final Exam Grades
CREATE TABLE final_exam_grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id),
  module_id UUID NOT NULL REFERENCES modules(id),
  marks_obtained DECIMAL(5, 2),
  max_marks INTEGER DEFAULT 100,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, module_id)
);

-- Final Results (Aggregated)
CREATE TABLE final_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id),
  module_id UUID NOT NULL REFERENCES modules(id),
  coursework_average DECIMAL(5, 2),
  exam_marks DECIMAL(5, 2),
  final_mark DECIMAL(5, 2),
  grade result_grade_type,
  result_date DATE,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, module_id)
);

-- Lecture Schedule
CREATE TABLE lecture_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id),
  instructor_id UUID NOT NULL REFERENCES employees(id),
  day_of_week VARCHAR(10),
  start_time TIME,
  end_time TIME,
  classroom VARCHAR(50),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- LEGAL DOCUMENTS
-- ============================================================================

-- Document Templates
CREATE TABLE document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  template_html TEXT,
  variables JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generated Documents
CREATE TABLE generated_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID REFERENCES employees(id),
  document_type VARCHAR(100),
  template_id UUID REFERENCES document_templates(id),
  file_path TEXT,
  status VARCHAR(50),
  generated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DIVIDENDS MANAGEMENT
-- ============================================================================

-- Dividends Configuration
CREATE TABLE dividends_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  total_dividend_amount DECIMAL(12, 2),
  dividend_date DATE,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dividend Distribution
CREATE TABLE dividend_distribution (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dividend_config_id UUID NOT NULL REFERENCES dividends_config(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  dividend_share DECIMAL(12, 2),
  payment_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- NOTIFICATIONS & AUDIT
-- ============================================================================

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  message TEXT,
  type VARCHAR(50),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  changes JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_role ON users(role);

-- Employee indexes
CREATE INDEX idx_employees_company_id ON employees(company_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_email ON employees(email);

-- Invoice indexes
CREATE INDEX idx_invoices_company_id ON invoices(company_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_invoice_date ON invoices(invoice_date);

-- Expense indexes
CREATE INDEX idx_expenses_company_id ON expenses(company_id);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);

-- Payroll indexes
CREATE INDEX idx_payroll_records_company_id ON payroll_records(company_id);
CREATE INDEX idx_payroll_records_employee_id ON payroll_records(employee_id);
CREATE INDEX idx_payroll_records_month ON payroll_records(payroll_month);

-- Student indexes
CREATE INDEX idx_students_company_id ON students(company_id);
CREATE INDEX idx_students_enrollment_date ON students(enrollment_date);

-- Results indexes
CREATE INDEX idx_final_results_student_id ON final_results(student_id);
CREATE INDEX idx_final_results_module_id ON final_results(module_id);

-- Subscription indexes
CREATE INDEX idx_company_subscriptions_company_id ON company_subscriptions(company_id);
CREATE INDEX idx_company_subscriptions_status ON company_subscriptions(status);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Uncomment if needed
-- ============================================================================

-- Enable RLS on all tables (Optional - implement as needed)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Insert Default Tools
-- ============================================================================

INSERT INTO available_tools (name, category, description, requires_tier) VALUES
('Bookkeeping', 'Accounting', 'Complete bookkeeping and general ledger management', 'basic'),
('Invoice Management', 'Accounting', 'Create and manage invoices', 'basic'),
('Expense Tracking', 'Accounting', 'Track and categorize expenses', 'basic'),
('Credit & Debit Notes', 'Accounting', 'Issue credit and debit notes', 'pro'),
('VAT Calculation', 'Accounting', 'Automated VAT calculation (18% for Uganda)', 'pro'),
('PAYE Calculation', 'Accounting', 'Automated PAYE tax calculation for Uganda', 'pro'),
('HR Points System', 'HR', 'Employee performance and attendance tracking', 'basic'),
('Employee Management', 'HR', 'Manage employee information and profiles', 'basic'),
('Salary Management', 'HR', 'Configure salary structures and payroll', 'basic'),
('Payroll Processing', 'HR', 'Process monthly payroll', 'pro'),
('Sales Management', 'Sales', 'Track sales and manage commissions', 'pro'),
('Affiliate Program', 'Sales', 'Manage affiliate programs and payouts', 'platinum'),
('Results Management', 'Education', 'Manage student results and grades', 'pro'),
('Lecture Scheduling', 'Education', 'Create and manage lecture schedules', 'pro'),
('Document Generation', 'Legal', 'Auto-generate legal documents', 'pro'),
('Dividend Management', 'Finance', 'Configure and distribute dividends', 'platinum'),
('Advanced Analytics', 'Reporting', 'Comprehensive financial and HR analytics', 'platinum');

-- ============================================================================
-- Insert Default Subscription Plans
-- ============================================================================

INSERT INTO subscription_plans (tier, name, monthly_price, yearly_price, max_employees, storage_gb, features) VALUES
(
  'basic',
  'Basic Plan',
  5,
  45,
  25,
  5,
  '{"features": ["Bookkeeping", "Invoice Management", "Expense Tracking", "HR Points System", "Employee Management", "Basic Reporting"]}'
),
(
  'pro',
  'Pro Plan',
  15,
  120,
  100,
  50,
  '{"features": ["All Basic", "Credit & Debit Notes", "VAT Calculation", "PAYE Calculation", "Payroll Processing", "Sales Management", "Results Management", "Lecture Scheduling", "Document Generation", "Advanced Reporting"]}'
),
(
  'platinum',
  'Platinum Plan',
  25,
  200,
  500,
  500,
  '{"features": ["All Pro", "Affiliate Program", "Dividend Management", "Advanced Analytics", "Priority Support", "Custom Integrations", "Dedicated Account Manager"]}'
);
