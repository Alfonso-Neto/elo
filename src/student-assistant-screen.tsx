import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowRight, Check, Dumbbell, HeartPulse, Info, LoaderCircle, Moon, Send, Sparkles,
} from 'lucide-react'
import { BackButton, Button, Drawer, Eyebrow, MovementDemo, PageIntro, SectionTitle, SuccessState } from './components'
import { useEloApp } from './app-state'
import type { Exercise } from './types'
import { assessPainSafety, type PainRedFlag } from './assistant/pain-safety'
import { createAssistantService, type AssistantProposal } from './assistant/assistant-service'
import { useAuth } from './auth/auth-context'
import { createIdempotencyKey, createSignalService } from './signals'
import { mapPainIntakeSelection, submitConsentedPainIntake, type PendingPainIntake } from './live/pain-intake'
import { getLatestWorkoutVersion } from './live/training'
import { LiveStudentAbsenceFlow } from './live/LiveOperationsScreens'
import './assistant.css'

type PainStep = 'intro' | 'location' | 'movement' | 'moment' | 'intensity' | 'red-flags' | 'detail' | 'review' | 'done'

const redFlagOptions: { value: PainRedFlag | 'none'; label: string }[] = [
  { value: 'trauma', label: 'Houve queda, impacto forte ou trauma recente' },
  { value: 'major_swelling', label: 'Apareceu inchaço importante ou muito rápido' },
  { value: 'loss_of_motion', label: 'Não consigo apoiar ou mover a região normalmente' },
  { value: 'numbness_or_weakness', label: 'Senti formigamento, perda de força ou dor irradiando' },
  { value: 'none', label: 'Nenhum desses sinais aconteceu' },
]

export function StudentAssistantScreen() {
  const { navigate, assistantEntry, clearAssistantEntry, notify } = useEloApp()
  const { membership, profile } = useAuth()
  const trainerFirstName = membership?.trainerName.split(/\s+/)[0] ?? 'seu professor'
  const entryMovement = assistantEntry?.kind === 'exercise-pain' ? assistantEntry.movement : ''
  const [liveWorkout, setLiveWorkout] = useState<Exercise[]>([])
  const workout = liveWorkout
  const [mode, setMode] = useState<'home' | 'pain' | 'help' | 'absence'>(entryMovement ? 'pain' : 'home')
  const [step, setStep] = useState<PainStep>(entryMovement ? 'location' : 'intro')
  const [location, setLocation] = useState('')
  const [movement, setMovement] = useState(entryMovement)
  const [movementSource, setMovementSource] = useState<'workout' | null>(entryMovement ? 'workout' : null)
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
  const assistantRequestVersion = useRef(0)
  const [savedReportId, setSavedReportId] = useState('')
  const [assistantPhase, setAssistantPhase] = useState<'idle' | 'loading' | 'processing' | 'complete' | 'unavailable'>('idle')
  const [assistantProposal, setAssistantProposal] = useState<AssistantProposal | null>(null)
  const [helpExercise, setHelpExercise] = useState<Exercise | null>(null)
  const [helpPlaying, setHelpPlaying] = useState(true)
  const assessment = assessPainSafety(intensity, redFlags)
  const movementOptions = useMemo(() => Array.from(new Set([...workout.map((exercise) => exercise.name), 'Caminhando ou correndo', 'Não estava treinando'])), [workout])
  useEffect(() => () => { assistantRequestVersion.current += 1 }, [])
  useEffect(() => {
    if (mode !== 'pain' || step === 'intro' || step === 'done') return
    const protectPainDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectPainDraft)
    return () => window.removeEventListener('beforeunload', protectPainDraft)
  }, [mode, step])
  useEffect(() => {
    if (!assistantEntry || assistantEntry.kind !== 'exercise-pain') return
    setMode('pain')
    setStep('location')
    setMovement(assistantEntry.movement)
    setMovementSource('workout')
    clearAssistantEntry()
  }, [assistantEntry, clearAssistantEntry])
  useEffect(() => {
    setLiveWorkout([])
    if (!membership || !profile) return
    let active = true
    void getLatestWorkoutVersion({ workspaceId: membership.workspaceId, userId: profile.id, role: 'student' })
      .then((version) => { if (active) setLiveWorkout(version?.exercises ?? []) })
      .catch(() => { if (active) setLiveWorkout([]) })
    return () => { active = false }
  }, [membership, profile])
  const loadPainProposal = async (painReportId: string) => {
    const assistantKey = commandKeys.current?.assistant
    if (!membership || !profile || !assistantKey) return
    const requestVersion = ++assistantRequestVersion.current
    setAssistantPhase('loading')
    try {
      const result = await createAssistantService().requestPainTriage({
        workspaceId: membership.workspaceId,
        studentId: profile.id,
        painReportId,
        idempotencyKey: assistantKey,
      })
      if (requestVersion !== assistantRequestVersion.current) return
      if (result.state === 'processing') {
        setAssistantPhase('processing')
        return
      }
      setAssistantProposal(result.proposal)
      setAssistantPhase('complete')
    } catch {
      if (requestVersion !== assistantRequestVersion.current) return
      setAssistantPhase('unavailable')
    }
  }
  const submitPain = async () => {
    if (!consent) { setConsentError(true); return }
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
  const reset = () => { assistantRequestVersion.current += 1; setMode('home'); setStep('intro'); setLocation(''); setMovement(''); setMovementSource(null); setMoment(''); setIntensity(0); setRedFlags([]); setRedFlagsAnswered(false); setNoRedFlags(false); setDetail(''); setConsent(false); setConsentError(false); setSubmitting(false); setSubmitError(''); setPendingIntake(null); setSavedReportId(''); setAssistantPhase('idle'); setAssistantProposal(null); commandKeys.current = null }
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
    else if (step === 'moment') setStep(movementSource === 'workout' ? 'location' : 'movement')
    else if (step === 'intensity') setStep('moment')
    else if (step === 'red-flags') setStep('intensity')
    else if (step === 'detail') setStep('red-flags')
    else if (step === 'review') setStep('detail')
  }
  return <div className="page assistant-page enter"><PageIntro eyebrow="ASSISTENTE · CANAL ESTRUTURADO" title={<>O que seu corpo<br />está tentando dizer?</>} copy={`Eu organizo o relato e aviso ${trainerFirstName}. Não faço diagnóstico e não altero seu treino sozinho.`} />
    {mode === 'home' && <div className="assistant-choices"><button type="button" onClick={() => { setMode('pain'); setStep('location') }}><span className="assistant-choice-icon danger"><HeartPulse /></span><span><Eyebrow>RELATO ESTRUTURADO</Eyebrow><h3>Senti uma dor</h3><p>Local, momento e intensidade em menos de um minuto.</p></span><ArrowRight size={18} /></button><button type="button" onClick={() => setMode('help')}><span className="assistant-choice-icon blue"><Dumbbell /></span><span><Eyebrow>EXECUÇÃO</Eyebrow><h3>Dúvida em um exercício</h3><p>Reveja a demonstração e o recado de {trainerFirstName}.</p></span><ArrowRight size={18} /></button><button type="button" onClick={() => setMode('absence')}><span className="assistant-choice-icon neutral"><Moon /></span><span><Eyebrow>ROTINA</Eyebrow><h3>Não consigo treinar hoje</h3><p>Avise {trainerFirstName} e preserve o contexto da semana.</p></span><ArrowRight size={18} /></button></div>}
    {mode === 'pain' && <section className="assistant-flow">{step !== 'done' && !submitting && !submitError && <BackButton onClick={backPain} label="Voltar uma etapa" />}{movementSource === 'workout' && step !== 'done' && <div className="assistant-entry-context" role="status"><span><Dumbbell size={17} /></span><div><Eyebrow>CONTEXTO DO TREINO</Eyebrow><strong>{movement}</strong><small>O exercício foi trazido do treino aberto. Você ainda confirma todo o relato.</small></div><button type="button" onClick={() => { setMovement(''); setMovementSource(null); setStep(location ? 'movement' : 'location') }}>Trocar movimento</button></div>}<div className="assistant-thread"><div className="assistant-message"><Sparkles size={17} /><p>{step === 'done' ? `Seu relato foi estruturado e já apareceu para ${trainerFirstName}.` : 'Vou organizar o que aconteceu e checar sinais de alerta. Eu não faço diagnóstico e não altero seu treino.'}</p></div>{location && <div className="assistant-answer">{location}</div>}{location && movement && <div className="assistant-answer">{movement}</div>}{moment && <div className="assistant-answer">{moment}</div>}{['red-flags','detail','review'].includes(step) && <div className="assistant-answer">Intensidade {intensity}/10</div>}</div>
      {step === 'location' && <FlowQuestion title="Onde você sentiu?" copy="Escolha a região mais próxima.">{['Joelho direito','Joelho esquerdo','Lombar','Ombro direito','Ombro esquerdo','Quadril','Outra região'].map((item) => <button type="button" key={item} onClick={() => { setLocation(item); setStep(movementSource === 'workout' && movement ? 'moment' : 'movement') }}>{item}</button>)}</FlowQuestion>}
      {step === 'movement' && <FlowQuestion title="Em qual movimento?" copy="Escolha o exercício ou a situação mais próxima.">{movementOptions.map((item) => <button type="button" key={item} onClick={() => { setMovement(item); setStep('moment') }}>{item}</button>)}</FlowQuestion>}
      {step === 'moment' && <FlowQuestion title="Quando incomodou?" copy={`Isso ajuda ${trainerFirstName} a entender o padrão.`}>{['Durante a descida','Durante a subida','Depois da série','Após o treino','Em repouso'].map((item) => <button type="button" key={item} onClick={() => { setMoment(item); setStep('intensity') }}>{item}</button>)}</FlowQuestion>}
      {step === 'intensity' && <div className="flow-question"><Eyebrow>INTENSIDADE</Eyebrow><h3>Qual foi a intensidade?</h3><p>0 é sem dor; 10 é a pior dor imaginável.</p><div className="pain-scale">{Array.from({ length: 11 }, (_, value) => <button type="button" className={intensity === value ? 'active' : ''} key={value} onClick={() => { setIntensity(value); setStep('red-flags') }}>{value}</button>)}</div></div>}
      {step === 'red-flags' && <div className="flow-question"><Eyebrow>CHECAGEM DE SEGURANÇA</Eyebrow><h3>Algum destes sinais aconteceu?</h3><p>Marque tudo o que se aplica. Isso não é um diagnóstico; serve para orientar o próximo passo com mais segurança.</p><div className="pain-red-flags">{redFlagOptions.map((option) => { const active = option.value === 'none' ? noRedFlags : redFlags.includes(option.value); return <button type="button" className={active ? 'active' : ''} aria-pressed={active} key={option.value} onClick={() => toggleRedFlag(option.value)}><i>{active && <Check size={13} />}</i>{option.label}</button> })}</div><Button className="wide pain-step-action" disabled={!redFlagsAnswered} onClick={() => setStep('detail')}>Continuar <ArrowRight size={16} /></Button></div>}
      {step === 'detail' && <div className="flow-question"><Eyebrow>DETALHE · OPCIONAL</Eyebrow><h3>Quer acrescentar algo?</h3><p>Uma frase já basta. Não inclua documentos, diagnósticos ou informações que não sejam necessárias para o acompanhamento.</p>{assessment.level !== 'monitor' && <div className={`pain-safety-guidance ${assessment.level === 'stop_and_assess' ? 'stop' : ''}`} role="alert"><AlertTriangle size={19} /><span><strong>{assessment.title}</strong><p>{assessment.guidance}</p></span></div>}<textarea value={detail} onChange={(event) => setDetail(event.target.value.slice(0, 600))} placeholder="Ex.: começou na terceira série e melhorou quando parei..." /><Button className="wide" onClick={() => setStep('review')}>Revisar relato <ArrowRight size={16} /></Button></div>}
      {step === 'review' && <div className="flow-question pain-review"><Eyebrow>SEU ÚLTIMO OLHAR</Eyebrow><h3>Está fiel ao que aconteceu?</h3><div className={`pain-safety-guidance ${assessment.level === 'stop_and_assess' ? 'stop' : ''}`} role="status"><AlertTriangle size={19} /><span><strong>{assessment.title}</strong><p>{assessment.guidance}</p></span></div><dl><div><dt>Região</dt><dd>{location}</dd></div><div><dt>Movimento</dt><dd>{movement}</dd></div><div><dt>Momento</dt><dd>{moment}</dd></div><div><dt>Intensidade</dt><dd>{intensity}/10</dd></div></dl><div className="pain-consent"><p>Este relato contém dado de saúde. Ele será usado somente para acompanhamento, segurança e comunicação com a equipe responsável.</p><label className="switch-label"><input type="checkbox" checked={consent} disabled={submitting || Boolean(pendingIntake)} onChange={(event) => { setConsent(event.target.checked); setConsentError(false) }} /><i /><span>Autorizo salvar e compartilhar este relato com meu professor.</span></label>{consentError && <small role="alert">Registre seu consentimento para enviar o relato.</small>}</div>{submitError && <div className="pain-submit-error" role="alert"><strong>O envio não foi concluído.</strong><p>{submitError}</p><button type="button" onClick={editAfterFailure}>Editar e criar um novo envio</button></div>}<Button className="wide" onClick={() => void submitPain()} disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={16} /> Registrando com segurança...</> : <><Send size={16} /> {submitError ? 'Tentar novamente' : `Enviar para ${trainerFirstName}`}</>}</Button></div>}
      {step === 'done' && <><SuccessState title={`${trainerFirstName} já recebeu`} copy={`${location} · ${movement} · intensidade ${intensity}/10. O relato e a orientação de segurança ficaram registrados.`} action={<div className="success-actions"><Button onClick={() => navigate('today')}>Voltar para hoje</Button><Button variant="secondary" onClick={reset}>Novo relato</Button></div>} /><StudentAssistantInsight phase={assistantPhase} proposal={assistantProposal} onRetry={() => void loadPainProposal(savedReportId)} /></>}
    </section>}
    {mode === 'help' && <section className="assistant-flow"><BackButton onClick={reset} /><SectionTitle title="Qual exercício gerou dúvida?" copy="A demonstração é um apoio; siga sempre a orientação do seu professor." /><div className="help-list">{workout.map((exercise) => <button type="button" key={exercise.id} onClick={() => setHelpExercise(exercise)}><Dumbbell size={17} /><span><strong>{exercise.name}</strong><small>{exercise.sets} × {exercise.reps} · ver execução</small></span><ArrowRight size={16} /></button>)}{!workout.length && <p className="mini-empty">Nenhum treino publicado para revisar ainda.</p>}</div></section>}
    {mode === 'absence' && <LiveStudentAbsenceFlow onBack={reset} onDone={() => navigate('schedule')} />}
    {helpExercise && <Drawer title={helpExercise.name} eyebrow={`EXECUÇÃO E RECADO DE ${trainerFirstName.toUpperCase()}`} onClose={() => setHelpExercise(null)}><MovementDemo name={helpExercise.name} playing={helpPlaying} onToggle={() => setHelpPlaying((value) => !value)} /><div className="exercise-stats">{[['Séries',helpExercise.sets],['Reps',helpExercise.reps],['Carga',helpExercise.load],['Descanso',helpExercise.rest],['Cadência',helpExercise.tempo],['RIR',helpExercise.rir]].map(([label,value]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div><div className="trainer-note"><Eyebrow>RECADO DO SEU PROFESSOR</Eyebrow><p>{helpExercise.note}</p></div><Button variant="secondary" className="wide" onClick={() => { setMovement(helpExercise.name); setMovementSource('workout'); setHelpExercise(null); setMode('pain'); setStep('location') }}><HeartPulse size={16} /> Relatar dor neste movimento</Button></Drawer>}
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
