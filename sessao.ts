import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { env } from './env';

export type Papel = 'ADMIN' | 'ATENDENTE';

export interface DadosSessao {
  usuarioId?: number;
  email?: string;
  nome?: string;
  papel?: Papel;
}

function opcoes(): SessionOptions {
  return {
    password: env.sessionSecret,
    cookieName: 'viab_sessao',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      path: '/',
      maxAge: 60 * 60 * 12,
    },
  };
}

export async function sessao(): Promise<IronSession<DadosSessao>> {
  return getIronSession<DadosSessao>(await cookies(), opcoes());
}

export class NaoAutorizado extends Error {
  constructor(msg = 'Não autorizado.') {
    super(msg);
    this.name = 'NaoAutorizado';
  }
}

/** Exige sessão de administrador. */
export async function exigirAdmin(): Promise<DadosSessao> {
  const s = await sessao();
  if (!s.usuarioId) throw new NaoAutorizado();
  if (s.papel !== 'ADMIN') throw new NaoAutorizado('Acesso restrito a administradores.');
  return s;
}

/** Exige qualquer usuário logado (admin ou atendente). */
export async function exigirUsuario(): Promise<DadosSessao> {
  const s = await sessao();
  if (!s.usuarioId) throw new NaoAutorizado();
  return s;
}

/**
 * Quem pode consultar. Com ACESSO_PUBLICO=true a consulta fica aberta —
 * só faça isso se a base de cobertura puder ser vista por qualquer um.
 * O padrão é fechado.
 */
export async function podeConsultar(): Promise<DadosSessao | null> {
  const s = await sessao();
  if (s.usuarioId) return s;
  if (env.acessoPublico) return null;
  throw new NaoAutorizado();
}
