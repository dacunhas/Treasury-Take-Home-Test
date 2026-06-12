import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'TTB Label Verification',
  description:
    'Agent-assist prototype: verify an alcohol beverage label against expected application data.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          lineHeight: 1.5,
          color: '#1a1a1a',
          background: '#ffffff',
        }}
      >
        {/* Skip link: first focusable element, lets keyboard users jump the
            header straight to the form (T3.3). */}
        <a href="#main-content" className="skip-link">
          Skip to the verification form
        </a>
        {children}
      </body>
    </html>
  );
}
