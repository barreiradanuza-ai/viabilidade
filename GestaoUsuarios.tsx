'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Usuario {
  id: number;
  email: string;
  nome: string;
  papel: 'ADMIN' | 'ATENDENTE';
  ativo: boolean;
  criado_em: string | null;
  ultimo_login: string | null;
}

export default function GestaoUsuarios({
  usuarios,
  meuId,
}: {
  usuarios: Usuario[];
  meuId: number;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<'ADMIN' | 'ATENDENTE'>('ATENDENTE');

  const [trocando, setTrocando] = useState<number | null>(null);
  const [novaSenha, setNovaSenha] = useState('');

  async function chamar(corpo: Record<string, unknown>, sucesso: string) {
    setOcupado(true);
    setErro(null);
    setOk(null);
    try {
      const r = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const d = (await r.json()) as { erro?: string };
      if (!r.ok) {
        setErro(d.erro ?? 'Não foi possível concluir.');
        return false;
      }
      setOk(sucesso);
      router.refresh();
      return true;
    } catch {
      setErro('Não foi possível concluir.');
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const feito = await chamar(
      { acao: 'criar', nome, email, senha, papel },
      `${nome} pode entrar agora.`,
    );
    if (feito) {
      setNome('');
      setEmail('');
      setSenha('');
      setPapel('ATENDENTE');
    }
  }

  return (
    <>
      <form className="card" onSubmit={criar} style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 17 }}>Novo usuário</h2>
        <div className="form-linha">
          <div className="campo">
            <label htmlFor="u-nome">Nome</label>
            <input id="u-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="campo">
            <label htmlFor="u-email">E-mail</label>
            <input id="u-email" type="email" autoComplete="off"
                   value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="campo">
            <label htmlFor="u-senha">Senha (mín. 10 caracteres)</label>
            <input id="u-senha" type="text" autoComplete="new-password"
                   value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          <div className="campo">
            <label htmlFor="u-papel">Perfil</label>
            <select
              id="u-papel"
              value={papel}
              onChange={(e) => setPapel(e.target.value as 'ADMIN' | 'ATENDENTE')}
              style={{
                font: 'inherit', padding: '11px 13px', borderRadius: 10,
                border: '1px solid var(--borda-forte)', background: 'var(--superficie)',
                color: 'var(--texto)',
              }}
            >
              <option value="ATENDENTE">Atendente</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
        </div>
        <div className="acoes">
          <button className="botao" type="submit" disabled={ocupado}>
            {ocupado ? <span className="carregando" /> : 'CRIAR USUÁRIO'}
          </button>
          <span className="dica" style={{ fontSize: 13, color: 'var(--texto-3)' }}>
            Anote a senha: ela não pode ser lida depois, só trocada.
          </span>
        </div>
        {erro && <div className="aviso erro">{erro}</div>}
        {ok && <div className="aviso info">{ok}</div>}
      </form>

      <div className="tabela-caixa">
        <header>{usuarios.length} usuário(s) cadastrado(s)</header>
        <div className="rolagem">
          <table style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Nome</th><th>E-mail</th><th>Perfil</th>
                <th>Último acesso</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={{ cursor: 'default', opacity: u.ativo ? 1 : 0.5 }}>
                  <td>
                    {u.nome}
                    {u.id === meuId && (
                      <span style={{ fontSize: 12, color: 'var(--texto-3)' }}> (você)</span>
                    )}
                    {!u.ativo && (
                      <div style={{ fontSize: 12, color: 'var(--vermelho)' }}>desativado</div>
                    )}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.papel}
                      disabled={ocupado || u.id === meuId}
                      onChange={(e) =>
                        chamar(
                          { acao: 'papel', id: u.id, papel: e.target.value },
                          'Perfil atualizado.',
                        )
                      }
                      style={{
                        font: 'inherit', fontSize: 13.5, padding: '5px 8px',
                        borderRadius: 8, border: '1px solid var(--borda-forte)',
                        background: 'var(--superficie)', color: 'var(--texto)',
                      }}
                    >
                      <option value="ATENDENTE">Atendente</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </td>
                  <td style={{ fontSize: 13.5, color: 'var(--texto-2)' }}>
                    {u.ultimo_login ?? 'nunca entrou'}
                  </td>
                  <td>
                    {trocando === u.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          value={novaSenha}
                          onChange={(e) => setNovaSenha(e.target.value)}
                          placeholder="nova senha"
                          style={{
                            font: 'inherit', fontSize: 13, padding: '5px 8px', width: 160,
                            borderRadius: 8, border: '1px solid var(--borda-forte)',
                            background: 'var(--superficie)', color: 'var(--texto)',
                          }}
                        />
                        <button
                          className="botao"
                          style={{ padding: '5px 12px', fontSize: 13 }}
                          disabled={ocupado}
                          onClick={async () => {
                            const feito = await chamar(
                              { acao: 'senha', id: u.id, senha: novaSenha },
                              'Senha trocada.',
                            );
                            if (feito) {
                              setTrocando(null);
                              setNovaSenha('');
                            }
                          }}
                        >
                          Salvar
                        </button>
                        <button
                          className="botao secundario"
                          style={{ padding: '5px 12px', fontSize: 13 }}
                          onClick={() => { setTrocando(null); setNovaSenha(''); }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="botao secundario"
                          style={{ padding: '5px 12px', fontSize: 13 }}
                          onClick={() => { setTrocando(u.id); setNovaSenha(''); }}
                        >
                          Trocar senha
                        </button>
                        {u.id !== meuId && (
                          <button
                            className="botao secundario"
                            style={{ padding: '5px 12px', fontSize: 13 }}
                            disabled={ocupado}
                            onClick={() =>
                              chamar(
                                { acao: 'ativo', id: u.id, ativo: !u.ativo },
                                u.ativo ? 'Usuário desativado.' : 'Usuário reativado.',
                              )
                            }
                          >
                            {u.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
