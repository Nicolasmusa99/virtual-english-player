import type { Metadata } from 'next'
import { Atkinson_Hyperlegible_Next } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

// Rediseño 2026-10 ("la sala y el aula"): UNA sola familia para todo. Atkinson
// Hyperlegible Next está hecha para que no se confundan letras parecidas (I/l/1, a/o,
// rn/m): el alumno lee subtítulos en otro idioma a través de la compresión de Zoom.
// Variable (pesos 200–800). Las horas usan `font-variant-numeric: tabular-nums`.
// next/font no tiene sus medidas para ajustar la letra de respaldo: se declara a mano.
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin'], variable: '--font-sans', display: 'swap',
  adjustFontFallback: false, fallback: ['system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'Virtual English — Player',
  description: 'Professional language learning video player',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={atkinson.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
