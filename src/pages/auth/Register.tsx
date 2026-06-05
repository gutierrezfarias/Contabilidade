import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthForm } from '../../components/forms/AuthForm'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import type { RegisterData } from '../../types/auth'
import { email, password, required } from '../../utils/validators'

type RegisterErrors = Partial<Record<keyof RegisterData, string>>

const initialForm: RegisterData = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
}

export function Register() {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { register } = useAuth()

  function updateField(field: keyof RegisterData, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setErrorMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: RegisterErrors = {
      name: required(form.name, 'Nome completo'),
      email: email(form.email),
      phone: required(form.phone, 'Telefone'),
      password: password(form.password),
      confirmPassword: form.confirmPassword ? '' : 'Confirme sua senha.',
    }

    if (!nextErrors.confirmPassword && form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'As senhas não são iguais.'
    }

    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const result = await register(form)
      setSuccessMessage(result.message)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível concluir o cadastro.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      subtitle="Preencha seus dados para começar a organizar sua rotina."
      title="Criar conta"
    >
      {successMessage ? (
        <div className="space-y-6">
          <Alert type="success">{successMessage}</Alert>
          <Link
            className="flex h-12 items-center justify-center rounded-xl bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700"
            to="/login"
          >
            Voltar para o Login
          </Link>
        </div>
      ) : (
        <AuthForm onSubmit={handleSubmit}>
          {errorMessage && <Alert type="error">{errorMessage}</Alert>}
          <Input
            error={errors.name}
            id="name"
            label="Nome completo"
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="Seu nome completo"
            required
            value={form.name}
          />
          <Input
            autoComplete="email"
            error={errors.email}
            id="register-email"
            label="E-mail"
            onChange={(event) => updateField('email', event.target.value)}
            placeholder="voce@exemplo.com"
            required
            type="email"
            value={form.email}
          />
          <Input
            autoComplete="tel"
            error={errors.phone}
            id="phone"
            label="Telefone"
            onChange={(event) => updateField('phone', event.target.value)}
            placeholder="(00) 00000-0000"
            required
            type="tel"
            value={form.phone}
          />
          <Input
            autoComplete="new-password"
            error={errors.password}
            id="register-password"
            label="Senha"
            onChange={(event) => updateField('password', event.target.value)}
            placeholder="Mínimo de 6 caracteres"
            required
            type="password"
            value={form.password}
          />
          <Input
            autoComplete="new-password"
            error={errors.confirmPassword}
            id="confirm-password"
            label="Confirmar senha"
            onChange={(event) => updateField('confirmPassword', event.target.value)}
            placeholder="Repita sua senha"
            required
            type="password"
            value={form.confirmPassword}
          />
          <Button className="w-full" isLoading={isSubmitting} type="submit">
            Criar conta
          </Button>
        </AuthForm>
      )}

      <p className="mt-7 text-center text-sm text-slate-500">
        Já possui uma conta?{' '}
        <Link className="font-semibold text-indigo-600 hover:text-indigo-700" to="/login">
          Voltar ao Login
        </Link>
      </p>
    </AuthLayout>
  )
}
