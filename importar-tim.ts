/**
 * Importação da base TIM pela linha de comando.
 *
 *   npm run tim:importar -- base1.csv base2.csv ...          # importa, não ativa
 *   npm run tim:importar -- pasta/*.csv --ativar             # importa e ativa
 *
 * Todos os arquivos passados formam UMA base: a TIM entrega um CSV por
 * parceiro/estado, e juntos eles são a cobertura completa. A base que
 * está no ar continua respondendo durante todo o processo.
 */
import path from 'node:path';
import fs from 'node:fs';
import { importarBaseTim } from '../src/lib/importador';
import { pool } from '../src/lib/db';

const n = (x: number) => x.toLocaleString('pt-BR');

async function main() {
  const args = process.argv.slice(2);
  const caminhos = args.filter((a) => !a.startsWith('--'));
  const ativar = args.includes('--ativar');

  if (!caminhos.length) {
    console.error('Uso: npm run tim:importar -- <arquivo.csv> [outro.csv ...] [--ativar]');
    process.exit(1);
  }
  for (const c of caminhos) {
    if (!fs.existsSync(c)) {
      console.error(`Arquivo não encontrado: ${c}`);
      process.exit(1);
    }
  }

  const t0 = Date.now();
  console.log(`Importando ${caminhos.length} arquivo(s)...`);

  const r = await importarBaseTim({
    arquivos: caminhos.map((c) => ({ caminho: c, nome: path.basename(c) })),
    ativar,
    onProgresso: (lidos, arq) =>
      process.stdout.write(`\r  ${path.basename(arq)}: ${n(lidos)} linhas   `),
  });

  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n
Importação concluída em ${seg}s

  Base ...................... #${r.baseId}
  Data mais recente ......... ${r.dtRef ?? '(não informada)'}
  Registros encontrados ..... ${n(r.lidos)}
  Registros válidos ......... ${n(r.validos)}
  Registros com problemas ... ${n(r.invalidos)}
  Lotes duplicados .......... ${n(r.duplicados)}
  Endereços com >1 lote ..... ${n(r.enderecosMultiLote)}
  Imóveis sem número ........ ${n(r.semNumero)}
  Cidades ................... ${n(r.municipios)}
`);

  console.log('  Por arquivo:');
  for (const a of r.arquivos) {
    console.log(
      `    ${a.parceiro.padEnd(12)} ${n(a.validos).padStart(9)} válidos  ` +
        `[${a.layout}, ${a.encoding}, "${a.delimitador}"]` +
        (a.colunasIgnoradas.length ? `  ignoradas: ${a.colunasIgnoradas.join(', ')}` : ''),
    );
  }

  console.log('\n  Viabilidade na base importada:');
  for (const s of r.porStatus) {
    const pct = ((s.qtd / r.validos) * 100).toFixed(1);
    console.log(`    ${s.rotulo.padEnd(24)} ${n(s.qtd).padStart(9)}  ${pct.padStart(5)}%`);
  }

  if (r.problemas.length) {
    console.log('\n  Primeiros problemas:');
    for (const p of r.problemas.slice(0, 10)) {
      console.log(`    ${p.arquivo} linha ${p.linha}: ${p.motivo}`);
    }
  }

  console.log(
    `\n  ${ativar ? 'Base ATIVADA.' : 'Base pronta para ativação (ative em /admin/tim).'}\n`,
  );
  await pool().end();
}

main().catch(async (e) => {
  console.error('\nFalha na importação:', e instanceof Error ? e.message : e);
  console.error('A base anterior continua ativa.');
  await pool().end().catch(() => undefined);
  process.exit(1);
});
