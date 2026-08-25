import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Logs() {
  const [consultas, eventos] = await Promise.all([
    query<{
      criado_em: string; operadora: string; modo: string; cep: string | null;
      municipio: string | null; logradouro: string | null; numero: string | null;
      status: string; resultados: number; duracao_ms: number;
    }>(
      `SELECT criado_em, operadora, modo, cep, municipio, logradouro, numero,
              status, resultados, duracao_ms
         FROM consulta_log ORDER BY criado_em DESC LIMIT 100`,
    ).catch(() => []),
    query<{ criado_em: string; nivel: string; origem: string; mensagem: string }>(
      `SELECT criado_em, nivel, origem, mensagem
         FROM evento_log ORDER BY criado_em DESC LIMIT 50`,
    ).catch(() => []),
  ]);

  return (
    <>
      <h1 className="titulo">Logs</h1>
      <p className="subtitulo">Últimas consultas e eventos do sistema.</p>

      <div className="tabela-caixa" style={{ marginBottom: 24 }}>
        <header>Consultas recentes</header>
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Data/hora</th><th>Operadora</th><th>Consulta</th>
                <th>Resultado</th><th>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {consultas.length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--texto-3)' }}>Nenhuma consulta registrada.</td></tr>
              )}
              {consultas.map((c, i) => (
                <tr key={i} style={{ cursor: 'default' }}>
                  <td>{new Date(c.criado_em).toLocaleString('pt-BR')}</td>
                  <td>{c.operadora}</td>
                  <td>
                    {c.modo === 'CEP'
                      ? `CEP ${c.cep ?? ''}`
                      : `${c.municipio ?? ''} — ${c.logradouro ?? ''}${c.numero ? `, ${c.numero}` : ''}`}
                  </td>
                  <td><span className={`selo ${c.status}`}>{c.status}</span></td>
                  <td>{c.duracao_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tabela-caixa">
        <header>Eventos</header>
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>Data/hora</th><th>Nível</th><th>Origem</th><th>Mensagem</th></tr>
            </thead>
            <tbody>
              {eventos.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--texto-3)' }}>Nenhum evento.</td></tr>
              )}
              {eventos.map((e, i) => (
                <tr key={i} style={{ cursor: 'default' }}>
                  <td>{new Date(e.criado_em).toLocaleString('pt-BR')}</td>
                  <td>{e.nivel}</td>
                  <td>{e.origem}</td>
                  <td>{e.mensagem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
