// Auth & User Types
export type UserRole = 'super_admin' | 'company_admin' | 'employee'

export interface User {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// Company Types
export type SubscriptionTier = 'basic' | 'pro' | 'platinum'
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending'

export interface Company {
  id: string
  name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  country: string
  postal_code: string | null
  website: string | null
  logo_url: string | null
  company_registration_number: string | null
  tax_id: string | null
  industry: string | null
  employee_count: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface SubscriptionPlan {
  id: string
  tier: SubscriptionTier
  name: string
  monthly_price: number | null
  yearly_price: number | null
  description: string | null
  max_employees: number | null
  max_storage_gb: number | null
  features: Record<string, any>
  created_at: string
}

export interface CompanySubscription {
  id: string
  company_id: string
  plan_id: string
  status: SubscriptionStatus
  billing_cycle: 'monthly' | 'yearly'
  start_date: string
  end_date: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  next_billing_date: string | null
  auto_renew: boolean
  created_at: string
  updated_at: string
  plan?: SubscriptionPlan
  company?: Company
}

// Employee Types
export type EmployeeStatus = 'pending_invitation' | 'active' | 'suspended' | 'terminated'

export interface Employee {
  id: string
  user_id: string | null
  company_id: string
  employee_number: string
  phone: string | null
  emergency_contact: string | null
  emergency_contact_phone: string | null
  date_of_birth: string | null
  hire_date: string
  termination_date: string | null
  status: EmployeeStatus
  invitation_token: string | null
  invitation_sent_at: string | null
  created_at: string
  updated_at: string
  user?: User
}

// Accounting Types
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type ExpenseCategory = 'utilities' | 'salaries' | 'rent' | 'equipment' | 'travel' | 'supplies' | 'marketing' | 'maintenance' | 'other'

export interface Invoice {
  id: string
  company_id: string
  invoice_number: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  invoice_date: string
  due_date: string
  status: InvoiceStatus
  subtotal: number
  tax_amount: number
  total_amount: number
  currency: string
  notes: string | null
  terms: string | null
  created_by: string
  paid_date: string | null
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  company_id: string
  category: ExpenseCategory
  description: string
  amount: number
  currency: string
  expense_date: string
  payment_method: string | null
  receipt_url: string | null
  account_id: string
  approved_by: string | null
  approval_date: string | null
  created_by: string
  created_at: string
}

// HR & Payroll Types
export type HRPointType = 'attendance' | 'performance' | 'behavior' | 'achievement' | 'penalty'

export interface EmployeeSalary {
  id: string
  employee_id: string
  basic_salary: number
  allowances: Record<string, number>
  deductions: Record<string, number>
  currency: string
  effective_from: string
  effective_to: string | null
  created_at: string
  updated_at: string
}

export interface PAYERecord {
  id: string
  company_id: string
  employee_id: string
  pay_period_start: string
  pay_period_end: string
  gross_salary: number
  nssf_contribution: number
  taxable_income: number
  tax_band_1_amount: number
  tax_band_1_rate: number
  tax_band_2_amount: number
  tax_band_2_rate: number
  tax_band_3_amount: number
  tax_band_3_rate: number
  tax_band_4_amount: number
  tax_band_4_rate: number
  total_paye: number
  net_pay: number
  created_at: string
}

export interface HRPoint {
  id: string
  company_id: string
  employee_id: string
  point_type: HRPointType
  points_awarded: number
  description: string | null
  reason: string | null
  recorded_date: string
  recorded_by: string
  created_at: string
}

// Education Types
export type ResultGradeType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface Module {
  id: string
  company_id: string
  module_code: string
  module_name: string
  description: string | null
  credit_hours: number | null
  created_by: string
  created_at: string
}

export interface Student {
  id: string
  company_id: string
  student_number: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  enrollment_date: string
  status: string
  created_at: string
}

export interface FinalGrade {
  id: string
  student_id: string
  module_id: string
  coursework_average: number | null
  exam_mark: number | null
  final_mark: number
  grade: ResultGradeType
  calculated_at: string
  created_at: string
}

// Role & Permission Types
export interface SystemRole {
  id: string
  company_id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
}

export interface Tool {
  id: string
  name: string
  description: string | null
  category: string | null
  icon: string | null
  is_active: boolean
  created_at: string
}

// Dashboard Stats
export interface DashboardStats {
  totalEmployees: number
  activeSubscription: boolean
  pendingInvoices: number
  upcomingPayroll: number
  storageUsed: number
  storageLimit: number
}
