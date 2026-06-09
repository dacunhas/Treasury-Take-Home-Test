export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem' }}>
      <h1 style={{ fontSize: '1.75rem' }}>TTB Label Verification</h1>
      <p>
        Agent-assist prototype for verifying an alcohol beverage label against the
        expected application data. The single-label and batch workflows are under
        construction.
      </p>
      <p style={{ color: '#555' }}>
        This tool flags discrepancies for a human reviewer; it does not make
        compliance decisions.
      </p>
    </main>
  );
}
