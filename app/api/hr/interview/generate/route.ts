import { NextRequest, NextResponse } from 'next/server'

const CATEGORIES = [
  'skill',
  'work_attitude',
  'emotional_intelligence',
  'teamwork',
  'mental_stability',
  'personality_assessment',
] as const

const fallbackQuestions = (role: string) => CATEGORIES.flatMap((category) =>
  Array.from({ length: 10 }, (_, index) => ({
    category,
    type: category === 'skill' && index >= 8 ? 'practical' : 'theory',
    question: category === 'skill'
      ? `${index >= 8 ? 'Practical' : 'Theory'} ${index + 1}: Ask the candidate to demonstrate or explain a core ${role} competency relevant to day-to-day work.`
      : `Question ${index + 1}: Assess the candidate's ${category.replace(/_/g, ' ')} for the ${role} role with a behavioral interview prompt.`,
    expectedAnswer: 'Look for role-specific examples, clear reasoning, honesty, and evidence of healthy professional judgment.',
    maxMarks: 10,
  }))
)

function normalizeQuestions(raw: any, role: string) {
  const questions = Array.isArray(raw?.questions) ? raw.questions : []
  const normalized = CATEGORIES.flatMap((category) => {
    const categoryQuestions = questions.filter((q: any) => q?.category === category).slice(0, 10)
    const padded = [...categoryQuestions]
    while (padded.length < 10) {
      const fallback = fallbackQuestions(role).find((q) => q.category === category && !padded.some((p: any) => p.question === q.question))
      padded.push(fallback)
    }
    return padded.map((q: any, index: number) => ({
      category,
      type: category === 'skill' && index >= 8 ? 'practical' : 'theory',
      question: String(q?.question || `${category} question ${index + 1}`),
      expectedAnswer: String(q?.expectedAnswer || q?.expected_answer || 'Evaluate against the role requirements.'),
      maxMarks: 10,
    }))
  })
  return normalized
}

export async function POST(request: NextRequest) {
  try {
    const { roleName, roleDescription } = await request.json()
    if (!roleName) return NextResponse.json({ error: 'Role is required.' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY
    if (!apiKey) {
      return NextResponse.json({ questions: fallbackQuestions(roleName), source: 'fallback' })
    }

    const prompt = `Create an interview quiz for the role "${roleName}". Role context: ${roleDescription || 'No extra description'}.
Return only valid JSON with a questions array. Create exactly 60 questions: categories skill, work_attitude, emotional_intelligence, teamwork, mental_stability, personality_assessment. Each category must have 10 questions. Skill must have 8 theory questions first and 2 practical questions last. Each item must include category, type, question, expectedAnswer, maxMarks. Use maxMarks 10. Questions should be professional, lawful, job-related, and avoid medical diagnosis or protected-class discrimination. Mental stability questions should assess work stress coping and judgement, not clinical health.`

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })

    if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`)

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const jsonText = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    const parsed = JSON.parse(jsonText)

    return NextResponse.json({ questions: normalizeQuestions(parsed, roleName), source: 'gemini' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate interview questions.' }, { status: 500 })
  }
}
