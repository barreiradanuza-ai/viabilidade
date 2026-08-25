import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/**
 * Guarda de verdade da área administrativa: roda no servidor, em toda
 * requisição, antes de qualquer página filha ser renderizada.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await sessao();
  if (!s.usuarioId) redirect('/login');
  // Atendente não entra aqui, nem digitando o endereço.
  if (s.papel !== 'ADMIN') redirect('/');

  return (
    <>
      <div className="topo-nav" style={{ marginBottom: 20, marginLeft: 0 }}>
        <Link href="/admin" className="ativo">Painel</Link>
        <Link href="/admin/tim">Base TIM</Link>
        <Link href="/admin/regras">Regras</Link>
        <Link href="/admin/usuarios">Usuários</Link>
        <Link href="/admin/logs">Logs</Link>
      </div>
      {children}
    </>
  );
}
