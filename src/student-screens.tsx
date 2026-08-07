import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, CalendarCheck, CalendarDays, Check, CheckCircle2, ChevronRight, Circle,
  Clock3, Dumbbell, FileCheck2, HeartPulse, Info, LoaderCircle, MessageCircle, Minus, Moon, Plus, Salad,
  Send, Sparkles, TimerReset, Utensils, Waves, X,
} from 'lucide-react'
import { meals } from './data'
import { BackButton, Button, Drawer, Eyebrow, Modal, MovementDemo, PageIntro, Progress, SectionTitle, SuccessState } from './components'
import { usePrototype } from './prototype-context'
import type { Exercise, FormQuestion } from './types'
import { assessPainSafety, type PainRedFlag } from './assistant/pain-safety'
import { createAssistantService, type AssistantProposal } from './assistant/assistant-service'
import { useAuth } from './auth/auth-context'
import { createIdempotencyKey, createSignalService } from './signals'
import { mapPainIntakeSelection, submitConsentedPainIntake, type PendingPainIntake } from './live/pain-intake'
import './assistant.css'

export function StudentTodayScreen() {
  const { navigate, studentWorkout: workout, studentWorkoutName: workoutName, completedExercises, sessions, formSubmitted, messages, workoutSent, painReports } = usePrototype()
  const completedCount = completedExercises.filter((id) => workout.some((exercise) => exercise.id === id)).length
  const progress = Math.round((completedCount / Math.max(workout.length, 1)) * 100)
  const nextSession = sessions.find((session) => session.student === 'Marina Costa' && session.status === 'confirmed')
  return <div className="page student-home enter"><section className="student-welcome"><Eyebrow accent>SEXTA, 7 DE AGOSTO</Eyebrow><h2>Oi, Marina.</h2><p>{painReports[0]?.createdAt === 'Agora' ? 'Seu relato já chegou ao André. Vá no seu ritmo hoje.' : 'Seu treino está pronto. Vá no seu ritmo e me conte como foi.'}</p></section>
    <section className="today-grid"><button className="today-workout" onClick={() => navigate('workout')}><div className="workout-orbit"><strong>{progress}%</strong><small>CONCLUÍDO</small><i style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties} /></div><div><Eyebrow>{workoutSent ? 'ATUALIZADO PELO ANDRÉ' : 'TREINO DE HOJE'}</Eyebrow><h3>{workoutName}</h3><p>{workout.length} exercícios · aproximadamente 48 min</p><span>Continuar treino <ArrowRight size={16} /></span></div><span className="today-number">01</span></button>
      <div className="today-side"><button onClick={() => navigate('assistant')}><span className="today-icon danger"><HeartPulse size={20} /></span><div><Eyebrow>COMO VOCÊ ESTÁ?</Eyebrow><h3>Algo doeu ou atrapalhou?</h3><p>Conte em menos de um minuto.</p></div><ChevronRight size={18} /></button><button onClick={() => navigate('schedule')}><span className="today-icon blue"><CalendarDays size={20} /></span><div><Eyebrow>PRÓXIMA SESSÃO</Eyebrow><h3>{nextSession ? `${nextSession.date.split('-').reverse().slice(0,2).join('/')} · ${nextSession.time}` : 'Escolha um horário'}</h3><p>{nextSession?.place ?? 'Veja a disponibilidade do André'}</p></div><ChevronRight size={18} /></button></div>
    </section>
    <section className="student-lower"><div><SectionTitle index="02" title="Para você hoje" /><div className="student-task-list"><button onClick={() => navigate('student-form')}><span className={formSubmitted ? 'task-check done' : 'task-check'}>{formSubmitted ? <Check size={16} /> : <FileCheck2 size={16} />}</span><span><strong>{formSubmitted ? 'Anamnese respondida' : 'Anamnese inicial'}</strong><small>{formSubmitted ? 'Respostas anexadas ao seu histórico' : 'André pediu que você responda · 3 min'}</small></span><span className={`tag ${formSubmitted ? 'success' : 'warning'}`}>{formSubmitted ? 'Concluída' : 'Pendente'}</span></button><button onClick={() => navigate('nutrition')}><span className="task-check"><Salad size={16} /></span><span><strong>Plano alimentar de hoje</strong><small>4 refeições · Nutri. Camila Reis</small></span><ArrowRight size={16} /></button><button onClick={() => navigate('messages')}><span className="task-check"><MessageCircle size={16} /></span><span><strong>Conversa com André</strong><small>{messages.at(-1)?.text}</small></span><ArrowRight size={16} /></button></div></div>
      <aside className="continuity-card"><Eyebrow>SEU ELO</Eyebrow><strong>4</strong><span>semanas de consistência</span><div className="streak-days">{['S','T','Q','Q','S','S','D'].map((day, index) => <i className={index < 5 ? 'done' : ''} key={`${day}-${index}`}>{index < 5 ? <Check size={12} /> : day}</i>)}</div><p>Consistência também é adaptar quando o corpo pede.</p></aside>
    </section>
  </div>
}

export function StudentWorkoutScreen() {
  const { navigate, studentWorkout: workout, studentWorkoutName: workoutName, completedExercises, setCompletedExercises, submitWorkoutFeedback, notify } = usePrototype()
  const [selected, setSelected] = useState<Exercise | null>(null)
  const [playing, setPlaying] = useState(true)
  const [started, setStarted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [feedback, setFeedback] = useState(false)
  const [rpe, setRpe] = useState(7)
  const [mood, setMood] = useState('Na medida')
  const [comment, setComment] = useState('')
  useEffect(() => { if (!started) return; const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer) }, [started])
  const completedCount = completedExercises.filter((id) => workout.some((exercise) => exercise.id === id)).length
  const progress = Math.round((completedCount / Math.max(workout.length, 1)) * 100)
  const toggle = (id: string) => setCompletedExercises((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  const finish = () => { if (completedExercises.length < workout.length) { notify('Ainda há exercícios em aberto', 'Você pode concluir mesmo assim ou marcar os itens realizados.'); setFeedback(true); return }; setFeedback(true) }
  return <div className="page workout-page enter"><BackButton onClick={() => navigate('today')} label="Voltar para hoje" /><PageIntro eyebrow="TREINO DE HOJE · INFERIORES" title={workoutName} copy="Adaptado pelo André a partir dos sinais que você compartilhou." action={<div className="workout-timer"><TimerReset size={18} /><span><strong>{String(Math.floor(seconds / 60)).padStart(2,'0')}:{String(seconds % 60).padStart(2,'0')}</strong><small>{started ? 'EM ANDAMENTO' : 'PRONTO'}</small></span><Button onClick={() => setStarted(!started)}>{started ? 'Pausar' : 'Começar'}</Button></div>} />
    <div className="workout-progress"><div><span><strong>{completedCount} de {workout.length}</strong> exercícios</span><b>{progress}%</b></div><Progress value={progress} label="Progresso do treino" /></div>
    <div className="student-exercise-list">{workout.map((exercise, index) => { const done = completedExercises.includes(exercise.id); return <article className={done ? 'done' : ''} key={exercise.id}><button className="complete-exercise" onClick={() => toggle(exercise.id)} aria-label={done ? `Desmarcar ${exercise.name}` : `Concluir ${exercise.name}`}>{done ? <Check size={18} /> : <Circle size={18} />}</button><span className="exercise-order">{String(index + 1).padStart(2,'0')}</span><button className="exercise-info" onClick={() => setSelected(exercise)}><span className="exercise-glyph"><Dumbbell size={18} /></span><span><strong>{exercise.name}</strong><small>{exercise.sets} séries × {exercise.reps} · {exercise.load} · {exercise.rest}</small></span>{exercise.suggested && <span className="tag success">AJUSTADO</span>}<ChevronRight size={17} /></button></article>})}</div>
    <Button className="finish-workout" onClick={finish}><CheckCircle2 size={17} /> Finalizar treino</Button>
    {selected && <Drawer title={selected.name} eyebrow="EXECUÇÃO E PARÂMETROS" onClose={() => setSelected(null)}><MovementDemo name={selected.name} playing={playing} onToggle={() => setPlaying(!playing)} /><div className="exercise-stats">{[['Séries',selected.sets],['Reps',selected.reps],['Carga',selected.load],['Descanso',selected.rest],['Cadência',selected.tempo],['RIR',selected.rir]].map(([label,value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div><div className="trainer-note"><Eyebrow>RECADO DO ANDRÉ</Eyebrow><p>{selected.note}</p></div><Button variant="secondary" className="wide" onClick={() => { setSelected(null); navigate('assistant') }}><HeartPulse size={16} /> Senti dor neste exercício</Button><Button className="wide" onClick={() => { toggle(selected.id); setSelected(null) }}>{completedExercises.includes(selected.id) ? 'Marcar como não concluído' : 'Concluir exercício'}</Button></Drawer>}
    {feedback && <Modal title="Como foi para você?" eyebrow="FEEDBACK PÓS-TREINO" onClose={() => setFeedback(false)} size="small"><div className="feedback-form"><label><span>Esforço percebido</span><strong>{rpe}/10</strong><input type="range" min="0" max="10" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} /></label><div className="mood-options" role="group" aria-label="Sensação após o treino">{['Leve','Na medida','Pesado'].map((option) => <button className={mood === option ? 'active' : ''} onClick={() => setMood(option)} aria-pressed={mood === option} key={option}>{option}</button>)}</div><label><span>Quer contar algo ao André?</span><textarea value={comment} onChange={(event) => setComment(event.target.value.slice(0, 400))} placeholder="Opcional: dor, dificuldade ou conquista..." /></label><Button className="wide" onClick={() => { submitWorkoutFeedback(rpe, mood, comment); setFeedback(false); navigate('today') }}>Enviar feedback</Button></div></Modal>}
  </div>
}

type PainStep = 'intro' | 'location' | 'movement' | 'moment' | 'intensity' | 'red-flags' | 'detail' | 'review' | 'done'

const redFlagOptions: { value: PainRedFlag | 'none'; label: string }[] = [
  { value: 'trauma', label: 'Houve queda, impacto forte ou trauma recente' },
  { value: 'major_swelling', label: 'Apareceu inchaço importante ou muito rápido' },
  { value: 'loss_of_motion', label: 'Não consigo apoiar ou mover a região normalmente' },
  { value: 'numbness_or_weakness', label: 'Senti formigamento, perda de força ou dor irradiando' },
  { value: 'none', label: 'Nenhum desses sinais aconteceu' },
]

export function StudentAssistantScreen() {
  const { navigate, addPainReport, studentWorkout: workout, setSessions, notify } = usePrototype()
  const { isDemo, membership, profile } = useAuth()
  const trainerFirstName = isDemo ? 'André' : membership?.trainerName.split(/\s+/)[0] ?? 'seu professor'
  const [mode, setMode] = useState<'home' | 'pain' | 'help' | 'absence'>('home')
  const [step, setStep] = useState<PainStep>('intro')
  const [location, setLocation] = useState('')
  const [movement, setMovement] = useState('')
  const [moment, setMoment] = useState('')
  const [intensity, setIntensity] = useState(0)
  const [redFlags, setRedFlags] = useState<PainRedFlag[]>([])
  const [redFlagsAnswered, setRedFlagsAnswered] = useState(false)
  const [noRedFlags, setNoRedFlags] = useState(false)
  const [detail, setDetail] = useState('')
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [pendingIntake, setPendingIntake] = useState<PendingPainIntake | null>(null)
  const commandKeys = useRef<{ consent: string; report: string; assistant: string } | null>(null)
  const [savedReportId, setSavedReportId] = useState('')
  const [assistantPhase, setAssistantPhase] = useState<'idle' | 'loading' | 'processing' | 'complete' | 'unavailable'>('idle')
  const [assistantProposal, setAssistantProposal] = useState<AssistantProposal | null>(null)
  const [helpExercise, setHelpExercise] = useState<Exercise | null>(null)
  const [helpPlaying, setHelpPlaying] = useState(true)
  const assessment = assessPainSafety(intensity, redFlags)
  const loadPainProposal = async (painReportId: string) => {
    if (isDemo || !membership || !profile || !commandKeys.current) return
    setAssistantPhase('loading')
    try {
      const result = await createAssistantService().requestPainTriage({
        workspaceId: membership.workspaceId,
        studentId: profile.id,
        painReportId,
        idempotencyKey: commandKeys.current.assistant,
      })
      if (result.state === 'processing') {
        setAssistantPhase('processing')
        return
      }
      setAssistantProposal(result.proposal)
      setAssistantPhase('complete')
    } catch {
      setAssistantPhase('unavailable')
    }
  }
  const submitPain = async () => {
    if (!consent) { setConsentError(true); return }
    if (isDemo) {
      addPainReport({ studentId: 'marina', studentName: 'Marina Costa', location, movement, moment: detail ? `${movement} · ${moment} · ${detail}` : `${movement} · ${moment}`, intensity, redFlags, safetyLevel: assessment.level })
      setStep('done')
      return
    }
    if (submitting) return
    const keys = commandKeys.current ?? {
      consent: createIdempotencyKey('consent-granted'),
      report: createIdempotencyKey('pain-report'),
      assistant: createIdempotencyKey('assistant-pain'),
    }
    commandKeys.current = keys
    const command = pendingIntake ?? {
      consentIdempotencyKey: keys.consent,
      reportIdempotencyKey: keys.report,
      draft: mapPainIntakeSelection({ location, movement, moment, intensity, detail, redFlags, onset: new Date().toISOString() }),
    }
    setPendingIntake(command)
    setSubmitting(true)
    setSubmitError('')
    try {
      const painReportId = await submitConsentedPainIntake(createSignalService(), command)
      setSavedReportId(painReportId)
      setStep('done')
      notify('Relato enviado ao professor', 'Consentimento e sinal foram registrados no espaço vinculado.')
      void loadPainProposal(painReportId)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível enviar o relato agora. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }
  const reset = () => { setMode('home'); setStep('intro'); setLocation(''); setMovement(''); setMoment(''); setIntensity(0); setRedFlags([]); setRedFlagsAnswered(false); setNoRedFlags(false); setDetail(''); setConsent(false); setConsentError(false); setSubmitting(false); setSubmitError(''); setPendingIntake(null); setSavedReportId(''); setAssistantPhase('idle'); setAssistantProposal(null); commandKeys.current = null }
  const editAfterFailure = () => { setSubmitError(''); setPendingIntake(null); commandKeys.current = null; setStep('detail') }
  const toggleRedFlag = (value: PainRedFlag | 'none') => {
    if (value === 'none') { setRedFlags([]); setNoRedFlags(true); setRedFlagsAnswered(true); return }
    const next = redFlags.includes(value) ? redFlags.filter((item) => item !== value) : [...redFlags, value]
    setRedFlags(next)
    setNoRedFlags(false)
    setRedFlagsAnswered(next.length > 0)
  }
  const backPain = () => {
    if (step === 'location') reset()
    else if (step === 'movement') setStep('location')
    else if (step === 'moment') setStep('movement')
    else if (step === 'intensity') setStep('moment')
    else if (step === 'red-flags') setStep('intensity')
    else if (step === 'detail') setStep('red-flags')
    else if (step === 'review') setStep('detail')
  }
  return <div className="page assistant-page enter"><PageIntro eyebrow="ASSISTENTE · CANAL ESTRUTURADO" title={<>O que seu corpo<br />está tentando dizer?</>} copy={`Eu organizo o relato e aviso ${trainerFirstName}. Não faço diagnóstico e não altero seu treino sozinho.`} />
    {mode === 'home' && <div className="assistant-choices"><button onClick={() => { setMode('pain'); setStep('location') }}><span className="assistant-choice-icon danger"><HeartPulse /></span><span><Eyebrow>RELATO ESTRUTURADO</Eyebrow><h3>Senti uma dor</h3><p>Local, momento e intensidade em menos de um minuto.</p></span><ArrowRight size={18} /></button><button onClick={() => setMode('help')}><span className="assistant-choice-icon blue"><Dumbbell /></span><span><Eyebrow>EXECUÇÃO</Eyebrow><h3>Dúvida em um exercício</h3><p>Reveja a demonstração e o recado do André.</p></span><ArrowRight size={18} /></button><button onClick={() => setMode('absence')}><span className="assistant-choice-icon neutral"><Moon /></span><span><Eyebrow>ROTINA</Eyebrow><h3>Não consigo treinar hoje</h3><p>Avise o André e preserve o contexto da semana.</p></span><ArrowRight size={18} /></button></div>}
    {mode === 'pain' && <section className="assistant-flow">{step !== 'done' && !submitting && !submitError && <BackButton onClick={backPain} label="Voltar uma etapa" />}<div className="assistant-thread"><div className="assistant-message"><Sparkles size={17} /><p>{step === 'done' ? `Seu relato foi estruturado e já apareceu para ${trainerFirstName}.` : 'Vou organizar o que aconteceu e checar sinais de alerta. Eu não faço diagnóstico e não altero seu treino.'}</p></div>{location && <div className="assistant-answer">{location}</div>}{movement && <div className="assistant-answer">{movement}</div>}{moment && <div className="assistant-answer">{moment}</div>}{['red-flags','detail','review'].includes(step) && <div className="assistant-answer">Intensidade {intensity}/10</div>}</div>
      {step === 'location' && <FlowQuestion title="Onde você sentiu?" copy="Escolha a região mais próxima.">{['Joelho direito','Joelho esquerdo','Lombar','Ombro direito','Ombro esquerdo','Quadril','Outra região'].map((item) => <button key={item} onClick={() => { setLocation(item); setStep('movement') }}>{item}</button>)}</FlowQuestion>}
      {step === 'movement' && <FlowQuestion title="Em qual movimento?" copy="Escolha o exercício ou a situação mais próxima.">{[...workout.map((exercise) => exercise.name), 'Caminhando ou correndo', 'Não estava treinando'].map((item) => <button key={item} onClick={() => { setMovement(item); setStep('moment') }}>{item}</button>)}</FlowQuestion>}
      {step === 'moment' && <FlowQuestion title="Quando incomodou?" copy="Isso ajuda o André a entender o padrão.">{['Durante a descida','Durante a subida','Depois da série','Após o treino','Em repouso'].map((item) => <button key={item} onClick={() => { setMoment(item); setStep('intensity') }}>{item}</button>)}</FlowQuestion>}
      {step === 'intensity' && <div className="flow-question"><Eyebrow>INTENSIDADE</Eyebrow><h3>Qual foi a intensidade?</h3><p>0 é sem dor; 10 é a pior dor imaginável.</p><div className="pain-scale">{Array.from({ length: 11 }, (_, value) => <button className={intensity === value ? 'active' : ''} key={value} onClick={() => { setIntensity(value); setStep('red-flags') }}>{value}</button>)}</div></div>}
      {step === 'red-flags' && <div className="flow-question"><Eyebrow>CHECAGEM DE SEGURANÇA</Eyebrow><h3>Algum destes sinais aconteceu?</h3><p>Marque tudo o que se aplica. Isso não é um diagnóstico; serve para orientar o próximo passo com mais segurança.</p><div className="pain-red-flags">{redFlagOptions.map((option) => { const active = option.value === 'none' ? noRedFlags : redFlags.includes(option.value); return <button type="button" className={active ? 'active' : ''} aria-pressed={active} key={option.value} onClick={() => toggleRedFlag(option.value)}><i>{active && <Check size={13} />}</i>{option.label}</button> })}</div><Button className="wide pain-step-action" disabled={!redFlagsAnswered} onClick={() => setStep('detail')}>Continuar <ArrowRight size={16} /></Button></div>}
      {step === 'detail' && <div className="flow-question"><Eyebrow>DETALHE · OPCIONAL</Eyebrow><h3>Quer acrescentar algo?</h3><p>Uma frase já basta. Não inclua documentos, diagnósticos ou informações que não sejam necessárias para o acompanhamento.</p>{assessment.level !== 'monitor' && <div className={`pain-safety-guidance ${assessment.level === 'stop_and_assess' ? 'stop' : ''}`} role="alert"><AlertTriangle size={19} /><span><strong>{assessment.title}</strong><p>{assessment.guidance}</p></span></div>}<textarea value={detail} onChange={(event) => setDetail(event.target.value.slice(0, 600))} placeholder="Ex.: começou na terceira série e melhorou quando parei..." /><Button className="wide" onClick={() => setStep('review')}>Revisar relato <ArrowRight size={16} /></Button></div>}
      {step === 'review' && <div className="flow-question pain-review"><Eyebrow>SEU ÚLTIMO OLHAR</Eyebrow><h3>Está fiel ao que aconteceu?</h3><div className={`pain-safety-guidance ${assessment.level === 'stop_and_assess' ? 'stop' : ''}`} role="status"><AlertTriangle size={19} /><span><strong>{assessment.title}</strong><p>{assessment.guidance}</p></span></div><dl><div><dt>Região</dt><dd>{location}</dd></div><div><dt>Movimento</dt><dd>{movement}</dd></div><div><dt>Momento</dt><dd>{moment}</dd></div><div><dt>Intensidade</dt><dd>{intensity}/10</dd></div></dl><div className="pain-consent"><p>Este relato contém dado de saúde. Ele será usado somente para acompanhamento, segurança e comunicação com a equipe responsável.</p><label className="switch-label"><input type="checkbox" checked={consent} disabled={submitting || Boolean(pendingIntake)} onChange={(event) => { setConsent(event.target.checked); setConsentError(false) }} /><i /><span>Autorizo salvar e compartilhar este relato com meu professor.</span></label>{consentError && <small role="alert">Registre seu consentimento para enviar o relato.</small>}</div>{submitError && <div className="pain-submit-error" role="alert"><strong>O envio não foi concluído.</strong><p>{submitError}</p><button type="button" onClick={editAfterFailure}>Editar e criar um novo envio</button></div>}<Button className="wide" onClick={() => void submitPain()} disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={16} /> Registrando com segurança...</> : <><Send size={16} /> {submitError ? 'Tentar novamente' : isDemo ? 'Enviar ao André' : `Enviar para ${trainerFirstName}`}</>}</Button></div>}
      {step === 'done' && <><SuccessState title={isDemo ? 'O André já recebeu' : `${trainerFirstName} já recebeu`} copy={`${location} · ${movement} · intensidade ${intensity}/10. O relato e a orientação de segurança ficaram registrados.`} action={<div className="success-actions"><Button onClick={() => navigate('today')}>Voltar para hoje</Button><Button variant="secondary" onClick={reset}>Novo relato</Button></div>} />{!isDemo && <StudentAssistantInsight phase={assistantPhase} proposal={assistantProposal} onRetry={() => void loadPainProposal(savedReportId)} />}</>}
    </section>}
    {mode === 'help' && <section className="assistant-flow"><BackButton onClick={reset} /><SectionTitle title="Qual exercício gerou dúvida?" copy="A demonstração é um apoio; siga sempre a orientação do seu professor." /><div className="help-list">{workout.map((exercise) => <button key={exercise.id} onClick={() => setHelpExercise(exercise)}><Dumbbell size={17} /><span><strong>{exercise.name}</strong><small>{exercise.sets} × {exercise.reps} · ver execução</small></span><ArrowRight size={16} /></button>)}</div></section>}
    {mode === 'absence' && <section className="assistant-flow"><BackButton onClick={reset} /><div className="absence-card"><Moon size={29} /><Eyebrow>SEM CULPA · COM CONTEXTO</Eyebrow><h3>Quer avisar que hoje não dá?</h3><p>Eu sinalizo sua próxima sessão ao André. Ele poderá reorganizar a semana sem tratar isso como um novo pedido de horário.</p><div><Button onClick={() => { setSessions((items) => { const next = items.find((item) => item.student === 'Marina Costa' && item.status === 'confirmed'); return next ? items.map((item) => item.id === next.id ? { ...item, status: 'reschedule' } : item) : items }); notify('André foi avisado', 'Sua próxima sessão foi marcada para reorganização.'); navigate('today') }}>Avisar e reorganizar</Button><Button variant="ghost" onClick={reset}>Voltar</Button></div></div></section>}
    {helpExercise && <Drawer title={helpExercise.name} eyebrow="EXECUÇÃO E RECADO DO ANDRÉ" onClose={() => setHelpExercise(null)}><MovementDemo name={helpExercise.name} playing={helpPlaying} onToggle={() => setHelpPlaying((value) => !value)} /><div className="exercise-stats">{[['Séries',helpExercise.sets],['Reps',helpExercise.reps],['Carga',helpExercise.load],['Descanso',helpExercise.rest],['Cadência',helpExercise.tempo],['RIR',helpExercise.rir]].map(([label,value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div><div className="trainer-note"><Eyebrow>RECADO DO ANDRÉ</Eyebrow><p>{helpExercise.note}</p></div><Button variant="secondary" className="wide" onClick={() => { setHelpExercise(null); setMode('pain'); setStep('location') }}><HeartPulse size={16} /> Relatar dor neste movimento</Button></Drawer>}
  </div>
}

const urgencyCopy: Record<AssistantProposal['urgency'], string> = {
  routine: 'ACOMPANHAR',
  soon: 'REVISAR EM BREVE',
  urgent: 'ATENÇÃO PRIORITÁRIA',
  emergency: 'INTERROMPER E BUSCAR AJUDA',
}

function StudentAssistantInsight({ phase, proposal, onRetry }: { phase: 'idle' | 'loading' | 'processing' | 'complete' | 'unavailable'; proposal: AssistantProposal | null; onRetry: () => void }) {
  if (phase === 'idle') return null
  if (phase === 'loading') return <section className="assistant-insight loading" aria-live="polite"><LoaderCircle className="spin" size={20} /><span><Eyebrow>APOIO DO COPILOTO</Eyebrow><strong>Organizando o contexto para revisão...</strong><small>Seu relato já está salvo; esta etapa não bloqueia o envio.</small></span></section>
  if (phase === 'processing') return <section className="assistant-insight pending" aria-live="polite"><Sparkles size={20} /><span><Eyebrow>ANÁLISE EM PROCESSAMENTO</Eyebrow><strong>O relato já chegou ao professor.</strong><small>O apoio adicional ainda está sendo preparado.</small></span><Button variant="secondary" onClick={onRetry}>Verificar novamente</Button></section>
  if (phase === 'unavailable' || !proposal) return <section className="assistant-insight unavailable" role="status"><Info size={20} /><span><Eyebrow>RELATO PRESERVADO</Eyebrow><strong>O apoio automático não abriu agora.</strong><small>Isso não afetou o registro nem o aviso ao professor.</small></span><Button variant="secondary" onClick={onRetry}>Tentar novamente</Button></section>
  return <section className={`assistant-insight proposal urgency-${proposal.urgency}`} aria-live="polite">
    <header><span><Sparkles size={18} /></span><div><Eyebrow>COPILOTO · PARA REVISÃO HUMANA</Eyebrow><h3>{proposal.summary}</h3></div><b>{urgencyCopy[proposal.urgency]}</b></header>
    {proposal.red_flags.length > 0 && <div className="assistant-insight-alert"><AlertTriangle size={18} /><span><strong>{proposal.red_flags[0].label}</strong><p>{proposal.red_flags[0].recommended_action}</p></span></div>}
    {proposal.questions.length > 0 && <div className="assistant-insight-questions"><Eyebrow>PONTOS PARA CONFIRMAR COM SEU PROFESSOR</Eyebrow>{proposal.questions.slice(0, 3).map((question) => <article key={question.id}><span>?</span><div><strong>{question.question}</strong><small>{question.reason}</small></div></article>)}</div>}
    <footer><Info size={17} aria-hidden="true" /><p>{proposal.disclaimer} <strong>Nenhuma alteração foi aplicada ao seu treino.</strong></p></footer>
  </section>
}

function FlowQuestion({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return <div className="flow-question"><Eyebrow>RELATO DE DOR</Eyebrow><h3>{title}</h3><p>{copy}</p><div className="flow-options">{children}</div></div>
}

export function NutritionScreen() {
  const { navigate, completedMeals, toggleMeal, water, setWater, notify } = usePrototype()
  const totals = meals.reduce((sum, meal) => ({ protein: sum.protein + meal.protein, carbs: sum.carbs + meal.carbs, fat: sum.fat + meal.fat }), { protein: 0, carbs: 0, fat: 0 })
  return <div className="page nutrition-page enter"><PageIntro eyebrow="PLANO DE HOJE · LEITURA" title={<>Nutrição que acompanha<br />o seu treino.</>} copy="Plano elaborado pela Nutri. Camila Reis, parceira responsável pelo acompanhamento nutricional." action={<div className="nutrition-author"><span>CR</span><div><strong>Camila Reis</strong><small>Nutricionista · CRN 00000</small></div></div>} />
    <section className="macro-strip"><div><strong>{totals.protein}g</strong><span>Proteína</span><i style={{ width: '78%' }} /></div><div><strong>{totals.carbs}g</strong><span>Carboidratos</span><i style={{ width: '72%' }} /></div><div><strong>{totals.fat}g</strong><span>Gorduras</span><i style={{ width: '55%' }} /></div><div><strong>2.180</strong><span>kcal planejadas</span><i style={{ width: '68%' }} /></div></section>
    <div className="nutrition-layout"><section><SectionTitle index="01" title="Refeições" copy={`${completedMeals.length} de ${meals.length} registradas`} /><div className="meal-list">{meals.map((meal) => <article className={completedMeals.includes(meal.id) ? 'done' : ''} key={meal.id}><time>{meal.time}</time><button onClick={() => toggleMeal(meal.id)} aria-label={completedMeals.includes(meal.id) ? `Desmarcar ${meal.title}` : `Registrar ${meal.title}`}>{completedMeals.includes(meal.id) ? <Check size={17} /> : <Circle size={17} />}</button><div><h3>{meal.title}</h3><p>{meal.description}</p><small>P {meal.protein}g · C {meal.carbs}g · G {meal.fat}g</small></div></article>)}</div></section><aside><div className="water-card"><Waves size={22} /><Eyebrow>ÁGUA · META 8 COPOS</Eyebrow><strong>{water}<small>/8</small></strong><Progress value={(water / 8) * 100} label="Meta de água" /><div><button onClick={() => setWater((value) => Math.max(0, value - 1))} disabled={water === 0} aria-label="Remover um copo"><Minus size={17} /></button><span>{water >= 8 ? 'Meta atingida' : `${8 - water} para a meta`}</span><button onClick={() => setWater((value) => Math.min(8, value + 1))} disabled={water === 8} aria-label="Adicionar um copo"><Plus size={17} /></button></div></div><div className="legal-note"><Info size={17} /><p>Seu personal não prescreve nem altera este plano. Pelo canal da equipe, André encaminha questões nutricionais à Camila Reis.</p></div><Button variant="secondary" className="wide" onClick={() => { notify('Canal com André', 'Escreva sua dúvida e peça o encaminhamento para a Nutri. Camila Reis.'); navigate('messages') }}><MessageCircle size={16} /> Pedir encaminhamento à Camila</Button></aside></div>
  </div>
}

const studentDays = [
  { key: '2026-08-07', label: 'Sex, 07' }, { key: '2026-08-08', label: 'Sáb, 08' }, { key: '2026-08-09', label: 'Dom, 09' }, { key: '2026-08-10', label: 'Seg, 10' }, { key: '2026-08-11', label: 'Ter, 11' },
]

export function StudentScheduleScreen() {
  const { sessions, setSessions, notify } = usePrototype()
  const [day, setDay] = useState('all')
  const visible = sessions.filter((session) => (day === 'all' || session.date === day) && (session.student === 'Marina Costa' || session.status === 'available'))
  const book = (id: string) => { setSessions((items) => items.map((item) => item.id === id ? { ...item, student: 'Marina Costa', status: 'pending' } : item)); notify('Solicitação enviada', 'O André precisa confirmar antes que o horário fique reservado.') }
  return <div className="page enter"><PageIntro eyebrow="SUA AGENDA · AGOSTO" title="Treino marcado, mente livre." copy="Veja suas sessões e solicite os horários que o André disponibilizou." />
    <div className="date-pills"><button className={day === 'all' ? 'active' : ''} onClick={() => setDay('all')}>Todos</button>{studentDays.map((item) => <button className={day === item.key ? 'active' : ''} onClick={() => setDay(item.key)} key={item.key}>{item.label}</button>)}</div>
    <div className="student-schedule-list">{visible.map((session) => <article className={session.status} key={session.id}><div className="date-tile"><strong>{session.date.slice(-2)}</strong><small>AGO</small></div><div><Eyebrow>{session.time} · {session.type}</Eyebrow><h3>{session.status === 'available' ? 'Horário disponível' : session.status === 'pending' ? 'Aguardando confirmação' : session.status === 'reschedule' ? 'Reorganização solicitada' : 'Sessão com André'}</h3><p>{session.place}</p></div>{session.status === 'available' ? <Button onClick={() => book(session.id)}>Solicitar horário</Button> : session.status === 'pending' ? <Button variant="secondary" onClick={() => setSessions((items) => items.map((item) => item.id === session.id ? { ...item, student: 'Horário livre', status: 'available' } : item))}>Cancelar pedido</Button> : session.status === 'reschedule' ? <Button variant="secondary" onClick={() => setSessions((items) => items.map((item) => item.id === session.id ? { ...item, status: 'confirmed' } : item))}>Desfazer aviso</Button> : <span className="tag success"><CalendarCheck size={13} /> Confirmada</span>}</article>)}</div>
    {!visible.length && <div className="empty-state"><CalendarDays size={28} /><h3>Nenhum horário neste filtro</h3><p>Selecione “Todos” para ver suas sessões e slots livres.</p><Button variant="secondary" onClick={() => setDay('all')}>Ver todos</Button></div>}
  </div>
}

export function StudentFormScreen() {
  const { navigate, publishedFormQuestions: formQuestions, publishedFormTitle, formSubmitted, formSent, submitForm } = usePrototype()
  const [consent, setConsent] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [errors, setErrors] = useState<string[]>([])
  const update = (question: FormQuestion, value: string, multi = false) => setAnswers((current) => {
    if (!multi) return { ...current, [question.id]: value }
    const values = Array.isArray(current[question.id]) ? current[question.id] as string[] : []
    return { ...current, [question.id]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }
  })
  const submit = () => {
    const missing = formQuestions.filter((question) => question.required && (!answers[question.id] || answers[question.id].length === 0)).map((question) => question.id)
    if (!consent) missing.unshift('consent')
    setErrors(missing)
    if (!missing.length) submitForm(answers)
  }
  if (!formSent) return <div className="page centered-page enter"><SuccessState title="Nenhuma anamnese pendente" copy="Quando André enviar um formulário, ele aparecerá aqui para sua revisão e consentimento." action={<Button onClick={() => navigate('today')}>Voltar para hoje</Button>} /></div>
  if (formSubmitted) return <div className="page centered-page enter"><SuccessState title="Anamnese concluída" copy="Suas respostas estão anexadas ao seu histórico e visíveis apenas para a equipe responsável pelo acompanhamento." action={<Button onClick={() => navigate('today')}>Voltar para hoje</Button>} /></div>
  return <div className="page form-fill-page enter"><BackButton onClick={() => navigate('today')} /><PageIntro eyebrow={`${publishedFormTitle.toUpperCase()} · ANDRÉ LIMA`} title="Antes do treino, sua história." copy="Reserve cerca de três minutos. Você pode revisar as respostas antes de enviar." />
    <section className={errors.includes('consent') ? 'consent-card error' : 'consent-card'}><FileCheck2 size={22} /><div><h3>Consentimento para dados de saúde</h3><p>Autorizo o uso destas respostas exclusivamente para avaliação, planejamento e acompanhamento do meu treino. Posso solicitar acesso, correção ou exclusão.</p><label className="switch-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><i /><span>Li e concordo com o uso descrito acima.</span></label>{errors.includes('consent') && <small role="alert">Você precisa registrar o consentimento antes de enviar.</small>}</div></section>
    <div className="fill-form">{formQuestions.map((question, index) => <fieldset className={errors.includes(question.id) ? 'error' : ''} key={question.id}><legend><Eyebrow>{String(index + 1).padStart(2,'0')} · {question.required ? 'OBRIGATÓRIA' : 'OPCIONAL'}</Eyebrow><span>{question.label}</span></legend>{question.type === 'long' ? <textarea value={(answers[question.id] as string) ?? ''} onChange={(event) => update(question, event.target.value)} placeholder={question.id === 'q3' ? 'Escreva com suas palavras...' : 'Conte o que considerar importante...'} aria-label={question.label} /> : question.type === 'scale' ? <div className="answer-scale">{Array.from({ length: 11 }, (_, value) => { const active = answers[question.id] === String(value); return <button type="button" className={active ? 'active' : ''} aria-pressed={active} key={value} onClick={() => update(question, String(value))}>{value}</button> })}</div> : ['single','multi','yesno'].includes(question.type) ? <div className="answer-options">{(question.type === 'yesno' ? ['Sim','Não'] : question.options ?? []).map((option) => { const active = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]).includes(option) : answers[question.id] === option; return <button type="button" className={active ? 'active' : ''} aria-pressed={active} key={option} onClick={() => update(question, option, question.type === 'multi')}><i>{active && <Check size={13} />}</i>{option}</button> })}</div> : <input type={question.type === 'number' ? 'number' : 'text'} value={(answers[question.id] as string) ?? ''} onChange={(event) => update(question, event.target.value)} placeholder="Sua resposta" />}{errors.includes(question.id) && <small role="alert">Responda esta pergunta para continuar.</small>}</fieldset>)}</div>
    <footer className="form-submit"><span><FileCheck2 size={17} /><small>Suas respostas são salvas apenas neste protótipo local.</small></span><Button onClick={submit}><Send size={16} /> Revisar e enviar</Button></footer>
  </div>
}
