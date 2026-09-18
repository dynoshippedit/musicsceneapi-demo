import { useState } from 'react';
import { useBrand } from '../../brand/BrandContext.jsx';
import { Button } from './Button.jsx';
import styles from './ConfirmAction.module.css';

/**
 * Two-step inline confirmation. Replaces the legacy `confirm()` / `alert()` calls, which
 * Phase 4A forbids in web/ (§17 acceptance). The destructive step is never the first click,
 * which is also what keeps the paid entity-audit refresh off a one-click control (§18).
 */
export function ConfirmAction({ label, confirmLabel, onConfirm, variant = 'outline', confirmVariant = 'danger', busy = false, disabled = false, prompt }) {
  const { text } = useBrand();
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return <Button variant={variant} disabled={disabled || busy} onClick={() => setArmed(true)}>{label}</Button>;
  }

  return (
    <span className={styles.group}>
      {prompt && <span className={styles.prompt}>{prompt}</span>}
      <Button
        variant={confirmVariant}
        busy={busy}
        onClick={async () => { try { await onConfirm(); } finally { setArmed(false); } }}
      >
        {confirmLabel || text.confirm}
      </Button>
      <Button variant="outline" disabled={busy} onClick={() => setArmed(false)}>{text.cancel}</Button>
    </span>
  );
}
