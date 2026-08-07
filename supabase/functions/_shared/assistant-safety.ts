import type {
  AssistantModelRequest,
  AssistantProposal,
  RedFlag,
} from "./assistant-types.ts";

type FlagRule = {
  code: string;
  label: string;
  pattern: RegExp;
  action: string;
};

const FLAG_RULES: FlagRule[] = [
  {
    code: "cardiorespiratory",
    label: "Sinal cardiorrespiratório relatado",
    pattern:
      /\b(dor no peito|pressao no peito|falta de ar|nao consigo respirar|desmaiei|desmaio|fainted|chest pain|shortness of breath)\b/i,
    action: "Interrompa o treino e procure atendimento de urgência agora.",
  },
  {
    code: "neurological",
    label: "Sinal neurológico relatado",
    pattern:
      /\b(paralisia|fraqueza de um lado|fala enrolada|perda de controle (da )?(bexiga|intestino)|dormencia na virilha|saddle numbness|one-sided weakness)\b/i,
    action: "Interrompa o treino e procure atendimento de urgência agora.",
  },
  {
    code: "severe_trauma",
    label: "Trauma importante relatado",
    pattern:
      /\b(deformidade|osso exposto|sangramento (forte|intenso|incontrolavel)|nao consigo apoiar|queda (forte|grande)|severe trauma|uncontrolled bleeding)\b/i,
    action: "Não continue o treino; busque avaliação presencial urgente.",
  },
  {
    code: "self_harm",
    label: "Risco imediato relatado",
    pattern:
      /\b(quero me matar|vou me matar|me machucar de proposito|suicidio|suicidal|kill myself|hurt myself)\b/i,
    action:
      "Procure ajuda de emergência e fique com uma pessoa de confiança agora.",
  },
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|developer|system) (instructions|prompts?)/i,
  /ignore (as|todas as) instru[cç][oõ]es/i,
  /reveal (the )?(system|developer) prompt/i,
  /(mostre|revele) (o )?(prompt|sistema|instru[cç][oõ]es internas)/i,
  /act as (an?|the) (administrator|system|developer)/i,
  /execute (this|the following) (command|code)/i,
];

const AUTONOMY_PATTERNS = [
  /\b(aplique|aplicar|publique|publicar|altere|alterar|envie|enviar)\b.{0,40}\b(automaticamente|agora|sem revisar|sem aprova[cç][aã]o)\b/i,
  /\b(auto[- ]?publish|apply automatically|without (human )?(review|approval))\b/i,
];

const STRUCTURED_RED_FLAG_LABELS: Record<string, string> = {
  chest_pain: "Dor ou pressão no peito relatada",
  shortness_of_breath: "Dificuldade respiratória relatada",
  fainting: "Desmaio ou quase desmaio relatado",
  major_trauma: "Trauma importante relatado",
  loss_of_strength: "Perda de força relatada",
  loss_of_sensation: "Perda de sensibilidade relatada",
  fever: "Febre associada ao quadro relatada",
  bowel_bladder_change: "Alteração urinária ou intestinal relatada",
};

const normalizeForSignals = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ")
    .trim();

export type SafetyEvaluation = {
  emergencyFlags: RedFlag[];
  promptInjectionDetected: boolean;
  autonomousActionRequested: boolean;
};

export function evaluateSafety(
  report: string,
  structuredRedFlags: readonly string[] = [],
): SafetyEvaluation {
  const normalized = normalizeForSignals(report);
  const textFlags = FLAG_RULES
    .filter((rule) => rule.pattern.test(normalized))
    .map((rule) => ({
      code: rule.code,
      label: rule.label,
      evidence:
        "O relato contém uma expressão compatível com este sinal de alerta.",
      recommended_action: rule.action,
    }));
  const structuredFlags = [...new Set(structuredRedFlags)].map((code) => ({
    code,
    label: STRUCTURED_RED_FLAG_LABELS[code] ??
      "Sinal de alerta estruturado relatado",
    evidence:
      "O aluno marcou explicitamente este sinal de alerta no relato estruturado.",
    recommended_action:
      "Interrompa o treino e procure avaliação profissional urgente.",
  }));
  const emergencyFlags = [...structuredFlags, ...textFlags]
    .filter((flag, index, flags) =>
      flags.findIndex((candidate) => candidate.code === flag.code) === index
    )
    .slice(0, 6);

  return {
    emergencyFlags,
    promptInjectionDetected: PROMPT_INJECTION_PATTERNS.some((pattern) =>
      pattern.test(normalized)
    ),
    autonomousActionRequested: AUTONOMY_PATTERNS.some((pattern) =>
      pattern.test(normalized)
    ),
  };
}

const DISCLAIMER =
  "Esta orientação é informativa, não substitui avaliação médica nem constitui diagnóstico. Em caso de piora ou risco imediato, procure um serviço de emergência.";

export function buildEmergencyProposal(
  evaluation: SafetyEvaluation,
): AssistantProposal {
  return {
    summary:
      "O relato contém sinal de alerta. Interrompa o treino e priorize avaliação presencial imediata.",
    urgency: "emergency",
    red_flags: evaluation.emergencyFlags,
    questions: [],
    rationale: [
      "A segurança vem antes da continuidade ou adaptação do treino.",
      "O Elo não diagnostica; o encaminhamento é uma precaução baseada no relato.",
    ],
    workout_changes: [
      {
        operation: "pause_session",
        target: null,
        value_number: null,
        value_text: null,
        duration_sessions: null,
        guardrail:
          "Não retomar a sessão até receber orientação de um profissional habilitado.",
      },
      {
        operation: "request_professional_review",
        target: null,
        value_number: null,
        value_text: null,
        duration_sessions: null,
        guardrail:
          "Esta é uma proposta de encaminhamento; nenhuma ação externa foi executada pelo Elo.",
      },
    ],
    sources: [
      { kind: "user_report", label: "Relato fornecido nesta solicitação" },
      {
        kind: "safety_protocol",
        label: "Triagem conservadora de sinais de alerta do Elo",
      },
    ],
    uncertainties: [
      "O relato remoto não permite confirmar causa, gravidade ou diagnóstico.",
    ],
    disclaimer: DISCLAIMER,
  };
}

export function enforceProposalBoundaries(
  proposal: AssistantProposal,
  request: Pick<AssistantModelRequest, "kind">,
  evaluation: SafetyEvaluation,
): AssistantProposal {
  const emergency = proposal.urgency === "emergency" ||
    proposal.red_flags.length > 0 ||
    evaluation.emergencyFlags.length > 0;
  const allowedInEmergency = new Set([
    "pause_session",
    "request_professional_review",
  ]);
  const reviewOnly = emergency || evaluation.promptInjectionDetected;
  let workoutChanges = reviewOnly
    ? proposal.workout_changes.filter((change) =>
      allowedInEmergency.has(change.operation)
    )
    : proposal.workout_changes;
  if (
    emergency &&
    !workoutChanges.some((change) => change.operation === "pause_session")
  ) {
    const pauseChange: AssistantProposal["workout_changes"][number] = {
      operation: "pause_session",
      target: null,
      value_number: null,
      value_text: null,
      duration_sessions: null,
      guardrail:
        "Não retomar a sessão até receber orientação de um profissional habilitado.",
    };
    workoutChanges = [pauseChange, ...workoutChanges].slice(0, 8);
  }
  if (
    reviewOnly &&
    !workoutChanges.some((change) =>
      change.operation === "request_professional_review"
    )
  ) {
    const reviewChange: AssistantProposal["workout_changes"][number] = {
      operation: "request_professional_review",
      target: null,
      value_number: null,
      value_text: null,
      duration_sessions: null,
      guardrail:
        "Revisão humana obrigatória antes de qualquer ajuste de treino.",
    };
    workoutChanges = [...workoutChanges, reviewChange].slice(0, 8);
  }

  const autonomyNotice = evaluation.autonomousActionRequested
    ? " A solicitação de aplicação automática foi ignorada: esta saída exige revisão humana."
    : "";
  const kindNotice = request.kind === "trainer_copilot"
    ? "Proposta para revisão do professor — nenhuma alteração foi aplicada ou publicada."
    : "Orientação preliminar — nenhuma alteração de treino foi aplicada ou publicada.";

  return {
    ...proposal,
    summary: `${kindNotice} ${proposal.summary}${autonomyNotice}`.slice(
      0,
      1000,
    ),
    urgency: emergency && proposal.urgency !== "emergency"
      ? "urgent"
      : proposal.urgency,
    red_flags: evaluation.emergencyFlags.length > 0
      ? evaluation.emergencyFlags
      : proposal.red_flags,
    workout_changes: workoutChanges,
    uncertainties: evaluation.promptInjectionDetected
      ? [
        ...proposal.uncertainties.slice(0, 7),
        "Trecho com aparência de instrução foi tratado somente como dado não confiável.",
      ]
      : proposal.uncertainties,
    disclaimer: DISCLAIMER,
  };
}
