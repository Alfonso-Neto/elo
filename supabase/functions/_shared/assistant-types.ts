export const ASSISTANT_KINDS = ["pain_triage", "trainer_copilot"] as const;
export type AssistantKind = (typeof ASSISTANT_KINDS)[number];

export const URGENCY_LEVELS = [
  "routine",
  "soon",
  "urgent",
  "emergency",
] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const WORKOUT_OPERATIONS = [
  "reduce_load_percent",
  "reduce_volume_percent",
  "replace_exercise",
  "remove_exercise",
  "add_rest_seconds",
  "cap_rpe",
  "pause_session",
  "request_professional_review",
] as const;
export type WorkoutOperation = (typeof WORKOUT_OPERATIONS)[number];

export type AssistantContext = {
  training_goal?: string;
  recent_feedback?: string[];
  constraints?: string[];
  current_workout?: Array<{
    exercise: string;
    sets: number;
    reps: string;
    load?: string;
    rpe?: number;
  }>;
};

type AssistantRequestBase = {
  kind: AssistantKind;
  workspace_id: string;
  subject_student_id: string;
  locale: "pt-BR";
};

export type PainTriageRequest = AssistantRequestBase & {
  kind: "pain_triage";
  pain_report_id: string;
};

export type TrainerCopilotRequest = AssistantRequestBase & {
  kind: "trainer_copilot";
  report: string;
  context: AssistantContext;
};

export type AssistantRequest = PainTriageRequest | TrainerCopilotRequest;

// Only this minimized shape may leave Elo for the model provider. Authorization
// identifiers remain in Elo and pain-triage content is resolved from the database.
export type AssistantModelRequest = {
  kind: AssistantKind;
  locale: "pt-BR";
  report: string;
  context: AssistantContext;
};

export type RedFlag = {
  code: string;
  label: string;
  evidence: string;
  recommended_action: string;
};

export type FollowUpQuestion = {
  id: string;
  question: string;
  reason: string;
  answer_type: "yes_no" | "scale_0_10" | "short_text";
};

export type WorkoutChange = {
  operation: WorkoutOperation;
  target: string | null;
  value_number: number | null;
  value_text: string | null;
  duration_sessions: number | null;
  guardrail: string;
};

export type AssistantProposal = {
  summary: string;
  urgency: Urgency;
  red_flags: RedFlag[];
  questions: FollowUpQuestion[];
  rationale: string[];
  workout_changes: WorkoutChange[];
  sources: Array<{
    kind: "user_report" | "workspace_context" | "safety_protocol";
    label: string;
  }>;
  uncertainties: string[];
  disclaimer: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const boundedString = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is string =>
  typeof value === "string" && value.trim().length >= minimum &&
  value.length <= maximum;
const exactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
};

const readStringArray = (
  value: unknown,
  maximumItems: number,
  maximumLength: number,
) => {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  if (!value.every((item) => boundedString(item, 1, maximumLength))) {
    return null;
  }
  return value.map((item) => item.trim());
};

function readContext(value: unknown): AssistantContext | null {
  if (value === undefined) return {};
  if (!plainObject(value)) return null;
  const allowed = [
    "training_goal",
    "recent_feedback",
    "constraints",
    "current_workout",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;

  const context: AssistantContext = {};
  if (value.training_goal !== undefined) {
    if (!boundedString(value.training_goal, 1, 500)) return null;
    context.training_goal = value.training_goal.trim();
  }
  if (value.recent_feedback !== undefined) {
    const feedback = readStringArray(value.recent_feedback, 4, 300);
    if (!feedback) return null;
    context.recent_feedback = feedback;
  }
  if (value.constraints !== undefined) {
    const constraints = readStringArray(value.constraints, 8, 200);
    if (!constraints) return null;
    context.constraints = constraints;
  }
  if (value.current_workout !== undefined) {
    if (
      !Array.isArray(value.current_workout) || value.current_workout.length > 20
    ) return null;
    const workout: NonNullable<AssistantContext["current_workout"]> = [];
    for (const item of value.current_workout) {
      if (!plainObject(item)) return null;
      const keys = Object.keys(item);
      if (
        keys.some((key) =>
          !["exercise", "sets", "reps", "load", "rpe"].includes(key)
        )
      ) return null;
      if (!boundedString(item.exercise, 1, 120)) return null;
      if (
        !Number.isInteger(item.sets) || (item.sets as number) < 1 ||
        (item.sets as number) > 20
      ) return null;
      if (!boundedString(item.reps, 1, 40)) return null;
      if (item.load !== undefined && !boundedString(item.load, 1, 40)) {
        return null;
      }
      if (
        item.rpe !== undefined &&
        (typeof item.rpe !== "number" || item.rpe < 0 || item.rpe > 10)
      ) return null;
      workout.push({
        exercise: item.exercise.trim(),
        sets: item.sets as number,
        reps: item.reps.trim(),
        ...(item.load === undefined ? {} : { load: item.load.trim() }),
        ...(item.rpe === undefined ? {} : { rpe: item.rpe }),
      });
    }
    context.current_workout = workout;
  }
  return context;
}

export type InputValidationResult =
  | { ok: true; value: AssistantRequest; canonical: string }
  | { ok: false; reason: "invalid_input" | "input_too_large" };

export function validateAssistantRequest(
  value: unknown,
): InputValidationResult {
  if (!plainObject(value)) return { ok: false, reason: "invalid_input" };
  if (!ASSISTANT_KINDS.includes(value.kind as AssistantKind)) {
    return { ok: false, reason: "invalid_input" };
  }
  if (
    typeof value.workspace_id !== "string" ||
    !UUID_PATTERN.test(value.workspace_id)
  ) {
    return { ok: false, reason: "invalid_input" };
  }
  if (
    typeof value.subject_student_id !== "string" ||
    !UUID_PATTERN.test(value.subject_student_id)
  ) {
    return { ok: false, reason: "invalid_input" };
  }
  if (value.locale !== "pt-BR") return { ok: false, reason: "invalid_input" };

  let request: AssistantRequest;
  if (value.kind === "pain_triage") {
    if (
      !exactKeys(value, [
        "kind",
        "workspace_id",
        "subject_student_id",
        "pain_report_id",
        "locale",
      ])
    ) {
      return { ok: false, reason: "invalid_input" };
    }
    if (
      typeof value.pain_report_id !== "string" ||
      !UUID_PATTERN.test(value.pain_report_id)
    ) {
      return { ok: false, reason: "invalid_input" };
    }
    request = {
      kind: "pain_triage",
      workspace_id: value.workspace_id,
      subject_student_id: value.subject_student_id,
      pain_report_id: value.pain_report_id,
      locale: "pt-BR",
    };
  } else {
    if (
      !exactKeys(value, [
        "kind",
        "workspace_id",
        "subject_student_id",
        "report",
        "locale",
        "context",
      ])
    ) {
      return { ok: false, reason: "invalid_input" };
    }
    if (!boundedString(value.report, 3, 2000)) {
      return { ok: false, reason: "invalid_input" };
    }
    const context = readContext(value.context);
    if (!context) return { ok: false, reason: "invalid_input" };
    request = {
      kind: "trainer_copilot",
      workspace_id: value.workspace_id,
      subject_student_id: value.subject_student_id,
      report: value.report.trim(),
      locale: "pt-BR",
      context,
    };
  }
  const canonical = JSON.stringify(request);
  if (canonical.length > 12_000) {
    return { ok: false, reason: "input_too_large" };
  }
  return { ok: true, value: request, canonical };
}

function validWorkoutChange(value: unknown): value is WorkoutChange {
  if (!plainObject(value)) return false;
  if (
    !exactKeys(value, [
      "operation",
      "target",
      "value_number",
      "value_text",
      "duration_sessions",
      "guardrail",
    ])
  ) {
    return false;
  }
  if (!WORKOUT_OPERATIONS.includes(value.operation as WorkoutOperation)) {
    return false;
  }
  if (value.target !== null && !boundedString(value.target, 1, 120)) {
    return false;
  }
  if (value.value_text !== null && !boundedString(value.value_text, 1, 160)) {
    return false;
  }
  if (
    value.value_number !== null &&
    (typeof value.value_number !== "number" ||
      !Number.isFinite(value.value_number))
  ) {
    return false;
  }
  const duration = value.duration_sessions;
  if (
    duration !== null && (
      typeof duration !== "number" || !Number.isInteger(duration) ||
      duration < 1 || duration > 4
    )
  ) return false;
  if (!boundedString(value.guardrail, 1, 240)) return false;

  if (
    ["reduce_load_percent", "reduce_volume_percent"].includes(
      value.operation as string,
    )
  ) {
    return value.value_text === null &&
      typeof value.value_number === "number" &&
      value.value_number >= 5 && value.value_number <= 50;
  }
  if (value.operation === "add_rest_seconds") {
    return value.value_text === null &&
      typeof value.value_number === "number" &&
      value.value_number >= 15 && value.value_number <= 180;
  }
  if (value.operation === "cap_rpe") {
    return value.value_text === null &&
      typeof value.value_number === "number" &&
      value.value_number >= 1 && value.value_number <= 10;
  }
  if (value.operation === "replace_exercise") {
    return value.target !== null && value.value_text !== null &&
      value.value_number === null;
  }
  if (value.operation === "remove_exercise") {
    return value.target !== null && value.value_text === null &&
      value.value_number === null;
  }
  return value.value_text === null && value.value_number === null;
}

export function validateAssistantProposal(
  value: unknown,
): value is AssistantProposal {
  if (!plainObject(value)) return false;
  if (
    !exactKeys(value, [
      "summary",
      "urgency",
      "red_flags",
      "questions",
      "rationale",
      "workout_changes",
      "sources",
      "uncertainties",
      "disclaimer",
    ])
  ) return false;
  if (!boundedString(value.summary, 1, 1000)) return false;
  if (!URGENCY_LEVELS.includes(value.urgency as Urgency)) return false;
  if (!boundedString(value.disclaimer, 20, 1000)) return false;
  if (
    !readStringArray(value.rationale, 8, 500) ||
    !readStringArray(value.uncertainties, 8, 500)
  ) return false;

  if (
    !Array.isArray(value.red_flags) || value.red_flags.length > 6 ||
    !value.red_flags.every((item) => {
      if (
        !plainObject(item) ||
        !exactKeys(item, ["code", "label", "evidence", "recommended_action"])
      ) return false;
      return boundedString(item.code, 1, 48) &&
        boundedString(item.label, 1, 160) &&
        boundedString(item.evidence, 1, 300) &&
        boundedString(item.recommended_action, 1, 300);
    })
  ) return false;

  if (
    !Array.isArray(value.questions) || value.questions.length > 8 ||
    !value.questions.every((item) => {
      if (
        !plainObject(item) ||
        !exactKeys(item, ["id", "question", "reason", "answer_type"])
      ) return false;
      return boundedString(item.id, 1, 48) &&
        boundedString(item.question, 1, 300) &&
        boundedString(item.reason, 1, 300) &&
        ["yes_no", "scale_0_10", "short_text"].includes(
          item.answer_type as string,
        );
    })
  ) return false;

  if (
    !Array.isArray(value.workout_changes) || value.workout_changes.length > 8 ||
    !value.workout_changes.every(validWorkoutChange)
  ) return false;

  const unsafeOperations = new Set([
    "reduce_load_percent",
    "reduce_volume_percent",
    "replace_exercise",
    "remove_exercise",
    "add_rest_seconds",
    "cap_rpe",
  ]);
  if (
    value.red_flags.length > 0 && (
      !["urgent", "emergency"].includes(value.urgency as string) ||
      value.workout_changes.some((change) =>
        unsafeOperations.has(change.operation)
      )
    )
  ) return false;
  if (
    value.urgency === "emergency" &&
    value.workout_changes.some((change) =>
      unsafeOperations.has(change.operation)
    )
  ) return false;

  if (
    !Array.isArray(value.sources) || value.sources.length > 8 ||
    !value.sources.every((item) => {
      if (!plainObject(item) || !exactKeys(item, ["kind", "label"])) {
        return false;
      }
      return ["user_report", "workspace_context", "safety_protocol"].includes(
        item.kind as string,
      ) &&
        boundedString(item.label, 1, 240);
    })
  ) return false;

  return true;
}

export const ASSISTANT_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "urgency",
    "red_flags",
    "questions",
    "rationale",
    "workout_changes",
    "sources",
    "uncertainties",
    "disclaimer",
  ],
  properties: {
    summary: { type: "string" },
    urgency: { type: "string", enum: [...URGENCY_LEVELS] },
    red_flags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "label", "evidence", "recommended_action"],
        properties: {
          code: { type: "string" },
          label: { type: "string" },
          evidence: { type: "string" },
          recommended_action: { type: "string" },
        },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "reason", "answer_type"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          reason: { type: "string" },
          answer_type: {
            type: "string",
            enum: ["yes_no", "scale_0_10", "short_text"],
          },
        },
      },
    },
    rationale: { type: "array", items: { type: "string" } },
    workout_changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "operation",
          "target",
          "value_number",
          "value_text",
          "duration_sessions",
          "guardrail",
        ],
        properties: {
          operation: { type: "string", enum: [...WORKOUT_OPERATIONS] },
          target: { type: ["string", "null"] },
          value_number: { type: ["number", "null"] },
          value_text: { type: ["string", "null"] },
          duration_sessions: { type: ["integer", "null"] },
          guardrail: { type: "string" },
        },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label"],
        properties: {
          kind: {
            type: "string",
            enum: ["user_report", "workspace_context", "safety_protocol"],
          },
          label: { type: "string" },
        },
      },
    },
    uncertainties: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
  },
} as const;
