import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter"
});

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: "--font-geist-mono"
});

export const metadata: Metadata = {
  title: 'FluxAgent | Identity is the New Alpha',
  description: 'The first ERC-8004 compliant autonomous trading agent with signature-level traceability and on-chain risk enforcement. Every decision is cryptographically bound, every trade is verifiable.',
  keywords: ['ERC-8004', 'autonomous trading', 'AI agent', 'Ethereum', 'blockchain', 'DeFi', 'cryptographic verification'],
  authors: [{ name: 'FluxAgent Team' }],
  openGraph: {
    title: 'FluxAgent | Identity is the New Alpha',
    description: 'The first ERC-8004 compliant autonomous trading agent with cryptographic verification and on-chain risk enforcement.',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FluxAgent | Identity is the New Alpha',
    description: 'The first ERC-8004 compliant autonomous trading agent with cryptographic verification.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${geistMono.variable} font-sans antialiased bg-black text-foreground`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
