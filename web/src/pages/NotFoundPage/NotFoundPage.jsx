import { useNavigate } from 'react-router-dom';
import { useBrand } from '../../brand/BrandContext.jsx';
import { Section } from '../../components/primitives/Section.jsx';
import { EmptyState } from '../../components/primitives/EmptyState.jsx';
import { Button } from '../../components/primitives/Button.jsx';

/** 4B redirected every unknown path to /dashboard; 4C answers honestly instead (§4). */
export function NotFoundPage() {
  const { text } = useBrand();
  const navigate = useNavigate();
  return (
    <Section title={text.notFoundTitle}>
      <EmptyState title={text.notFoundDetail} detail={null} icon="ri-compass-3-line">
        <Button variant="primary" onClick={() => navigate('/dashboard')}>{text.nav.dashboard}</Button>
      </EmptyState>
    </Section>
  );
}
