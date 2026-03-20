import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agentsy',
  description: 'The operating system for AI agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <nav style={{ padding: '12px 24px', borderBottom: '1px solid #eee', display: 'flex', gap: 16, alignItems: 'center' }}>
          <a href="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', marginRight: 'auto' }}>Agentsy</a>
          <a href="/settings/api-keys">API Keys</a>
          <a href="/settings/secrets">Secrets</a>
          <a href="/settings/members">Team</a>
          <a href="/login">Login</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
