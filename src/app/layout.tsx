import type { Metadata } from 'next';
import type { ReactNode } from 'react';

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
        }}
      >
        {children}
      </body>
    </html>
  );
}
