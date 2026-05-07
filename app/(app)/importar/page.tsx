'use client';

import { useState } from 'react';
import ImportarSocios from './_socios';
import ImportarDeuda from './_deuda';

type Tab = 'socios' | 'deuda';

export default function ImportarPage() {
  const [tab, setTab] = useState<Tab>('socios');

  return (
    <div>
      <div className="main-header">
        <h1>Importar</h1>
      </div>

      <div className="tabs">
        <button className={tab === 'socios' ? 'tab-active' : ''} onClick={() => setTab('socios')}>
          Socios
        </button>
        <button className={tab === 'deuda' ? 'tab-active' : ''} onClick={() => setTab('deuda')}>
          Deuda histórica
        </button>
      </div>

      {tab === 'socios' && <ImportarSocios />}
      {tab === 'deuda' && <ImportarDeuda />}
    </div>
  );
}
