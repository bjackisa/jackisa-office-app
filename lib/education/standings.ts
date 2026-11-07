import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Student standings.
 *
 * Pure computation over the education tables — no I/O beyond the reads the
 * caller passes in — so the same numbers drive the Grades screen, the marks
 * notification and the report card. Coursework and the final exam each carry 50%
 * of a module and the module total is their sum. Keep this in step with the
 * Grades screen (app/app/education/grades/page.tsx), which is the reference.
 *
 * Retakes: the first exam mark entered for a student on a module is the Exam;
 * any later entry is a Retake. When a retake exists the module total is
 * 50% coursework + 50% of the (latest) retake — the original exam is still
 * reported, it just no longer counts.
 */

export const COURSEWORK_WEIGHT = 0.5
export const EXAM_WEIGHT = 0.5

/** Points each half contributes to a module total (0–50 apiece). */
const COURSEWORK_POINTS = COURSEWORK_WEIGHT * 100
const EXAM_POINTS = EXAM_WEIGHT * 100

export interface ModuleStanding {
  module_id: string
  code: string
  name: string
  /** The coursework half's contribution to the module total (0–50), or null when nothing was graded. */
  coursework: number | null
  /** The first exam sitting's contribution (0–50), or null when the paper was not sat. */
  exam: number | null
  /** The latest retake's contribution (0–50), or null when there was no retake. */
  retake: number | null
  /** Module total out of 100 — coursework + retake when retaken, else coursework + exam. */
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
  if (pct === null) return 'NA'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B'
  if (pct >= 60) return 'C'
  if (pct >= 50) return 'D'
  if (pct >= 40) return 'E'
  return 'F'
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export interface ExamAttempt {
  grade: any
  exam: any
  /** Raw percentage for the sitting (marks / max × 100). */
  percent: number
}

/**
 * A student's exam sittings on one module, oldest first. Entry order
 * (`created_at` of the mark) decides which is the exam and which the retake;
 * exam_date breaks ties for legacy rows recorded without a timestamp.
 */
export function examAttempts(exams: any[], examGrades: any[], studentId: string | null, moduleId: string): ExamAttempt[] {
  const examById = new Map(exams.filter((e) => e.module_id === moduleId).map((e) => [e.id, e]))
  return examGrades
    .filter((g) => (studentId === null || g.student_id === studentId) && examById.has(g.final_exam_id))
    .map((g) => {
      const exam = examById.get(g.final_exam_id)
      return { grade: g, exam, percent: (Number(g.marks_obtained) / Number(exam?.max_marks || 100)) * 100 }
    })
    .sort((a, b) =>
      String(a.grade.created_at || '').localeCompare(String(b.grade.created_at || '')) ||
      String(a.exam?.exam_date || '').localeCompare(String(b.exam?.exam_date || '')),
    )
}

/** Split sittings into the original exam and the latest retake, each as 0–50 points. */
export function examAndRetake(attempts: ExamAttempt[]): { exam: number | null; retake: number | null; retakes: number } {
  const toPoints = (a?: ExamAttempt) => (a ? round1((a.percent / 100) * EXAM_POINTS) : null)
  return {
    exam: toPoints(attempts[0]),
    retake: attempts.length > 1 ? toPoints(attempts[attempts.length - 1]) : null,
    retakes: Math.max(0, attempts.length - 1),
  }
}

export function totalFor(coursework: number | null, exam: number | null): number | null {
  if (coursework === null && exam === null) return null
  // A module assessed on one component only is graded on that component alone,
  // scaled to 100 — an exam-only module scores the exam percentage.
  if (coursework === null) return round1((exam as number) * 2)
  if (exam === null) return round1((coursework as number) * 2)
  return round1(coursework + exam)
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

    // Sum every coursework row the student has for this module's days — a
    // retake adds another row and both count, exactly as the Grades screen does.
    const dayById = new Map(days.map((d) => [d.id, d]))
    const graded = courseworkGrades.filter((g) => dayById.has(g.coursework_day_id))
    let cwSum = 0
    let cwMax = 0
    for (const g of graded) {
      cwSum += Number(g.marks_obtained || 0)
      cwMax += Number(dayById.get(g.coursework_day_id)?.max_marks || 20)
    }
    const gradedDayIds = new Set(graded.map((g) => g.coursework_day_id))
    const missed = days.filter((d) => !gradedDayIds.has(d.id)).length
    missedTotal += missed

    // Coursework half: raw marks scaled to 50 points, or null when nothing was
    // graded — an ungraded module shows dashes and NA, not a zero.
    const coursework = cwMax > 0
      ? round1(Math.min((cwSum / cwMax) * COURSEWORK_POINTS, COURSEWORK_POINTS))
      : null

    // Exam half: out of 50. The first sitting is the exam; a later entry is a
    // retake, and when there is one it replaces the exam in the total.
    const { exam, retake } = examAndRetake(examAttempts(modExams, examGrades, null, mod.id))
    const total = totalFor(coursework, retake ?? exam)

    rows.push({
      module_id: mod.id,
      code: mod.module_code || '',
      name: mod.module_name || '',
      coursework,
      exam,
      retake,
      total,
      grade: gradeFor(total),
      missed_days: missed,
    })
  }

  const scored = rows.filter((r) => r.total !== null)
  const average = scored.length ? round1(scored.reduce((s, r) => s + (r.total as number), 0) / scored.length) : 0
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
      db.from('student_grades_final_exam').select('final_exam_id, marks_obtained, created_at').eq('student_id', studentId),
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
