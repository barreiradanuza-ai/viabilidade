import Link from 'next/link';
import { query } from '@/lib/db';
import { TimProvider } from '@/providers/tim';
import { NioProvider, estadoSync } from '@/providers/nio';

export const dynamic = 'force-dynamic';

export default async function PainelAdmin() {
  const [tim, nio, sync, ultima, consultas] = await Promise.all([
    TimProvider.disponivel().catch(() => ({ ok: false, detalhe: 'Indisponível.' })),
    NioProvider.disponivel().catch(() => ({ ok: false, detalhe: 'Indisponível.' })),
    estadoSync().catch(() => null),
    query<{ criado_em: string; operadora: string }>(
      `SELECT criado_em, operadora FROM consulta_log ORDER BY criado_em DESC LIMIT 1`,
    ).catch(() => []),
    query<{ n: string }>(
      `SELECT count(*)::text AS n FROM consulta_log WHERE criado_em > now() - interval '24 hours'`,
    ).catch(() => [{ n: '0' }]),
  ]);

  return (
    <>
      <h1 className="titulo">Painel</h1>
      <p className="subtitulo">Situação das fontes de consulta.</p>

      {!tim.ok && (
        <div className="aviso" style={{ marginTop: 0, marginBottom: 22 }}>
          <strong>Primeiro passo:</strong> nenhuma base da TIM foi importada ainda.
          Vá em <Link href="/admin/tim/importar" style={{ color: 'var(--marca)', fontWeight: 600 }}>
            Base TIM → Importar nova base
          </Link>{' '}
          e selecione todos os CSVs de uma vez.
        </div>
      )}

      <div className="cards">
        <div className="card">
          <span className="op-sigla">TIM</span>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Base TIM</h2>
          <div className="linha-status" style={{ marginBottom: 10 }}>
            <span className={`pt${tim.ok ? '' : ' off'}`} />
            <span>{tim.ok ? 'Ativa' : 'Sem base ativa'}</span>
          </div>
          <p style={{ margin: 0, color: 'var(--texto-2)', fontSize: 14 }}>{tim.detalhe}</p>
          <p style={{ marginTop: 16, marginBottom: 0 }}>
            <Link href="/admin/tim" style={{ color: 'var(--marca)', fontWeight: 600, fontSize: 14 }}>
              Gerenciar base →
            </Link>
          </p>
        </div>

        <div className="card">
          <span className="op-sigla nio">NIO</span>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Integração NIO</h2>
          <div className="linha-status" style={{ marginBottom: 10 }}>
            <span className={`pt${nio.ok ? '' : ' off'}`} />
            <span>{nio.ok ? 'Conectada' : 'Não conectada'}</span>
          </div>
          <p style={{ margin: 0, color: 'var(--texto-2)', fontSize: 14 }}>{nio.detalhe}</p>
          {sync && (
            <dl
              style={{
                margin: '14px 0 0', display: 'grid', gap: 4,
                gridTemplateColumns: 'auto 1fr', fontSize: 13,
              }}
            >
              <dt style={{ color: 'var(--texto-3)' }}>CEPs</dt>
              <dd style={{ margin: 0 }}>{sync.total.toLocaleString('pt-BR')}</dd>
              <dt style={{ color: 'var(--texto-3)' }}>Último sync</dt>
              <dd style={{ margin: 0 }}>
                {sync.atualizadoEm
                  ? sync.atualizadoEm.toLocaleString('pt-BR')
                  : 'nunca'}
              </dd>
              <dt style={{ color: 'var(--texto-3)' }}>Última tentativa</dt>
              <dd style={{ margin: 0 }}>
                {sync.tentadoEm ? sync.tentadoEm.toLocaleString('pt-BR') : '—'}{' '}
                <span className={`selo ${sync.status === 'OK' ? 'ATIVA' : 'ERRO'}`}>
                  {sync.status ?? '—'}
                </span>
              </dd>
            </dl>
          )}
          {sync?.erro && (
            <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12.5, color: 'var(--vermelho)' }}>
              {sync.erro}
            </p>
          )}
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Consultas</h2>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 650, letterSpacing: '-.02em' }}>
            {Number(consultas[0]?.n ?? 0).toLocaleString('pt-BR')}
          </p>
          <p style={{ margin: '2px 0 0', color: 'var(--texto-2)', fontSize: 14 }}>
            nas últimas 24 horas
          </p>
          <p style={{ marginTop: 14, marginBottom: 0, color: 'var(--texto-3)', fontSize: 13 }}>
            Última:{' '}
            {ultima[0]
              ? `${new Date(ultima[0].criado_em).toLocaleString('pt-BR')} (${ultima[0].operadora})`
              : '—'}
          </p>
        </div>
      </div>
    </>
  );
}
