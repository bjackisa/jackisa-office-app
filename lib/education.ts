export const calculateEightWorkingWeekEndDate = (startDate: string) => {
  const start = new Date(`${startDate}T00:00:00`)
  const result = new Date(start)
  let workingDays = 0

  while (workingDays < 40) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) {
      workingDays += 1
    }
  }

  return result.toISOString().split('T')[0]
}

export const gradeFromScore = (score: number) => {
  if (score >= 90) return 'A+'
  if (score >= 85) return 'A'
  if (score >= 75) return 'B'
  if (score >= 65) return 'C'
  if (score >= 55) return 'D'
  if (score >= 45) return 'E'
  if (score >= 35) return 'F'
  return 'F+'
}
