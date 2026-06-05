export function formatPostalCode(countryCode: string, value: string) {
  if (countryCode === 'BR') {
    return value
      .replace(/\D/g, '')
      .slice(0, 8)
      .replace(/^(\d{5})(\d{0,3}).*/, (_, first: string, second: string) =>
        second ? `${first}-${second}` : first,
      )
  }

  if (countryCode === 'US') {
    const cleanValue = value.replace(/\D/g, '').slice(0, 9)
    return cleanValue.replace(/^(\d{5})(\d{0,4}).*/, (_, first: string, second: string) =>
      second ? `${first}-${second}` : first,
    )
  }

  if (countryCode === 'PT') {
    return value
      .replace(/\D/g, '')
      .slice(0, 7)
      .replace(/^(\d{4})(\d{0,3}).*/, (_, first: string, second: string) =>
        second ? `${first}-${second}` : first,
      )
  }

  return value
}

export function formatPhone(countryCode: string, value: string) {
  const digits = value.replace(/\D/g, '')

  if (countryCode === 'BR') {
    const cleanValue = digits.slice(0, 11)
    if (cleanValue.length <= 10) {
      return cleanValue
        .replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, area: string, first: string, second: string) =>
          [area && `(${area}`, area.length === 2 && ') ', first, second && `-${second}`]
            .filter(Boolean)
            .join(''),
        )
    }

    return cleanValue.replace(
      /^(\d{2})(\d{5})(\d{0,4}).*/,
      (_, area: string, first: string, second: string) =>
        `(${area}) ${first}${second ? `-${second}` : ''}`,
    )
  }

  if (countryCode === 'US') {
    return digits
      .slice(0, 10)
      .replace(/^(\d{0,3})(\d{0,3})(\d{0,4}).*/, (_, area: string, first: string, second: string) =>
        [area && `(${area}`, area.length === 3 && ') ', first, second && `-${second}`]
          .filter(Boolean)
          .join(''),
      )
  }

  if (countryCode === 'PT') {
    return digits
      .slice(0, 9)
      .replace(/^(\d{0,3})(\d{0,3})(\d{0,3}).*/, (_, first: string, second: string, third: string) =>
        [first, second, third].filter(Boolean).join(' '),
      )
  }

  if (countryCode === 'PY') {
    const cleanValue = digits.replace(/^595/, '').slice(0, 9)
    return cleanValue.replace(
      /^(\d{0,3})(\d{0,3})(\d{0,3}).*/,
      (_, first: string, second: string, third: string) =>
        `+595 ${[first, second, third].filter(Boolean).join(' ')}`.trim(),
    )
  }

  return value
}

export function formatCnpj(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(
      /^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2}).*/,
      (_, first: string, second: string, third: string, fourth: string, fifth: string) =>
        [
          first,
          second && `.${second}`,
          third && `.${third}`,
          fourth && `/${fourth}`,
          fifth && `-${fifth}`,
        ]
          .filter(Boolean)
          .join(''),
    )
}

function formatNumericGroups(value: string, maxDigits: number) {
  const digits = value.replace(/\D/g, '').slice(0, maxDigits)

  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatMunicipalRegistration(value: string) {
  return formatNumericGroups(value, 15)
}

export function formatStateRegistration(value: string) {
  return formatNumericGroups(value, 14)
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function formatCurrencyBRL(value: unknown) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) {
    return 'Nao informado'
  }

  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(numberValue)
}

export function formatDateValue(value: unknown) {
  if (!value) return 'Nao informado'

  const text = String(value)
  const date = new Date(text)

  if (Number.isNaN(date.getTime())) {
    return text
  }

  return new Intl.DateTimeFormat('pt-BR').format(date)
}

export function formatBooleanValue(value: boolean) {
  return value ? 'Sim' : 'Nao'
}

export function formatEmptyValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'Nao informado'
  }

  if (typeof value === 'boolean') {
    return formatBooleanValue(value)
  }

  return String(value)
}

export function formatTechnicalLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bCnpj\b/g, 'CNPJ')
    .replace(/\bCpf\b/g, 'CPF')
    .replace(/\bCep\b/g, 'CEP')
    .replace(/\bUf\b/g, 'UF')
    .replace(/\bCnae\b/g, 'CNAE')
}
