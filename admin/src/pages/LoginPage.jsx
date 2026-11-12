import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import logo from '../assets/logo-mark.svg';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (status === 'authenticated') return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={logo} alt="" width="48" height="48" />
          <div>
            <p className={styles.brandName}>
              SEO <b>VIRJI</b>
            </p>
            <p className={styles.brandSub}>AI Chatbot Control Panel</p>
          </div>
        </div>

        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to manage your AI consultant.</p>

        <form onSubmit={submit} noValidate className={styles.form}>
          <label className="field">
            <span className="field-label">Email</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <span className={styles.passwordWrap}>
              <input
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className={styles.eye} onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          {error && (
            <p className={styles.error} role="alert">
              <AlertCircle size={16} /> {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || status === 'checking'}>
            <Lock size={16} /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className={styles.foot}>Accounts are created by the site owner with the secure provisioning command.</p>
      </div>
    </div>
  );
}
