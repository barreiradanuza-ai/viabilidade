'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AcoesBase({
  baseId,
  status,
}: {
  baseId: number;
  status: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function acao(acao: 'ativar' | 'descartar') {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch('/api/admin/bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, baseId }),
      });
      const d = (await r.json()) as { erro?: string };
      if (!r.ok) setErro(d.erro ?? 'Não foi possível concluir.');
      else router.refresh();
    } catch {
      setErro('Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  }

  if (status === 'ATIVA') {
    return <span style={{ color: 'var(--texto-3)', fontSize: 13 }}>no ar</span>;
  }
  if (status === 'PROCESSANDO') {
    return <span style={{ color: 'var(--texto-3)', fontSize: 13 }}>aguarde…</span>;
  }

  const podeAtivar = status === 'PROCESSADA' || status === 'ARQUIVADA';

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {podeAtivar && (
        <button
          className="botao"
          style={{ padding: '6px 14px', fontSize: 13.5 }}
          disabled={ocupado}
          onClick={() => acao('ativar')}
        >
          {status === 'ARQUIVADA' ? 'Voltar para esta' : 'Ativar'}
        </button>
      )}
      <button
        className="botao secundario"
        style={{ padding: '6px 14px', fontSize: 13.5 }}
        disabled={ocupado}
        onClick={() => acao('descartar')}
      >
        Descartar
      </button>
      {erro && <span style={{ color: 'var(--vermelho)', fontSize: 12.5 }}>{erro}</span>}
    </div>
  );
}
