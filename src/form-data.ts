import type { FormQuestion } from './types'

export const generalForm: FormQuestion[] = [
  { id: 'q1', label: 'Qual é o seu objetivo principal?', type: 'single', options: ['Ganhar massa', 'Emagrecer', 'Saúde e qualidade de vida', 'Performance'], required: true },
  { id: 'q2', label: 'Você pratica atividade física atualmente?', type: 'yesno', required: true },
  { id: 'q3', label: 'Tem alguma lesão ou dor atual? Descreva.', type: 'long', required: true },
  { id: 'q4', label: 'Quantas horas você dorme por noite?', type: 'number' },
  { id: 'q5', label: 'Como está seu nível de estresse hoje?', type: 'scale' },
  { id: 'q6', label: 'Quantos dias por semana você consegue treinar?', type: 'number' },
  { id: 'q7', label: 'Há alguma informação importante que não perguntamos?', type: 'long' },
]

export const createGeneralForm = () => generalForm.map((question) => ({
  ...question,
  options: question.options ? [...question.options] : undefined,
}))
