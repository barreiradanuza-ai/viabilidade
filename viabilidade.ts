import { query } from './db';
import type { StatusViabilidade } from '@/providers/types';

/**
 * Camada configurável de interpretação.
 *
 * A base da TIM não traz um campo "viável": traz RESTRICAO_FTTH (Sim/Não)
 * e, quando "Sim", a descrição do impedimento. As regras que traduzem isso
 * em VIÁVEL / ANÁLISE / SEM VIABILIDADE ficam na tabela viabilidade_regra
 * e podem ser ajustadas por SQL, sem tocar em código.
 */

export interface Regra {
  prioridade: number;
  sinal_padrao: string | null;
  motivo_padrao: string | null;
  status: StatusViabilidade;
  rotulo: string;
  descricao: string | null;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { em: number; regras: Regra[] }>();

export async function regras(operadora: string): Promise<Regra[]> {
  const c = cache.get(operadora);
  if (c && Date.now() - c.em < CACHE_MS) return c.regras;
  const regras = await query<Regra>(
    `SELECT prioridade, sinal_padrao, motivo_padrao, status, rotulo, descricao
       FROM viabilidade_regra
      WHERE operadora = $1 AND ativo
      ORDER BY prioridade ASC`,
    [operadora],
  );
  cache.set(operadora, { em: Date.now(), regras });
  return regras;
}

export function limparCacheRegras() {
  cache.clear();
}

export interface Interpretacao {
  status: StatusViabilidade;
  rotulo: string;
  descricao: string;
}

const PADRAO: Interpretacao = {
  status: 'ANALISE',
  rotulo: 'Necessita de análise',
  descricao: 'Não foi possível classificar o retorno da base.',
};

/**
 * `sinal` e `motivo` são as colunas JÁ normalizadas pelo banco
 * (sinal_norm / motivo_norm), para que a regra case exatamente do mesmo
 * jeito aqui e nas contagens feitas em SQL durante a importação.
 */
export function interpretar(
  lista: Regra[],
  sinal: string | null,
  motivo: string | null,
): Interpretacao {
  const s = sinal ?? '';
  const m = motivo ?? '';
  for (const r of lista) {
    const okS = !r.sinal_padrao || new RegExp(r.sinal_padrao).test(s);
    const okM = !r.motivo_padrao || new RegExp(r.motivo_padrao).test(m);
    if (okS && okM) {
      return { status: r.status, rotulo: r.rotulo, descricao: r.descricao ?? '' };
    }
  }
  return PADRAO;
}

/** Do mais favorável ao menos: usado para resumir vários lotes num endereço. */
const ORDEM: Record<string, number> = {
  VIAVEL: 0, ANALISE: 1, SEM_VIABILIDADE: 2, NAO_ENCONTRADO: 3, INDISPONIVEL: 4,
};

export function melhor(a: Interpretacao, b: Interpretacao): Interpretacao {
  return (ORDEM[a.status] ?? 9) <= (ORDEM[b.status] ?? 9) ? a : b;
}
