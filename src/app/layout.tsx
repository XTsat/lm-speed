import type { ReactNode } from 'react'
import './globals.css'

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html>
      <body className="bg-gray-50">
        {children}
      </body>
    </html>
  )
}