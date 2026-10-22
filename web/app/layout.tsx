import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'KubeAgent',
  description: 'Chat with the KubeAgent AI assistant',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
