import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Academy LMS', description: 'Learning Management System' }
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="bg-gray-50 antialiased">{children}</body></html>
}
