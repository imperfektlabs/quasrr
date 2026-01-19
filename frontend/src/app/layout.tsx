import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Quasrr',
  description: 'Unified media search and download management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
