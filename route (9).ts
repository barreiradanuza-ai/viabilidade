import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '@/lib/db';
import { exigirAdmin } from '@/lib/sessao';
import { registrarEvento } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corpo = z.discriminatedUnion('acao', [
  z.object({
    acao: z.literal('criar'),
    email: z.string().email().max(200),
    nome: z.string().min(2).max(120),
    senha: z.string().min(10).max(200),
    papel: z.enum(['ADMIN', 'ATENDENTE']),
  }),
  z.object({
    acao: z.literal('senha'),
    id: z.number().int().positive(),
    senha: z.string().min(10).max(200),
  }),
  z.object({
    acao: z.literal('ativo'),
    id: z.number().int().positive(),
    ativo: z.boolean(),
  }),
  z.object({
    acao: z.literal('papel'),
    id: z.number().int().positive(),
    papel: z.enum(['ADMIN', 'ATENDENTE']),
  }),
]);

/** Nunca deixar a instalação sem nenhum administrador ativo. */
async function sobraAdmin(idExcluido: number): Promise<boolean> {
  const r = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM admin_usuario
      WHERE ativo AND papel = 'ADMIN' AND id <> $1`,
    [idExcluido],
  );
  return Number(r[0].n) > 0;
}

export async function POST(req: Request) {
  let eu: { usuarioId?: number; email?: string };
  try {
    eu = await exigirAdmin();
  } catch {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const p = Corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    // Mensagem por campo: "dados inválidos" não diz o que corrigir.
    const campos = new Set(p.error.issues.flatMap((i) => i.path.map(String)));
    const erro = campos.has('senha')
      ? 'A senha precisa ter pelo menos 10 caracteres.'
      : campos.has('email')
        ? 'Informe um e-mail válido.'
        : campos.has('nome')
          ? 'Informe o nome completo (pelo menos 2 caracteres).'
          : campos.has('papel')
            ? 'Perfil precisa ser Atendente ou Administrador.'
            : 'Dados inválidos.';
    return NextResponse.json({ erro }, { status: 400 });
  }
  const d = p.data;

  try {
    if (d.acao === 'criar') {
      const existe = await query<{ id: string }>(
        `SELECT id FROM admin_usuario WHERE email = $1`,
        [d.email.toLowerCase().trim()],
      );
      if (existe.length) {
        return NextResponse.json(
          { erro: 'Já existe um usuário com esse e-mail.' },
          { status: 409 },
        );
      }
      const hash = await bcrypt.hash(d.senha, 12);
      await query(
        `INSERT INTO admin_usuario (email, nome, senha_hash, papel)
         VALUES ($1, $2, $3, $4)`,
        [d.email.toLowerCase().trim(), d.nome.trim(), hash, d.papel],
      );
      registrarEvento('INFO', 'usuarios', `${eu.email} criou ${d.email} (${d.papel})`);
      return NextResponse.json({ ok: true });
    }

    if (d.acao === 'senha') {
      const hash = await bcrypt.hash(d.senha, 12);
      await query(`UPDATE admin_usuario SET senha_hash = $2 WHERE id = $1`, [d.id, hash]);
      registrarEvento('INFO', 'usuarios', `${eu.email} trocou a senha do usuário #${d.id}`);
      return NextResponse.json({ ok: true });
    }

    if (d.acao === 'ativo') {
      if (!d.ativo) {
        if (d.id === eu.usuarioId) {
          return NextResponse.json(
            { erro: 'Você não pode desativar a própria conta.' },
            { status: 400 },
          );
        }
        if (!(await sobraAdmin(d.id))) {
          return NextResponse.json(
            { erro: 'Precisa sobrar pelo menos um administrador ativo.' },
            { status: 400 },
          );
        }
      }
      await query(`UPDATE admin_usuario SET ativo = $2 WHERE id = $1`, [d.id, d.ativo]);
      registrarEvento(
        'INFO', 'usuarios',
        `${eu.email} ${d.ativo ? 'reativou' : 'desativou'} o usuário #${d.id}`,
      );
      return NextResponse.json({ ok: true });
    }

    // acao === 'papel'
    if (d.papel === 'ATENDENTE' && !(await sobraAdmin(d.id))) {
      return NextResponse.json(
        { erro: 'Precisa sobrar pelo menos um administrador ativo.' },
        { status: 400 },
      );
    }
    await query(`UPDATE admin_usuario SET papel = $2 WHERE id = $1`, [d.id, d.papel]);
    registrarEvento('INFO', 'usuarios', `${eu.email} mudou o perfil do usuário #${d.id} para ${d.papel}`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { erro: 'Não foi possível concluir a operação.' },
      { status: 500 },
    );
  }
}
