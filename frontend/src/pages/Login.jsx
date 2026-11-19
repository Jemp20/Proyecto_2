import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { mensajeDeError } from '../api';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verClave, setVerClave] = useState(false);

  if (user) return <Navigate to="/panel" replace />;

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(form.email, form.password);
      navigate('/panel');
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AuthLayout
      titulo="Iniciar sesión"
      pie={<>¿Aún no tienes cuenta? <Link to="/registro">Regístrate como cliente</Link></>}
    >
      <form onSubmit={enviar}>
        <div>
          <label htmlFor="login-email">Correo</label>
          <div className="auth-field">
            <svg className="auth-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m3.5 7 8.5 6 8.5-6" />
            </svg>
            <input
              id="login-email"
              type="email"
              name="email"
              value={form.email}
              onChange={cambiar}
              placeholder="tucorreo@empresa.com"
              required
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password">Contraseña</label>
          <div className="auth-field">
            <svg className="auth-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="10.5" width="16" height="10" rx="3" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
            </svg>
            <input
              id="login-password"
              type={verClave ? 'text' : 'password'}
              name="password"
              value={form.password}
              onChange={cambiar}
              placeholder="Tu contraseña"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-eye"
              onClick={() => setVerClave((v) => !v)}
              aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {verClave && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
        </div>

        <p className="auth-enlace-recuperacion">
          <Link to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link>
        </p>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="auth-submit" disabled={enviando}>
          <span>{enviando ? 'Ingresando…' : 'Iniciar sesión'}</span>
          {!enviando && (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h12M10 4l6 6-6 6" />
            </svg>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}