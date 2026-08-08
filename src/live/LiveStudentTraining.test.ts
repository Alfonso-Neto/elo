import { describe, expect, it } from 'vitest'
import type { FormQuestion } from '../types'
import { buildAnamnesisAnswers } from './LiveStudentTraining'

const questions: FormQuestion[] = [
  { id: 'goal', label: 'Qual é seu objetivo?', type: 'text', required: true },
  { id: 'days', label: 'Quantos dias?', type: 'number', required: true },
  { id: 'pain', label: 'Sentiu dor?', type: 'yesno' },
  { id: 'sports', label: 'Práticas', type: 'multi', options: ['Corrida','Natação'] },
]

describe('student anamnesis answers', () => {
  it('omits optional blanks and preserves valid question-specific values', () => {
    expect(buildAnamnesisAnswers(questions, { goal: 'Ganhar força', days: '3', pain: '', sports: ['Corrida'] })).toEqual({ goal: 'Ganhar força', days: '3', sports: ['Corrida'] })
  })

  it('rejects missing required and out-of-contract values', () => {
    expect(buildAnamnesisAnswers(questions, { goal: '', days: '3' })).toBeNull()
    expect(buildAnamnesisAnswers(questions, { goal: 'Força', days: 'muitos' })).toBeNull()
    expect(buildAnamnesisAnswers(questions, { goal: 'Força', days: '3', sports: ['Futebol'] })).toBeNull()
  })
})
