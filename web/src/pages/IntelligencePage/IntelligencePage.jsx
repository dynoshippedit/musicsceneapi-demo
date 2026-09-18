import { useCallback } from 'react';
import { getArtists } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { CommandConsole } from '../../components/ai/CommandConsole.jsx';
import { NetworkGraph } from '../../charts/NetworkGraph.jsx';
import { InlineLoading } from '../../components/primitives/InlineLoading.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import styles from './IntelligencePage.module.css';

export function IntelligencePage() {
  const { token } = useAuth();
  const { text } = useBrand();
  const query = useCallback(({ signal }) => getArtists(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(query);
  const artists = data?.artists ?? [];

  return (
    <div className={styles.page}>
      <CommandConsole artists={artists} onRosterChange={refetch} />
      <Section title={text.networkGraphTitle} note={`${artists.length}`}>
        {loading && !data && <InlineLoading />}
        {error && !data && <ErrorState variant="panel" message={error.message} status={error.status} onRetry={refetch} />}
        {data && (artists.length ? <NetworkGraph artists={artists} /> : <EmptyState />)}
      </Section>
    </div>
  );
}
