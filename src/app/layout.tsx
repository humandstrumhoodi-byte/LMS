import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hum & Strum Music School',
  description: 'Student and staff portal for Hum & Strum Music School, Hoodi, Bengaluru',
  icons: { icon: '/logo.png', apple: '/logo.png' },
}

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png" type="image/png"/>
        <link rel="apple-touch-icon" href="/logo.png"/>
        <meta name="theme-color" content="#3B1F8C"/>
        <meta name="mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <meta name="apple-mobile-web-app-title" content="Hum &amp; Strum"/>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
      </head>
      <body className="bg-gray-50 antialiased">{children}</body>
    </html>
  )
}
