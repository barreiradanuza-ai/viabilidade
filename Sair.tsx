'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Sair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  return (
    <button
      type="button"
      disabled={saindo}
      onClick={async () => {
        setSaindo(true);
        await fetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
        router.push('/login');
        router.refresh();
      }}
      style={{
        font: 'inherit', fontSize: 13, cursor: 'pointer',
        background: 'none', border: 0, color: 'var(--texto-2)',
        padding: '7px 10px', borderRadius: 999,
      }}
    >
      {saindo ? '…' : 'Sair'}
    </button>
  );
}
