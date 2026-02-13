import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';

export const metadata: Metadata = {
  title: 'Prospex — Precision Prospecting',
  description: 'B2B Lead Generation Platform for SMMA Agencies. Scrape, Enrich, Audit, and Convert Leads.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-prospex-bg">
        <Sidebar />
        <main className="ml-64 min-h-screen grid-pattern">
          <div className="p-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
