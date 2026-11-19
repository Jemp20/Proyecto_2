import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import RecuperarContrasena from './pages/RecuperarContrasena';
import RestablecerContrasena from './pages/RestablecerContrasena';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';
import Clientes from './pages/Clientes';
import ClienteForm from './pages/ClienteForm';
import ClienteDetalle from './pages/ClienteDetalle';
import Equipos from './pages/Equipos';
import Solicitudes from './pages/Solicitudes';
import SolicitudForm from './pages/SolicitudForm';
import SolicitudDetalle from './pages/SolicitudDetalle';
import Cotizaciones from './pages/Cotizaciones';
import Tecnicos from './pages/Tecnicos';
import Agenda from './pages/Agenda';
import Ordenes from './pages/Ordenes';
import OrdenDetalle from './pages/OrdenDetalle';
import HistorialEquipo from './pages/HistorialEquipo';
import Reportes from './pages/Reportes';
import Asistente from './pages/Asistente';

const ADMIN = ['administrador'];
const ADMIN_Y_CLIENTE = ['administrador', 'cliente'];
const TODOS = ['administrador', 'tecnico', 'cliente'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Register />} />
      <Route path="/recuperar-contrasena" element={<RecuperarContrasena />} />
      <Route path="/restablecer-contrasena" element={<RestablecerContrasena />} />
      <Route path="/panel" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute roles={ADMIN}><Usuarios /></ProtectedRoute>} />
      <Route path="/clientes" element={<ProtectedRoute roles={ADMIN}><Clientes /></ProtectedRoute>} />
      <Route path="/clientes/nuevo" element={<ProtectedRoute roles={ADMIN}><ClienteForm /></ProtectedRoute>} />
      <Route path="/clientes/:id" element={<ProtectedRoute roles={ADMIN}><ClienteDetalle /></ProtectedRoute>} />
      <Route path="/clientes/:id/editar" element={<ProtectedRoute roles={ADMIN}><ClienteForm /></ProtectedRoute>} />
      <Route path="/equipos" element={<ProtectedRoute roles={ADMIN_Y_CLIENTE}><Equipos /></ProtectedRoute>} />
      <Route path="/solicitudes" element={<ProtectedRoute roles={ADMIN_Y_CLIENTE}><Solicitudes /></ProtectedRoute>} />
      <Route path="/solicitudes/nueva" element={<ProtectedRoute roles={ADMIN_Y_CLIENTE}><SolicitudForm /></ProtectedRoute>} />
      <Route path="/solicitudes/:id" element={<ProtectedRoute roles={ADMIN_Y_CLIENTE}><SolicitudDetalle /></ProtectedRoute>} />
      <Route path="/cotizaciones" element={<ProtectedRoute roles={ADMIN_Y_CLIENTE}><Cotizaciones /></ProtectedRoute>} />
      <Route path="/tecnicos" element={<ProtectedRoute roles={ADMIN}><Tecnicos /></ProtectedRoute>} />
      <Route path="/agenda" element={<ProtectedRoute roles={TODOS}><Agenda /></ProtectedRoute>} />
      <Route path="/ordenes" element={<ProtectedRoute roles={TODOS}><Ordenes /></ProtectedRoute>} />
      <Route path="/ordenes/:id" element={<ProtectedRoute roles={TODOS}><OrdenDetalle /></ProtectedRoute>} />
      <Route path="/equipos/:id/historial" element={<ProtectedRoute roles={TODOS}><HistorialEquipo /></ProtectedRoute>} />
      <Route path="/reportes" element={<ProtectedRoute roles={ADMIN}><Reportes /></ProtectedRoute>} />
      <Route path="/asistente" element={<ProtectedRoute roles={ADMIN}><Asistente /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  );
}