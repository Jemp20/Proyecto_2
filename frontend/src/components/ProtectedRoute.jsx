import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Sin sesión -> /login. Con sesión pero sin el rol requerido -> /panel
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) return <p className="estado">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.rol)) return <Navigate to="/panel" replace />;

  return children;
}
