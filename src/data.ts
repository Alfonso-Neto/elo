import type { ChatMessage, Exercise, FormQuestion, Meal, PainReport, Session, Student } from './types'

export const students: Student[] = [
  { id: 'marina', name: 'Marina Costa', initials: 'MC', age: 34, goal: 'Hipertrofia', since: '4 meses', status: 'priority', summary: 'Dor no joelho · RPE 9/10 · 2 faltas', streak: 4, adherence: 78 },
  { id: 'rafael', name: 'Rafael Lima', initials: 'RL', age: 29, goal: 'Performance', since: '7 meses', status: 'feedback', summary: 'Feedback novo no treino de pernas', streak: 11, adherence: 91 },
  { id: 'bianca', name: 'Bianca Souza', initials: 'BS', age: 41, goal: 'Qualidade de vida', since: '1 ano', status: 'steady', summary: 'Rotina consistente · sem sinal aberto', streak: 18, adherence: 96 },
  { id: 'lucas', name: 'Lucas Mendes', initials: 'LM', age: 37, goal: 'Corrida 10 km', since: '2 meses', status: 'steady', summary: 'Treino B concluído · evolução estável', streak: 7, adherence: 89 },
  { id: 'camila', name: 'Camila Rocha', initials: 'CR', age: 31, goal: 'Força', since: '9 meses', status: 'feedback', summary: 'Sono baixo relatado no check-in', streak: 6, adherence: 84 },
]

export const initialWorkout: Exercise[] = [
  { id: 'legpress', name: 'Leg press 45°', muscle: 'Quadríceps · cadeia fechada', sets: '4', reps: '12', load: '80 kg', rest: '90s', tempo: '2-0-2', rir: '2', note: 'Não trave o joelho na subida. Pare se doer.', suggested: true },
  { id: 'extensora', name: 'Cadeira extensora', muscle: 'Quadríceps · cadeia aberta', sets: '3', reps: '15', load: '30 kg', rest: '60s', tempo: '2-1-2', rir: '2', note: 'Amplitude parcial. Controle o movimento, sem impulso.' },
  { id: 'pelvica', name: 'Elevação pélvica', muscle: 'Glúteo · estabilizador', sets: '3', reps: '12', load: '40 kg', rest: '60s', tempo: '2-1-1', rir: '1', note: 'Segure um segundo no topo e mantenha o abdômen ativo.', suggested: true },
  { id: 'flexora', name: 'Cadeira flexora', muscle: 'Posterior de coxa', sets: '3', reps: '12', load: '35 kg', rest: '60s', tempo: '2-0-2', rir: '2', note: 'Controle a volta e não deixe o peso cair.' },
]

export const exerciseLibrary: Exercise[] = [
  { id: 'mobilidade', name: 'Mobilidade de tornozelo', muscle: 'Preparação · mobilidade', sets: '2', reps: '10', load: 'Livre', rest: '30s', tempo: 'controlada', rir: '—', note: 'Avance o joelho sem tirar o calcanhar do chão.', suggested: true },
  { id: 'stiff', name: 'Stiff com halteres', muscle: 'Posterior · glúteo', sets: '3', reps: '10', load: '24 kg', rest: '75s', tempo: '3-1-1', rir: '2', note: 'Quadril para trás e coluna neutra.' },
  { id: 'abducao', name: 'Abdução de quadril', muscle: 'Glúteo médio · estabilidade', sets: '3', reps: '15', load: 'Elástico', rest: '45s', tempo: '2-1-2', rir: '2', note: 'Mantenha a pelve estável durante todo o movimento.' },
  { id: 'panturrilha', name: 'Panturrilha em pé', muscle: 'Panturrilha', sets: '3', reps: '15', load: '20 kg', rest: '45s', tempo: '2-1-2', rir: '2', note: 'Use amplitude completa e pause no topo.' },
]

export const initialPainReports: PainReport[] = [
  { id: 'pain-1', studentId: 'marina', studentName: 'Marina Costa', location: 'Joelho direito', moment: 'Na terceira série do agachamento', intensity: 6, createdAt: 'Hoje, 08:12', status: 'open' },
  { id: 'pain-2', studentId: 'marina', studentName: 'Marina Costa', location: 'Joelho direito', moment: 'Ao descer no agachamento', intensity: 5, createdAt: 'Há 5 dias', status: 'open' },
  { id: 'pain-3', studentId: 'marina', studentName: 'Marina Costa', location: 'Joelho direito', moment: 'Depois do treino', intensity: 4, createdAt: 'Há 12 dias', status: 'open' },
]

export const initialSessions: Session[] = [
  { id: 's1', date: '2026-08-07', time: '09:00', student: 'Lucas Mendes', type: 'Presencial', place: 'Studio 02', status: 'confirmed' },
  { id: 's2', date: '2026-08-07', time: '10:30', student: 'Camila Rocha', type: 'Online', place: 'Chamada de vídeo', status: 'confirmed' },
  { id: 's3', date: '2026-08-07', time: '14:00', student: 'Pedro Alves', type: 'Presencial', place: 'Studio 01', status: 'confirmed' },
  { id: 's4', date: '2026-08-08', time: '08:00', student: 'Marina Costa', type: 'Presencial', place: 'Studio 02', status: 'confirmed' },
  { id: 'free1', date: '2026-08-09', time: '09:30', student: 'Horário livre', type: 'Online', place: 'Disponível para agendamento', status: 'available' },
  { id: 'free2', date: '2026-08-10', time: '18:00', student: 'Horário livre', type: 'Presencial', place: 'Studio 01', status: 'available' },
]

export const initialMessages: ChatMessage[] = [
  { id: 'm1', sender: 'trainer', text: 'Oi, Marina. Vi seu relato sobre o joelho e vou ajustar a sessão de amanhã.', time: '09:14' },
  { id: 'm2', sender: 'student', text: 'Obrigada! Hoje incomodou mais na descida, principalmente na terceira série.', time: '09:18' },
  { id: 'm3', sender: 'trainer', text: 'Perfeito, esse detalhe ajuda. Se a dor reaparecer antes do treino, me avise por aqui.', time: '09:21' },
]

export const generalForm: FormQuestion[] = [
  { id: 'q1', label: 'Qual é o seu objetivo principal?', type: 'single', options: ['Ganhar massa', 'Emagrecer', 'Saúde e qualidade de vida', 'Performance'], required: true },
  { id: 'q2', label: 'Você pratica atividade física atualmente?', type: 'yesno', required: true },
  { id: 'q3', label: 'Tem alguma lesão ou dor atual? Descreva.', type: 'long', required: true },
  { id: 'q4', label: 'Quantas horas você dorme por noite?', type: 'number' },
  { id: 'q5', label: 'Como está seu nível de estresse hoje?', type: 'scale' },
  { id: 'q6', label: 'Quantos dias por semana você consegue treinar?', type: 'number' },
  { id: 'q7', label: 'Há alguma informação importante que não perguntamos?', type: 'long' },
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

export const meals: Meal[] = [
  { id: 'meal1', time: '07:30', title: 'Café da manhã', description: 'Ovos mexidos, pão integral, mamão e café', protein: 28, carbs: 46, fat: 14 },
  { id: 'meal2', time: '12:30', title: 'Almoço', description: 'Arroz, feijão, frango grelhado e salada', protein: 42, carbs: 68, fat: 12 },
  { id: 'meal3', time: '16:30', title: 'Lanche pré-treino', description: 'Iogurte natural, banana e aveia', protein: 18, carbs: 52, fat: 8 },
  { id: 'meal4', time: '20:00', title: 'Jantar', description: 'Batata assada, patinho moído e legumes', protein: 38, carbs: 55, fat: 11 },
]
