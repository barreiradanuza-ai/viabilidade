import { env } from '@/lib/env';
import { query } from '@/lib/db';
import { cepsPorEndereco } from '@/lib/cep-por-endereco';
import { cepFormatado, normCep, normTxt } from '@/lib/normalize';
import type {
  Candidato,
  Consulta,
  OperatorProvider,
  RespostaConsulta,
  ResultadoViabilidade,
  StatusViabilidade,
} from './types';

/**
 * ---------------------------------------------------------------------
 * NIO — camada de integração desacoplada
 * ---------------------------------------------------------------------
 * O link fornecido é um relatório Power BI "Publicar na web"
 * (app.powerbi.com/view?r=...). O parâmetro r é base64 de
 * {"k": resourceKey, "t": tenantId}: relatório ANÔNIMO, sem autenticação
 * de usuário. Não existe API pública oficial para lê-lo — a Power BI REST
 * API exige app registrado e licença no tenant DONO do relatório, que é da
 * NIO. Automatizar o relatório visualmente a cada consulta é frágil e lento.
 *
 * A saída adotada não é consultar o relatório na hora, e sim SINCRONIZAR:
 * um job (sync_nio_ceps.py) abre o relatório uma vez por dia, percorre a
 * lista de CEPs do slicer e grava tudo em `ceps_nio`. A consulta do
 * atendente vira um SELECT indexado — milissegundos, sem navegador.
 *
 * Modos, escolhidos por variável de ambiente:
 *
 *   NIO_MODO=BASE_LOCAL   -> consulta a tabela ceps_nio (o padrão hoje)
 *   NIO_MODO=API          -> consome um endpoint HTTP fornecido pela NIO,
 *                            quando e se ela liberar um. Caminho ideal.
 *   NIO_MODO=INDISPONIVEL -> a tela existe e avisa que não há fonte.
 *
 * O que a fonte da NIO NÃO entrega: número, logradouro, motivo, tecnologia.
 * O slicer só expõe CEP. Portanto a resposta é binária — e este provider
 * não finge o contrário.
 *
 * Nenhuma credencial aparece aqui nem chega ao navegador.
 * ---------------------------------------------------------------------
 */

/* ------------------------------------------------------------------ *
 * Estado do sync
 * ------------------------------------------------------------------ */

export interface EstadoSync {
  total: number;
  atualizadoEm: Date | null;
  status: string | null;
  tentadoEm: Date | null;
  erro: string | null;
  idadeHoras: number | null;
  desatualizada: boolean;
}

export async function estadoSync(): Promise<EstadoSync | null> {
  const r = await query<{
    total: number | null;
    updated_at: Date | null;
    status: string | null;
    tentado_em: Date | null;
    erro: string | null;
  }>(
    `SELECT total, updated_at, status, tentado_em, erro
       FROM nio_cache_meta WHERE id = 1`,
  ).catch(() => []);

  if (!r.length) return null;

  const atualizadoEm = r[0].updated_at ? new Date(r[0].updated_at) : null;
  const idadeHoras = atualizadoEm
    ? (Date.now() - atualizadoEm.getTime()) / 3_600_000
    : null;

  return {
    total: Number(r[0].total ?? 0),
    atualizadoEm,
    status: r[0].status,
    tentadoEm: r[0].tentado_em ? new Date(r[0].tentado_em) : null,
    erro: r[0].erro,
    idadeHoras,
    desatualizada: idadeHoras !== null && idadeHoras > env.nio.maxIdadeHoras,
  };
}

function dataCurta(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ *
 * Montagem do resultado
 * ------------------------------------------------------------------ */

function montar(
  status: StatusViabilidade,
  rotulo: string,
  descricao: string,
  cep: string,
  e: Partial<Candidato>,
  sync: EstadoSync | null,
): ResultadoViabilidade {
  const resumo: Array<{ campo: string; valor: string }> = [
    { campo: 'Operadora', valor: 'NIO' },
    { campo: 'Status', valor: rotulo },
    { campo: 'CEP', valor: cepFormatado(cep) || cep },
  ];
  if (e.bairro) resumo.push({ campo: 'Bairro', valor: e.bairro });
  if (e.municipio) resumo.push({ campo: 'Cidade', valor: e.municipio });
  if (e.uf) resumo.push({ campo: 'UF', valor: e.uf });
  resumo.push({
    campo: 'Base sincronizada em',
    valor: dataCurta(sync?.atualizadoEm ?? null),
  });

  const tecnico: Array<{ campo: string; valor: string }> = [
    { campo: 'Fonte', valor: 'Relatório Power BI da NIO (sync diário)' },
    { campo: 'Granularidade', valor: 'CEP — a fonte não informa número nem motivo' },
    { campo: 'CEPs na base', valor: (sync?.total ?? 0).toLocaleString('pt-BR') },
    { campo: 'Última tentativa de sync', valor: dataCurta(sync?.tentadoEm ?? null) },
    { campo: 'Resultado do último sync', valor: sync?.status ?? '—' },
  ];
  if (sync?.erro) tecnico.push({ campo: 'Erro do último sync', valor: sync.erro });

  return {
    operadora: 'NIO',
    status,
    rotulo,
    descricao,
    endereco: {
      ref: `nio:${cep}`,
      cep: cepFormatado(cep) || cep,
      logradouro: e.logradouro ?? null,
      numero: e.numero ?? null,
      complemento: null,
      bairro: e.bairro ?? null,
      municipio: e.municipio ?? null,
      uf: e.uf ?? null,
    },
    resumo,
    tecnico,
    dataBase: sync?.atualizadoEm ? dataCurta(sync.atualizadoEm) : null,
  };
}

const AVISO_ANTIGA =
  ' Atenção: a base da NIO não é sincronizada há mais de ' +
  '{h} horas — confirme antes de fechar.';

async function responderPorCep(
  cep: string,
  extras: Partial<Candidato>,
): Promise<RespostaConsulta> {
  const sync = await estadoSync();

  // Sem sync nenhum, não se responde "sem cobertura": responde-se que não dá
  // para saber. Um erro de infraestrutura nunca pode virar venda perdida.
  if (!sync || !sync.total) {
    return {
      tipo: 'INDISPONIVEL',
      mensagem:
        'A base de cobertura da NIO ainda não foi sincronizada. Fale com o administrador.',
    };
  }

  const achou = await query<{ cep: string }>(
    `SELECT cep FROM ceps_nio WHERE cep = $1 LIMIT 1`,
    [cep],
  );

  const antiga = sync.desatualizada
    ? AVISO_ANTIGA.replace('{h}', String(env.nio.maxIdadeHoras))
    : '';

  if (achou.length) {
    return {
      tipo: 'RESULTADO',
      resultado: montar(
        'VIAVEL',
        'Viável',
        'CEP com cobertura NIO na última sincronização.' + antiga,
        cep, extras, sync,
      ),
    };
  }

  return {
    tipo: 'RESULTADO',
    resultado: montar(
      'SEM_VIABILIDADE',
      'Sem viabilidade',
      'CEP fora da cobertura NIO na última sincronização.' + antiga,
      cep, extras, sync,
    ),
  };
}

/* ------------------------------------------------------------------ *
 * Modo API — reservado para quando a NIO liberar um endpoint
 * ------------------------------------------------------------------ */

interface RespostaApiNio {
  status?: string;
  viavel?: boolean;
  motivo?: string;
  tecnologia?: string;
  endereco?: {
    cep?: string; logradouro?: string; numero?: string;
    bairro?: string; municipio?: string; uf?: string;
  };
}

function mapearStatus(r: RespostaApiNio): { status: StatusViabilidade; rotulo: string } {
  const s = normTxt(r.status ?? '');
  if (r.viavel === true || /^(VIAVEL|DISPONIVEL|OK|SIM)$/.test(s)) {
    return { status: 'VIAVEL', rotulo: 'Viável' };
  }
  if (r.viavel === false || /^(INVIAVEL|SEM VIABILIDADE|INDISPONIVEL|NAO)$/.test(s)) {
    return { status: 'SEM_VIABILIDADE', rotulo: 'Sem viabilidade' };
  }
  return { status: 'ANALISE', rotulo: 'Necessita de análise' };
}

async function consultarApi(c: Consulta): Promise<RespostaConsulta> {
  const url = new URL(env.nio.apiUrl);
  if (c.modo === 'CEP') {
    url.searchParams.set('cep', normCep(c.cep));
    if (c.numero) url.searchParams.set('numero', c.numero);
  } else {
    url.searchParams.set('municipio', c.municipio);
    url.searchParams.set('logradouro', c.logradouro);
    if (c.numero) url.searchParams.set('numero', c.numero);
    if (c.uf) url.searchParams.set('uf', c.uf);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.nio.timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: env.nio.apiToken
        ? { Authorization: `Bearer ${env.nio.apiToken}`, Accept: 'application/json' }
        : { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const dados = (await resp.json()) as RespostaApiNio;
    const { status, rotulo } = mapearStatus(dados);
    const e = dados.endereco ?? {};
    const cep = normCep(e.cep ?? (c.modo === 'CEP' ? c.cep : ''));
    const r = montar(status, rotulo, dados.motivo ?? '', cep, {
      logradouro: e.logradouro ?? (c.modo === 'ENDERECO' ? c.logradouro : null),
      numero: e.numero ?? c.numero ?? null,
      bairro: e.bairro ?? null,
      municipio: e.municipio ?? (c.modo === 'ENDERECO' ? c.municipio : null),
      uf: e.uf ?? null,
    }, null);
    r.tecnico = dados.tecnologia
      ? [{ campo: 'Tecnologia', valor: dados.tecnologia }]
      : [];
    r.dataBase = null;
    return { tipo: 'RESULTADO', resultado: r };
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ */

export const NioProvider: OperatorProvider = {
  id: 'nio',
  nome: 'NIO',

  async disponivel() {
    if (env.nio.modo === 'API') {
      return env.nio.apiUrl
        ? { ok: true, detalhe: 'Integração por API configurada.' }
        : { ok: false, detalhe: 'NIO_MODO=API mas NIO_API_URL não foi definida.' };
    }

    if (env.nio.modo === 'BASE_LOCAL') {
      const s = await estadoSync().catch(() => null);
      if (!s || !s.total) {
        return {
          ok: false,
          detalhe:
            'Base da NIO ainda não sincronizada. Rode o job de sincronização (sync_nio_ceps.py).',
        };
      }
      const partes = [
        `${s.total.toLocaleString('pt-BR')} CEPs`,
        `sincronizado em ${dataCurta(s.atualizadoEm)}`,
      ];
      if (s.desatualizada) partes.push('base desatualizada');
      if (s.status === 'ERRO') partes.push('último sync falhou');
      return { ok: !s.desatualizada && s.status !== 'ERRO', detalhe: partes.join(' · ') };
    }

    return {
      ok: false,
      detalhe:
        'Fonte da NIO não conectada. O relatório Power BI fornecido é publicação ' +
        'anônima na web e não oferece API oficial de consulta.',
    };
  },

  async consultar(c: Consulta): Promise<RespostaConsulta> {
    try {
      if (env.nio.modo === 'API' && env.nio.apiUrl) return await consultarApi(c);

      if (env.nio.modo !== 'BASE_LOCAL') {
        const d = await NioProvider.disponivel();
        return { tipo: 'INDISPONIVEL', mensagem: d.detalhe };
      }

      /* ---- consulta por CEP: caminho direto ---- */
      if (c.modo === 'CEP') {
        const cep = normCep(c.cep);
        if (!cep) return { tipo: 'NAO_ENCONTRADO', mensagem: 'Digite um CEP válido.' };
        return await responderPorCep(cep, {});
      }

      /* ---- consulta por endereço: traduz para CEP pela base da TIM ---- */
      const enderecos = await cepsPorEndereco(c.municipio, c.logradouro, c.numero);

      if (!enderecos.length) {
        return {
          tipo: 'NAO_ENCONTRADO',
          mensagem:
            'A cobertura da NIO é consultada por CEP e este endereço não foi ' +
            'encontrado na base de endereços. Informe o CEP para consultar.',
        };
      }

      const ceps = [...new Set(enderecos.map((e) => e.cep))];

      if (ceps.length === 1) {
        const e = enderecos[0];
        return await responderPorCep(ceps[0], {
          logradouro: e.logradouro, numero: c.numero ?? e.numero,
          bairro: e.bairro, municipio: e.municipio, uf: e.uf,
        });
      }

      // Vários CEPs para o mesmo logradouro: o atendente escolhe.
      const sync = await estadoSync();
      if (!sync || !sync.total) {
        return {
          tipo: 'INDISPONIVEL',
          mensagem: 'A base de cobertura da NIO ainda não foi sincronizada.',
        };
      }
      const cobertos = new Set(
        (
          await query<{ cep: string }>(
            `SELECT cep FROM ceps_nio WHERE cep = ANY($1::text[])`,
            [ceps],
          )
        ).map((r) => r.cep),
      );

      const candidatos: Candidato[] = enderecos.map((e) => {
        const ok = cobertos.has(e.cep);
        return {
          ref: `nio:${e.cep}`,
          cep: cepFormatado(e.cep),
          logradouro: e.logradouro,
          numero: e.numero,
          complemento: null,
          bairro: e.bairro,
          municipio: e.municipio,
          uf: e.uf,
          status: ok ? 'VIAVEL' : 'SEM_VIABILIDADE',
          rotulo: ok ? 'Viável' : 'Sem viabilidade',
        };
      });

      return { tipo: 'MULTIPLOS', candidatos, total: candidatos.length };
    } catch {
      // Falha de banco ou de rede jamais vira "sem cobertura".
      return {
        tipo: 'INDISPONIVEL',
        mensagem: 'Não foi possível consultar a base da NIO neste momento.',
      };
    }
  },

  async detalhar(ref: string): Promise<RespostaConsulta> {
    const cep = normCep(ref.replace(/^nio:/, ''));
    if (!cep) {
      return { tipo: 'NAO_ENCONTRADO', mensagem: 'Endereço inválido.' };
    }
    try {
      return await responderPorCep(cep, {});
    } catch {
      return {
        tipo: 'INDISPONIVEL',
        mensagem: 'Não foi possível consultar a base da NIO neste momento.',
      };
    }
  },
};
