import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { useApiMutation } from '../../hooks/useApiMutation.js';
import { Button } from '../../components/primitives/Button.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { profile, text } = useBrand();
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { mutate, loading, error } = useApiMutation(login);

  async function submit(event) {
    event.preventDefault();
    try {
      await mutate({ email, password });
      navigate('/dashboard', { replace: true });
    } catch { /* The in-card ErrorState renders the server message. */ }
  }

  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div className={styles.loginPage}>
      <form className={`panel ${styles.card}`} onSubmit={submit}>
        <div className={styles.brandBlock}>
          <h1 className={styles.wordmark}>{profile.displayName}</h1>
          <p className={styles.tagline}>{profile.tagline}</p>
        </div>
        {error && <div className={styles.error}><ErrorState variant="panel" message={error.message || text.loginFailed} hideKicker /></div>}
        <div className={styles.field}>
          <label className="label" htmlFor="access-id">{text.accessIdLabel}</label>
          <input id="access-id" type="email" autoComplete="username" placeholder={`user@${profile.domain}`} value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className="label" htmlFor="passphrase">{text.passphraseLabel}</label>
            <button className={styles.forgot} type="button" disabled>{text.forgotLink}</button>
          </div>
          <input id="passphrase" type="password" autoComplete="current-password" placeholder={text.passphrasePlaceholder} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <Button type="submit" variant="primary" busy={loading} className={styles.submit}>{loading ? text.submitBusy : text.submit}</Button>
        <footer className={styles.footer}>
          <p>{text.footerLine1}</p>
          <p>{text.footerLine2}</p>
          {profile.legal.footer && <p>{profile.legal.footer}</p>}
        </footer>
      </form>
    </div>
  );
}
