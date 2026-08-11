import type { Exercise, FormQuestion } from './types'
import { generalForm } from './form-data'

export { generalForm } from './form-data'

export const exerciseLibrary: Exercise[] = [
  { id: 'mobilidade', name: 'Mobilidade de tornozelo', muscle: 'Preparação · mobilidade', sets: '2', reps: '10', load: 'Livre', rest: '30s', tempo: 'controlada', rir: '—', note: 'Avance o joelho sem tirar o calcanhar do chão.', suggested: true },
  { id: 'stiff', name: 'Stiff com halteres', muscle: 'Posterior · glúteo', sets: '3', reps: '10', load: '24 kg', rest: '75s', tempo: '3-1-1', rir: '2', note: 'Quadril para trás e coluna neutra.' },
  { id: 'abducao', name: 'Abdução de quadril', muscle: 'Glúteo médio · estabilidade', sets: '3', reps: '15', load: 'Elástico', rest: '45s', tempo: '2-1-2', rir: '2', note: 'Mantenha a pelve estável durante todo o movimento.' },
  { id: 'panturrilha', name: 'Panturrilha em pé', muscle: 'Panturrilha', sets: '3', reps: '15', load: '20 kg', rest: '45s', tempo: '2-1-2', rir: '2', note: 'Use amplitude completa e pause no topo.' },
]

export const formTemplateQuestions: Record<string, FormQuestion[]> = {
  geral: generalForm,
  parq: [
    { id: 'parq-1', label: 'Algum médico já disse que você tem um problema cardíaco?', type: 'yesno', required: true },
    { id: 'parq-2', label: 'Você sente dor no peito durante atividade física?', type: 'yesno', required: true },
    { id: 'parq-3', label: 'No último mês, sentiu dor no peito em repouso?', type: 'yesno', required: true },
    { id: 'parq-4', label: 'Você já perdeu o equilíbrio por tontura ou perdeu a consciência?', type: 'yesno', required: true },
    { id: 'parq-5', label: 'Tem algum problema ósseo ou articular que possa piorar com exercício?', type: 'yesno', required: true },
    { id: 'parq-6', label: 'Existe outro motivo para não iniciar atividade física agora?', type: 'long' },
  ],
  emagrecimento: [
    { id: 'emag-1', label: 'Qual mudança você espera perceber primeiro?', type: 'long', required: true },
    { id: 'emag-2', label: 'Quantos dias por semana consegue treinar?', type: 'number', required: true },
    { id: 'emag-3', label: 'Como avalia sua energia no dia a dia?', type: 'scale', required: true },
    { id: 'emag-4', label: 'Já tentou manter uma rotina de treino antes?', type: 'yesno' },
    { id: 'emag-5', label: 'O que mais costuma interromper sua consistência?', type: 'multi', options: ['Tempo', 'Dor', 'Cansaço', 'Motivação', 'Rotina familiar'] },
    { id: 'emag-6', label: 'Há alguma dor ou condição que o treinador deve conhecer?', type: 'long', required: true },
  ],
  hipertrofia: [
    { id: 'hiper-1', label: 'Quais grupos musculares você quer priorizar?', type: 'multi', options: ['Pernas', 'Glúteos', 'Costas', 'Peito', 'Ombros', 'Braços'], required: true },
    { id: 'hiper-2', label: 'Há quanto tempo pratica musculação?', type: 'single', options: ['Nunca pratiquei', 'Menos de 1 ano', '1 a 3 anos', 'Mais de 3 anos'], required: true },
    { id: 'hiper-3', label: 'Quantos dias por semana consegue treinar?', type: 'number', required: true },
    { id: 'hiper-4', label: 'Como está sua recuperação entre treinos?', type: 'scale' },
    { id: 'hiper-5', label: 'Existe exercício que causa dor ou insegurança?', type: 'long' },
  ],
  corrida: [
    { id: 'run-1', label: 'Qual distância você corre atualmente?', type: 'single', options: ['Ainda não corro', 'Até 5 km', '5 a 10 km', 'Mais de 10 km'], required: true },
    { id: 'run-2', label: 'Qual é sua meta principal na corrida?', type: 'long', required: true },
    { id: 'run-3', label: 'Quantas sessões de corrida faz por semana?', type: 'number', required: true },
    { id: 'run-4', label: 'Sentiu dor durante ou após correr nas últimas semanas?', type: 'yesno', required: true },
    { id: 'run-5', label: 'Se respondeu sim, descreva local e momento da dor.', type: 'long' },
  ],
  reabilitacao: [
    { id: 'rehab-1', label: 'Qual região está em recuperação?', type: 'text', required: true },
    { id: 'rehab-2', label: 'Existe diagnóstico ou orientação de um profissional de saúde?', type: 'long', required: true },
    { id: 'rehab-3', label: 'Qual movimento provoca mais desconforto?', type: 'long', required: true },
    { id: 'rehab-4', label: 'Qual a intensidade atual do desconforto?', type: 'scale', required: true },
    { id: 'rehab-5', label: 'Há alguma restrição que precisa ser respeitada?', type: 'long' },
  ],
  mulher: [
    { id: 'mulher-1', label: 'Há gestação, pós-parto ou outra fase que deva orientar o acompanhamento?', type: 'long' },
    { id: 'mulher-2', label: 'Existe liberação ou orientação médica relevante?', type: 'long' },
    { id: 'mulher-3', label: 'Como está sua energia nesta semana?', type: 'scale', required: true },
    { id: 'mulher-4', label: 'Há sintomas ou desconfortos que afetam o treino?', type: 'long' },
    { id: 'mulher-5', label: 'Qual é sua prioridade neste ciclo?', type: 'single', options: ['Força', 'Mobilidade', 'Condicionamento', 'Bem-estar'], required: true },
  ],
  idosos: [
    { id: 'idosos-1', label: 'Qual atividade do dia a dia você quer realizar com mais facilidade?', type: 'long', required: true },
    { id: 'idosos-2', label: 'Teve queda ou perda de equilíbrio no último ano?', type: 'yesno', required: true },
    { id: 'idosos-3', label: 'Usa algum apoio para caminhar?', type: 'yesno' },
    { id: 'idosos-4', label: 'Existe orientação médica ou restrição para exercício?', type: 'long', required: true },
    { id: 'idosos-5', label: 'Como avalia sua confiança para se movimentar?', type: 'scale', required: true },
  ],
}

export const formTemplates = [
  { id: 'geral', name: 'Anamnese geral', niche: 'Qualquer aluno', questions: 7 },
  { id: 'parq', name: 'PAR-Q', niche: 'Prontidão física', questions: 6 },
  { id: 'emagrecimento', name: 'Emagrecimento', niche: 'Perda de peso', questions: 6 },
  { id: 'hipertrofia', name: 'Hipertrofia', niche: 'Ganho de massa', questions: 5 },
  { id: 'corrida', name: 'Corrida / endurance', niche: 'Corredores', questions: 5 },
  { id: 'reabilitacao', name: 'Reabilitação', niche: 'Pós-lesão', questions: 5 },
  { id: 'mulher', name: 'Saúde da mulher', niche: 'Gestação e pós-parto', questions: 5 },
  { id: 'idosos', name: 'Terceira idade', niche: 'Longevidade', questions: 5 },
]
