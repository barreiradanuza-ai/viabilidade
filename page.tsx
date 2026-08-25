import { query } from '@/lib/db';
import EditorRegras, { type RegraLinha } from '@/components/EditorRegras';

export const dynamic = 'force-dynamic';

export default async function PaginaRegras() {
  // Quantos lotes da base ativa caem em cada regra: sem esse número, mexer
  // numa regra é decidir no escuro.
  const regras = await query<RegraLinha>(
    `WITH ativa AS (
       SELECT id FROM base_versao WHERE operadora = 'TIM' AND status = 'ATIVA'
     ),
     contagem AS (
       SELECT r.id AS regra_id, count(*)::bigint AS qtd
         FROM tim_endereco e
         JOIN ativa ON e.base_id = ativa.id
         CROSS JOIN LATERAL (
           SELECT id FROM viabilidade_regra
            WHERE operadora = 'TIM' AND ativo
              AND (sinal_padrao  IS NULL OR coalesce(e.sinal_norm, '')  ~ sinal_padrao)
              AND (motivo_padrao IS NULL OR coalesce(e.motivo_norm, '') ~ motivo_padrao)
            ORDER BY prioridade LIMIT 1
         ) r
        GROUP BY r.id
     )
     SELECT v.id, v.prioridade, v.sinal_padrao, v.motivo_padrao,
            v.status, v.rotulo, v.descricao, v.ativo,
            coalesce(c.qtd, 0)::text AS lotes
       FROM viabilidade_regra v
       LEFT JOIN contagem c ON c.regra_id = v.id
      WHERE v.operadora = 'TIM'
      ORDER BY v.prioridade`,
  ).catch(() => [] as RegraLinha[]);

  const total = regras.reduce((s, r) => s + Number(r.lotes), 0);

  return (
    <>
      <h1 className="titulo">Regras de viabilidade</h1>
      <p className="subtitulo">
        Como cada situação da base da TIM vira um resultado na tela do atendente.
      </p>

      <div className="aviso info" style={{ marginTop: 0, marginBottom: 22 }}>
        A base da TIM <strong>não diz</strong> se um endereço é viável — ela diz se
        existe restrição. Estar na base já significa que há rede no local. Estas
        regras traduzem cada tipo de restrição em um resultado. A regra de menor
        prioridade que casar é a que decide.
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>A decisão que mais pesa</h2>
        <p style={{ margin: 0, color: 'var(--texto-2)', fontSize: 14.5, lineHeight: 1.6 }}>
          <strong>Lote S/N</strong> é a restrição mais comum da base — 77% de todas
          elas no arquivo analisado. Não significa falta de rede: significa que o
          imóvel está cadastrado sem número. Por isso está classificada como{' '}
          <em>necessita de análise</em>, e não como sem viabilidade. Se você marcar
          essa regra como &ldquo;sem viabilidade&rdquo;, o sistema passará a
          dispensar esses endereços — confira o número de lotes na tabela abaixo
          antes de mudar.
        </p>
      </div>

      <EditorRegras regras={regras} total={total} />
    </>
  );
}
