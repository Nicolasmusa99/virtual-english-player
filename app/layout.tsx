import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

// Tipografía: UNA sola familia para todo, Verdana (decisión del dueño, 2026-10-16; antes
// era Atkinson Hyperlegible Next). Es una fuente de sistema: no se descarga ni usa
// next/font. Se define en app/globals.css como --font-sans (con Geneva y Tahoma de
// respaldo) y la usan todos los módulos, también los subtítulos. Las horas siguen con
// `font-variant-numeric: tabular-nums`.

export const metadata: Metadata = {
  title: 'Virtual English — Player',
  description: 'Professional language learning video player',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
