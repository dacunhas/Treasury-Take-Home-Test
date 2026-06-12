'use client';

/**
 * M4 — accessible Single / Batch mode switch.
 *
 * The PROJECT_PLAN §4 UI is "two modes, tab or toggle: Verify a label (single) /
 * Batch." This is a small WAI-ARIA tab pattern: a `role="tablist"` of two tabs
 * controlling two tabpanels. Keyboard support follows the APG — Left/Right (and
 * Home/End) move between tabs, and only the active tab is in the tab sequence
 * (roving tabindex) so the panel content is one Tab away. Both panels stay
 * mounted (hidden via `hidden`) so a long single-label result or an in-progress
 * batch is preserved when the agent flips tabs.
 *
 * Accessibility bar (CONTEXT §2): visible labels, keyboard operable, AA contrast
 * (the active-tab colours are guarded by contrast.test.ts).
 */
import { useRef, useState } from 'react';
import VerifyForm from '@/components/VerifyForm';
import BatchForm from '@/components/BatchForm';
import { COLORS } from '@/lib/ui/colors';

type Mode = 'single' | 'batch';

const TABS: { id: Mode; label: string }[] = [
  { id: 'single', label: 'Verify a label' },
  { id: 'batch', label: 'Batch' },
];

export default function AppTabs() {
  const [mode, setMode] = useState<Mode>('single');
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({
    single: null,
    batch: null,
  });

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const order: Mode[] = TABS.map((t) => t.id);
    const i = order.indexOf(mode);
    let next: Mode | null = null;
    if (e.key === 'ArrowRight') next = order[(i + 1) % order.length] ?? null;
    else if (e.key === 'ArrowLeft') next = order[(i - 1 + order.length) % order.length] ?? null;
    else if (e.key === 'Home') next = order[0] ?? null;
    else if (e.key === 'End') next = order[order.length - 1] ?? null;
    if (next) {
      e.preventDefault();
      setMode(next);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Verification mode"
        style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #d0d0d0', marginBottom: '1.5rem' }}
      >
        {TABS.map((tab) => {
          const selected = mode === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setMode(tab.id)}
              onKeyDown={onKeyDown}
              style={{
                padding: '0.6rem 1.1rem',
                fontSize: '1.05rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                borderBottom: selected ? `3px solid ${COLORS.buttonBg}` : '3px solid transparent',
                background: 'transparent',
                color: selected ? COLORS.buttonBg : COLORS.text,
                marginBottom: '-2px',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="panel-single" aria-labelledby="tab-single" hidden={mode !== 'single'}>
        <VerifyForm />
      </div>
      <div role="tabpanel" id="panel-batch" aria-labelledby="tab-batch" hidden={mode !== 'batch'}>
        <BatchForm />
      </div>
    </div>
  );
}
