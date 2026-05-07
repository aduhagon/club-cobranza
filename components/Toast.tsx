'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';

type ToastTipo = 'success' | 'error' | 'info' | 'warning' | 'danger';
interface Toast {
  id: number;
  tipo: ToastTipo;
  mensaje: string;
}

interface ToastContextValue {
  show: (mensaje: string, tipo?: ToastTipo) => void;
  success: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
  warning: (mensaje: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: (m: string) => alert(m),
      success: (m: string) => alert(m),
      error: (m: string) => alert(m),
      info: (m: string) => alert(m),
      warning: (m: string) => alert(m),
    };
  }
  return ctx;
}

const ICONS: Record<ToastTipo, React.ComponentType<{ size?: number | string }>> = {
  success: CheckCircle2,
  error: XCircle,
  danger: XCircle,
  warning: AlertCircle,
  info: Info,
};

const CLASSES: Record<ToastTipo, string> = {
  success: 'success',
  error: 'danger',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((mensaje: string, tipo: ToastTipo = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tipo, mensaje }]);
    setTimeout(() => remove(id), tipo === 'error' || tipo === 'danger' ? 5000 : 3000);
  }, [remove]);

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    info: (m) => show(m, 'info'),
    warning: (m) => show(m, 'warning'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => {
          const Icon = ICONS[t.tipo];
          return (
            <div key={t.id} className={`toast ${CLASSES[t.tipo]}`} onClick={() => remove(t.id)}>
              <Icon size={18} />
              <span>{t.mensaje}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
