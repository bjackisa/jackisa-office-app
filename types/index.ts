// ============================================================================
// AUTH & USER TYPES
// ============================================================================

export type UserRole = 'super_admin' | 'company_admin' | 'employee'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  super_admin_id: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// COMPANY TYPES
// ============================================================================

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
  brand_primary_color: string
  brand_secondary_color: string
  company_registration_number: string | null
  tax_id: string | null
  industry: string | null
  currency: string
  employees_count: number
  storage_gb: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SubscriptionPlan {
  id: string
  tier: SubscriptionTier
  monthly_price: number
  yearly_price: number
  max_employees: number
  storage_gb: number
  features: Record<string, any>
  created_at: string
}

export interface CompanySubscription {
  id: string
  company_id: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  monthly_cost: number
  yearly_cost: number
  billing_cycle: 'monthly' | 'yearly'
  start_date: string
  end_date: string
  auto_renew: boolean
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
  plan?: SubscriptionPlan
  company?: Company
}

// ============================================================================
// COUPON TYPES
// ============================================================================

export interface Coupon {
  id: string
  code: string
  discount_percent: number | null
  discount_amount: number | null
  free_days: number | null
  max_uses: number | null
  current_uses: number
  expiry_date: string
  created_by: string
  created_at: string
}

// ============================================================================
// ROLE & TOOL TYPES
// ============================================================================

export interface CompanyRole {
  id: string
  company_id: string
  name: string
  description: string | null
  is_default: boolean
  created_at: string
}

export interface SystemTool {
  id: string
  name: string
  slug: string
  description: string | null
  category: string
  icon: string | null
  route: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface RoleToolMapping {
  id: string
  company_role_id: string
  tool_id: string
  created_at: string
  tool?: SystemTool
}

// ============================================================================
// EMPLOYEE TYPES
// ============================================================================

export type EmployeeStatus = 'pending_invitation' | 'active' | 'suspended' | 'terminated'
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface CompanyEmployee {
  id: string
  company_id: string
  user_id: string
  company_role_id: string
  employee_id_number: string | null
  department: string | null
  position: string | null
  status: EmployeeStatus
  invitation_token: string | null
  invitation_sent_at: string | null
  joined_at: string | null
  salary: number | null
  bank_account: string | null
  nssf_number: string | null
  phone_number: string | null
  digital_signature_url: string | null
  emergency_contact: string | null
  emergency_contact_phone: string | null
  date_of_birth: string | null
  termination_date: string | null
  termination_reason: string | null
  created_at: string
  updated_at: string
  user?: User
  company?: Company
  role?: CompanyRole
}

export interface EmployeeInvitation {
  id: string
  company_id: string
  company_role_id: string
  email: string
  full_name: string
  department: string | null
  position: string | null
  salary: number | null
  token: string
  status: InvitationStatus
  invited_by: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface UserActiveCompany {
  id: string
  user_id: string
  company_id: string
  updated_at: string
}

// ============================================================================
// ACCOUNTING TYPES
// ============================================================================

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type ExpenseCategory = 'utilities' | 'salaries' | 'rent' | 'equipment' | 'travel' | 'supplies' | 'marketing' | 'maintenance' | 'other'

export interface AccountingAccount {
  id: string
  company_id: string
  account_code: string
  account_name: string
  account_type: string | null
  currency: string
  balance: number
  created_at: string
}

export interface BookkeepingEntry {
  id: string
  company_id: string
  entry_date: string
  description: string
  reference_number: string | null
  created_by: string
  created_at: string
  journal_entries?: JournalEntry[]
}

export interface JournalEntry {
  id: string
  bookkeeping_entry_id: string
  accounting_account_id: string
  debit: number
  credit: number
  created_at: string
  account?: AccountingAccount
}

export interface Invoice {
  id: string
  company_id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  customer_name: string
  customer_email: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  status: InvoiceStatus
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  items?: InvoiceItem[]
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  created_at: string
}

export interface CreditNote {
  id: string
  company_id: string
  credit_note_number: string
  invoice_id: string | null
  credit_date: string
  reason: string
  amount: number
  created_by: string
  created_at: string
}

export interface DebitNote {
  id: string
  company_id: string
  debit_note_number: string
  invoice_id: string | null
  debit_date: string
  reason: string
  amount: number
  created_by: string
  created_at: string
}

export interface Expense {
  id: string
  company_id: string
  expense_date: string
  category: ExpenseCategory
  description: string
  amount: number
  receipt_url: string | null
  submitted_by: string
  approved_by: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface VATRecord {
  id: string
  company_id: string
  period_start: string
  period_end: string
  total_sales: number
  total_purchases: number
  output_vat: number
  input_vat: number
  net_vat_payable: number
  status: string
  created_at: string
  updated_at: string
}

// ============================================================================
// HR & PAYROLL TYPES
// ============================================================================

export type PointActionType = 'gain' | 'loss'
export type PointRedemptionStatus = 'pending' | 'approved' | 'rejected' | 'paid'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface SalaryStructure {
  id: string
  company_id: string
  employee_id: string
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  medical_allowance: number
  other_allowances: Record<string, number>
  other_deductions: Record<string, number>
  currency: string
  effective_from: string
  effective_to: string | null
  is_current: boolean
  created_at: string
  updated_at: string
  employee?: CompanyEmployee
}

export interface PayrollRecord {
  id: string
  company_id: string
  employee_id: string
  payroll_period_start: string
  payroll_period_end: string
  gross_salary: number
  nssf_contribution: number
  taxable_amount: number
  paye_tax: number
  net_salary: number
  status: string
  created_at: string
  updated_at: string
  employee?: CompanyEmployee
}

export interface PAYETaxBand {
  id: string
  country: string
  band_order: number
  lower_limit: number
  upper_limit: number | null
  rate: number
  description: string | null
  is_active: boolean
  created_at: string
}

export interface PointRule {
  id: string
  company_id: string
  category: string
  indicator: string
  description: string | null
  point_value: number
  action_type: PointActionType
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface PointTransaction {
  id: string
  company_id: string
  employee_id: string
  rule_id: string | null
  action_type: PointActionType
  points: number
  reason: string | null
  recorded_by: string
  recorded_date: string
  created_at: string
  employee?: CompanyEmployee
  rule?: PointRule
}

export interface PointBalance {
  id: string
  company_id: string
  employee_id: string
  period_month: number
  period_year: number
  opening_balance: number
  points_gained: number
  points_lost: number
  closing_balance: number
  created_at: string
  employee?: CompanyEmployee
}

export interface PointRedemption {
  id: string
  company_id: string
  employee_id: string
  points_redeemed: number
  monetary_value: number
  status: PointRedemptionStatus
  approved_by: string | null
  period_month: number
  period_year: number
  created_at: string
}

export interface LeaveType {
  id: string
  company_id: string
  name: string
  max_days_per_year: number
  is_paid: boolean
  created_at: string
}

export interface LeaveRequest {
  id: string
  company_id: string
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days_count: number
  reason: string | null
  status: LeaveStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
  employee?: CompanyEmployee
  leave_type?: LeaveType
}

export interface AttendanceRecord {
  id: string
  company_id: string
  employee_id: string
  attendance_date: string
  clock_in: string | null
  clock_out: string | null
  status: string
  late_minutes: number
  overtime_minutes: number
  notes: string | null
  created_at: string
  employee?: CompanyEmployee
}

// ============================================================================
// EDUCATION TYPES
// ============================================================================

export type ResultGradeType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface EducationModule {
  id: string
  company_id: string
  module_code: string
  module_name: string
  description: string | null
  created_by: string
  created_at: string
  coursework_days?: CourseworkDay[]
}

export interface CourseworkDay {
  id: string
  module_id: string
  day_number: number
  title: string
  max_marks: number
  created_at: string
}

export interface Student {
  id: string
  company_id: string
  student_id: string | null
  full_name: string
  email: string | null
  created_at: string
}

export interface StudentEnrollment {
  id: string
  student_id: string
  module_id: string
  enrolled_at: string
  student?: Student
  module?: EducationModule
}

export interface StudentGradeCoursework {
  id: string
  student_id: string
  coursework_day_id: string
  marks_obtained: number
  recorded_by: string
  created_at: string
}

export interface FinalExam {
  id: string
  module_id: string
  exam_date: string
  max_marks: number
  created_at: string
}

export interface StudentGradeFinalExam {
  id: string
  student_id: string
  final_exam_id: string
  marks_obtained: number
  recorded_by: string
  created_at: string
}

export interface LectureSchedule {
  id: string
  company_id: string
  module_id: string
  instructor_id: string
  day_name: string
  start_time: string
  end_time: string
  room_location: string | null
  created_at: string
  module?: EducationModule
  instructor?: CompanyEmployee
}

// ============================================================================
// SALES TYPES
// ============================================================================

export type SaleStatus = 'draft' | 'confirmed' | 'invoiced' | 'cancelled'

export interface SalesOrder {
  id: string
  company_id: string
  order_number: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  order_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  status: SaleStatus
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  items?: SalesOrderItem[]
}

export interface SalesOrderItem {
  id: string
  sales_order_id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  created_at: string
}

export interface SalesCommission {
  id: string
  company_id: string
  employee_id: string
  sales_order_id: string
  commission_rate: number
  commission_amount: number
  status: string
  paid_at: string | null
  created_at: string
}

// ============================================================================
// BUSINESS MANAGEMENT TYPES
// ============================================================================

export interface Dividend {
  id: string
  company_id: string
  dividend_date: string
  total_amount: number
  status: string
  created_at: string
}

export interface DividendAllocation {
  id: string
  dividend_id: string
  employee_id: string
  allocated_amount: number
  created_at: string
}

export interface AffiliateProgram {
  id: string
  company_id: string
  affiliate_name: string
  commission_percent: number
  commission_paid: number
  status: string
  created_at: string
}

// ============================================================================
// SUPPORT / HELP DESK TYPES
// ============================================================================

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface SupportTicket {
  id: string
  company_id: string
  ticket_number: string
  subject: string
  description: string | null
  priority: TicketPriority
  status: TicketStatus
  assigned_to: string | null
  reported_by: string
  resolved_at: string | null
  resolution_minutes: number | null
  created_at: string
  updated_at: string
}

export interface TicketComment {
  id: string
  ticket_id: string
  user_id: string
  comment: string
  is_internal: boolean
  created_at: string
}

// ============================================================================
// CMS TYPES
// ============================================================================

export type CMSContentStatus = 'draft' | 'published' | 'archived'

export interface CMSPage {
  id: string
  company_id: string
  title: string
  slug: string
  content: string | null
  status: CMSContentStatus
  author_id: string
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface CMSArticle {
  id: string
  company_id: string
  title: string
  slug: string
  content: string | null
  category: string | null
  status: CMSContentStatus
  author_id: string
  approved_by: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface KBArticle {
  id: string
  company_id: string
  title: string
  content: string
  category: string | null
  is_approved: boolean
  approved_by: string | null
  author_id: string
  created_at: string
  updated_at: string
}

// ============================================================================
// LEGAL DOCUMENT TYPES
// ============================================================================

export interface LegalDocumentTemplate {
  id: string
  company_id: string
  document_type: string
  template_content: string
  created_by: string
  created_at: string
}

export interface GeneratedLegalDocument {
  id: string
  company_id: string
  template_id: string
  document_type: string
  employee_id: string | null
  document_content: string
  generated_date: string
  created_by: string
  created_at: string
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface Notification {
  id: string
  user_id: string
  company_id: string | null
  title: string
  message: string
  type: string
  is_read: boolean
  link: string | null
  created_at: string
}

// ============================================================================
// ACTIVITY LOG TYPES
// ============================================================================

export interface ActivityLog {
  id: string
  user_id: string
  company_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  details: Record<string, any>
  created_at: string
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

export interface StorageUsage {
  id: string
  company_id: string
  used_storage_bytes: number
  total_storage_bytes: number
  updated_at: string
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

export interface DashboardStats {
  totalEmployees: number
  activeSubscription: boolean
  subscriptionTier: SubscriptionTier | null
  pendingInvoices: number
  totalRevenue: number
  upcomingPayroll: number
  storageUsed: number
  storageLimit: number
  pendingLeaveRequests: number
  openTickets: number
}

// ============================================================================
// PAYE CALCULATION HELPERS
// ============================================================================

export interface PAYECalculation {
  grossSalary: number
  nssfContribution: number
  taxableIncome: number
  bands: {
    bandDescription: string
    taxableAmount: number
    rate: number
    tax: number
  }[]
  totalPAYE: number
  netPay: number
}

export interface VATCalculation {
  totalSales: number
  totalPurchases: number
  outputVAT: number
  inputVAT: number
  netVATPayable: number
  vatRate: number
}

// ============================================================================
// POINT SYSTEM CALCULATION HELPERS
// ============================================================================

export interface PointRedemptionCalculation {
  totalPoints: number
  first50Value: number
  remaining50Value: number
  totalMonetaryValue: number
  maxRedeemable: number
}
