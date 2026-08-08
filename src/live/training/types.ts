import type { Exercise, FormQuestion, Role } from '../../types'

export type TrainingScope = {
  workspaceId: string
  userId: string
  role: Role
}

export type PageCursor = { at: string; id: string }
export type PageOptions = { limit?: number; before?: PageCursor }
export type PageResult<T> = { items: T[]; nextCursor: PageCursor | null }

export type WorkoutVersion = {
  id: string
  workspaceId: string
  studentUserId: string
  publishedByUserId: string
  publishedByRole: 'owner' | 'trainer'
  versionNumber: number
  title: string
  exercises: Exercise[]
  publishedAt: string
}

export type WorkoutCompletion = {
  id: string
  workoutVersionId: string
  workspaceId: string
  studentUserId: string
  rpe: number
  mood: string
  comment: string | null
  completedExerciseIds: string[]
  completedAt: string
}

export type AnamnesisAssignment = {
  id: string
  workspaceId: string
  studentUserId: string
  assignedByUserId: string
  assignedByRole: 'owner' | 'trainer'
  title: string
  questions: FormQuestion[]
  assignedAt: string
}

export type AnamnesisAnswer = string | number | string[]
export type AnamnesisAnswers = Record<string, AnamnesisAnswer>

export type AnamnesisSubmission = {
  id: string
  assignmentId: string
  workspaceId: string
  studentUserId: string
  answers: AnamnesisAnswers
  submittedAt: string
}

export type TrainerStudentNote = {
  id: string
  workspaceId: string
  studentUserId: string
  authorUserId: string
  authorRole: 'owner' | 'trainer'
  note: string
  createdAt: string
}

export type PublishWorkoutInput = {
  studentUserId: string
  title: string
  exercises: Exercise[]
  idempotencyKey: string
}

export type CompleteWorkoutInput = {
  workoutVersionId: string
  rpe: number
  mood: string
  comment?: string
  completedExerciseIds: string[]
  idempotencyKey: string
}

export type AssignAnamnesisInput = {
  studentUserId: string
  title: string
  questions: FormQuestion[]
  idempotencyKey: string
}

export type SubmitAnamnesisInput = {
  assignmentId: string
  questions: FormQuestion[]
  answers: AnamnesisAnswers
  idempotencyKey: string
}

export type CreateTrainerNoteInput = {
  studentUserId: string
  note: string
  idempotencyKey: string
}
