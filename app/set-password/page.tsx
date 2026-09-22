import type { Metadata } from 'next'
import SetPasswordForm from './SetPasswordForm'

export const metadata: Metadata = {
  title: 'Elegir contraseña — Virtual English',
  // El token viaja en la URL de esta página: que no salga en el Referer de ningún
  // pedido. (Los navegadores ya mandan solo el origen a otros sitios; esto lo corta
  // del todo.) Y que ningún buscador indexe una URL con token.
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default function SetPasswordPage() {
  return <SetPasswordForm />
}
