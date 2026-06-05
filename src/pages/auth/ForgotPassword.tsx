import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthForm } from '../../components/forms/AuthForm'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import { email as validateEmail } from '../../utils/validators'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [serviceError, setServiceError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { forgotPassword } = useAuth()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextError = validateEmail(email)

    if (nextError) {
      setError(nextError)
      return
    }

    setIsSubmitting(true)
    setServiceError('')

    try {
      const result = await forgotPassword(email)
      setMessage(result.message)
    } catch (serviceError) {
      setServiceError(
        serviceError instanceof Error
          ? serviceError.message
          : 'Não foi possível enviar a recuperação.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      subtitle="Informe seu e-mail e enviaremos instruções para redefinir sua senha."
      title="Recuperar senha"
    >
      <AuthForm onSubmit={handleSubmit}>
        {serviceError && <Alert type="error">{serviceError}</Alert>}
        {message && <Alert type="success">{message}</Alert>}
        <Input
          autoComplete="email"
          error={error}
          id="recovery-email"
          label="E-mail"
          onChange={(event) => {
            setEmail(event.target.value)
            setError('')
            setMessage('')
            setServiceError('')
          }}
          placeholder="voce@exemplo.com"
          required
          type="email"
          value={email}
        />
        <Button className="w-full" isLoading={isSubmitting} type="submit">
          Enviar instruções
        </Button>
      </AuthForm>
      <p className="mt-7 text-center text-sm text-slate-500">
        Lembrou a senha?{' '}
        <Link className="font-semibold text-indigo-600 hover:text-indigo-700" to="/login">
          Voltar ao Login
        </Link>
      </p>
    </AuthLayout>
  )
}
