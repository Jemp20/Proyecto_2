import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const MODULOS_POR_ROL = {
  administrador: [
    { nombre: 'Usuarios', descripcion: 'Accesos y cuentas', ruta: '/usuarios', grupo: 'Gestión', icono: 'usuarios' },
    { nombre: 'Clientes', descripcion: 'Cuentas e información', ruta: '/clientes', grupo: 'Gestión', icono: 'clientes' },
    { nombre: 'Equipos', descripcion: 'Inventario de climatización', ruta: '/equipos', grupo: 'Gestión', icono: 'equipos' },
    { nombre: 'Solicitudes', descripcion: 'Requerimientos de servicio', ruta: '/solicitudes', grupo: 'Servicios', icono: 'solicitudes' },
    { nombre: 'Cotizaciones', descripcion: 'Propuestas y aprobación', ruta: '/cotizaciones', grupo: 'Servicios', icono: 'cotizaciones' },
    { nombre: 'Agenda', descripcion: 'Visitas y programación', ruta: '/agenda', grupo: 'Servicios', icono: 'agenda' },
    { nombre: 'Técnicos', descripcion: 'Equipo de trabajo', ruta: '/tecnicos', grupo: 'Servicios', icono: 'tecnicos' },
    { nombre: 'Órdenes de servicio', descripcion: 'Seguimiento de trabajos', ruta: '/ordenes', grupo: 'Servicios', icono: 'ordenes' },
    { nombre: 'Historial técnico', descripcion: 'Intervenciones por equipo', ruta: '/equipos', grupo: 'Servicios', icono: 'historial' },
    { nombre: 'Reportes', descripcion: 'Indicadores y actividad', ruta: '/reportes', grupo: 'Análisis', icono: 'reportes' },
    { nombre: 'Asistente inteligente', descripcion: 'Consulta datos y documentos', ruta: '/asistente', grupo: 'Análisis', icono: 'asistente', destacado: true },
  ],
  tecnico: [
    { nombre: 'Mis visitas', descripcion: 'Agenda y próximos servicios', ruta: '/agenda', grupo: 'Mi operación', icono: 'agenda' },
    { nombre: 'Mis órdenes', descripcion: 'Trabajos asignados', ruta: '/ordenes', grupo: 'Mi operación', icono: 'ordenes' },
  ],
  cliente: [
    { nombre: 'Mis equipos', descripcion: 'Equipos registrados', ruta: '/equipos', grupo: 'Mi servicio', icono: 'equipos' },
    { nombre: 'Mis solicitudes', descripcion: 'Solicitudes de atención', ruta: '/solicitudes', grupo: 'Mi servicio', icono: 'solicitudes' },
    { nombre: 'Mis visitas', descripcion: 'Visitas programadas', ruta: '/agenda', grupo: 'Mi servicio', icono: 'agenda' },
    { nombre: 'Mis servicios', descripcion: 'Órdenes y avances', ruta: '/ordenes', grupo: 'Mi servicio', icono: 'ordenes' },
    { nombre: 'Historial de mis equipos', descripcion: 'Servicios realizados', ruta: '/equipos', grupo: 'Mi servicio', icono: 'historial' },
  ],
};

const ICONOS = {
  usuarios: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19" /><path d="M16 5.2a3 3 0 0 1 0 5.7M17 13.2a4.8 4.8 0 0 1 3.5 4.6V19" /></>,
  clientes: <><path d="M4 19v-1.5A4.5 4.5 0 0 1 8.5 13h1A4.5 4.5 0 0 1 14 17.5V19" /><circle cx="9" cy="7.5" r="3.5" /><path d="M16 11.5h5M18.5 9v5" /></>,
  equipos: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.2V21" /></>,
  solicitudes: <><path d="M8 4h8l3 3v13H5V4h3Z" /><path d="M9 10h6M9 14h6M9 17h3" /><path d="M15 4v4h4" /></>,
  cotizaciones: <><path d="M7 3h7l4 4v14H6V3h1Z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
  agenda: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6" /></>,
  tecnicos: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-1.5A4.5 4.5 0 0 1 9.5 14h5a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="m16 8 1.3 1.3L20 6.5" /></>,
  ordenes: <><path d="M14 6 18 2l4 4-4 4" /><path d="m17 5-7.5 7.5a3 3 0 1 0 2 2L19 7" /><path d="m5 17 2 2" /></>,
  historial: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 7v5l3 2" /></>,
  reportes: <><path d="M4 19V5M4 19h17" /><path d="M8 15v-4M13 15V7M18 15v-7" /></>,
  asistente: <><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M5.6 18.4l2.1-2.1M12 21v-3M18.4 18.4l-2.1-2.1M21 12h-3M18.4 5.6l-2.1 2.1" /><circle cx="12" cy="12" r="3" /></>,
};

function ModuloCard({ modulo }) {
  return (
    <Link
      className={`inicio-modulo${modulo.destacado ? ' inicio-modulo-destacado' : ''}`}
      to={modulo.ruta}
    >
      <span className={`inicio-modulo-icono inicio-icono-${modulo.icono}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {ICONOS[modulo.icono]}
        </svg>
      </span>
      <span className="inicio-modulo-texto">
        <strong>{modulo.nombre}</strong>
        <small>{modulo.descripcion}</small>
      </span>
      <svg className="inicio-modulo-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const modulos = MODULOS_POR_ROL[user.rol] || [];
  const modulosPrincipales = modulos.filter((modulo) => !modulo.destacado);
  const grupos = [...new Set(modulosPrincipales.map((modulo) => modulo.grupo))];
  const nombre = user.nombre.split(' ')[0];
  const esAdministrador = user.rol === 'administrador';

  return (
    <Layout>
      <section className="inicio-hero">
        <div className="inicio-hero-contenido">
          <span className="inicio-hero-etiqueta">
            <i aria-hidden="true" />
            {esAdministrador ? 'CENTRO DE OPERACIONES' : 'PORTAL DE SERVICIOS'}
          </span>
          <h1>Hola, {nombre}</h1>
          <p>
            {esAdministrador
              ? 'Todo lo que necesitas para coordinar servicios, equipos y clientes.'
              : 'Consulta tus equipos y mantente al tanto de cada servicio.'}
          </p>
        </div>
        <div className="inicio-hero-sello" aria-hidden="true">
          <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M40 8v64M12.3 24l55.4 32M12.3 56l55.4-32" />
            <circle cx="40" cy="40" r="8" />
            <circle cx="40" cy="40" r="27" opacity=".2" />
          </svg>
        </div>
        <span className="inicio-hero-decoracion" aria-hidden="true" />
      </section>

      <div className="inicio-seccion-cabecera">
        <div>
          <p className="inicio-ceja">TU ESPACIO DE TRABAJO</p>
          <h2>Módulos</h2>
        </div>
        <span className="inicio-conteo">{modulosPrincipales.length} {modulosPrincipales.length === 1 ? 'módulo' : 'módulos'}</span>
      </div>

      <div className="inicio-grupos">
        {grupos.map((grupo) => (
          <section className="inicio-grupo" key={grupo} aria-label={grupo}>
            <h3>{grupo}</h3>
            <div className="inicio-modulos">
              {modulosPrincipales.filter((modulo) => modulo.grupo === grupo).map((modulo) => (
                <ModuloCard key={modulo.nombre} modulo={modulo} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {esAdministrador && (
        <Link className="inicio-asistente-banner" to="/asistente">
          <span className="inicio-asistente-banner-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {ICONOS.asistente}
            </svg>
          </span>
          <span>
            <small>CONSULTA INTELIGENTE</small>
            <strong>Pregunta a los datos de tu sistema</strong>
            <span>Consulta solicitudes, equipos y reportes en lenguaje natural.</span>
          </span>
          <svg className="inicio-modulo-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      )}
    </Layout>
  );
}
