// Characters that can hide, reorder, or ambiguously render user-controlled
// content. New lines and tabs are allowed here for legitimate multiline fields.
const unsafeDisplayCharacterPattern =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/

const lineBreakPattern = /[\t\r\n]/

export function hasUnsafeDisplayCharacters(value: string, multiline = false) {
  return unsafeDisplayCharacterPattern.test(value)
    || (!multiline && lineBreakPattern.test(value))
}
