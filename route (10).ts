import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '@/lib/db';
import { sessao } from '@/lib/sessao';
import { limitar } from '@/lib/limite';
import { hashIp, ipDaRequisicao, registrarEvento } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corpo = z.object({
  email: z.string().email().max(200),
  senha: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const ipH = hashIp(ipDaRequisicao(req));

  // 8 tentativas a cada 10 minutos por origem.
  if (!limitar(`login:${ipH}`, 8, 10 * 60_000).ok) {
    return NextResponse.json(
      { erro: 'Muitas tentativas. Aguarde alguns minutos.' },
      { status: 429 },
    );
  }

  const dados = Corpo.safeParse(await req.json().catch(() => null));
  if (!dados.success) {
    return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  const u = await query<{
    id: string; email: string; nome: string; senha_hash: string;
    ativo: boolean; papel: 'ADMIN' | 'ATENDENTE';
  }>(
    `SELECT id, email, nome, senha_hash, ativo, papel FROM admin_usuario WHERE email = $1`,
    [dados.data.email.toLowerCase().trim()],
  );

  // Compara mesmo sem usuário, para não vazar quais e-mails existem.
  const hash = u[0]?.senha_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await bcrypt.compare(dados.data.senha, hash);

  if (!ok || !u.length || !u[0].ativo) {
    registrarEvento('AVISO', 'login', 'Tentativa de login sem sucesso', { ipH });
    return NextResponse.json({ erro: 'E-mail ou senha incorretos.' }, { status: 401 });
  }

  const s = await sessao();
  s.usuarioId = Number(u[0].id);
  s.email = u[0].email;
  s.nome = u[0].nome;
  s.papel = u[0].papel;
  await s.save();

  await query(`UPDATE admin_usuario SET ultimo_login = now() WHERE id = $1`, [u[0].id]);
  registrarEvento('INFO', 'login', `Login de ${u[0].email}`);

  return NextResponse.json({ ok: true, papel: u[0].papel });
}
