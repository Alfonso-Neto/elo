export type Role = 'trainer' | 'student'

export type Page =
  | 'dashboard' | 'students' | 'student-detail' | 'copilot' | 'builder'
  | 'forms' | 'form-builder' | 'schedule' | 'messages'
  | 'today' | 'workout' | 'assistant' | 'nutrition' | 'student-form'

export type Exercise = {
  id: string
  name: string
  muscle: string
  sets: string
  reps: string
  load: string
  rest: string
  tempo: string
  rir: string
  note: string
  suggested?: boolean
}

export type QuestionType = 'text' | 'long' | 'single' | 'multi' | 'scale' | 'yesno' | 'number'

export type FormQuestion = {
  id: string
  label: string
  type: QuestionType
  options?: string[]
  required?: boolean
}
