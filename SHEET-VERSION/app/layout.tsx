import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Assumption College Rayong Library',
  description: 'ระบบลงทะเบียนและจัดการการเข้าใช้ห้องสมุด โรงเรียนอัสสัมชัญระยอง',
  icons: {
    icon: [
      {
        url: '/assumption-rayoung.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/assumption-rayoung.png',
        media: '(prefers-color-scheme: dark)',
      },
    
    ],
    apple: '/assumption-rayoung.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
