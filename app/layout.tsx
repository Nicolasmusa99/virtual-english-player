import type { Metadata } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Virtual English — Player',
  description: 'Professional language learning video player',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
