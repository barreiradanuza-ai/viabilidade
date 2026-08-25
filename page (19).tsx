'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      const d = (await r.json()) as {
        ok?: boolean; erro?: string; papel?: 'ADMIN' | 'ATENDENTE';
      };
      if (!r.ok) {
        setErro(d.erro ?? 'Não foi possível entrar.');
        return;
      }
      // Atendente vai direto para a consulta; administrador, para o painel.
      router.push(d.papel === 'ATENDENTE' ? '/' : '/admin');
      router.refresh();
    } catch {
      setErro('Não foi possível entrar. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '40px auto' }}>
      <h1 className="titulo">Entrar</h1>
      <p className="subtitulo">Consulta de viabilidade — acesso restrito.</p>
      <form className="card" onSubmit={enviar}>
        <div className="campo" style={{ marginBottom: 14 }}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </div>
        <div className="acoes">
          <button className="botao" type="submit" disabled={carregando}>
            {carregando ? <span className="carregando" /> : 'Entrar'}
          </button>
        </div>
        {erro && <div className="aviso erro">{erro}</div>}
      </form>
    </div>
  );
}
