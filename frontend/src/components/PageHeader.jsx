const ICONOS = {
  clientes: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  equipos: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.2V21" /></>,
  solicitudes: <><path d="M8 4h8l3 3v13H5V4h3Z" /><path d="M9 10h6M9 14h6M9 17h3M15 4v4h4" /></>,
  cotizaciones: <><path d="M7 3h7l4 4v14H6V3h1Z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
  agenda: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3" /></>,
  tecnicos: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-1.5A4.5 4.5 0 0 1 9.5 14h5a4.5 4.5 0 0 1 4.5 4.5V20M17 7l1.5 1.5L21 6" /></>,
  ordenes: <><path d="m14 6 4-4 4 4-4 4" /><path d="m17 5-7.5 7.5a3 3 0 1 0 2 2L19 7" /></>,
  reportes: <><path d="M4 19V5M4 19h17" /><path d="M8 15v-4M13 15V7M18 15v-7" /></>,
  usuarios: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
};

export default function PageHeader({ eyebrow, title, description, icon, action }) {
  return (
    <header className="pagina-hero">
      <div className="pagina-hero-contenido">
        <p className="pagina-hero-ceja"><i aria-hidden="true" />{eyebrow}</p>
        <h1>{title}</h1>
        <p className="pagina-hero-descripcion">{description}</p>
      </div>
      {action && <div className="pagina-hero-accion">{action}</div>}
      <span className={`pagina-hero-icono pagina-hero-icono-${icon}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          {ICONOS[icon]}
        </svg>
      </span>
      <span className="pagina-hero-decoracion" aria-hidden="true" />
    </header>
  );
}
