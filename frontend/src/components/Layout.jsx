import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROL } from '../constantes';

// Íconos del menú (trazos simples, heredan el color del texto)
const ICONOS = {
  panel: (
    <>
      <rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>
    </>
  ),
  clientes: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </>
  ),
  equipos: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
    </>
  ),
  solicitudes: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
    </>
  ),
  cotizaciones: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>
    </>
  ),
  agenda: (
    <>
      <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
    </>
  ),
  tecnicos: (
    <>
      <path d="m16 11 2 2 4-4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    </>
  ),
  ordenes: (
    <>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </>
  ),
  reportes: (
    <>
      <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
    </>
  ),
  asistente: (
    <>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>
      <path d="M8 12h.01M12 12h.01M16 12h.01"/>
    </>
  ),
  usuarios: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>
    </>
  ),
};

// Menú lateral de cada rol: [texto, ruta, ícono]
const MENU = {
  administrador: [
    ['Panel', '/panel', 'panel'], ['Clientes', '/clientes', 'clientes'], ['Equipos', '/equipos', 'equipos'],
    ['Solicitudes', '/solicitudes', 'solicitudes'], ['Cotizaciones', '/cotizaciones', 'cotizaciones'],
    ['Agenda', '/agenda', 'agenda'], ['Técnicos', '/tecnicos', 'tecnicos'], ['Órdenes de servicio', '/ordenes', 'ordenes'],
    ['Reportes', '/reportes', 'reportes'], ['Asistente', '/asistente', 'asistente'], ['Usuarios', '/usuarios', 'usuarios'],
  ],
  tecnico: [
    ['Panel', '/panel', 'panel'], ['Mis visitas', '/agenda', 'agenda'], ['Mis órdenes', '/ordenes', 'ordenes'],
  ],
  cliente: [
    ['Panel', '/panel', 'panel'], ['Mis equipos', '/equipos', 'equipos'], ['Solicitudes', '/solicitudes', 'solicitudes'],
    ['Cotizaciones', '/cotizaciones', 'cotizaciones'], ['Visitas', '/agenda', 'agenda'], ['Servicios', '/ordenes', 'ordenes'],
  ],
};

const iniciales = (nombre) =>
  nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

export default function Layout({ ancho, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const salir = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/panel" className="marca">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" />
          </svg>
          Climatización
        </Link>

        <nav className="nav" aria-label="Principal">
          {MENU[user.rol].map(([texto, ruta, icono]) => (
            <NavLink key={ruta} to={ruta} end={ruta === '/panel'}>
              <svg className="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONOS[icono]}
              </svg>
              {texto}
            </NavLink>
          ))}
        </nav>

        <div className="usuario">
          <div className="usuario-fila">
            <span className="avatar" aria-hidden="true">{iniciales(user.nombre)}</span>
            <span className="usuario-datos">
              <span>{user.nombre}</span>
              <small>{ROL[user.rol]}</small>
            </span>
          </div>
          <button className="secundario" onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>

      <main className={ancho ? 'contenido ancho' : 'contenido'}>{children}</main>
    </div>
  );
}
