import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { useApiMutation } from '../../hooks/useApiMutation.js';
import { requestPasswordReset } from '../../api/endpoints.js';
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

  // STEP 7: password-reset request lives on this page (no separate route needed
  // to ask for the link; the link itself lands on /reset-password).
  const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'sent'
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    try {
      await mutate({ email, password });
      navigate('/dashboard', { replace: true });
    } catch { /* The in-card ErrorState renders the server message. */ }
  }

  async function submitForgot(event) {
    event.preventDefault();
    setForgotBusy(true);
    setForgotError(null);
    try {
      await requestPasswordReset(email);
      setMode('sent');
    } catch (err) {
      setForgotError(err);
    } finally {
      setForgotBusy(false);
    }
  }

  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div className={styles.loginPage}>
      <form className={`panel ${styles.card}`} onSubmit={mode === 'forgot' ? submitForgot : submit}>
        <div className={styles.brandBlock}>
          <h1 className={styles.wordmark}>{profile.displayName}</h1>
          <p className={styles.tagline}>{profile.tagline}</p>
        </div>
        {mode === 'login' && error && <div className={styles.error}><ErrorState variant="panel" message={error.message || text.loginFailed} hideKicker /></div>}
        {mode === 'forgot' && forgotError && <div className={styles.error}><ErrorState variant="panel" message={forgotError.message} hideKicker /></div>}

        {mode === 'sent' ? (
          <div className={styles.field}>
            <p>{text.forgotSent}</p>
            <Button type="button" variant="primary" className={styles.submit} onClick={() => setMode('login')}>
              {text.forgotBack}
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <label className="label" htmlFor="access-id">{text.accessIdLabel}</label>
              <input id="access-id" type="email" autoComplete="username" placeholder={`user@${profile.domain}`} value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            {mode === 'login' ? (
              <>
                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className="label" htmlFor="passphrase">{text.passphraseLabel}</label>
                    <button className={styles.forgot} type="button" onClick={() => setMode('forgot')}>{text.forgotLink}</button>
                  </div>
                  <input id="passphrase" type="password" autoComplete="current-password" placeholder={text.passphrasePlaceholder} value={password} onChange={(event) => setPassword(event.target.value)} required />
                </div>
                <Button type="submit" variant="primary" busy={loading} className={styles.submit}>{loading ? text.submitBusy : text.submit}</Button>
              </>
            ) : (
              <>
                <p>{text.forgotPrompt}</p>
                <Button type="submit" variant="primary" busy={forgotBusy} className={styles.submit}>{forgotBusy ? text.forgotBusy : text.forgotSend}</Button>
                <button className={styles.forgot} type="button" onClick={() => setMode('login')}>{text.forgotBack}</button>
              </>
            )}
          </>
        )}

        <footer className={styles.footer}>
          <p>{text.footerLine1}</p>
          <p>{text.footerLine2}</p>
          {profile.legal.footer && <p>{profile.legal.footer}</p>}
        </footer>
      </form>
    </div>
  );
}
