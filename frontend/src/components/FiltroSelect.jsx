import { useEffect, useId, useRef, useState } from 'react';

export default function FiltroSelect({ etiqueta, valor, opciones, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const id = useId();
  const contenedor = useRef(null);
  const opcionesRef = useRef([]);

  const cerrar = (devolverFoco = false) => {
    setAbierto(false);
    if (devolverFoco) contenedor.current?.querySelector('button')?.focus();
  };

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrarExterno = (evento) => {
      if (!contenedor.current?.contains(evento.target)) setAbierto(false);
    };
    document.addEventListener('pointerdown', cerrarExterno);
    return () => document.removeEventListener('pointerdown', cerrarExterno);
  }, [abierto]);

  const abrir = (indice = opciones.findIndex((opcion) => opcion.valor === valor)) => {
    const siguiente = indice < 0 ? 0 : indice;
    setIndiceActivo(siguiente);
    setAbierto(true);
    requestAnimationFrame(() => opcionesRef.current[siguiente]?.focus());
  };

  const mover = (indice) => {
    const siguiente = (indice + opciones.length) % opciones.length;
    setIndiceActivo(siguiente);
    opcionesRef.current[siguiente]?.focus();
  };

  const seleccionar = (opcion) => {
    onChange(opcion.valor);
    cerrar(true);
  };

  const manejarTeclado = (evento) => {
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(evento.key)) {
        evento.preventDefault();
        abrir(evento.key === 'ArrowUp' ? opciones.length - 1 : undefined);
      }
      return;
    }

    if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrar(true);
    } else if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      mover(indiceActivo + 1);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      mover(indiceActivo - 1);
    } else if (evento.key === 'Home') {
      evento.preventDefault();
      mover(0);
    } else if (evento.key === 'End') {
      evento.preventDefault();
      mover(opciones.length - 1);
    } else if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      seleccionar(opciones[indiceActivo]);
    } else if (evento.key === 'Tab') {
      setAbierto(false);
    }
  };

  const actual = opciones.find((opcion) => opcion.valor === valor) || opciones[0];

  return (
    <div className="filtro-select" ref={contenedor} onKeyDown={manejarTeclado}>
      <button
        aria-controls={`${id}-opciones`}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        className={`filtro-select-trigger${abierto ? ' abierto' : ''}`}
        onClick={() => (abierto ? cerrar() : abrir())}
        type="button"
      >
        <span>{actual?.etiqueta || 'Seleccionar'}</span>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {abierto && (
        <ul className="filtro-select-opciones" id={`${id}-opciones`} role="listbox" aria-label={etiqueta}>
          {opciones.map((opcion, indice) => (
            <li key={opcion.valor} role="presentation">
              <button
                aria-selected={opcion.valor === valor}
                className={`filtro-select-opcion${opcion.valor === valor ? ' seleccionada' : ''}${indice === indiceActivo ? ' activa' : ''}`}
                id={`${id}-opcion-${indice}`}
                ref={(elemento) => { opcionesRef.current[indice] = elemento; }}
                role="option"
                tabIndex={indice === indiceActivo ? 0 : -1}
                onClick={() => seleccionar(opcion)}
                onFocus={() => setIndiceActivo(indice)}
                type="button"
              >
                <span>{opcion.etiqueta}</span>
                {opcion.valor === valor && <span className="filtro-select-check" aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
