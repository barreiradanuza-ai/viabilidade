import { query } from '@/lib/db';
import { sessao } from '@/lib/sessao';
import { env } from '@/lib/env';
import GestaoUsuarios, { type Usuario } from '@/components/GestaoUsuarios';

export const dynamic = 'force-dynamic';

export default async function PaginaUsuarios() {
  const s = await sessao();
  const usuarios = await query<Usuario>(
    `SELECT id::int AS id, email, nome, papel, ativo,
            to_char(criado_em, 'DD/MM/YYYY') AS criado_em,
            to_char(ultimo_login, 'DD/MM/YYYY HH24:MI') AS ultimo_login
       FROM admin_usuario ORDER BY papel, nome`,
  ).catch(() => [] as Usuario[]);

  return (
    <>
      <h1 className="titulo">Usuários</h1>
      <p className="subtitulo">
        Quem pode entrar no sistema e o que cada um enxerga.
      </p>

      <div className="aviso info" style={{ marginTop: 0, marginBottom: 22 }}>
        <strong>Atendente</strong> consulta TIM e NIO e nada mais.{' '}
        <strong>Administrador</strong> também importa base, ajusta regras e
        gerencia usuários.
        {env.acessoPublico && (
          <>
            {' '}
            <strong style={{ color: 'var(--vermelho)' }}>
              Atenção: ACESSO_PUBLICO está ligado — a consulta está aberta a
              qualquer pessoa com o endereço, mesmo sem login.
            </strong>
          </>
        )}
      </div>

      <GestaoUsuarios usuarios={usuarios} meuId={s.usuarioId ?? 0} />
    </>
  );
}
