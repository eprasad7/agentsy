import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agentsy',
  description: 'The operating system for AI agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
