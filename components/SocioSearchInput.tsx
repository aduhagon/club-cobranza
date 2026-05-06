'use client';

import { useState, useRef, useEffect } from 'react';
import { normalize } from '@/lib/utils';
import type { Socio } from '@/lib/types';

interface Props {
  socios: Socio[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
}

export default function SocioSearchInput({ socios, selectedId, onSelect, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedSocio = socios.find((s) => s.id === selectedId);

  // Cuando cambia la selección desde afuera, sincronizo el query
  useEffect(() => {
    if (selectedSocio && !open) {
      setQuery(`${selectedSocio.numero} - ${selectedSocio.nombre}`);
    } else if (!selectedSocio) {
      setQuery('');
    }
  }, [selectedId]);

  // Cierre al click afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        if (selectedSocio) {
          setQuery(`${selectedSocio.numero} - ${selectedSocio.nombre}`);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedSocio]);

  const q = normalize(query);
  const filtrados = !open ? [] : socios.filter((s) => {
    if (!q) return true;
    return (
      normalize(s.nombre).includes(q) ||
      String(s.numero).includes(q) ||
      (s.dni && s.dni.includes(q))
    );
  }).slice(0, 30);

  function handleSelect(socio: Socio) {
    onSelect(socio.id);
    setQuery(`${socio.numero} - ${socio.nombre}`);
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, filtrados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtrados[highlightedIdx]) {
        handleSelect(filtrados[highlightedIdx]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="socio-search" ref={wrapperRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlightedIdx(0);
          if (e.target.value === '') onSelect('');
        }}
        onFocus={() => { setOpen(true); setQuery(''); setHighlightedIdx(0); }}
        onKeyDown={handleKey}
        placeholder={placeholder || 'Buscar por nombre, número o DNI...'}
      />
      {selectedSocio && !open && (
        <button
          type="button"
          className="socio-search-clear"
          onClick={() => { onSelect(''); setQuery(''); }}
          title="Limpiar"
        >×</button>
      )}
      {open && filtrados.length > 0 && (
        <div className="socio-search-results">
          {filtrados.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              className={`socio-search-item ${idx === highlightedIdx ? 'highlighted' : ''}`}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setHighlightedIdx(idx)}
            >
              <span className="socio-num">#{s.numero}</span>
              <span className="socio-nombre">{s.nombre}</span>
              {s.debito_automatico && <span className="badge debito">DA</span>}
              {s.dni && <span className="socio-dni">{s.dni}</span>}
            </button>
          ))}
        </div>
      )}
      {open && q && filtrados.length === 0 && (
        <div className="socio-search-results">
          <div className="socio-search-empty">Ningún socio coincide con "{query}"</div>
        </div>
      )}
    </div>
  );
}
