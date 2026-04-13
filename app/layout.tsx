import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StableOps Treasury',
  description:
    'Agentic treasury execution for small teams, DAOs, and builders, powered by LI.FI Earn and Composer.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
