'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSessionContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Search, Check, X, Zap, Camera, QrCode, ShieldAlert, Clock, Keyboard } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { logEcosystemEvent, awardAttendancePoints } from '@/lib/ecosystem'

type AttendanceRow = any
type CameraDevice = { id: string; label: string }
type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'saving' | 'error'

const SCANNER_REGION_ID = 'attendance-qr-reader'
const DEFAULT_CLOCK_OUT = '19:00'

const pad = (value: number) => value.toString().padStart(2, '0')
const getBrowserDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const getBrowserTime = (date = new Date(), includeSeconds = false) => `${pad(date.getHours())}:${pad(date.getMinutes())}${includeSeconds ? `:${pad(date.getSeconds())}` : ''}`
const isPastBrowserLateCutoff = (date = new Date()) => date.getHours() > 19 || (date.getHours() === 19 && (date.getMinutes() > 30 || (date.getMinutes() === 30 && date.getSeconds() > 0)))
const getEATDate = (date = new Date()) => new Date(date.getTime() + 3 * 60 * 60 * 1000)
const getEATDateString = (date = new Date()) => getEATDate(date).toISOString().split('T')[0]
const isEATWorkdayAfterAbsenceCutoff = (date = new Date()) => {
  const eatDate = getEATDate(date)
  const day = eatDate.getUTCDay()
  const hour = eatDate.getUTCHours()
  const minute = eatDate.getUTCMinutes()

  return day >= 1 && day <= 5 && (hour > 10 || (hour === 10 && minute >= 0))
}

const parseQrEmployeeToken = (decodedText: string) => {
  const trimmed = decodedText.trim()

  if (!trimmed) return ''

  try {
    const parsed = JSON.parse(trimmed)
    return String(parsed.employee_id || parsed.employeeId || parsed.employee_id_number || parsed.employeeIdNumber || parsed.id || '').trim()
  } catch {
    return trimmed
  }
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [allEmployees, setAllEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState(getBrowserDate())
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ employee_id: '', status: 'present', clock_in: '09:00', clock_out: '17:00', notes: '' })
  const [userId, setUserId] = useState<string | null>(null)
  const [ecosystemMsg, setEcosystemMsg] = useState<string | null>(null)
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>('idle')
  const [scannerMessage, setScannerMessage] = useState('Choose a camera and start scanning employee QR codes.')
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [authorizationDenied, setAuthorizationDenied] = useState(false)
  const [lastScan, setLastScan] = useState<{ employee: string; time: string; status: string } | null>(null)
  const [hardwareScanInput, setHardwareScanInput] = useState('')
  const scannerRef = useRef<any>(null)
  const hardwareScannerInputRef = useRef<HTMLInputElement | null>(null)
  const scanLockRef = useRef(false)

  const loadData = async () => {
    try {
      const context = await getSessionContext()
      if (!context?.companyId) return
      setCompanyId(context.companyId)
      setUserId(context.userId)

      const [recordsRes, employeesRes, allEmployeesRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, attendance_date, clock_in, clock_out, status, company_employees(users(full_name))')
          .eq('company_id', context.companyId)
          .order('attendance_date', { ascending: false })
          .limit(200),
        supabase
          .from('company_employees')
          .select('id, employee_id_number, status, users(full_name)')
          .eq('company_id', context.companyId)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('company_employees')
          .select('id, employee_id_number, status, users(full_name)')
          .eq('company_id', context.companyId)
          .order('created_at', { ascending: false }),
      ])

      setRecords((recordsRes.data as AttendanceRow[]) || [])
      setEmployees(employeesRes.data || [])
      setAllEmployees(allEmployeesRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  const markMissingEmployeesAbsent = async (activeEmployees = employees, activeCompanyId = companyId) => {
    if (!activeCompanyId || activeEmployees.length === 0 || !isEATWorkdayAfterAbsenceCutoff()) return

    const eatToday = getEATDateString()
    const { data: existingRecords } = await supabase
      .from('attendance_records')
      .select('employee_id')
      .eq('company_id', activeCompanyId)
      .eq('attendance_date', eatToday)

    const registeredIds = new Set((existingRecords || []).map((record: any) => record.employee_id))
    const absentRows = activeEmployees
      .filter((employee: any) => employee.status === 'active' && !registeredIds.has(employee.id))
      .map((employee: any) => ({
        company_id: activeCompanyId,
        employee_id: employee.id,
        attendance_date: eatToday,
        status: 'absent',
        clock_in: null,
        clock_out: null,
        notes: 'Automatically marked absent after 10:00 AM EAT.',
      }))

    if (absentRows.length === 0) return

    await supabase
      .from('attendance_records')
      .upsert(absentRows, { onConflict: 'employee_id,attendance_date' })

    setEcosystemMsg(`${absentRows.length} active employee${absentRows.length === 1 ? '' : 's'} automatically marked absent for ${eatToday}.`)
    setTimeout(() => setEcosystemMsg(null), 4000)
    await loadData()
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!companyId || employees.length === 0) return

    markMissingEmployeesAbsent(employees, companyId)
    const interval = window.setInterval(() => markMissingEmployeesAbsent(employees, companyId), 60 * 1000)

    return () => window.clearInterval(interval)
  }, [companyId, employees])

  useEffect(() => () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => null)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(min-width: 768px)').matches) return

    hardwareScannerInputRef.current?.focus()
  }, [])

  const getEmployeeName = (row: any) => row.company_employees?.users?.full_name || row.company_employees?.[0]?.users?.[0]?.full_name || row.company_employees?.[0]?.users?.full_name || ''

  const filtered = useMemo(() => records.filter((r) => {
    const employee = getEmployeeName(r) || ''
    const searchMatch = !search || employee.toLowerCase().includes(search.toLowerCase())
    const dateMatch = !dateFilter || r.attendance_date === dateFilter
    const statusMatch = !statusFilter || r.status === statusFilter
    return searchMatch && dateMatch && statusMatch
  }), [records, search, dateFilter, statusFilter])

  const attendanceSummary = {
    total: employees.length,
    present: filtered.filter(r => r.status === 'present').length,
    absent: filtered.filter(r => r.status === 'absent').length,
    late: filtered.filter(r => r.status === 'late').length,
    leave: filtered.filter(r => r.status === 'leave').length,
  }

  const saveAttendance = async (employee: any, status: string, clockIn: string, attendanceDate: string, notes?: string, clockOut = DEFAULT_CLOCK_OUT, source = 'manual') => {
    if (!companyId) return

    await supabase
      .from('attendance_records')
      .upsert({
        company_id: companyId,
        employee_id: employee.id,
        attendance_date: attendanceDate,
        status,
        clock_in: clockIn || null,
        clock_out: clockOut,
        notes: notes || null,
      }, { onConflict: 'employee_id,attendance_date' })

    if (userId) {
      await logEcosystemEvent({ companyId, eventType: 'attendance_recorded', sourceTable: 'attendance_records', sourceId: employee.id, payload: { status, date: attendanceDate, source } })
      const pts = await awardAttendancePoints({ companyId, employeeId: employee.id, status, userId })
      if (pts) {
        setEcosystemMsg(`${employee.users?.full_name || 'Employee'}: ${pts.points > 0 ? '+' : ''}${pts.points} HR points (${pts.status})`)
        setTimeout(() => setEcosystemMsg(null), 4000)
      }
    }

    setLastScan({ employee: employee.users?.full_name || employee.employee_id_number || employee.id, time: clockIn, status })
    setScannerMessage(`${employee.users?.full_name || 'Employee'} recorded at ${clockIn} as ${status}.`)
    await loadData()
  }

  const handleRecordAttendance = async () => {
    if (!companyId || !form.employee_id) return
    const employee = employees.find((item: any) => item.id === form.employee_id)

    await saveAttendance(
      employee || { id: form.employee_id, users: { full_name: employees.find(e => e.id === form.employee_id)?.users?.full_name || 'Employee' } },
      form.status,
      form.clock_in,
      dateFilter,
      form.notes,
      form.clock_out || DEFAULT_CLOCK_OUT,
      'manual',
    )

    setShowForm(false)
    setForm({ employee_id: '', status: 'present', clock_in: '09:00', clock_out: '17:00', notes: '' })
  }

  const findEmployeeByQrToken = async (token: string) => {
    const employee = allEmployees.find((item: any) => item.id === token || item.employee_id_number === token)
    if (employee || !companyId) return employee

    const { data } = await supabase
      .from('company_employees')
      .select('id, employee_id_number, status, users(full_name)')
      .eq('company_id', companyId)
      .eq(token.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) ? 'id' : 'employee_id_number', token)
      .maybeSingle()

    return data
  }

  const processScanPayload = async (decodedText: string, source: 'camera' | 'hardware') => {
    if (scanLockRef.current || !companyId) return
    scanLockRef.current = true

    if (source === 'camera') {
      setScannerStatus('saving')
    } else {
      setScannerMessage('Processing connected scanner input...')
    }

    const token = parseQrEmployeeToken(decodedText)
    const employee = await findEmployeeByQrToken(token)

    if (!employee || employee.status !== 'active') {
      setAuthorizationDenied(true)
      setScannerMessage('Authorization Denied! Only active employees can record attendance with QR scan.')
      if (source === 'camera') setScannerStatus('scanning')
      window.setTimeout(() => {
        scanLockRef.current = false
        hardwareScannerInputRef.current?.focus()
      }, 1800)
      return
    }

    const now = new Date()
    const clockIn = getBrowserTime(now, true)
    const attendanceDate = getBrowserDate(now)
    const status = isPastBrowserLateCutoff(now) ? 'late' : 'present'
    const scanSourceLabel = source === 'camera' ? 'phone camera QR scan' : 'connected desktop scanner'

    await saveAttendance(employee, status, clockIn, attendanceDate, `Recorded automatically from ${scanSourceLabel} at ${clockIn}.`, DEFAULT_CLOCK_OUT, source)
    if (source === 'camera') setScannerStatus('scanning')
    window.setTimeout(() => {
      scanLockRef.current = false
      hardwareScannerInputRef.current?.focus()
    }, 1800)
  }

  const handleQrScan = (decodedText: string) => {
    processScanPayload(decodedText, 'camera')
  }

  const handleHardwareScanSubmit = async () => {
    const payload = hardwareScanInput.trim()
    if (!payload) return

    setHardwareScanInput('')
    await processScanPayload(payload, 'hardware')
  }

  const startScanner = async () => {
    if (scannerStatus === 'starting' || scannerStatus === 'scanning') return

    setScannerStatus('starting')
    setScannerMessage('Requesting camera access...')

    const { Html5Qrcode } = await import('html5-qrcode')

    try {
      const devices = await Html5Qrcode.getCameras()
      const mappedDevices = devices.map((device: any) => ({ id: device.id, label: device.label || `Camera ${device.id.slice(0, 6)}` }))
      setCameras(mappedDevices)

      const cameraId = selectedCameraId || mappedDevices[0]?.id
      if (!cameraId) {
        setScannerStatus('error')
        setScannerMessage('No camera was found. Connect a camera and try again.')
        return
      }

      setSelectedCameraId(cameraId)
      const scanner = new Html5Qrcode(SCANNER_REGION_ID)
      scannerRef.current = scanner
      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1.777778 },
        handleQrScan,
        undefined,
      )
      setScannerStatus('scanning')
      setScannerMessage('Camera is live. Point an employee QR code at the scanner.')
    } catch (error) {
      setScannerStatus('error')
      setScannerMessage(error instanceof Error ? error.message : 'Unable to start QR scanner.')
    }
  }

  const stopScanner = async () => {
    if (!scannerRef.current) return

    await scannerRef.current.stop().catch(() => null)
    await scannerRef.current.clear().catch(() => null)
    scannerRef.current = null
    scanLockRef.current = false
    setScannerStatus('idle')
    setScannerMessage('Scanner stopped. Choose a camera and start scanning employee QR codes.')
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {authorizationDenied && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm p-6 text-center shadow-2xl border-red-200">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <ShieldAlert className="h-7 w-7 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-red-700">Authorization Denied!</h2>
            <p className="mt-2 text-sm text-muted-foreground">Only active employees can scan QR codes to record attendance.</p>
            <Button className="mt-5 w-full" variant="destructive" onClick={() => setAuthorizationDenied(false)}>Close</Button>
          </Card>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Attendance Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track employee attendance and working hours</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Record Attendance
        </Button>
      </div>

      {ecosystemMsg && (
        <Card className="mb-6 p-3 border-blue-200 bg-blue-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-100"><Zap className="w-3.5 h-3.5 text-blue-600" /></div>
            <p className="text-xs font-medium text-blue-700">{ecosystemMsg}</p>
          </div>
        </Card>
      )}

      <Card className="mb-6 hidden overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.04] via-background to-background md:block">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                  <Keyboard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Desktop Connected Scanner</h3>
                  <p className="text-[11px] text-muted-foreground/70">Keep this field active and scan with the USB/Bluetooth reader connected to this computer.</p>
                </div>
              </div>
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                ready
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <Input
                ref={hardwareScannerInputRef}
                value={hardwareScanInput}
                onChange={(e) => setHardwareScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleHardwareScanSubmit()
                  }
                }}
                placeholder="Scan employee QR/barcode here; connected scanners usually press Enter automatically"
                className="h-12 font-mono text-base"
                autoComplete="off"
              />
              <Button size="sm" className="h-12" onClick={handleHardwareScanSubmit} disabled={!hardwareScanInput.trim()}>
                <QrCode className="mr-1.5 h-4 w-4" />
                Process Scan
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/50 bg-background/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Desktop mode</p>
                <p className="mt-1 text-xs text-muted-foreground">No camera is opened on PCs; the connected scanner feeds the QR text into the focused field.</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Auto-save</p>
                <p className="mt-1 text-xs text-muted-foreground">A successful scan saves immediately with the browser time and {DEFAULT_CLOCK_OUT} end time.</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Access control</p>
                <p className="mt-1 text-xs text-muted-foreground">Only active employees are accepted; any other status triggers Authorization Denied.</p>
              </div>
            </div>
          </div>

          <div className="border-t bg-muted/10 p-5 lg:border-l lg:border-t-0">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Clock className="h-4 w-4 text-primary" /> Automation rules</h4>
            <div className="space-y-3 text-xs text-muted-foreground">
              <p><span className="font-semibold text-foreground">Input format:</span> QR values can be an employee UUID, employee ID number, or JSON containing employee_id.</p>
              <p><span className="font-semibold text-foreground">Late rule:</span> scans after 7:30 PM in the browser&apos;s local time are saved as late.</p>
              <p><span className="font-semibold text-foreground">Absence rule:</span> Monday-Friday after 10:00 AM EAT, active employees without a record are saved as absent.</p>
            </div>
            {lastScan && (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">
                <p className="font-semibold">Last successful scan</p>
                <p>{lastScan.employee} • {lastScan.time} • {lastScan.status}</p>
              </div>
            )}
            <p className="mt-5 rounded-xl bg-background/70 p-3 text-xs font-medium text-muted-foreground">{scannerMessage}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-6 overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.04] via-background to-background md:hidden">
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Phone Camera QR Scanner</h3>
                <p className="text-[11px] text-muted-foreground/70">Use the phone camera to scan employee QR codes and auto-save attendance.</p>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${scannerStatus === 'scanning' ? 'bg-green-100 text-green-700' : scannerStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
              {scannerStatus}
            </span>
          </div>

          <div className="grid gap-3">
            <select className="form-select" value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)} disabled={scannerStatus === 'scanning' || scannerStatus === 'starting'}>
              <option value="">Auto-select camera</option>
              {cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <Button size="sm" onClick={startScanner} disabled={scannerStatus === 'starting' || scannerStatus === 'scanning'}>
                <Camera className="mr-1.5 h-4 w-4" />
                Start Camera
              </Button>
              <Button size="sm" variant="outline" onClick={stopScanner} disabled={!scannerRef.current}>
                <X className="mr-1.5 h-4 w-4" />
                Stop
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-primary/20 bg-background/80 p-3">
            <div id={SCANNER_REGION_ID} className="mx-auto min-h-[280px] overflow-hidden rounded-lg bg-muted/40" />
          </div>

          <div className="mt-4 space-y-3 text-xs text-muted-foreground">
            <p><span className="font-semibold text-foreground">Phone mode:</span> camera scanning is shown only on small screens where a built-in camera makes sense.</p>
            <p><span className="font-semibold text-foreground">Rules:</span> active employees save instantly; scans after 7:30 PM browser time are late; inactive statuses are denied.</p>
          </div>
          {lastScan && (
            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">
              <p className="font-semibold">Last successful scan</p>
              <p>{lastScan.employee} • {lastScan.time} • {lastScan.status}</p>
            </div>
          )}
          <p className="mt-5 rounded-xl bg-background/70 p-3 text-xs font-medium text-muted-foreground">{scannerMessage}</p>
        </div>
      </Card>

      {showForm && (
        <Card className="mb-6 p-5 border border-primary/15 bg-primary/[0.02]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Check className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Record Attendance</h3>
              <p className="text-[11px] text-muted-foreground/60">Log attendance for an employee</p>
            </div>
          </div>
          <div className="grid md:grid-cols-5 gap-3">
            <select className="form-select" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Select employee</option>
              {employees.map((e: any) => <option key={e.id} value={e.id}>{e.users?.full_name || 'Unnamed'}</option>)}
            </select>
            <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">Leave</option>
            </select>
            <Input type="time" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} />
            <Input type="time" value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} />
            <Button size="sm" onClick={handleRecordAttendance}>Save</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 stagger-children">
        {[
          { label: 'Total', value: attendanceSummary.total, gradient: 'from-slate-500 to-slate-600' },
          { label: 'Present', value: attendanceSummary.present, gradient: 'from-emerald-500 to-green-600' },
          { label: 'Absent', value: attendanceSummary.absent, gradient: 'from-red-500 to-rose-600' },
          { label: 'Late', value: attendanceSummary.late, gradient: 'from-amber-500 to-orange-500' },
          { label: 'On Leave', value: attendanceSummary.leave, gradient: 'from-blue-500 to-blue-600' },
        ].map(stat => (
          <Card key={stat.label} className="stat-card p-4">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input placeholder="Search employee..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-auto" />
          <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">On Leave</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="!py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading attendance...</p>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="!py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-6 h-6 text-muted-foreground/25" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">No attendance records found</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Record attendance above to get started</p>
                </td></tr>
              ) : filtered.map((record) => (
                <tr key={record.id} className="group">
                  <td className="text-xs text-muted-foreground whitespace-nowrap">{record.attendance_date}</td>
                  <td className="font-medium text-foreground">{getEmployeeName(record) || 'Unknown'}</td>
                  <td className="text-muted-foreground font-mono text-xs">{record.clock_in || '—'}</td>
                  <td className="text-muted-foreground font-mono text-xs">{record.clock_out || '—'}</td>
                  <td>
                    <span className={`badge ${
                      record.status === 'present' ? 'badge-success' :
                      record.status === 'absent' ? 'badge-danger' :
                      record.status === 'late' ? 'badge-warning' :
                      'badge-info'
                    }`}>
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/20 bg-muted/10">
            <p className="text-xs text-muted-foreground/50">Showing <span className="font-semibold text-foreground">{filtered.length}</span> records</p>
          </div>
        )}
      </Card>
    </div>
  )
}
