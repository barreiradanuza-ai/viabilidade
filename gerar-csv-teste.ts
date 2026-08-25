/**
 * Gera um CSV sintético no mesmo layout da base TIM, para testar o
 * importador e medir performance sem depender do arquivo real.
 *   npx tsx scripts/gerar-csv-teste.ts /tmp/teste.csv 200000
 */
import fs from 'node:fs';

const saida = process.argv[2] ?? '/tmp/tim-teste.csv';
const linhas = Number(process.argv[3] ?? 100_000);

// Mesmo layout de rede do arquivo real, inclusive o BOM inicial.
const CABECALHO =
  '﻿CEP_NUM;ID_LOTE;UF;CIDADE;ZONEAMENTO;BAIRRO;NUMERO;CEP;LOGRADOURO;INDICADOR;HH;' +
  'PREDIO_FTTC;PREDIO_FTTH;DATA_CABEAMENTO;RESTRICAO_FTTC;DESCRICAO_RESTRICA_FTTC;' +
  'RESTRICAO_FTTH;DESCRICAO_RESTRICA_FTTH;MSAN_FTTC;VAGOS_MSAN;PER_OC_PRIM_MSAN_FTTC;' +
  'TIPO_35B_MSAN_FTTC;CAIXA_MSAN_FTTC;VAGOS_CAIXA_FTTC;OCUPADOS_CAIXA_FTTC;OLT_FTTH;' +
  'CAIXA_OLT_FTTH;VAGOS_CAIXA_FTTH;OCUPADOS_CAIXA_FTTH;TOPOLOGIA;SEGMENTO_FTTC;' +
  'SEGMENTO_FTTH;NUM_REAL;QUADRA_REAL;LOTE_REAL;OFERTA_FOCO;OFERTA_CORP;QUADRA;LOTE;' +
  'CONJUNTO;BLOCO;via';

// Proporções aproximadas às do arquivo real.
const RESTRICOES: Array<[string, number]> = [
  ['', 965], ['Lote S/N', 20], ['Pendência Adequação - FTTH', 8],
  ['Ofensor Churn Invol', 3], ['CDO Bloqueada', 2], ['Sem Facilidades', 1],
  ['BLOQUEIO LOTE TIM', 1],
];
const SORTEIO: string[] = RESTRICOES.flatMap(([r, n]) => Array(n).fill(r));

const CIDADES: Array<[string, string, string]> = [
  ['SC', 'JOINVILLE', '892'],
  ['SC', 'FLORIANOPOLIS', '880'],
  ['SC', 'SÃO JOSÉ', '881'],
  ['PR', 'CURITIBA', '800'],
  ['SP', 'SÃO PAULO', '010'],
  ['RS', 'PORTO ALEGRE', '900'],
];
const TIPOS = ['RUA', 'AVENIDA', 'TRAVESSA', 'ALAMEDA', 'ESTRADA'];
const NOMES = [
  'DOS PORTUGUESES', 'GETÚLIO VARGAS', 'DAS FLORES', 'SÃO PAULO', 'MARECHAL DEODORO',
  'XV DE NOVEMBRO', 'DOM PEDRO II', 'SANTA CATARINA', 'JOÃO PESSOA', 'BRASIL',
];
const BAIRROS = ['CENTRO', 'VILA NOVA', 'COSTA E SILVA', 'GLÓRIA', 'ANITA GARIBALDI'];
const INDICADORES = ['Residencial casa', 'Comercial frente rua', 'Residencial prédio', 'Outros'];

const out = fs.createWriteStream(saida);
out.write(CABECALHO + '\n');

let buf = '';
for (let i = 0; i < linhas; i++) {
  const [uf, mun, pre] = CIDADES[i % CIDADES.length];
  const cep = pre + String(37780 + (i % 900)).padStart(5, '0').slice(-5);
  const log = `${TIPOS[i % TIPOS.length]} ${NOMES[(i * 7) % NOMES.length]}`;
  const num = String(1 + ((i * 13) % 3000));
  const restricao = SORTEIO[(i * 37) % SORTEIO.length];
  const numero = i % 43 === 0 ? 'SN' : num;
  buf +=
    [
      cep + numero, String(500000 + i), uf, mun, '', BAIRROS[i % BAIRROS.length],
      numero, cep, log, INDICADORES[i % INDICADORES.length], String(1 + (i % 6)),
      'NÃO SE APLICA', 'NÃO SE APLICA', '2026-06-25', '', '',
      restricao ? 'Sim' : 'Não', restricao,
      '', '', '', '', '', '', '',
      `SC${mun.slice(0, 3).toUpperCase()}${String(i % 20).padStart(3, '0')}H`,
      '', '', '', 'GREENFIELD FTTH', '', '',
      numero === 'SN' ? '0' : numero, '', '', '', '', '', '', '', '', '',
    ].join(';') + '\n';
  if (buf.length > 1 << 20) {
    out.write(buf);
    buf = '';
  }
}
out.write(buf);
out.end(() => console.log(`${linhas} linhas escritas em ${saida}`));
