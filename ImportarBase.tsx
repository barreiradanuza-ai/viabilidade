'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RelatorioArquivo {
  arquivo: string;
  parceiro: string;
  encoding: string;
  delimitador: string;
  lidos: number;
  validos: number;
  invalidos: number;
  colunasIgnoradas: string[];
  layout: string;
}

interface Resultado {
  baseId: number;
  lidos: number;
  validos: number;
  invalidos: number;
  duplicados: number;
  enderecosMultiLote: number;
  semNumero: number;
  municipios: number;
  dtRef: string | null;
  arquivos: RelatorioArquivo[];
  porStatus: Array<{ status: string; rotulo: string; qtd: number }>;
  problemas: Array<{ arquivo: string; linha: number; motivo: string }>;
}

const ETAPAS = [
  'Envio dos arquivos',
  'Validação dos cabeçalhos',
  'Processamento',
  'Importação',
  'Indexação',
  'Teste de integridade',
  'Pronta para ativação',
];

const n = (x: number) => x.toLocaleString('pt-BR');

export default function ImportarBase() {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [atual, setAtual] = useState('');
  const [etapa, setEtapa] = useState(-1);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ativando, setAtivando] = useState(false);

  const totalBytes = arquivos.reduce((s, a) => s + a.size, 0);

  /** Envia um arquivo por vez, com progresso real de upload. */
  function enviarArquivo(sessao: string, f: File, base: number, total: number) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        'POST',
        `/api/admin/import?acao=upload&sessao=${sessao}&nome=${encodeURIComponent(f.name)}`,
      );
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgresso(Math.round(((base + e.loaded) / total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        try {
          reject(new Error((JSON.parse(xhr.responseText) as { erro?: string }).erro));
        } catch {
          reject(new Error(`Falha ao enviar ${f.name}.`));
        }
      };
      xhr.onerror = () => reject(new Error(`Falha de rede ao enviar ${f.name}.`));
      xhr.send(f);
    });
  }

  async function enviar() {
    if (!arquivos.length) return;
    setEnviando(true);
    setErro(null);
    setResultado(null);
    setEtapa(0);
    setProgresso(0);

    const sessao = crypto.randomUUID();
    try {
      let enviados = 0;
      for (const f of arquivos) {
        setAtual(f.name);
        await enviarArquivo(sessao, f, enviados, totalBytes);
        enviados += f.size;
      }

      setAtual('');
      setEtapa(1);

      const r = await fetch(`/api/admin/import?acao=processar&sessao=${sessao}`, {
        method: 'POST',
      });
      const d = (await r.json()) as {
        resultado?: Resultado; erro?: string; aviso?: string;
      };
      if (!r.ok || !d.resultado) {
        setEtapa(-1);
        setErro(`${d.erro ?? 'Falha na importação.'} ${d.aviso ?? ''}`.trim());
        return;
      }
      setEtapa(ETAPAS.length - 1);
      setResultado(d.resultado);
    } catch (e) {
      setEtapa(-1);
      setErro(e instanceof Error ? e.message : 'Falha no envio.');
    } finally {
      setEnviando(false);
    }
  }

  async function ativar() {
    if (!resultado) return;
    setAtivando(true);
    try {
      const r = await fetch('/api/admin/bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'ativar', baseId: resultado.baseId }),
      });
      const d = (await r.json()) as { erro?: string };
      if (!r.ok) setErro(d.erro ?? 'Não foi possível ativar.');
      else router.push('/admin/tim');
    } finally {
      setAtivando(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="campo">
          <label htmlFor="arq">Arquivos CSV da base</label>
          <input
            id="arq"
            type="file"
            accept=".csv,text/csv,text/plain"
            multiple
            disabled={enviando}
            onChange={(e) => {
              setArquivos(Array.from(e.target.files ?? []));
              setResultado(null);
              setErro(null);
              setEtapa(-1);
            }}
          />
        </div>
        <p style={{ fontSize: 13, color: 'var(--texto-3)', margin: '8px 0 0' }}>
          Selecione todos os arquivos de uma vez — a TIM entrega um CSV por
          parceiro/estado e juntos eles formam <strong>uma</strong> base.
        </p>

        {arquivos.length > 0 && (
          <ul style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 14, color: 'var(--texto-2)' }}>
            {arquivos.map((a) => (
              <li key={a.name}>
                {a.name} — {(a.size / 1024 / 1024).toFixed(1)} MB
              </li>
            ))}
            {arquivos.length > 1 && (
              <li style={{ listStyle: 'none', marginLeft: -18, marginTop: 6, fontWeight: 600 }}>
                Total: {(totalBytes / 1024 / 1024).toFixed(1)} MB em {arquivos.length} arquivos
              </li>
            )}
          </ul>
        )}

        <div className="acoes">
          <button className="botao" onClick={enviar} disabled={!arquivos.length || enviando}>
            {enviando ? <span className="carregando" /> : 'ENVIAR E PROCESSAR'}
          </button>
        </div>

        {enviando && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                height: 6, borderRadius: 999, background: 'var(--superficie-2)',
                border: '1px solid var(--borda)', overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%', width: `${progresso}%`,
                  background: 'var(--marca)', transition: 'width .2s',
                }}
              />
            </div>
            <p style={{ fontSize: 13, color: 'var(--texto-2)', marginTop: 8 }}>
              {atual
                ? `Enviando ${atual}… ${progresso}%`
                : 'Processando no servidor. Bases grandes levam alguns minutos.'}
            </p>
          </div>
        )}

        {etapa >= 0 && (
          <ol style={{ marginTop: 18, paddingLeft: 20, fontSize: 14, color: 'var(--texto-2)' }}>
            {ETAPAS.map((e, i) => (
              <li key={e} style={{ color: i <= etapa ? 'var(--verde)' : 'var(--texto-3)', marginBottom: 2 }}>
                {i <= etapa ? '✓ ' : ''}{e}
              </li>
            ))}
          </ol>
        )}

        {erro && <div className="aviso erro">{erro}</div>}
      </div>

      {resultado && (
        <>
          <div className="resultado" style={{ marginTop: 24 }}>
            <div className="res-faixa v-VIAVEL">
              <span className="bolha" />
              <div>
                <h3>Importação concluída</h3>
                <p>Base #{resultado.baseId} pronta para ativação.</p>
              </div>
            </div>
            <div className="grade">
              <Item k="Registros encontrados" v={resultado.lidos} />
              <Item k="Registros válidos" v={resultado.validos} />
              <Item k="Registros com problemas" v={resultado.invalidos} />
              <Item k="Lotes duplicados" v={resultado.duplicados} />
              <Item k="Endereços com mais de um lote" v={resultado.enderecosMultiLote} />
              <Item k="Imóveis sem número" v={resultado.semNumero} />
              <Item k="Cidades" v={resultado.municipios} />
              <Item k="Data mais recente" v={resultado.dtRef ?? '—'} />
            </div>

            <div style={{ padding: 20, borderTop: '1px solid var(--borda)' }}>
              <button className="botao" onClick={ativar} disabled={ativando}>
                {ativando ? <span className="carregando" /> : 'ATIVAR ESTA BASE'}
              </button>
              <p style={{ fontSize: 13, color: 'var(--texto-3)', margin: '10px 0 0' }}>
                Até você ativar, as consultas continuam usando a base anterior.
              </p>
            </div>
          </div>

          <div className="tabela-caixa" style={{ marginTop: 24 }}>
            <header>
              Viabilidade na base importada — confira antes de ativar
            </header>
            <div className="rolagem">
              <table>
                <thead>
                  <tr><th>Status</th><th>Lotes</th><th>Participação</th></tr>
                </thead>
                <tbody>
                  {resultado.porStatus.map((s) => (
                    <tr key={s.status} style={{ cursor: 'default' }}>
                      <td><span className={`selo ${s.status}`}>{s.rotulo}</span></td>
                      <td>{n(s.qtd)}</td>
                      <td>{((s.qtd / resultado.validos) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tabela-caixa" style={{ marginTop: 24 }}>
            <header>Arquivos processados</header>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Parceiro</th><th>Arquivo</th><th>Válidos</th>
                    <th>Problemas</th><th>Formato</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.arquivos.map((a) => (
                    <tr key={a.arquivo} style={{ cursor: 'default' }}>
                      <td>{a.parceiro}</td>
                      <td>{a.arquivo}</td>
                      <td>{n(a.validos)}</td>
                      <td>{n(a.invalidos)}</td>
                      <td>
                        {a.layout} · {a.encoding} · {JSON.stringify(a.delimitador)}
                        {a.colunasIgnoradas.length > 0 && (
                          <div style={{ fontSize: 12.5, color: 'var(--texto-3)' }}>
                            ignoradas: {a.colunasIgnoradas.join(', ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {resultado.problemas.length > 0 && (
            <details className="tecnico card" style={{ marginTop: 24 }}>
              <summary>Ver linhas com problema ({resultado.problemas.length})</summary>
              <div style={{ paddingTop: 12, fontSize: 14, color: 'var(--texto-2)' }}>
                {resultado.problemas.slice(0, 30).map((p, i) => (
                  <div key={i}>{p.arquivo} — linha {p.linha}: {p.motivo}</div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}

function Item({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="item">
      <div className="k">{k}</div>
      <div className="v">{typeof v === 'number' ? n(v) : v}</div>
    </div>
  );
}
