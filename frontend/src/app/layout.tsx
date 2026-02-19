import type { Metadata } from 'next'
import './globals.css'
import { DownloadToastHost } from '@/components/DownloadToastHost'
import { CommandPalette } from '@/components/CommandPalette'
import { AuthProvider, AuthGate } from '@/contexts/AuthContext'

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
        <AuthProvider>
          <AuthGate>
            {children}
            <CommandPalette />
            <DownloadToastHost />
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  )
}
