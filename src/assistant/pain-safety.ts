export type PainRedFlag = 'trauma' | 'major_swelling' | 'loss_of_motion' | 'numbness_or_weakness'

export type PainSafetyLevel = 'monitor' | 'pause_and_contact' | 'stop_and_assess'

export type PainSafetyAssessment = {
  level: PainSafetyLevel
  title: string
  guidance: string
  requiresProfessionalAssessment: boolean
}

export function assessPainSafety(intensity: number, redFlags: PainRedFlag[]): PainSafetyAssessment {
  const boundedIntensity = Math.min(10, Math.max(0, Math.round(intensity)))
  if (redFlags.length > 0 || boundedIntensity >= 8) {
    return {
      level: 'stop_and_assess',
      title: 'Interrompa o treino por agora',
      guidance: 'Não tente testar o movimento novamente. Procure avaliação de um profissional de saúde, especialmente se o sinal for súbito, estiver piorando ou limitar seus movimentos.',
      requiresProfessionalAssessment: true,
    }
  }
  if (boundedIntensity >= 6) {
    return {
      level: 'pause_and_contact',
      title: 'Pause este movimento',
      guidance: 'Não insista no exercício hoje. Envie o contexto ao professor e acompanhe como o corpo responde; procure avaliação profissional se não melhorar ou se piorar.',
      requiresProfessionalAssessment: false,
    }
  }
  return {
    level: 'monitor',
    title: 'Registre e acompanhe o sinal',
    guidance: 'Evite o movimento que provocou o incômodo até receber orientação do professor. Se surgir algum sinal de alerta ou houver piora, interrompa o treino e procure avaliação profissional.',
    requiresProfessionalAssessment: false,
  }
}
