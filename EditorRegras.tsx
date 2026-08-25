'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface RegraLinha {
  id: number;
  prioridade: number;
  sinal_padrao: string | null;
  motivo_padrao: string | null;
  status: 'VIAVEL' | 'ANALISE' | 'SEM_VIABILIDADE';
  rotulo: string;
  descricao: string | null;
  ativo: boolean;
  lotes: string;
}

const OPCOES = [
  { v: 'VIAVEL', t: 'Viável' },
  { v: 'ANALISE', t: 'Necessita de análise' },
  { v: 'SEM_VIABILIDADE', t: 'Sem viabilidade' },
] as const;

/**
 * Traduz o padrão técnico para a situação que ele descreve, usando o texto
 * que aparece de verdade na coluna DESCRICAO_RESTRICA_FTTH da base.
 */
const NOMES: Array<[RegExp, string]> = [
  [/LOTE S N/, 'Lote S/N'],
  [/PENDENCIA ADEQUACAO/, 'Pendência Adequação - FTTH'],
  [/PROLONGAMENTO DE REDE/, 'Prolongamento de Rede'],
  [/OFENSOR CHURN/, 'Ofensor Churn Invol'],
  [/BLOQUEIO LOTE/, 'BLOQUEIO LOTE TIM'],
  [/SEM FACILIDADES/, 'Sem Facilidades'],
  [/CDO BLOQUEADA/, 'CDO Bloqueada'],
  [/FORA DA DISTANCIA TECNICA/, 'Fora da Distância Técnica'],
  [/CABEAMENTO NAO AUTORIZADO/, 'Cabeamento Não Autorizado'],
];

function situacao(r: RegraLinha): string {
  if (r.motivo_padrao) {
    const achou = NOMES.find(([re]) => re.test(r.motivo_padrao ?? ''));
    return `Restrição: ${achou ? achou[1] : r.motivo_padrao.replace(/[\^$]/g, '')}`;
  }
  if (r.sinal_padrao === '^(NAO|1)$') return 'Sem restrição na base';
  if (r.sinal_padrao === '^SIM$') return 'Restrição não prevista aqui';
  if (r.sinal_padrao === '^0$') return 'Layout antigo: VIABILIDADE = 0';
  return 'Qualquer outro caso';
}

export default function EditorRegras({
  regras,
  total,
}: {
  regras: RegraLinha[];
  total: number;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function alterar(id: number, campo: 'status' | 'ativo', valor: string | boolean) {
    setSalvando(id);
    setErro(null);
    try {
      const r = await fetch('/api/admin/regras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [campo]: valor }),
      });
      const d = (await r.json()) as { erro?: string };
      if (!r.ok) setErro(d.erro ?? 'Não foi possível salvar.');
      else router.refresh();
    } catch {
      setErro('Não foi possível salvar.');
    } finally {
      setSalvando(null);
    }
  }

  return (
    <>
      {erro && <div className="aviso erro" style={{ marginTop: 0 }}>{erro}</div>}

      <div className="tabela-caixa">
        <header>
          {total > 0
            ? `Lotes da base ativa distribuídos pelas regras (${total.toLocaleString('pt-BR')} no total).`
            : 'Nenhuma base ativa — importe uma base para ver quantos lotes cada regra atinge.'}
        </header>
        <div className="rolagem">
          <table style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Situação na base</th>
                <th>Lotes</th>
                <th>Resultado mostrado</th>
                <th>Orientação ao atendente</th>
                <th>Ativa</th>
              </tr>
            </thead>
            <tbody>
              {regras.map((r) => {
                const n = Number(r.lotes);
                return (
                  <tr key={r.id} style={{ cursor: 'default', opacity: r.ativo ? 1 : 0.5 }}>
                    <td>
                      {situacao(r)}
                      <div style={{ fontSize: 12, color: 'var(--texto-3)', marginTop: 2 }}>
                        prioridade {r.prioridade}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {n > 0 ? n.toLocaleString('pt-BR') : '—'}
                      {n > 0 && total > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--texto-3)' }}>
                          {((n / total) * 100).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td>
                      <select
                        value={r.status}
                        disabled={salvando === r.id}
                        onChange={(e) => alterar(r.id, 'status', e.target.value)}
                        style={{
                          font: 'inherit', fontSize: 13.5, padding: '6px 8px',
                          borderRadius: 8, border: '1px solid var(--borda-forte)',
                          background: 'var(--superficie)', color: 'var(--texto)',
                        }}
                      >
                        {OPCOES.map((o) => (
                          <option key={o.v} value={o.v}>{o.t}</option>
                        ))}
                      </select>
                      <div style={{ marginTop: 6 }}>
                        <span className={`selo ${r.status}`}>{r.rotulo}</span>
                      </div>
                    </td>
                    <td style={{ maxWidth: 320, fontSize: 13.5, color: 'var(--texto-2)' }}>
                      {r.descricao ?? '—'}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.ativo}
                        disabled={salvando === r.id}
                        onChange={(e) => alterar(r.id, 'ativo', e.target.checked)}
                        aria-label="Regra ativa"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--texto-3)', marginTop: 14 }}>
        A alteração vale para as próximas consultas — não é preciso reimportar a
        base. Desativar uma regra faz a próxima regra que casar assumir o caso.
      </p>
    </>
  );
}
