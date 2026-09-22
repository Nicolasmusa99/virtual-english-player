import type { Metadata } from 'next'
import ForgotPasswordForm from './ForgotPasswordForm'

export const metadata: Metadata = { title: 'Olvidé mi contraseña — Virtual English' }

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
