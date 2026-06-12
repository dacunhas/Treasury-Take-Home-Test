import AppTabs from '@/components/AppTabs';

/**
 * Verification screen. Server component shell that renders the client `AppTabs`
 * (the Single / Batch mode switch — T3.1 single-label, T4.1 batch).
 *
 * `<main id="main-content" tabIndex={-1}>` is the skip-link target (T3.3): a
 * single, programmatically focusable landmark so keyboard and screen-reader
 * users can bypass the header.
 */
export default function HomePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1.25rem' }}
    >
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.9rem', margin: '0 0 0.5rem' }}>
          TTB Label Verification
        </h1>
        <p style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>
          Enter the expected values from the application, upload the label image,
          and verify them field by field — including the mandatory Government
          Warning — in under five seconds.
        </p>
        <p style={{ margin: 0, color: '#595959' }}>
          This tool flags discrepancies for a human reviewer; it does not make
          compliance decisions.
        </p>
      </header>
      <AppTabs />
    </main>
  );
}
