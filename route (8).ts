import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { exigirAdmin } from '@/lib/sessao';
import { limparCacheRegras } from '@/lib/viabilidade';
import { registrarEvento } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corpo = z.object({
  id: z.number().int().positive(),
  status: z.enum(['VIAVEL', 'ANALISE', 'SEM_VIABILIDADE']).optional(),
  ativo: z.boolean().optional(),
});

const ROTULO: Record<string, string> = {
  VIAVEL: 'Viável',
  ANALISE: 'Necessita de análise',
  SEM_VIABILIDADE: 'Sem viabilidade',
};

export async function POST(req: Request) {
  let quem: string | undefined;
  try {
    quem = (await exigirAdmin()).email;
  } catch {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const p = Corpo.safeParse(await req.json().catch(() => null));
  if (!p.success || (p.data.status === undefined && p.data.ativo === undefined)) {
    return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  try {
    if (p.data.status !== undefined) {
      // O rótulo acompanha o status: é o texto que o atendente lê.
      await query(
        `UPDATE viabilidade_regra SET status = $2, rotulo = $3 WHERE id = $1`,
        [p.data.id, p.data.status, ROTULO[p.data.status]],
      );
    }
    if (p.data.ativo !== undefined) {
      await query(`UPDATE viabilidade_regra SET ativo = $2 WHERE id = $1`, [
        p.data.id,
        p.data.ativo,
      ]);
    }
    limparCacheRegras();
    registrarEvento('INFO', 'regras', `Regra #${p.data.id} alterada por ${quem}`, p.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { erro: 'Não foi possível salvar a alteração.' },
      { status: 500 },
    );
  }
}
