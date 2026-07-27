import type { Metadata } from 'next'
import { DM_Sans, DM_Mono, Fraunces, Public_Sans, JetBrains_Mono } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })
// Rediseño visual — bienvenida
const fraunces   = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans' })
const jbMono     = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jb-mono' })

export const metadata: Metadata = {
  title: 'Virtual English — Player',
  description: 'Professional language learning video player',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmMono.variable} ${fraunces.variable} ${publicSans.variable} ${jbMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
