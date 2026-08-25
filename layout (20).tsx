import type { Metadata } from 'next';
import Link from 'next/link';
import { sessao } from '@/lib/sessao';
import Sair from '@/components/Sair';
import './globals.css';

export const metadata: Metadata = {
  title: 'Consulta de Viabilidade',
  description: 'Central de consulta de viabilidade de internet residencial.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await sessao();
  const logado = Boolean(s.usuarioId);
  const admin = s.papel === 'ADMIN';

  return (
    <html lang="pt-BR">
      <body>
        <div className="casca">
          <header className="topo">
            <div className="topo-int">
              <Link href="/" className="marca-logo">
                <span className="marca-ponto">V</span>
                <span>Consulta de Viabilidade</span>
              </Link>
              <nav className="topo-nav">
                {logado && (
                  <>
                    <Link href="/tim">TIM</Link>
                    <Link href="/nio">NIO</Link>
                    {admin && <Link href="/admin">Administração</Link>}
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--texto-3)',
                        padding: '0 4px 0 8px',
                      }}
                    >
                      {s.nome}
                    </span>
                    <Sair />
                  </>
                )}
                {!logado && <Link href="/login">Entrar</Link>}
              </nav>
            </div>
          </header>
          <main>{children}</main>
          <footer className="rodape">
            Consulta de viabilidade — uso interno.
          </footer>
        </div>
      </body>
    </html>
  );
}
