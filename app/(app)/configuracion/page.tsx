'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { darkenHex, hexToBg } from '@/lib/utils';
import type { Club } from '@/lib/types';

const COLORES_PRESET = [
  { hex: '#d62828', label: 'Rojo' },
  { hex: '#185fa5', label: 'Azul' },
  { hex: '#2e7d32', label: 'Verde' },
  { hex: '#7c2d92', label: 'Violeta' },
  { hex: '#e8851b', label: 'Naranja' },
  { hex: '#1f1f1c', label: 'Negro' },
];

export default function ConfiguracionPage() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);

  // form state
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [contacto, setContacto] = useState('');
  const [cuit, setCuit] = useState('');
  const [color, setColor] = useState('#185fa5');

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [usuarioRes, clubRes] = await Promise.all([
      supabase.from('usuarios').select('rol').eq('auth_id', user.id).maybeSingle(),
      supabase.from('clubes').select('*').limit(1).maybeSingle(),
    ]);

    setEsAdmin(usuarioRes.data?.rol === 'admin');

    if (clubRes.data) {
      const c = clubRes.data as Club;
      setClub(c);
      setNombre(c.nombre || '');
      setDireccion(c.direccion || '');
      setContacto(c.contacto || '');
      setCuit(c.cuit || '');
      setColor(c.color_primario || '#185fa5');
    }
    setLoading(false);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!club) return;
    if (!nombre.trim()) { toast.warning('El nombre es obligatorio'); return; }
    setGuardando(true);

    const { error } = await supabase
      .from('clubes')
      .update({
        nombre: nombre.trim(),
        direccion: direccion.trim() || null,
        contacto: contacto.trim() || null,
        cuit: cuit.trim() || null,
        color_primario: color,
      })
      .eq('id', club.id);

    if (error) {
      toast.error('Error al guardar: ' + error.message);
      setGuardando(false);
      return;
    }

    // Aplicar el color al instante
    document.documentElement.style.setProperty('--primary', color);
    document.documentElement.style.setProperty('--primary-dark', darkenHex(color, 18));
    document.documentElement.style.setProperty('--primary-bg', hexToBg(color, 0.10));

    toast.success('Datos guardados');
    setGuardando(false);
    cargar();
    router.refresh(); // refrescar layout para que sidebar tome los cambios
  }

  async function subirLogo(file: File) {
    if (!club) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('El logo no puede pesar más de 2 MB');
      return;
    }
    setSubiendoLogo(true);

    try {
      // Borrar logo anterior si había
      if (club.logo_url) {
        const partes = club.logo_url.split('/club-assets/');
        if (partes.length > 1) {
          await supabase.storage.from('club-assets').remove([partes[1]]);
        }
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `logo-${Date.now()}.${ext}`;
      const path = `${club.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('club-assets')
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) {
        toast.error('Error subiendo logo: ' + uploadError.message);
        setSubiendoLogo(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('club-assets').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('clubes')
        .update({ logo_url: publicUrl })
        .eq('id', club.id);

      if (updateError) {
        toast.error('Error al guardar logo: ' + updateError.message);
        setSubiendoLogo(false);
        return;
      }

      toast.success('Logo actualizado');
      cargar();
      router.refresh();
    } catch (err: any) {
      toast.error('Error: ' + (err.message || err));
    } finally {
      setSubiendoLogo(false);
    }
  }

  async function quitarLogo() {
    if (!club || !club.logo_url) return;
    if (!confirm('¿Quitar el logo del club?')) return;

    const partes = club.logo_url.split('/club-assets/');
    if (partes.length > 1) {
      await supabase.storage.from('club-assets').remove([partes[1]]);
    }
    const { error } = await supabase.from('clubes').update({ logo_url: null }).eq('id', club.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Logo quitado');
    cargar();
    router.refresh();
  }

  if (loading) return <div className="empty">Cargando...</div>;

  if (!esAdmin) {
    return (
      <div>
        <h1>Configuración</h1>
        <div className="banner warning">Solo los administradores pueden modificar la configuración del club.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="main-header">
        <h1>Configuración del club</h1>
      </div>

      <form className="card" onSubmit={guardar}>
        <h3>Logo</h3>
        <div className="logo-upload">
          <div className="logo-preview">
            {club?.logo_url ? <img src={club.logo_url} alt="Logo" /> : <span className="placeholder">📷</span>}
          </div>
          <div className="logo-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) subirLogo(file);
                e.target.value = '';
              }}
            />
            <button type="button" className="primary" onClick={() => fileRef.current?.click()} disabled={subiendoLogo}>
              {subiendoLogo ? 'Subiendo...' : (club?.logo_url ? 'Cambiar logo' : 'Subir logo')}
            </button>
            {club?.logo_url && (
              <button type="button" className="danger" onClick={quitarLogo} disabled={subiendoLogo}>
                Quitar logo
              </button>
            )}
            <small style={{ color: 'var(--text-3)' }}>PNG, JPG, WebP o SVG. Máx 2 MB.</small>
          </div>
        </div>

        <h3 style={{ marginTop: 24 }}>Datos del club</h3>
        <div className="field">
          <label>Nombre *</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div className="field">
          <label>Dirección</label>
          <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, localidad, provincia" />
        </div>
        <div className="row">
          <div className="field">
            <label>Teléfono / WhatsApp</label>
            <input type="text" value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="5491145678901" />
          </div>
          <div className="field">
            <label>CUIT</label>
            <input type="text" value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="30-70950373-8" />
          </div>
        </div>

        <h3 style={{ marginTop: 24 }}>Color principal</h3>
        <div className="field">
          <label>Aparece en botones, links y acentos</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 80 }} />
            <input type="text" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 120, fontFamily: 'ui-monospace, monospace' }} maxLength={7} />
            <div style={{ display: 'flex', gap: 6 }}>
              {COLORES_PRESET.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  title={c.label}
                  style={{
                    width: 32,
                    height: 32,
                    background: c.hex,
                    border: color === c.hex ? '3px solid var(--text)' : '1px solid var(--border-strong)',
                    borderRadius: '50%',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="banner info" style={{ marginTop: 16 }}>
          <strong>Vista previa:</strong> Los botones primarios y links activos van a usar este color.
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="primary" style={{ background: color, borderColor: color }}>Botón primario</button>
            <span style={{ color, fontWeight: 500 }}>Texto destacado</span>
            <span className="badge" style={{ background: hexToBg(color, 0.12), color }}>Badge</span>
          </div>
        </div>

        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="submit" className="primary" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}
