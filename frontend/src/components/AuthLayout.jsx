import { useEffect, useRef } from 'react';
import './AuthLayout.css';

const TICKS = Array.from({ length: 41 }, (_, i) => {
  const a = ((135 + i * (270 / 40)) * Math.PI) / 180;
  const grande = i % 5 === 0;
  const r1 = grande ? 124 : 129;
  return {
    x1: 150 + Math.cos(a) * r1,
    y1: 150 + Math.sin(a) * r1,
    x2: 150 + Math.cos(a) * 134,
    y2: 150 + Math.sin(a) * 134,
    grande,
  };
});

const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function AuthLayout({ titulo, descripcion = 'Ingresa tus datos para continuar al sistema.', pie, children }) {
  const canvasRef = useRef(null);
  const arcoRef = useRef(null);
  const tempRef = useRef(null);
  const modoRef = useRef(null);

  /* Flujo de aire: líneas de frío a cálido */
  useEffect(() => {
    const c = canvasRef.current;
    const x = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = 26;
    let W, H, raf;

    const medir = () => {
      W = c.clientWidth;
      H = c.clientHeight;
      c.width = W * dpr;
      c.height = H * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const dibujar = (t) => {
      x.clearRect(0, 0, W, H);
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        const y0 = H * (0.18 + k * 0.7);
        const amp = 14 + k * 26;
        const ph = i * 0.55 + t * 0.0004 * (1 + k * 0.6);
        const g = x.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'rgba(76,214,245,0)');
        g.addColorStop(0.45, `rgba(76,214,245,${0.16 - k * 0.05})`);
        g.addColorStop(0.8, `rgba(255,138,76,${0.05 + k * 0.2})`);
        g.addColorStop(1, 'rgba(255,138,76,0)');
        x.strokeStyle = g;
        x.lineWidth = 1.2;
        x.beginPath();
        for (let px = 0; px <= W; px += 14) {
          const y = y0 + Math.sin(px * 0.006 + ph) * amp + Math.sin(px * 0.013 - ph * 1.3) * amp * 0.35;
          px ? x.lineTo(px, y) : x.moveTo(px, y);
        }
        x.stroke();
      }
    };
    const bucle = (t) => {
      dibujar(t);
      raf = requestAnimationFrame(bucle);
    };

    medir();
    window.addEventListener('resize', medir);
    if (sinMovimiento()) dibujar(0);
    else raf = requestAnimationFrame(bucle);
    return () => {
      window.removeEventListener('resize', medir);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* Dial: baja de 26 a 22 °C una sola vez al cargar */
  useEffect(() => {
    const de = 26;
    const a = 22;
    const poner = (v) => {
      arcoRef.current.style.setProperty('--off', 490 * (1 - (v - 16) / 14));
      tempRef.current.textContent = v.toFixed(1);
    };
    poner(de);
    if (sinMovimiento()) {
      poner(a);
      modoRef.current.textContent = 'Estable en 22 °C';
      return;
    }
    let raf;
    let inicio = null;
    const paso = (ts) => {
      if (!inicio) inicio = ts;
      const p = Math.min((ts - inicio) / 2600, 1);
      poner(de + (a - de) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(paso);
      else modoRef.current.textContent = 'Estable en 22 °C';
    };
    const espera = setTimeout(() => {
      raf = requestAnimationFrame(paso);
    }, 500);
    return () => {
      clearTimeout(espera);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <main className="auth-shell">
      <section className="auth-hero" aria-label="ThermoAssist">
        <canvas ref={canvasRef} className="auth-flow" aria-hidden="true" />

        <div className="auth-brand">
          <div className="auth-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2v20M4.9 6.5l14.2 11M19.1 6.5L4.9 17.5M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" />
            </svg>
          </div>
          ThermoAssist
        </div>

        <div className="auth-copy">
          <h2>Tu operación, en la temperatura perfecta.</h2>
          <p>Coordina clientes, equipos y servicios desde un solo espacio, del primer contacto al servicio finalizado.</p>
        </div>

        <div className="auth-dial" aria-hidden="true">
          <svg viewBox="0 0 300 300">
            <defs>
              <linearGradient id="auth-g" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#4CD6F5" />
                <stop offset=".55" stopColor="#2F6BFF" />
                <stop offset="1" stopColor="#FF8A4C" />
              </linearGradient>
            </defs>
            <circle cx="150" cy="150" r="146" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.12)" />
            <g strokeWidth="2" strokeLinecap="round">
              {TICKS.map((t, i) => (
                <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.grande ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.28)'} />
              ))}
            </g>
            <circle cx="150" cy="150" r="104" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="12" strokeDasharray="490 164" transform="rotate(135 150 150)" strokeLinecap="round" />
            <circle ref={arcoRef} className="auth-arc" cx="150" cy="150" r="104" fill="none" stroke="url(#auth-g)" strokeWidth="12" strokeLinecap="round" transform="rotate(135 150 150)" style={{ '--len': 490, '--off': 490 }} />
          </svg>
          <div className="auth-readout">
            <div className="auth-temp"><span ref={tempRef}>26.0</span><sup>°C</sup></div>
            <div className="auth-mode" ref={modoRef}>Enfriando a 22 °C</div>
          </div>
        </div>

        <div className="auth-chip auth-chip-a"><i className="auth-dot auth-dot-w" /><div><b>Mantenimiento programado</b><span>Equipo 214 · mañana, 9:00 a. m.</span></div></div>
        <div className="auth-chip auth-chip-b"><i className="auth-dot" /><div><b>Servicio finalizado</b><span>Orden 1048 · cliente notificado</span></div></div>

        <div className="auth-foot"><span>Solicitudes</span><span>Equipos</span><span>Mantenimiento</span></div>
      </section>

      <section className="auth-side">
        <div className="auth-card">
          <h1>{titulo}</h1>
          <p className="auth-sub">{descripcion}</p>
          {children}
          {pie && <p className="auth-card-pie">{pie}</p>}
        </div>
        <small className="auth-seguridad">Acceso seguro · Sistema de gestión ThermoAssist</small>
      </section>
    </main>
  );
}