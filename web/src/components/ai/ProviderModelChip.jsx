import { Link } from 'react-router-dom';
import { useBrand } from '../../brand/BrandContext.jsx';
import styles from './CommandConsole.module.css';

/**
 * Shows which provider/model answered, and links to where selection happens. It is a LINK by
 * specification (architecture §13.8.1) — never a dropdown, because provider selection belongs
 * only to /settings/ai. No vendor name is hardcoded: anything shown here came from the
 * backend catalogue, and when there is none the chip reads SYSTEM DEFAULT.
 */
export function ProviderModelChip({ providers }) {
  const { text } = useBrand();
  const label = providers?.selectable && providers.defaultProvider
    ? `${providers.defaultProvider}${providers.defaultModel ? ` · ${providers.defaultModel}` : ''}`
    : text.consoleSystemDefault;

  return (
    <Link to="/settings/ai" className={`label ${styles.chip}`}>
      <span className="status-dot status-dot--on" aria-hidden="true" />
      {label} · {text.consoleReady}
    </Link>
  );
}
