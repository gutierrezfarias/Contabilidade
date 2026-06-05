import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthForm } from '../../components/forms/AuthForm'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import { useRole } from '../../hooks/useRole'
import { getCurrentProfile } from '../../services/platformService'
import type { LoginCredentials } from '../../types/auth'
import { email, password } from '../../utils/validators'

type LoginErrors = Partial<Record<keyof LoginCredentials, string>>

export function Login() {
  const [form, setForm] = useState<LoginCredentials>({ email: '', password: '' })
  const [errors, setErrors] = useState<LoginErrors>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { isAuthenticated, isLoading, login } = useAuth()
  const { isAdmin, isLoading: isRoleLoading } = useRole()
  const location = useLocation()
  const navigate = useNavigate()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/aplicativos'

  if (!isLoading && isAuthenticated) {
    if (isRoleLoading) {
      return <div aria-hidden="true" className="min-h-screen bg-slate-50" />
    }

    return <Navigate replace to={isAdmin ? '/admin' : '/aplicativos'} />
  }

  function updateField(field: keyof LoginCredentials, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setErrorMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      email: email(form.email),
      password: password(form.password),
    }

    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await login(form)
      const profile = await getCurrentProfile()
      const isAdminProfile = profile?.role === 'admin'
      const destination =
        isAdminProfile && !redirectTo.startsWith('/admin') && !redirectTo.includes('organization=')
          ? '/admin'
          : redirectTo
      navigate(destination, { replace: true })
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível entrar no momento.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      subtitle="Entre na sua conta para acessar seu painel pessoal."
      title="Bem-vindo de volta"
    >
      <AuthForm onSubmit={handleSubmit}>
        {errorMessage && <Alert type="error">{errorMessage}</Alert>}
        <Input
          autoComplete="email"
          error={errors.email}
          id="email"
          label="E-mail"
          onChange={(event) => updateField('email', event.target.value)}
          placeholder="voce@exemplo.com"
          required
          type="email"
          value={form.email}
        />
        <div>
          <Input
            autoComplete="current-password"
            error={errors.password}
            id="password"
            label="Senha"
            onChange={(event) => updateField('password', event.target.value)}
            placeholder="Digite sua senha"
            required
            type="password"
            value={form.password}
          />
          <div className="mt-3 text-right">
            <Link className="text-sm font-medium text-indigo-600 hover:text-indigo-700" to="/esqueci-senha">
              Esqueci minha senha
            </Link>
          </div>
        </div>
        <Button className="w-full" isLoading={isSubmitting} type="submit">
          Entrar
        </Button>
      </AuthForm>

      <p className="mt-7 text-center text-sm text-slate-500">
        Ainda não tem uma conta?{' '}
        <Link className="font-semibold text-indigo-600 hover:text-indigo-700" to="/cadastro">
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  )
}
