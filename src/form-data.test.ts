import { describe, expect, it } from 'vitest'
import { createGeneralForm, generalForm } from './form-data'

describe('general form draft factory', () => {
  it('creates independent question and option objects for each authenticated app state', () => {
    const first = createGeneralForm()
    const second = createGeneralForm()

    first[0].label = 'Alteração da primeira sessão'
    first[0].options?.push('Opção privada')

    expect(second[0]).toEqual(generalForm[0])
    expect(second[0]).not.toBe(first[0])
    expect(second[0].options).not.toBe(first[0].options)
  })
})
