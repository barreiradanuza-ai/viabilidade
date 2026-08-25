import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import crypto from 'node:crypto';
import { parse as csvParse } from 'csv-parse';
import copyFrom from 'pg-copy-streams';
import { withClient } from './db';
import { normTxt } from './normalize';

/* ==================================================================== *
 * Mapeamento de colunas
 *
 * A base da TIM chega em dois layouts. O atual é o de rede, com 42
 * colunas (CEP_NUM, CIDADE, NUMERO, RESTRICAO_FTTH, OLT_FTTH...), sem
 * nenhum campo "viabilidade": o que existe é restrição e a descrição
 * dela. O layout antigo trazia MUNICIPIO, NUM_LOGRADOURO, VIABILIDADE e
 * MOTIVO. Os dois são aceitos, detectados pelo NOME das colunas — nunca
 * pela posição — com acento ou sem, com BOM ou sem.
 * ==================================================================== */

type Tipo = 'texto' | 'int' | 'float';

interface Coluna {
  db: string;
  nomes: string[];
  tipo: Tipo;
}

const COLUNAS: Coluna[] = [
  // endereço
  { db: 'uf',                       nomes: ['UF'],                          tipo: 'texto' },
  { db: 'cidade',                   nomes: ['CIDADE', 'MUNICIPIO'],         tipo: 'texto' },
  { db: 'bairro',                   nomes: ['BAIRRO'],                      tipo: 'texto' },
  { db: 'zoneamento',               nomes: ['ZONEAMENTO'],                  tipo: 'texto' },
  { db: 'cep',                      nomes: ['CEP'],                         tipo: 'texto' },
  { db: 'logradouro',               nomes: ['LOGRADOURO'],                  tipo: 'texto' },
  { db: 'numero',                   nomes: ['NUMERO', 'NUM_LOGRADOURO'],    tipo: 'texto' },
  { db: 'num_real',                 nomes: ['NUM_REAL'],                    tipo: 'texto' },
  { db: 'cep_num',                  nomes: ['CEP_NUM'],                     tipo: 'texto' },
  { db: 'complemento',              nomes: ['COMPLEMENTO'],                 tipo: 'texto' },
  { db: 'quadra',                   nomes: ['QUADRA'],                      tipo: 'texto' },
  { db: 'lote',                     nomes: ['LOTE'],                        tipo: 'texto' },
  { db: 'quadra_real',              nomes: ['QUADRA_REAL'],                 tipo: 'texto' },
  { db: 'lote_real',                nomes: ['LOTE_REAL'],                   tipo: 'texto' },
  { db: 'conjunto',                 nomes: ['CONJUNTO'],                    tipo: 'texto' },
  { db: 'bloco',                    nomes: ['BLOCO'],                       tipo: 'texto' },

  // lote
  { db: 'id_lote',                  nomes: ['ID_LOTE'],                     tipo: 'texto' },
  { db: 'indicador',                nomes: ['INDICADOR'],                   tipo: 'texto' },
  { db: 'hh',                       nomes: ['HH', 'QTD_HH'],                tipo: 'int'   },
  { db: 'topologia',                nomes: ['TOPOLOGIA'],                   tipo: 'texto' },
  { db: 'data_cabeamento',          nomes: ['DATA_CABEAMENTO', 'DT_REF'],   tipo: 'texto' },

  // FTTH
  { db: 'predio_ftth',              nomes: ['PREDIO_FTTH'],                 tipo: 'texto' },
  { db: 'restricao_ftth',           nomes: ['RESTRICAO_FTTH'],              tipo: 'texto' },
  { db: 'descricao_restricao_ftth', nomes: ['DESCRICAO_RESTRICA_FTTH', 'DESCRICAO_RESTRICAO_FTTH'], tipo: 'texto' },
  { db: 'olt_ftth',                 nomes: ['OLT_FTTH', 'OLT'],             tipo: 'texto' },
  { db: 'caixa_olt_ftth',           nomes: ['CAIXA_OLT_FTTH'],              tipo: 'texto' },
  { db: 'vagos_caixa_ftth',         nomes: ['VAGOS_CAIXA_FTTH'],            tipo: 'int'   },
  { db: 'ocupados_caixa_ftth',      nomes: ['OCUPADOS_CAIXA_FTTH'],         tipo: 'int'   },
  { db: 'segmento_ftth',            nomes: ['SEGMENTO_FTTH', 'SEGMENTACAO_OLT'], tipo: 'texto' },

  // FTTC
  { db: 'predio_fttc',              nomes: ['PREDIO_FTTC'],                 tipo: 'texto' },
  { db: 'restricao_fttc',           nomes: ['RESTRICAO_FTTC'],              tipo: 'texto' },
  { db: 'descricao_restricao_fttc', nomes: ['DESCRICAO_RESTRICA_FTTC', 'DESCRICAO_RESTRICAO_FTTC'], tipo: 'texto' },
  { db: 'msan_fttc',                nomes: ['MSAN_FTTC'],                   tipo: 'texto' },
  { db: 'vagos_msan',               nomes: ['VAGOS_MSAN'],                  tipo: 'int'   },
  { db: 'per_oc_prim_msan_fttc',    nomes: ['PER_OC_PRIM_MSAN_FTTC'],       tipo: 'texto' },
  { db: 'tipo_35b_msan_fttc',       nomes: ['TIPO_35B_MSAN_FTTC'],          tipo: 'texto' },
  { db: 'caixa_msan_fttc',          nomes: ['CAIXA_MSAN_FTTC'],             tipo: 'texto' },
  { db: 'vagos_caixa_fttc',         nomes: ['VAGOS_CAIXA_FTTC'],            tipo: 'int'   },
  { db: 'ocupados_caixa_fttc',      nomes: ['OCUPADOS_CAIXA_FTTC'],         tipo: 'int'   },
  { db: 'segmento_fttc',            nomes: ['SEGMENTO_FTTC'],               tipo: 'texto' },

  // comercial
  { db: 'oferta_foco',              nomes: ['OFERTA_FOCO'],                 tipo: 'texto' },
  { db: 'oferta_corp',              nomes: ['OFERTA_CORP'],                 tipo: 'texto' },

  // layout antigo
  { db: 'viabilidade',              nomes: ['VIABILIDADE'],                 tipo: 'texto' },
  { db: 'motivo',                   nomes: ['MOTIVO'],                      tipo: 'texto' },
  { db: 'tipo_lote',                nomes: ['TIPO_LOTE'],                   tipo: 'texto' },
  { db: 'infraco_principal',        nomes: ['INFRACO_PRINCIPAL'],           tipo: 'texto' },
  { db: 'latitude',                 nomes: ['LATITUDE'],                    tipo: 'float' },
  { db: 'longitude',                nomes: ['LONGITUDE'],                   tipo: 'float' },
];

/** Sem estas, não dá para localizar o endereço. */
const OBRIGATORIAS = ['cidade', 'cep', 'logradouro'];

/**
 * Sem pelo menos uma destas, o arquivo não diz nada sobre viabilidade —
 * e importar seria pior que recusar, porque a base entraria muda.
 */
const SINAL = ['restricao_ftth', 'restricao_fttc', 'viabilidade'];

const COLUNAS_COPY = [
  'base_id', 'id', 'parceiro', 'arquivo',
  ...COLUNAS.map((c) => c.db),
  'extras',
];

/** Normaliza um nome de cabeçalho: remove BOM, acento, caixa e ruído. */
function chaveCabecalho(nome: string): string {
  return (normTxt(nome.replace(/^﻿/, '')) ?? '').replace(/ /g, '_');
}

export interface Mapeamento {
  indices: Record<string, number>;
  faltando: string[];
  semSinal: boolean;
  extras: Array<{ nome: string; indice: number }>;
}

export function mapearColunas(cabecalho: string[]): Mapeamento {
  const porChave = new Map<string, number>();
  cabecalho.forEach((nome, i) => {
    const k = chaveCabecalho(nome);
    if (k && !porChave.has(k)) porChave.set(k, i);
  });

  const indices: Record<string, number> = {};
  const usados = new Set<number>();

  for (const col of COLUNAS) {
    const achou = col.nomes.map(chaveCabecalho).find((k) => porChave.has(k));
    if (achou !== undefined) {
      indices[col.db] = porChave.get(achou)!;
      usados.add(indices[col.db]);
    }
  }

  return {
    indices,
    faltando: OBRIGATORIAS.filter((c) => indices[c] === undefined).map(
      (c) => COLUNAS.find((x) => x.db === c)!.nomes.join(' ou '),
    ),
    semSinal: SINAL.every((c) => indices[c] === undefined),
    extras: cabecalho
      .map((nome, indice) => ({ nome, indice }))
      .filter((x) => !usados.has(x.indice) && x.nome.trim() !== ''),
  };
}

/** "Base de Cobertura - Rede TIM – Parceiro V.talrs.csv" -> "V.talrs" */
export function parceiroDoArquivo(nome: string): string {
  const base = path.basename(nome).replace(/\.[^.]+$/, '');
  const m = base.match(/parceiro[\s_\-–—]*(.+)$/i);
  return (m ? m[1] : base).trim().replace(/^[-–—_\s]+/, '') || base;
}

/* ------------------------------------------------------------------ *
 * Encoding e delimitador
 * ------------------------------------------------------------------ */

export function detectarEncoding(caminho: string): 'utf8' | 'latin1' {
  const tamanho = fs.statSync(caminho).size;
  const fd = fs.openSync(caminho, 'r');
  const buf = Buffer.alloc(Math.min(256 * 1024, tamanho));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(
      buf.subarray(0, Math.max(0, buf.length - 4)),
    );
    return 'utf8';
  } catch {
    return 'latin1';
  }
}

export function detectarDelimitador(primeiraLinha: string): string {
  let melhor = ';';
  let max = -1;
  for (const c of [';', ',', '\t', '|']) {
    const n = primeiraLinha.split(c).length - 1;
    if (n > max) { max = n; melhor = c; }
  }
  return max <= 0 ? ';' : melhor;
}

function lerPrimeiraLinha(caminho: string, encoding: string): string {
  const tamanho = fs.statSync(caminho).size;
  const fd = fs.openSync(caminho, 'r');
  const buf = Buffer.alloc(Math.min(64 * 1024, tamanho || 1));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  return new TextDecoder(encoding).decode(buf).replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';
}

async function lerCabecalho(
  caminho: string, encoding: string, delimitador: string,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const parser = csvParse({
      bom: true, delimiter: delimitador, to_line: 1,
      relax_quotes: true, encoding: encoding as BufferEncoding,
    });
    const linhas: string[][] = [];
    parser.on('readable', () => {
      let r;
      while ((r = parser.read()) !== null) linhas.push(r as string[]);
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(linhas[0] ?? []));
    fs.createReadStream(caminho).pipe(parser);
  });
}

/* ------------------------------------------------------------------ *
 * Conversão de valores
 * ------------------------------------------------------------------ */

function escCopy(v: string | null): string {
  return v === null
    ? '\\N'
    : v.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function comoTexto(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

function comoInt(v: string | undefined): string | null {
  const s = (v ?? '').trim().replace(/\./g, '');
  return /^-?\d+$/.test(s) ? s : null;
}

function comoFloat(v: string | undefined): string | null {
  let s = (v ?? '').trim();
  if (s === '') return null;
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  else s = s.replace(/\.(?=\d{3}\b)/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
}

/* ------------------------------------------------------------------ *
 * Importação
 * ------------------------------------------------------------------ */

export interface ArquivoEntrada {
  caminho: string;
  /** Nome original — é dele que sai o parceiro. */
  nome: string;
}

export interface RelatorioArquivo {
  arquivo: string;
  parceiro: string;
  encoding: string;
  delimitador: string;
  lidos: number;
  validos: number;
  invalidos: number;
  colunasIgnoradas: string[];
  layout: 'rede' | 'antigo' | 'misto';
}

export interface ResultadoImportacao {
  baseId: number;
  particao: string;
  lidos: number;
  validos: number;
  invalidos: number;
  duplicados: number;
  enderecosMultiLote: number;
  municipios: number;
  semNumero: number;
  sha256: string;
  dtRef: string | null;
  problemas: Array<{ arquivo: string; linha: number; motivo: string }>;
  arquivos: RelatorioArquivo[];
  porStatus: Array<{ status: string; rotulo: string; qtd: number }>;
}

export interface OpcoesImportacao {
  arquivos: ArquivoEntrada[];
  operadora?: string;
  ativar?: boolean;
  onProgresso?: (lidos: number, arquivo: string) => void;
}

export async function importarBaseTim(
  op: OpcoesImportacao,
): Promise<ResultadoImportacao> {
  const operadora = op.operadora ?? 'TIM';
  if (!op.arquivos.length) throw new Error('Nenhum arquivo enviado.');

  // ---- 1. Valida TODOS os cabeçalhos antes de tocar no banco --------
  interface Preparado extends ArquivoEntrada {
    encoding: 'utf8' | 'latin1';
    delimitador: string;
    mapa: Mapeamento;
  }
  const preparados: Preparado[] = [];
  for (const a of op.arquivos) {
    const encoding = detectarEncoding(a.caminho);
    const delimitador = detectarDelimitador(lerPrimeiraLinha(a.caminho, encoding));
    const cabecalho = await lerCabecalho(a.caminho, encoding, delimitador);
    const mapa = mapearColunas(cabecalho);

    if (mapa.faltando.length) {
      throw new Error(
        `"${a.nome}" não contém as colunas obrigatórias: ${mapa.faltando.join(', ')}.`,
      );
    }
    if (mapa.semSinal) {
      throw new Error(
        `"${a.nome}" não tem nenhuma coluna de viabilidade ` +
          `(RESTRICAO_FTTH, RESTRICAO_FTTC ou VIABILIDADE). ` +
          `Sem isso não é possível responder se o endereço é viável.`,
      );
    }
    preparados.push({ ...a, encoding, delimitador, mapa });
  }

  return withClient(async (client) => {
    const bytes = op.arquivos.reduce((s, a) => s + fs.statSync(a.caminho).size, 0);
    const resumoNome =
      op.arquivos.length === 1
        ? op.arquivos[0].nome
        : `${op.arquivos.length} arquivos (${op.arquivos
            .map((a) => parceiroDoArquivo(a.nome))
            .join(', ')})`;

    const ins = await client.query<{ id: string }>(
      `INSERT INTO base_versao (operadora, arquivo_nome, arquivos, arquivo_bytes, status)
       VALUES ($1, $2, $3, $4, 'PROCESSANDO') RETURNING id`,
      [operadora, resumoNome.slice(0, 300),
       JSON.stringify(op.arquivos.map((a) => a.nome)), bytes],
    );
    const baseId = Number(ins.rows[0].id);
    const particao = `tim_endereco_p${baseId}`;

    try {
      await client.query(
        `CREATE TABLE ${particao}
           (LIKE tim_endereco INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING CONSTRAINTS)`,
      );
      await client.query(
        `ALTER TABLE ${particao} ADD CONSTRAINT ${particao}_base_ck CHECK (base_id = ${baseId})`,
      );

      const hash = crypto.createHash('sha256');
      const problemas: ResultadoImportacao['problemas'] = [];
      const relatorios: RelatorioArquivo[] = [];
      let idGlobal = 0;
      let dtRef: string | null = null;

      // ---- 2. Cada arquivo entra na MESMA partição -----------------
      for (const p of preparados) {
        const parceiro = parceiroDoArquivo(p.nome);
        let lidos = 0;
        let invalidos = 0;
        let viuRede = false;
        let viuAntigo = false;

        const leitura = fs.createReadStream(p.caminho);
        leitura.on('data', (c) => hash.update(c as Buffer));

        const parser = csvParse({
          bom: true,
          delimiter: p.delimitador,
          from_line: 2,
          relax_column_count: true,
          relax_quotes: true,
          skip_empty_lines: true,
          encoding: p.encoding as BufferEncoding,
        });

        const paraCopy = new Transform({
          writableObjectMode: true,
          transform(linha: string[], _enc, cb) {
            lidos++;
            if (op.onProgresso && lidos % 50_000 === 0) op.onProgresso(lidos, p.nome);

            const pega = (db: string) => {
              const i = p.mapa.indices[db];
              return i === undefined ? undefined : linha[i];
            };

            const cidade = comoTexto(pega('cidade'));
            const logradouro = comoTexto(pega('logradouro'));
            const cep = (pega('cep') ?? '').replace(/\D/g, '');

            if (!cidade || !logradouro || cep.length !== 8) {
              invalidos++;
              if (problemas.length < 100) {
                problemas.push({
                  arquivo: p.nome,
                  linha: lidos + 1,
                  motivo: !cidade
                    ? 'cidade vazia'
                    : !logradouro
                      ? 'logradouro vazio'
                      : `CEP inválido (${cep || 'vazio'})`,
                });
              }
              return cb();
            }

            if (pega('restricao_ftth') !== undefined || pega('restricao_fttc') !== undefined) viuRede = true;
            if (pega('viabilidade') !== undefined) viuAntigo = true;

            const data = comoTexto(pega('data_cabeamento'));
            if (data && /^\d{4}-\d{2}-\d{2}/.test(data)) {
              if (!dtRef || data > dtRef) dtRef = data.slice(0, 10);
            } else if (data && !dtRef) {
              dtRef = data;
            }

            idGlobal++;
            const campos = [
              String(baseId), String(idGlobal), escCopy(parceiro), escCopy(p.nome),
            ];
            for (const col of COLUNAS) {
              const bruto = pega(col.db);
              const v =
                col.tipo === 'int' ? comoInt(bruto)
                : col.tipo === 'float' ? comoFloat(bruto)
                : comoTexto(bruto);
              campos.push(escCopy(v));
            }

            // Colunas desconhecidas com conteúdo não são descartadas.
            const extras: Record<string, string> = {};
            for (const e of p.mapa.extras) {
              const v = comoTexto(linha[e.indice]);
              if (v !== null) extras[e.nome] = v;
            }
            campos.push(
              Object.keys(extras).length ? escCopy(JSON.stringify(extras)) : '\\N',
            );

            cb(null, campos.join('\t') + '\n');
          },
        });

        const destino = (
          client.query as unknown as (s: unknown) => NodeJS.WritableStream
        )(
          copyFrom.from(
            `COPY ${particao} (${COLUNAS_COPY.join(', ')}) FROM STDIN WITH (FORMAT text)`,
          ),
        );

        await pipeline(leitura, parser, paraCopy, destino);

        relatorios.push({
          arquivo: p.nome,
          parceiro,
          encoding: p.encoding,
          delimitador: p.delimitador,
          lidos,
          validos: lidos - invalidos,
          invalidos,
          colunasIgnoradas: p.mapa.extras.map((e) => e.nome),
          layout: viuRede && viuAntigo ? 'misto' : viuAntigo ? 'antigo' : 'rede',
        });
      }

      const sha256 = hash.digest('hex');

      // ---- 3. Índices depois da carga ------------------------------
      await client.query(`CREATE INDEX ${particao}_cep ON ${particao} (cep_norm, num_norm)`);
      await client.query(
        `CREATE INDEX ${particao}_endereco ON ${particao} (cidade_norm, logradouro_norm, num_norm)`,
      );
      await client.query(
        `CREATE INDEX ${particao}_trgm ON ${particao}
           USING gin (cidade_norm, logradouro_norm gin_trgm_ops)`,
      );
      await client.query(
        `ALTER TABLE ${particao} ADD CONSTRAINT ${particao}_pk PRIMARY KEY (base_id, id)`,
      );
      await client.query(`ANALYZE ${particao}`);

      // ---- 4. Testes de integridade --------------------------------
      const uma = async (sql: string) =>
        Number((await client.query<{ n: string }>(sql)).rows[0].n);

      const validos = await uma(`SELECT count(*)::text AS n FROM ${particao}`);
      if (validos === 0) throw new Error('Nenhum registro válido foi importado.');

      // Duplicado de verdade é o MESMO lote repetido. Vários lotes no
      // mesmo endereço são normais nesta base (prédios, condomínios) e
      // contá-los como duplicidade daria um número alarmante e falso.
      const duplicados = await uma(
        `SELECT coalesce(sum(c - 1), 0)::text AS n FROM (
           SELECT count(*) AS c FROM ${particao}
            WHERE id_lote IS NOT NULL
            GROUP BY cep_norm, num_norm, id_lote HAVING count(*) > 1) t`,
      );
      const enderecosMultiLote = await uma(
        `SELECT count(*)::text AS n FROM (
           SELECT 1 FROM ${particao}
            GROUP BY cep_norm, num_norm HAVING count(*) > 1) t`,
      );
      const semNumero = await uma(
        `SELECT count(*)::text AS n FROM ${particao} WHERE num_norm IS NULL OR num_norm = 'SN'`,
      );
      const semSinal = await uma(
        `SELECT count(*)::text AS n FROM ${particao} WHERE sinal_norm IS NULL`,
      );

      // ---- 5. Anexa e monta os agregados ---------------------------
      await client.query(
        `ALTER TABLE tim_endereco ATTACH PARTITION ${particao} FOR VALUES IN (${baseId})`,
      );
      await client.query(
        `INSERT INTO tim_municipio (base_id, uf, cidade, cidade_norm, qtd)
         SELECT $1::bigint, coalesce(uf, ''), cidade, cidade_norm, count(*)
           FROM ${particao} WHERE cidade IS NOT NULL
          GROUP BY 1, 2, 3, 4`,
        [baseId],
      );
      const municipios = await uma(
        `SELECT count(*)::text AS n FROM tim_municipio WHERE base_id = ${baseId}`,
      );

      // Distribuição por status, já com as regras aplicadas: é o número
      // que o administrador precisa ver antes de ativar a base.
      const porStatus = (
        await client.query<{ status: string; rotulo: string; qtd: string }>(
          `WITH regra AS (
             SELECT sinal_padrao, motivo_padrao, status, rotulo, prioridade
               FROM viabilidade_regra WHERE operadora = 'TIM' AND ativo
           )
           SELECT r.status, r.rotulo, count(*)::text AS qtd
             FROM ${particao} e
             CROSS JOIN LATERAL (
               SELECT status, rotulo FROM regra
                WHERE (sinal_padrao  IS NULL OR coalesce(e.sinal_norm, '')  ~ sinal_padrao)
                  AND (motivo_padrao IS NULL OR coalesce(e.motivo_norm, '') ~ motivo_padrao)
                ORDER BY prioridade LIMIT 1
             ) r
            GROUP BY r.status, r.rotulo
            ORDER BY count(*) DESC`,
        )
      ).rows.map((x: { status: string; rotulo: string; qtd: string }) => ({ status: x.status, rotulo: x.rotulo, qtd: Number(x.qtd) }));

      const lidos = relatorios.reduce((s, r) => s + r.lidos, 0);
      const invalidos = relatorios.reduce((s, r) => s + r.invalidos, 0);

      const relatorio = {
        arquivos: relatorios,
        enderecosMultiLote,
        semNumero,
        registrosSemSinal: semSinal,
        porStatus,
        problemas,
      };

      await client.query(
        `UPDATE base_versao
            SET status = 'PROCESSADA', registros_lidos = $2, registros_validos = $3,
                registros_invalidos = $4, registros_duplicados = $5,
                arquivo_sha256 = $6, dt_ref = $7, relatorio = $8, processado_em = now()
          WHERE id = $1`,
        [baseId, lidos, validos, invalidos, duplicados, sha256, dtRef,
         JSON.stringify(relatorio)],
      );

      if (op.ativar) await ativarBase(baseId);

      return {
        baseId, particao, lidos, validos, invalidos, duplicados,
        enderecosMultiLote, municipios, semNumero, sha256, dtRef,
        problemas, arquivos: relatorios, porStatus,
      };
    } catch (e) {
      // A base anterior continua no ar: nada foi trocado até aqui.
      const msg = e instanceof Error ? e.message : String(e);
      await client
        .query(`UPDATE base_versao SET status = 'ERRO', erro_mensagem = $2 WHERE id = $1`,
               [baseId, msg.slice(0, 2000)])
        .catch(() => undefined);
      await client.query(`ALTER TABLE tim_endereco DETACH PARTITION ${particao}`).catch(() => undefined);
      await client.query(`DROP TABLE IF EXISTS ${particao}`).catch(() => undefined);
      await client.query(`DELETE FROM tim_municipio WHERE base_id = $1`, [baseId]).catch(() => undefined);
      throw e;
    }
  });
}

/** Troca atômica da base ativa. A anterior vira ARQUIVADA, não é apagada. */
export async function ativarBase(baseId: number): Promise<void> {
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const b = await client.query<{ operadora: string; status: string }>(
        `SELECT operadora, status FROM base_versao WHERE id = $1 FOR UPDATE`, [baseId],
      );
      if (!b.rows.length) throw new Error('Base não encontrada.');
      if (!['PROCESSADA', 'ARQUIVADA'].includes(b.rows[0].status)) {
        throw new Error(
          `Só é possível ativar uma base com status PROCESSADA ou ARQUIVADA (atual: ${b.rows[0].status}).`,
        );
      }
      await client.query(
        `UPDATE base_versao SET status = 'ARQUIVADA' WHERE operadora = $1 AND status = 'ATIVA'`,
        [b.rows[0].operadora],
      );
      await client.query(
        `UPDATE base_versao SET status = 'ATIVA', ativado_em = now() WHERE id = $1`, [baseId],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
}

/** Remove uma base arquivada (DROP de partição: instantâneo). */
export async function descartarBase(baseId: number): Promise<void> {
  await withClient(async (client) => {
    const b = await client.query<{ status: string }>(
      `SELECT status FROM base_versao WHERE id = $1`, [baseId],
    );
    if (!b.rows.length) throw new Error('Base não encontrada.');
    if (b.rows[0].status === 'ATIVA') {
      throw new Error('Não é possível descartar a base que está ativa.');
    }
    await client
      .query(`ALTER TABLE tim_endereco DETACH PARTITION tim_endereco_p${baseId}`)
      .catch(() => undefined);
    await client.query(`DROP TABLE IF EXISTS tim_endereco_p${baseId}`);
    await client.query(`DELETE FROM tim_municipio WHERE base_id = $1`, [baseId]);
    await client.query(`DELETE FROM base_versao WHERE id = $1`, [baseId]);
  });
}
