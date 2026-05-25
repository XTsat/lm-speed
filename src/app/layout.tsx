import type { ReactNode } from 'react'
import './globals.css'

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html suppressHydrationWarning>
      <body className="bg-gray-50">
        {children}
      </body>
    </html>
  )
}