export const required = (value: string, fieldName: string) =>
  value.trim() ? '' : `${fieldName} é obrigatório.`

export const email = (value: string) => {
  if (!value.trim()) {
    return 'E-mail é obrigatório.'
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? ''
    : 'Digite um e-mail válido.'
}

export const password = (value: string) => {
  if (!value) {
    return 'Senha é obrigatória.'
  }

  return value.length >= 6 ? '' : 'A senha deve ter pelo menos 6 caracteres.'
}
