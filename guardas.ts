import { redirect } from 'next/navigation';
import { sessao, type DadosSessao } from './sessao';
import { env } from './env';

/**
 * Guarda das telas de consulta. Roda no servidor, a cada requisição.
 * Com ACESSO_PUBLICO=true a consulta fica aberta; o padrão é exigir login.
 */
export async function exigirConsulta(): Promise<DadosSessao | null> {
  const s = await sessao();
  if (s.usuarioId) return s;
  if (env.acessoPublico) return null;
  redirect('/login');
}
