/**
 * Exercita as consultas contra a base ATIVA e imprime o resultado.
 *   npx tsx scripts/teste-consulta.ts                       # casos padrão
 *   npx tsx scripts/teste-consulta.ts 89210900 100          # CEP + número
 *   npx tsx scripts/teste-consulta.ts JOINVILLE "RUA X" 75  # endereço
 */
import { TimProvider } from '../src/providers/tim';
import { NioProvider } from '../src/providers/nio';
import { query, pool } from '../src/lib/db';

async function mostrar(titulo: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  const r = (await fn()) as Record<string, unknown>;
  console.log(`\n### ${titulo}  (${Date.now() - t0}ms)`);
  console.log(JSON.stringify(r, null, 1).slice(0, 1200));
}

async function main() {
  const args = process.argv.slice(2);
  console.log('TIM:', await TimProvider.disponivel());
  console.log('NIO:', await NioProvider.disponivel());

  if (args.length >= 2 && /^\d{8}$/.test(args[0].replace(/\D/g, ''))) {
    await mostrar(`CEP ${args[0]} nº ${args[1]}`, () =>
      TimProvider.consultar({ modo: 'CEP', cep: args[0], numero: args[1] }));
    return;
  }
  if (args.length >= 2) {
    await mostrar(`${args[0]} / ${args[1]} / ${args[2] ?? ''}`, () =>
      TimProvider.consultar({
        modo: 'ENDERECO', municipio: args[0], logradouro: args[1], numero: args[2],
      }));
    return;
  }

  // Sem argumentos: escolhe casos reais da própria base ativa.
  const casos = await query<{
    rotulo: string; cep: string; numero: string; cidade: string; logradouro: string;
  }>(
    `WITH ativa AS (SELECT id FROM base_versao WHERE operadora='TIM' AND status='ATIVA')
     (SELECT 'sem restrição' AS rotulo, cep, numero, cidade, logradouro
        FROM tim_endereco, ativa WHERE base_id = ativa.id AND sinal_norm='NAO' LIMIT 1)
     UNION ALL
     (SELECT 'lote S/N', cep, numero, cidade, logradouro
        FROM tim_endereco, ativa WHERE base_id = ativa.id AND motivo_norm='LOTE S N' LIMIT 1)
     UNION ALL
     (SELECT 'impedimento técnico', cep, numero, cidade, logradouro
        FROM tim_endereco, ativa WHERE base_id = ativa.id
         AND motivo_norm ~ 'CDO BLOQUEADA|SEM FACILIDADES' LIMIT 1)`,
  );

  for (const c of casos) {
    await mostrar(`${c.rotulo}: CEP ${c.cep} nº ${c.numero}`, () =>
      TimProvider.consultar({ modo: 'CEP', cep: c.cep, numero: c.numero }));
  }
  if (casos[0]) {
    await mostrar('erro de digitação no logradouro', () =>
      TimProvider.consultar({
        modo: 'ENDERECO',
        municipio: casos[0].cidade.slice(0, -1),
        logradouro: casos[0].logradouro.replace(/^RUA /, 'R. '),
        numero: casos[0].numero,
      }));
    await mostrar('CEP sem cobertura', () =>
      TimProvider.consultar({ modo: 'CEP', cep: '99999999' }));
  }
}

main()
  .then(() => pool().end())
  .catch(async (e) => {
    console.error(e);
    await pool().end().catch(() => undefined);
    process.exit(1);
  });
