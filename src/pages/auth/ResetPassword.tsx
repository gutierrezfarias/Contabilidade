import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthForm } from '../../components/forms/AuthForm'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import { password } from '../../utils/validators'

export function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { updatePassword } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const passwordError = password(newPassword)

    if (passwordError) {
      setError(passwordError)
      return
    }

    if (newPassword !== confirmation) {
      setError('As senhas não são iguais.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const result = await updatePassword(newPassword)
      setMessage(result.message)
      window.setTimeout(() => navigate('/aplicativos', { replace: true }), 1200)
    } catch (serviceError) {
      setError(
        serviceError instanceof Error
          ? serviceError.message
          : 'Não foi possível atualizar a senha.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      subtitle="Escolha uma nova senha segura para sua conta."
      title="Redefinir senha"
    >
      <AuthForm onSubmit={handleSubmit}>
        {error && <Alert type="error">{error}</Alert>}
        {message && <Alert type="success">{message}</Alert>}
        <Input
          autoComplete="new-password"
          id="new-password"
          label="Nova senha"
          onChange={(event) => {
            setNewPassword(event.target.value)
            setError('')
          }}
          required
          type="password"
          value={newPassword}
        />
        <Input
          autoComplete="new-password"
          id="new-password-confirmation"
          label="Confirmar nova senha"
          onChange={(event) => {
            setConfirmation(event.target.value)
            setError('')
          }}
          required
          type="password"
          value={confirmation}
        />
        <Button className="w-full" isLoading={isSubmitting} type="submit">
          Salvar nova senha
        </Button>
      </AuthForm>
      <p className="mt-7 text-center text-sm text-slate-500">
        <Link className="font-semibold text-indigo-600 hover:text-indigo-700" to="/login">
          Voltar ao Login
        </Link>
      </p>
    </AuthLayout>
  )
}
