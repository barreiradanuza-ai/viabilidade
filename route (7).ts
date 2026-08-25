import { NextResponse } from 'next/server';
import { z } from 'zod';
import { exigirAdmin } from '@/lib/sessao';
import { ativarBase, descartarBase } from '@/lib/importador';
import { registrarEvento } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corpo = z.object({
  acao: z.enum(['ativar', 'descartar']),
  baseId: z.number().int().positive(),
});

export async function POST(req: Request) {
  let quem: string | undefined;
  try {
    quem = (await exigirAdmin()).email;
  } catch {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const p = Corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  try {
    if (p.data.acao === 'ativar') {
      await ativarBase(p.data.baseId);
      registrarEvento('INFO', 'base', `Base #${p.data.baseId} ativada por ${quem}`);
    } else {
      await descartarBase(p.data.baseId);
      registrarEvento('INFO', 'base', `Base #${p.data.baseId} descartada por ${quem}`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'Não foi possível concluir a ação.' },
      { status: 400 },
    );
  }
}
