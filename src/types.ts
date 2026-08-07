export type Role = 'trainer' | 'student'

export type Page =
  | 'dashboard' | 'students' | 'student-detail' | 'copilot' | 'builder'
  | 'forms' | 'form-builder' | 'schedule' | 'messages'
  | 'today' | 'workout' | 'assistant' | 'nutrition' | 'student-form'

export type Student = {
  id: string
  name: string
  initials: string
  age: number
  goal: string
  since: string
  status: 'priority' | 'feedback' | 'steady'
  summary: string
  streak: number
  adherence: number
}

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

export type PainReport = {
  id: string
  studentId: string
  studentName: string
  location: string
  moment: string
  intensity: number
  createdAt: string
  status: 'open' | 'reviewed'
}

export type Session = {
  id: string
  date: string
  time: string
  student: string
  type: 'Presencial' | 'Online' | 'Grupo'
  place: string
  status: 'confirmed' | 'available' | 'pending' | 'reschedule'
}

export type ChatMessage = {
  id: string
  sender: Role
  text: string
  time: string
}

export type QuestionType = 'text' | 'long' | 'single' | 'multi' | 'scale' | 'yesno' | 'number'

export type FormQuestion = {
  id: string
  label: string
  type: QuestionType
  options?: string[]
  required?: boolean
}

export type Meal = {
  id: string
  time: string
  title: string
  description: string
  protein: number
  carbs: number
  fat: number
}
