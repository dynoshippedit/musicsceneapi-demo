import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useBrand } from '../../brand/BrandContext.jsx';
import { confirmPasswordReset } from '../../api/endpoints.js';
import { Button } from '../../components/primitives/Button.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import styles from '../LoginPage/LoginPage.module.css';

/**
 * STEP 7: public landing page for password-reset links (?token=…).
 * Redeems the token via POST /v3/auth/reset-password, then points at /login.
 */
export function ResetPasswordPage() {
  const { profile, text } = useBrand();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError(new Error(text.resetMismatch));
      return;
    }
    if (newPassword.length < 8) {
      setError(new Error(text.resetTooShort));
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.loginPage}>
      <form className={`panel ${styles.card}`} onSubmit={submit}>
        <div className={styles.brandBlock}>
          <h1 className={styles.wordmark}>{profile.displayName}</h1>
          <p className={styles.tagline}>{profile.tagline}</p>
        </div>
        {error && <div className={styles.error}><ErrorState variant="panel" message={error.message} hideKicker /></div>}

        {!token ? (
          <div className={styles.field}>
            <p>{text.resetNoToken}</p>
            <Link to="/login">{text.forgotBack}</Link>
          </div>
        ) : done ? (
          <div className={styles.field}>
            <p>{text.resetDone}</p>
            <Link to="/login">{text.resetToLogin}</Link>
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <label className="label" htmlFor="new-passphrase">{text.resetNewLabel}</label>
              <input id="new-passphrase" type="password" autoComplete="new-password" placeholder={text.passphrasePlaceholder} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className="label" htmlFor="confirm-passphrase">{text.resetConfirmLabel}</label>
              <input id="confirm-passphrase" type="password" autoComplete="new-password" placeholder={text.passphrasePlaceholder} value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
            </div>
            <Button type="submit" variant="primary" busy={busy} className={styles.submit}>{busy ? text.resetBusy : text.resetSubmit}</Button>
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
