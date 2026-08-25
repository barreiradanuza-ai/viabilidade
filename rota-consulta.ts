import { NextResponse } from 'next/server';
import { z } from 'zod';
import { provider } from '@/providers';
import { cepValido } from './normalize';
import { limitar } from './limite';
import { hashIp, ipDaRequisicao, registrarConsulta } from './log';
import { podeConsultar } from './sessao';

const Entrada = z
  .object({
    modo: z.enum(['CEP', 'ENDERECO']).optional(),
    cep: z.string().max(20).optional(),
    municipio: z.string().max(120).optional(),
    logradouro: z.string().max(200).optional(),
    numero: z.string().max(20).optional(),
    uf: z.string().max(2).optional(),
    ref: z.string().max(60).optional(),
  })
  .strict();

/**
 * Handler compartilhado pelas rotas de consulta. A lógica de cada
 * operadora fica no seu provider; aqui só validamos, limitamos e logamos.
 */
export function rotaConsulta(operadoraId: string) {
  return async function GET(req: Request) {
    const t0 = Date.now();
    const ip = ipDaRequisicao(req);
    const ipH = hashIp(ip);

    let operador: string | null = null;
    try {
      operador = (await podeConsultar())?.email ?? null;
    } catch {
      return NextResponse.json(
        { erro: 'Sessão expirada. Entre novamente para consultar.' },
        { status: 401 },
      );
    }

    const lim = limitar(`consulta:${ipH}`, 60, 60_000);
    if (!lim.ok) {
      return NextResponse.json(
        { erro: 'Muitas consultas seguidas. Aguarde alguns segundos.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(lim.resetEmMs / 1000)) } },
      );
    }

    const p = provider(operadoraId);
    if (!p) {
      return NextResponse.json({ erro: 'Operadora desconhecida.' }, { status: 404 });
    }

    const url = new URL(req.url);
    const bruto = Object.fromEntries(url.searchParams.entries());
    const parse = Entrada.safeParse(bruto);
    if (!parse.success) {
      return NextResponse.json({ erro: 'Parâmetros inválidos.' }, { status: 400 });
    }
    const q = parse.data;

    try {
      // Detalhe de um endereço escolhido na lista
      if (q.ref) {
        const r = await p.detalhar(q.ref);
        return NextResponse.json(r);
      }

      const modo =
        q.modo ?? (q.cep && !q.logradouro ? 'CEP' : 'ENDERECO');

      if (modo === 'CEP') {
        if (!cepValido(q.cep)) {
          return NextResponse.json({ erro: 'Digite um CEP válido.' }, { status: 400 });
        }
        const r = await p.consultar({ modo: 'CEP', cep: q.cep!, numero: q.numero });
        registrarConsulta({
          operadora: p.nome, operador, modo: 'CEP', cep: q.cep, numero: q.numero,
          status: statusDe(r), resultados: quantos(r),
          duracaoMs: Date.now() - t0, ipHash: ipH,
        });
        return NextResponse.json(r);
      }

      if (!q.municipio?.trim() || !q.logradouro?.trim()) {
        return NextResponse.json(
          { erro: 'Informe a cidade e o logradouro.' },
          { status: 400 },
        );
      }
      const r = await p.consultar({
        modo: 'ENDERECO',
        municipio: q.municipio,
        logradouro: q.logradouro,
        numero: q.numero,
        uf: q.uf,
      });
      registrarConsulta({
        operadora: p.nome, operador, modo: 'ENDERECO', municipio: q.municipio,
        logradouro: q.logradouro, numero: q.numero,
        status: statusDe(r), resultados: quantos(r),
        duracaoMs: Date.now() - t0, ipHash: ipH,
      });
      return NextResponse.json(r);
    } catch {
      // Nada de stack trace para o atendente.
      return NextResponse.json(
        { erro: 'Não foi possível concluir a consulta neste momento.' },
        { status: 500 },
      );
    }
  };
}

function statusDe(r: { tipo: string; resultado?: { status: string } }): string {
  if (r.tipo === 'RESULTADO') return r.resultado?.status ?? 'ERRO';
  if (r.tipo === 'MULTIPLOS') return 'MULTIPLOS';
  if (r.tipo === 'NAO_ENCONTRADO') return 'NAO_ENCONTRADO';
  return 'INDISPONIVEL';
}

function quantos(r: { tipo: string; candidatos?: unknown[] }): number {
  if (r.tipo === 'RESULTADO') return 1;
  if (r.tipo === 'MULTIPLOS') return r.candidatos?.length ?? 0;
  return 0;
}
