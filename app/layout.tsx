import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://office.jackisa.com'),
  title: 'Jackisa Office',
  description: 'Jackisa Office is the all-in-one operating system for modern teams—manage HR, payroll, accounting, sales, education, legal workflows, and more from one secure dashboard.',
  keywords: ['office management', 'HR', 'accounting', 'payroll', 'corporate', 'business'],
  generator: 'Jackisa Office',
  authors: [{ name: 'Jackisa Office' }],
  icons: {
    icon: [
      {
        url: 'https://res.cloudinary.com/dsijcu1om/image/upload/v1772089563/3_umjgfn.ico',
      },
    ],
    shortcut: ['https://res.cloudinary.com/dsijcu1om/image/upload/v1772089563/3_umjgfn.ico'],
    apple: [
      {
        url: 'https://res.cloudinary.com/dsijcu1om/image/upload/v1772089958/jackisa.com_logo_cbm52w.png',
      },
    ],
  },
  openGraph: {
    title: 'Jackisa Office | Enterprise Operations Platform',
    description: 'Run your entire company from one place: HR, payroll, accounting, sales, education, legal documents, and team administration.',
    type: 'website',
    locale: 'en_US',
    url: 'https://office.jackisa.com',
    siteName: 'Jackisa Office',
    images: [
      {
        url: 'https://res.cloudinary.com/dsijcu1om/image/upload/v1772089958/jackisa.com_logo_cbm52w.png',
        width: 2000,
        height: 2000,
        alt: 'Jackisa Office',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jackisa Office | Enterprise Operations Platform',
    description: 'Run HR, payroll, accounting, sales, education, and legal workflows from one secure dashboard.',
    images: ['https://res.cloudinary.com/dsijcu1om/image/upload/v1772089958/jackisa.com_logo_cbm52w.png'],
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
    <html lang="en" className={`${inter.variable} segoe-font`}>
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
