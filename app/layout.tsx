import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'Jackisa Office - Corporate Management Suite',
  description: 'Professional office management tool for companies. Manage employees, accounting, HR, payroll, and more with Jackisa Office.',
  keywords: ['office management', 'HR', 'accounting', 'payroll', 'corporate', 'business'],
  generator: 'Jackisa Office',
  viewport: 'width=device-width, initial-scale=1',
  authors: [{ name: 'Jackisa Office' }],
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://jackisaoffice.com',
    siteName: 'Jackisa Office',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0D5BA3' },
    { media: '(prefers-color-scheme: dark)', color: '#5C9FD8' }
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="segoe-font">
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
