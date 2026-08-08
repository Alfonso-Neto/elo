import type { PainReportSummary } from '../signals'
import type { Exercise } from '../types'
import type { WorkoutCompletion } from '../live/training'
import type { AssistantProposal, TrainerCopilotContext } from './assistant-service'

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function appendGuardrail(note: string, guardrail: string, duration: number | null) {
  const parts = [
    note.trim(),
    guardrail.trim(),
    duration ? `Reavaliar após ${duration} ${duration === 1 ? 'sessão' : 'sessões'}.` : '',
  ].filter(Boolean)
  return parts.join(' ').slice(0, 220)
}

function targeted(exercise: Exercise, target: string | null) {
  return target === null || normalized(exercise.name) === normalized(target)
}

export function applyAssistantProposalToDraft(workout: Exercise[], proposal: AssistantProposal) {
  let draft = workout.map((exercise) => ({ ...exercise }))
  for (const change of proposal.workout_changes) {
    if (change.operation === 'pause_session' || change.operation === 'request_professional_review') continue
    if (change.operation === 'remove_exercise' && change.target) {
      draft = draft.filter((exercise) => !targeted(exercise, change.target))
      continue
    }
    if (change.operation === 'replace_exercise' && change.target && change.value_text) {
      draft = draft.map((exercise) => targeted(exercise, change.target) ? {
        ...exercise,
        name: change.value_text!,
        note: appendGuardrail(exercise.note, change.guardrail, change.duration_sessions),
        suggested: true,
      } : exercise)
      continue
    }
    draft = draft.map((exercise) => {
      if (!targeted(exercise, change.target)) return exercise
      const patch: Partial<Exercise> = {
        note: appendGuardrail(exercise.note, change.guardrail, change.duration_sessions),
        suggested: true,
      }
      if (change.operation === 'reduce_volume_percent' && change.value_number !== null) {
        const sets = Number(exercise.sets)
        if (Number.isInteger(sets) && sets > 0) patch.sets = String(Math.max(1, Math.ceil(sets * (1 - change.value_number / 100))))
      }
      if (change.operation === 'reduce_load_percent' && change.value_number !== null) {
        const match = exercise.load.match(/^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/)
        if (match) {
          const amount = Number(match[1].replace(',', '.'))
          patch.load = `${Math.round(amount * (1 - change.value_number / 100) * 10) / 10}${match[2] ? ` ${match[2].trim()}` : ''}`
        }
      }
      if (change.operation === 'add_rest_seconds' && change.value_number !== null) {
        const seconds = Number(exercise.rest.match(/\d+/)?.[0])
        if (Number.isFinite(seconds)) patch.rest = `${seconds + change.value_number}s`
      }
      return { ...exercise, ...patch }
    })
  }
  return draft
}

export function formatPainReportForAssistant(report: PainReportSummary) {
  const flags = report.redFlags.length ? report.redFlags.join(', ') : 'nenhum sinal de alerta marcado'
  return [
    'Relato estruturado registrado pelo aluno; não presuma dados ausentes.',
    `Região: ${report.region}; lado: ${report.side}; movimento: ${report.movement}.`,
    `Momento: ${report.timing}; intensidade: ${report.intensity}/10; sinais: ${flags}.`,
    `Início informado: ${report.onset}; registro: ${report.createdAt}.`,
  ].join(' ')
}

export function buildBuilderReviewReport(input: {
  title: string
  workout: Exercise[]
  latestPainReport: PainReportSummary | null
  signalLookupFailed: boolean
}) {
  const title = input.title.trim() || 'rascunho sem título'
  const signal = input.latestPainReport
    ? formatPainReportForAssistant(input.latestPainReport)
    : input.signalLookupFailed
      ? 'A consulta de sinais não ficou disponível; limite a revisão ao rascunho e declare essa incerteza.'
      : 'Nenhum relato estruturado de dor foi encontrado para o aluno ativo.'
  return [
    'WORKOUT_BUILDER_REVIEW_V1',
    'Revisão solicitada pelo professor durante a edição. Produza somente uma proposta; não publique nem prescreva automaticamente.',
    `Rascunho: “${title.slice(0, 120)}”; ${input.workout.length} exercícios no total; ${Math.min(input.workout.length, 20)} enviados no contexto minimizado.`,
    signal,
  ].join('\n')
}

export function buildAssistantWorkoutContext(workout: Exercise[]): NonNullable<TrainerCopilotContext['current_workout']> {
  return workout.slice(0, 20).map((exercise) => {
    const parsedSets = Number.parseInt(exercise.sets, 10)
    const load = exercise.load.trim().slice(0, 40)
    return {
      exercise: exercise.name.trim().slice(0, 120) || 'Exercício sem nome',
      sets: Number.isFinite(parsedSets) ? Math.min(20, Math.max(1, parsedSets)) : 1,
      reps: exercise.reps.trim().slice(0, 40) || 'não informado',
      ...(load ? { load } : {}),
    }
  })
}

export function formatStructuredWorkoutFeedback(completions: WorkoutCompletion[]) {
  return completions.slice(0, 4).map((completion) => {
    const date = Number.isFinite(Date.parse(completion.completedAt)) ? completion.completedAt : 'data indisponível'
    return `Conclusão em ${date}: RPE ${completion.rpe}/10; sensação “${completion.mood}”; ${completion.completedExerciseIds.length} exercícios marcados.`
  })
}
