import { query } from '@/lib/db';
import { interpretar, melhor, regras, type Interpretacao } from '@/lib/viabilidade';
import { cepFormatado, normLogradouro, normNum, normTxt } from '@/lib/normalize';
import type {
  Candidato, Consulta, Endereco, OperatorProvider,
  RespostaConsulta, ResultadoViabilidade,
} from './types';

const LIMITE_ENDERECOS = 50;
const LIMITE_LOTES = 400;

/** Uma linha do CSV = um LOTE. Um endereço pode ter vários. */
interface Lote {
  base_id: string;
  id: string;
  parceiro: string | null;
  uf: string | null;
  cidade: string | null;
  bairro: string | null;
  cep: string | null;
  cep_norm: string | null;
  logradouro: string | null;
  numero: string | null;
  num_norm: string | null;
  complemento: string | null;
  id_lote: string | null;
  indicador: string | null;
  hh: number | null;
  topologia: string | null;
  data_cabeamento: string | null;
  predio_ftth: string | null;
  restricao_ftth: string | null;
  descricao_restricao_ftth: string | null;
  olt_ftth: string | null;
  caixa_olt_ftth: string | null;
  vagos_caixa_ftth: number | null;
  ocupados_caixa_ftth: number | null;
  segmento_ftth: string | null;
  restricao_fttc: string | null;
  descricao_restricao_fttc: string | null;
  msan_fttc: string | null;
  vagos_caixa_fttc: number | null;
  segmento_fttc: string | null;
  quadra_real: string | null;
  lote_real: string | null;
  cep_num: string | null;
  viabilidade: string | null;
  motivo: string | null;
  sinal_norm: string | null;
  motivo_norm: string | null;
  tecnologia: string | null;
}

const CAMPOS = `
  base_id, id, parceiro, uf, cidade, bairro, cep, cep_norm, logradouro, numero,
  num_norm, complemento, id_lote, indicador, hh, topologia, data_cabeamento,
  predio_ftth, restricao_ftth, descricao_restricao_ftth, olt_ftth, caixa_olt_ftth,
  vagos_caixa_ftth, ocupados_caixa_ftth, segmento_ftth, restricao_fttc,
  descricao_restricao_fttc, msan_fttc, vagos_caixa_fttc, segmento_fttc,
  quadra_real, lote_real, cep_num, viabilidade, motivo,
  sinal_norm, motivo_norm, tecnologia`;

export async function baseAtiva(): Promise<{
  id: number; dt_ref: string | null; registros: number; ativado_em: string | null;
} | null> {
  const r = await query<{
    id: string; dt_ref: string | null; registros_validos: string; ativado_em: string | null;
  }>(
    `SELECT id, dt_ref, registros_validos, ativado_em
       FROM base_versao WHERE operadora = 'TIM' AND status = 'ATIVA' LIMIT 1`,
  );
  if (!r.length) return null;
  return {
    id: Number(r[0].id),
    dt_ref: r[0].dt_ref,
    registros: Number(r[0].registros_validos),
    ativado_em: r[0].ativado_em,
  };
}

/* ------------------------------------------------------------------ *
 * Agrupamento por endereço
 *
 * A base é por lote: 10.403 endereços do arquivo analisado têm mais de um
 * lote, e em 89 deles os lotes divergem no status. Devolver "o primeiro
 * que apareceu" seria sorteio. Aqui os lotes do mesmo endereço são
 * agrupados e o status mais favorável prevalece — se existe um lote sem
 * restrição no endereço, há como instalar —, e a contagem aparece para o
 * atendente saber que houve divergência.
 * ------------------------------------------------------------------ */

interface Grupo {
  chave: string;
  lotes: Lote[];
  interpretacao: Interpretacao;
  viaveis: number;
}

function chaveDe(l: Lote): string {
  return `${l.cep_norm ?? ''}|${l.num_norm ?? ''}`;
}

async function agrupar(lotes: Lote[]): Promise<Grupo[]> {
  const lista = await regras('TIM');
  const mapa = new Map<string, Grupo>();

  for (const l of lotes) {
    const chave = chaveDe(l);
    const i = interpretar(lista, l.sinal_norm, l.motivo_norm);
    const g = mapa.get(chave);
    if (!g) {
      mapa.set(chave, {
        chave, lotes: [l], interpretacao: i, viaveis: i.status === 'VIAVEL' ? 1 : 0,
      });
    } else {
      g.lotes.push(l);
      g.interpretacao = melhor(g.interpretacao, i);
      if (i.status === 'VIAVEL') g.viaveis++;
    }
  }
  return [...mapa.values()];
}

function endereco(g: Grupo): Endereco {
  const l = g.lotes[0];
  return {
    ref: `${l.base_id}|${l.cep_norm ?? ''}|${l.num_norm ?? ''}`,
    cep: cepFormatado(l.cep) || l.cep,
    logradouro: l.logradouro,
    numero: l.numero,
    complemento: l.complemento,
    bairro: l.bairro,
    municipio: l.cidade,
    uf: l.uf,
  };
}

function campo(rotulo: string, valor: unknown) {
  return valor === null || valor === undefined || valor === ''
    ? null
    : { campo: rotulo, valor: String(valor) };
}

function unicos(vals: Array<string | null>): string {
  const s = [...new Set(vals.filter((v): v is string => !!v))];
  return s.join(', ');
}

async function montarResultado(g: Grupo, base: { dt_ref: string | null }): Promise<ResultadoViabilidade> {
  const l = g.lotes[0];
  const i = g.interpretacao;
  const varios = g.lotes.length > 1;

  // Motivo mostrado: o do lote que define o status, não o de um qualquer.
  const listaRegras = await regras('TIM');
  const decisivo =
    g.lotes.find(
      (x) => interpretar(listaRegras, x.sinal_norm, x.motivo_norm).status === i.status,
    ) ?? l;

  const resumo = [
    campo('Operadora', 'TIM'),
    campo('Status', i.rotulo),
    campo(
      'Restrição',
      decisivo.descricao_restricao_ftth ??
        decisivo.descricao_restricao_fttc ??
        decisivo.motivo ??
        (i.status === 'VIAVEL' ? 'Nenhuma' : null),
    ),
    campo('Tecnologia', unicos(g.lotes.map((x) => x.tecnologia))),
    campo('Tipo de imóvel', unicos(g.lotes.map((x) => x.indicador))),
    campo('Bairro', l.bairro),
    campo('Cidade', l.cidade),
    campo('UF', l.uf),
    varios
      ? campo('Lotes no endereço', `${g.lotes.length} (${g.viaveis} sem restrição)`)
      : null,
    campo('Cabeamento', unicos(g.lotes.map((x) => x.data_cabeamento))),
  ].filter(Boolean) as Array<{ campo: string; valor: string }>;

  const tecnico = [
    campo('ID do lote', unicos(g.lotes.map((x) => x.id_lote)).slice(0, 300)),
    campo('Parceiro/rede', unicos(g.lotes.map((x) => x.parceiro))),
    campo('OLT FTTH', unicos(g.lotes.map((x) => x.olt_ftth))),
    campo('Segmento FTTH', unicos(g.lotes.map((x) => x.segmento_ftth))),
    campo('Caixa OLT', unicos(g.lotes.map((x) => x.caixa_olt_ftth))),
    campo('Portas vagas (FTTH)', unicos(g.lotes.map((x) =>
      x.vagos_caixa_ftth === null ? null : String(x.vagos_caixa_ftth)))),
    campo('Portas ocupadas (FTTH)', unicos(g.lotes.map((x) =>
      x.ocupados_caixa_ftth === null ? null : String(x.ocupados_caixa_ftth)))),
    campo('MSAN FTTC', unicos(g.lotes.map((x) => x.msan_fttc))),
    campo('Segmento FTTC', unicos(g.lotes.map((x) => x.segmento_fttc))),
    campo('Prédio FTTH', unicos(g.lotes.map((x) => x.predio_ftth))),
    campo('Topologia', unicos(g.lotes.map((x) => x.topologia))),
    campo('Domicílios (HH)', g.lotes.reduce((s, x) => s + (x.hh ?? 0), 0) || null),
    campo('Quadra / lote', [l.quadra_real, l.lote_real].filter(Boolean).join(' / ')),
    campo('CEP_NUM', unicos(g.lotes.map((x) => x.cep_num)).slice(0, 200)),
    campo('RESTRICAO_FTTH (bruto)', unicos(g.lotes.map((x) => x.restricao_ftth))),
    campo('RESTRICAO_FTTC (bruto)', unicos(g.lotes.map((x) => x.restricao_fttc))),
    campo('VIABILIDADE (layout antigo)', unicos(g.lotes.map((x) => x.viabilidade))),
    campo('Data da base', base.dt_ref),
  ].filter(Boolean) as Array<{ campo: string; valor: string }>;

  return {
    operadora: 'TIM',
    status: i.status,
    rotulo: i.rotulo,
    descricao: i.descricao,
    endereco: endereco(g),
    resumo,
    tecnico,
    dataBase: base.dt_ref,
  };
}

function candidatos(grupos: Grupo[]): Candidato[] {
  return grupos.map((g) => ({
    ...endereco(g),
    status: g.interpretacao.status,
    rotulo: g.interpretacao.rotulo,
  }));
}

/** Ordena por número, com "SN" (sem número) por último. */
const ORDEM_SQL = `
  ORDER BY (num_norm = 'SN') ASC,
           nullif(regexp_replace(coalesce(num_norm,''),'\\D','','g'),'')::bigint NULLS LAST,
           num_norm NULLS LAST`;

async function resolverCidade(baseId: number, cidade: string): Promise<string | null> {
  const exato = await query<{ cidade_norm: string }>(
    `SELECT cidade_norm FROM tim_municipio WHERE base_id = $1 AND cidade_norm = $2 LIMIT 1`,
    [baseId, cidade],
  );
  if (exato.length) return exato[0].cidade_norm;
  const parecido = await query<{ cidade_norm: string }>(
    `SELECT cidade_norm FROM tim_municipio
      WHERE base_id = $1 AND cidade_norm % $2
      ORDER BY similarity(cidade_norm, $2) DESC, qtd DESC LIMIT 1`,
    [baseId, cidade],
  );
  return parecido.length ? parecido[0].cidade_norm : null;
}

export const TimProvider: OperatorProvider = {
  id: 'tim',
  nome: 'TIM',

  async disponivel() {
    const b = await baseAtiva();
    return b
      ? {
          ok: true,
          detalhe: `Base #${b.id}${b.dt_ref ? ` (${b.dt_ref})` : ''} — ${b.registros.toLocaleString('pt-BR')} lotes`,
        }
      : { ok: false, detalhe: 'Nenhuma base TIM ativa. Importe uma base em /admin/tim.' };
  },

  async consultar(c: Consulta): Promise<RespostaConsulta> {
    const base = await baseAtiva();
    if (!base) {
      return {
        tipo: 'INDISPONIVEL',
        mensagem: 'A base da TIM ainda não foi carregada. Fale com o administrador.',
      };
    }

    const numero = normNum(c.numero ?? '');
    let lotes: Lote[] = [];
    let escopo: { cep?: string; cidade?: string; logradouro?: string } = {};

    if (c.modo === 'CEP') {
      const cep = (c.cep ?? '').replace(/\D/g, '');
      if (cep.length !== 8) {
        return { tipo: 'NAO_ENCONTRADO', mensagem: 'Digite um CEP válido.' };
      }
      escopo = { cep };
      lotes = await query<Lote>(
        `SELECT ${CAMPOS} FROM tim_endereco
          WHERE base_id = $1 AND cep_norm = $2 ${ORDEM_SQL} LIMIT ${LIMITE_LOTES}`,
        [base.id, cep],
      );
    } else {
      const cidadeDigitada = normTxt(c.municipio);
      const logradouro = normLogradouro(c.logradouro);
      if (!cidadeDigitada || !logradouro) {
        return { tipo: 'NAO_ENCONTRADO', mensagem: 'Informe a cidade e o logradouro.' };
      }
      const cidade = await resolverCidade(base.id, cidadeDigitada);
      if (!cidade) {
        return {
          tipo: 'NAO_ENCONTRADO',
          mensagem: `A cidade "${c.municipio}" não existe na base da TIM.`,
        };
      }
      escopo = { cidade, logradouro };

      lotes = await query<Lote>(
        `SELECT ${CAMPOS} FROM tim_endereco
          WHERE base_id = $1 AND cidade_norm = $2 AND logradouro_norm = $3
          ${ORDEM_SQL} LIMIT ${LIMITE_LOTES}`,
        [base.id, cidade, logradouro],
      );

      // Sem correspondência exata: tenta por semelhança (erro de digitação).
      if (!lotes.length) {
        lotes = await query<Lote>(
          `SELECT ${CAMPOS} FROM tim_endereco
            WHERE base_id = $1 AND cidade_norm = $2 AND logradouro_norm % $3
            ORDER BY similarity(logradouro_norm, $3) DESC LIMIT ${LIMITE_LOTES}`,
          [base.id, cidade, logradouro],
        );
      }
    }

    if (!lotes.length) {
      return {
        tipo: 'NAO_ENCONTRADO',
        mensagem: 'Nenhum endereço encontrado na base da TIM.',
      };
    }

    const grupos = await agrupar(lotes);

    if (numero) {
      const exatos = grupos.filter((g) => g.lotes[0].num_norm === numero);
      if (exatos.length === 1) {
        return { tipo: 'RESULTADO', resultado: await montarResultado(exatos[0], base) };
      }
      if (exatos.length > 1) {
        return {
          tipo: 'MULTIPLOS',
          candidatos: candidatos(exatos.slice(0, LIMITE_ENDERECOS)),
          total: exatos.length,
        };
      }

      // Número não achado. A base registra 2.313 imóveis como "SN" (sem
      // número); ignorar isso devolveria "não encontrado" para endereços
      // que existem. Então oferecemos os lotes S/N do mesmo logradouro.
      const sn = grupos.filter((g) => g.lotes[0].num_norm === 'SN');
      const outros = grupos.filter((g) => g.lotes[0].num_norm !== 'SN');
      const lista = [...sn, ...outros].slice(0, LIMITE_ENDERECOS);
      return {
        tipo: 'MULTIPLOS',
        candidatos: candidatos(lista),
        total: grupos.length,
        aviso: sn.length
          ? `O número ${c.numero} não está na base. Há ${sn.length} lote(s) sem número (S/N) neste logradouro — confira se é o caso.`
          : `O número ${c.numero} não está na base. Veja os endereços cadastrados neste logradouro.`,
      };
    }

    if (grupos.length === 1) {
      return { tipo: 'RESULTADO', resultado: await montarResultado(grupos[0], base) };
    }

    void escopo;
    return {
      tipo: 'MULTIPLOS',
      candidatos: candidatos(grupos.slice(0, LIMITE_ENDERECOS)),
      total: grupos.length,
    };
  },

  async detalhar(ref: string): Promise<RespostaConsulta> {
    const [b, cep, num] = ref.split('|');
    if (!/^\d+$/.test(b ?? '')) {
      return { tipo: 'NAO_ENCONTRADO', mensagem: 'Endereço inválido.' };
    }
    const base = await baseAtiva();
    if (!base) {
      return { tipo: 'INDISPONIVEL', mensagem: 'A base da TIM não está disponível.' };
    }
    const lotes = await query<Lote>(
      `SELECT ${CAMPOS} FROM tim_endereco
        WHERE base_id = $1 AND cep_norm = $2
          AND coalesce(num_norm, '') = $3
        LIMIT ${LIMITE_LOTES}`,
      [Number(b), cep ?? '', num ?? ''],
    );
    if (!lotes.length) {
      return { tipo: 'NAO_ENCONTRADO', mensagem: 'Endereço não encontrado.' };
    }
    const grupos = await agrupar(lotes);
    return { tipo: 'RESULTADO', resultado: await montarResultado(grupos[0], base) };
  },

  async autocompleteMunicipio(termo: string) {
    const base = await baseAtiva();
    const t = normTxt(termo);
    if (!base || t.length < 3) return [];
    const r = await query<{ cidade: string; uf: string }>(
      `SELECT cidade, uf FROM tim_municipio
        WHERE base_id = $1 AND cidade_norm LIKE $2 || '%'
        ORDER BY qtd DESC LIMIT 10`,
      [base.id, t],
    );
    return r.map((x) => ({ municipio: x.cidade, uf: x.uf }));
  },

  async autocompleteLogradouro(municipio: string, termo: string) {
    const base = await baseAtiva();
    const m = normTxt(municipio);
    const t = normLogradouro(termo);
    if (!base || !m || t.length < 3) return [];
    return query<{ logradouro: string; bairro: string | null }>(
      `SELECT DISTINCT ON (logradouro_norm) logradouro, bairro
         FROM tim_endereco
        WHERE base_id = $1 AND cidade_norm = $2 AND logradouro_norm LIKE $3 || '%'
        ORDER BY logradouro_norm LIMIT 10`,
      [base.id, m, t],
    );
  },
};
