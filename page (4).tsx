import Link from 'next/link';
import { query } from '@/lib/db';
import AcoesBase from '@/components/AcoesBase';

export const dynamic = 'force-dynamic';

interface Base {
  id: string;
  arquivo_nome: string;
  arquivos: string[] | null;
  arquivo_bytes: string;
  dt_ref: string | null;
  status: string;
  registros_validos: string;
  registros_lidos: string;
  registros_invalidos: string;
  registros_duplicados: string;
  criado_em: string;
  ativado_em: string | null;
  erro_mensagem: string | null;
}

function mb(bytes: string) {
  const n = Number(bytes);
  if (!n) return '—';
  return n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
}

export default async function BaseTim() {
  const bases = await query<Base>(
    `SELECT id, arquivo_nome, arquivos, arquivo_bytes, dt_ref, status, registros_validos,
            registros_lidos, registros_invalidos, registros_duplicados,
            criado_em, ativado_em, erro_mensagem
       FROM base_versao WHERE operadora = 'TIM'
      ORDER BY criado_em DESC LIMIT 50`,
  ).catch(() => [] as Base[]);

  const ativa = bases.find((b) => b.status === 'ATIVA');

  return (
    <>
      <h1 className="titulo">Base TIM</h1>
      <p className="subtitulo">
        Uma nova importação só entra no ar depois de validada. Até lá, a base
        atual continua respondendo normalmente.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Base ativa</h2>
        {ativa ? (
          <div className="grade" style={{ border: '1px solid var(--borda)', borderRadius: 10 }}>
            <div className="item"><div className="k">Arquivos</div><div className="v">{ativa.arquivo_nome}</div></div>
            <div className="item"><div className="k">Data mais recente</div><div className="v">{ativa.dt_ref ?? '—'}</div></div>
            <div className="item"><div className="k">Lotes</div><div className="v">{Number(ativa.registros_validos).toLocaleString('pt-BR')}</div></div>
            <div className="item"><div className="k">Tamanho</div><div className="v">{mb(ativa.arquivo_bytes)}</div></div>
            <div className="item"><div className="k">Ativada em</div><div className="v">{ativa.ativado_em ? new Date(ativa.ativado_em).toLocaleString('pt-BR') : '—'}</div></div>
            <div className="item"><div className="k">Status</div><div className="v"><span className="selo ATIVA">Ativa</span></div></div>
          </div>
        ) : (
          <div className="aviso">
            Nenhuma base ativa. Importe um arquivo para começar a atender consultas.
          </div>
        )}
        <div className="acoes">
          <Link className="botao" href="/admin/tim/importar">IMPORTAR NOVA BASE</Link>
        </div>
      </div>

      <div className="tabela-caixa">
        <header>Histórico de bases</header>
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Arquivos</th><th>Lotes</th>
                <th>Problemas</th><th>Status</th><th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {bases.length === 0 && (
                <tr><td colSpan={6} style={{ color: 'var(--texto-3)' }}>Nenhuma importação registrada.</td></tr>
              )}
              {bases.map((b) => (
                <tr key={b.id} style={{ cursor: 'default' }}>
                  <td>{new Date(b.criado_em).toLocaleString('pt-BR')}</td>
                  <td>
                    {b.arquivo_nome}
                    {b.arquivos && b.arquivos.length > 1 && (
                      <div style={{ fontSize: 12.5, color: 'var(--texto-3)' }}>
                        {b.arquivos.length} arquivos
                      </div>
                    )}
                    {b.erro_mensagem && (
                      <div style={{ color: 'var(--vermelho)', fontSize: 12.5, marginTop: 3 }}>
                        {b.erro_mensagem}
                      </div>
                    )}
                  </td>
                  <td>{Number(b.registros_validos).toLocaleString('pt-BR')}</td>
                  <td>
                    {Number(b.registros_invalidos).toLocaleString('pt-BR')} inválidos
                    <div style={{ fontSize: 12.5, color: 'var(--texto-3)' }}>
                      {Number(b.registros_duplicados).toLocaleString('pt-BR')} lotes duplicados
                    </div>
                  </td>
                  <td><span className={`selo ${b.status}`}>{b.status[0] + b.status.slice(1).toLowerCase()}</span></td>
                  <td><AcoesBase baseId={Number(b.id)} status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
