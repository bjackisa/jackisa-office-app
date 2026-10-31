import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Student standings.
 *
 * Pure computation over the education tables — no I/O beyond the reads the
 * caller passes in — so the same numbers drive the dashboard, the marks
 * notification and the transcript. Coursework and the final exam each carry 50%,
 * matching the Grades screen; if only one side exists the other is ignored.
 */

export const COURSEWORK_WEIGHT = 0.5
export const EXAM_WEIGHT = 0.5

export interface ModuleStanding {
  module_id: string
  code: string
  name: string
  coursework: number | null
  exam: number | null
  total: number | null
  grade: string
  missed_days: number
}

export interface StudentStanding {
  modules: ModuleStanding[]
  average: number
  points: number
  missed_days: number
  trend: 'up' | 'down' | 'steady'
  balance: number
}

export function gradeFor(pct: number | null): string {
  if (pct === null) return '—'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B'
  if (pct >= 60) return 'C'
  if (pct >= 50) return 'D'
  return 'E'
}

function pct(sum: number, max: number): number | null {
  return max > 0 ? Math.round((sum / max) * 1000) / 10 : null
}

export function totalFor(coursework: number | null, exam: number | null): number | null {
  if (coursework !== null && exam !== null) {
    return Math.round((coursework * COURSEWORK_WEIGHT + exam * EXAM_WEIGHT) * 10) / 10
  }
  return coursework ?? exam ?? null
}

/** Compute a student's standing across every module they are enrolled in. */
export function computeStanding(input: {
  modules: any[]
  enrollments: any[]
  courseworkDays: any[]
  courseworkGrades: any[]
  exams: any[]
  examGrades: any[]
  tuitionAmount: number
  tuitionPaid: number
}): StudentStanding {
  const { modules, enrollments, courseworkDays, courseworkGrades, exams, examGrades } = input
  const enrolledIds = new Set(enrollments.map((e) => e.module_id))
  const rows: ModuleStanding[] = []
  let missedTotal = 0

  for (const mod of modules) {
    if (!enrolledIds.has(mod.id)) continue
    const days = courseworkDays.filter((d) => d.module_id === mod.id)
    const modExams = exams.filter((e) => e.module_id === mod.id)

    let cwSum = 0
    let cwMax = 0
    let missed = 0
    for (const day of days) {
      const grade = courseworkGrades.find((g) => g.coursework_day_id === day.id)
      const max = Number(day.max_marks || 20)
      if (!grade || Number(grade.marks_obtained) <= 0) {
        missed += 1
        cwMax += max
        continue
      }
      cwSum += Number(grade.marks_obtained)
      cwMax += max
    }
    missedTotal += missed

    let exSum = 0
    let exMax = 0
    for (const exam of modExams) {
      const grade = examGrades.find((g) => g.final_exam_id === exam.id)
      const max = Number(exam.max_marks || 100)
      exMax += max
      if (grade) exSum += Number(grade.marks_obtained)
    }

    const coursework = cwMax > 0 ? pct(cwSum, cwMax) : null
    const exam = exMax > 0 && examGrades.some((g) => modExams.some((e) => e.id === g.final_exam_id)) ? pct(exSum, exMax) : null
    const total = totalFor(coursework, exam)

    rows.push({
      module_id: mod.id,
      code: mod.module_code || '',
      name: mod.module_name || '',
      coursework,
      exam,
      total,
      grade: gradeFor(total),
      missed_days: missed,
    })
  }

  const scored = rows.filter((r) => r.total !== null)
  const average = scored.length ? Math.round((scored.reduce((s, r) => s + (r.total as number), 0) / scored.length) * 10) / 10 : 0
  const points = scored.reduce((s, r) => s + Math.round((r.total as number) / 10), 0)

  // Trend: the most recent scored module against the running average.
  let trend: StudentStanding['trend'] = 'steady'
  if (scored.length >= 2) {
    const last = scored[scored.length - 1].total as number
    const prev = scored.slice(0, -1).reduce((s, r) => s + (r.total as number), 0) / (scored.length - 1)
    if (last > prev + 2) trend = 'up'
    else if (last < prev - 2) trend = 'down'
  }

  return {
    modules: rows,
    average,
    points,
    missed_days: missedTotal,
    trend,
    balance: Math.max(0, Math.round((input.tuitionAmount - input.tuitionPaid) * 100) / 100),
  }
}

/** Sum completed payments tagged to a student (metadata.student_id). */
export async function tuitionPaid(db: SupabaseClient, companyId: string, studentId: string): Promise<number> {
  const { data } = await db
    .from('payments')
    .select('gross_amount, net_amount, status, metadata')
    .eq('company_id', companyId)
    .eq('status', 'completed')
    .limit(2000)
  return (data || [])
    .filter((p: any) => String(p?.metadata?.student_id || '') === studentId)
    .reduce((s: number, p: any) => s + Number(p.net_amount ?? p.gross_amount ?? 0), 0)
}

/** Everything the notification/transcript route needs about one student. */
export async function loadStudentContext(db: SupabaseClient, companyId: string, studentId: string) {
  const [{ data: student }, { data: modules }, { data: enrollments }, { data: days }, { data: cwGrades }, { data: exams }, { data: exGrades }] =
    await Promise.all([
      db.from('students').select('*').eq('id', studentId).maybeSingle(),
      db.from('education_modules').select('id, module_code, module_name').eq('company_id', companyId),
      db.from('student_enrollments').select('module_id').eq('student_id', studentId),
      db.from('coursework_days').select('id, module_id, day_number, title, max_marks'),
      db.from('student_grades_coursework').select('coursework_day_id, marks_obtained').eq('student_id', studentId),
      db.from('final_exams').select('id, module_id, exam_date, max_marks'),
      db.from('student_grades_final_exam').select('final_exam_id, marks_obtained').eq('student_id', studentId),
    ])

  const companyModules = modules || []
  const moduleIds = new Set(companyModules.map((m: any) => m.id))
  const scopedDays = (days || []).filter((d: any) => moduleIds.has(d.module_id))
  const scopedExams = (exams || []).filter((e: any) => moduleIds.has(e.module_id))

  const paid = await tuitionPaid(db, companyId, studentId)

  const standing = computeStanding({
    modules: companyModules,
    enrollments: enrollments || [],
    courseworkDays: scopedDays,
    courseworkGrades: cwGrades || [],
    exams: scopedExams,
    examGrades: exGrades || [],
    tuitionAmount: Number(student?.tuition_amount || 0),
    tuitionPaid: paid,
  })

  return { student, modules: companyModules, standing }
}
