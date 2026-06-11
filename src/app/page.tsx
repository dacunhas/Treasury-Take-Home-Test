import VerifyForm from '@/components/VerifyForm';

/**
 * Single-label verification screen (T3.1). Server component shell that renders
 * the client `VerifyForm`. Batch mode (M4) will be added as a second tab/route.
 */
export default function HomePage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1.25rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.9rem', margin: '0 0 0.5rem' }}>
          TTB Label Verification
        </h1>
        <p style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>
          Enter the expected values from the application, upload the label image,
          and verify them field by field — including the mandatory Government
          Warning — in under five seconds.
        </p>
        <p style={{ margin: 0, color: '#555' }}>
          This tool flags discrepancies for a human reviewer; it does not make
          compliance decisions.
        </p>
      </header>
      <VerifyForm />
    </main>
  );
}
