import { useBrand } from '../../brand/BrandContext.jsx';
import { useAiProviders } from '../../ai/useAiProviders.js';
import { Section } from '../../components/primitives/Section.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import styles from './SettingsPage.module.css';

/**
 * Settings › AI (architecture §13.8.2). Text-first definition grid — deliberately NOT a chat
 * settings page: no vendor logo, no key field, no model picker inside any console.
 *
 * `GET /v3/ai/providers` does not exist on the current backend, so `selectable` is false and
 * every selector collapses to a single mono line. When that route ships, the same component
 * renders real selectors with no rewrite. No provider credential is ever entered here —
 * credentials are server-managed, which is what keeps this app provider-neutral.
 */
export function AiSettingsView() {
  const { text } = useBrand();
  const providers = useAiProviders();

  return (
    <Section title={text.settingsAi}>
      <dl className={styles.definition}>
        <Row label={text.aiProviderLabel}>
          {providers.defaultProvider
            ? <span className="value">{providers.defaultProvider}</span>
            : <span className={styles.systemLine}>{text.aiCatalogUnavailable}</span>}
        </Row>
        <Row label={text.aiModelLabel}>
          {providers.defaultProvider
            ? <span className="value">{providers.defaultModel}</span>
            : <span className={styles.systemLine}>{text.aiCatalogUnavailable}</span>}
        </Row>
        <Row label={text.aiDefaultsLabel}>
          <span className="value">{text.consoleSystemDefault}</span>
          <Button disabled>SET AS DEFAULT</Button>
        </Row>
        <Row label={text.aiStatusLabel}>
          {providers.providers.length === 0 ? (
            <span className={`value ${styles.statusLine}`}>
              <span className="status-dot status-dot--warn" aria-hidden="true" />
              {String(providers.status).toUpperCase()}
            </span>
          ) : (
            <span className={styles.statusStack}>
              {providers.providers.map((provider) => (
                <span key={provider.id} className={`value ${styles.statusLine}`}>
                  <span className={`status-dot ${provider.status === 'configured' ? 'status-dot--on' : 'status-dot--warn'}`} aria-hidden="true" />
                  {provider.id} · {String(provider.status || '').toUpperCase()}
                </span>
              ))}
            </span>
          )}
        </Row>
        <Row label={text.aiByokLabel}>
          <span className={styles.systemLine}>{text.aiByokUnavailable}</span>
        </Row>
      </dl>
    </Section>
  );
}

function Row({ label, children }) {
  return (
    <div className={styles.definitionRow}>
      <dt className="label">{label}</dt>
      <dd className={styles.definitionValue}>{children}</dd>
    </div>
  );
}
