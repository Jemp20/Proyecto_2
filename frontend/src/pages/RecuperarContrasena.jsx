import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import api, { mensajeDeError } from '../api';

export default function RecuperarContrasena() {
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault();
    setMensaje('');
    setError('');
    setEnviando(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMensaje(data.mensaje);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AuthLayout
      titulo="Recuperar contraseña"
      descripcion="Te enviaremos un enlace seguro a tu correo para que puedas crear una nueva contraseña."
      pie={<>¿Recordaste tu contraseña? <Link to="/login">Volver a iniciar sesión</Link></>}
    >
      <form onSubmit={enviar}>
        <label>Correo de tu cuenta
          <input
            type="email"
            name="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            required
            maxLength={150}
            autoComplete="email"
          />
        </label>
        {mensaje && <p className="auth-mensaje-exito" role="status">{mensaje}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={enviando}>{enviando ? 'Enviando enlace…' : 'Enviar enlace de recuperación'}</button>
      </form>
    </AuthLayout>
  );
}
