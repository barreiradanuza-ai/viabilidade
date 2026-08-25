import Link from 'next/link';
import { exigirConsulta } from '@/lib/guardas';
import { TimProvider } from '@/providers/tim';
import { NioProvider } from '@/providers/nio';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await exigirConsulta();

  const [tim, nio] = await Promise.all([
    TimProvider.disponivel().catch(() => ({ ok: false, detalhe: 'Indisponível.' })),
    NioProvider.disponivel().catch(() => ({ ok: false, detalhe: 'Indisponível.' })),
  ]);

  return (
    <>
      <h1 className="titulo">Consulta de viabilidade</h1>
      <p className="subtitulo">
        Escolha a operadora, informe o endereço e receba o resultado na hora.
      </p>

      <div className="cards">
        <Link href="/tim" className="card card-op">
          <span className="op-sigla">TIM</span>
          <h2>Consultar TIM</h2>
          <p>Base própria de cobertura, atualizada por importação de arquivo.</p>
          <div className="linha-status" style={{ marginTop: 14, marginBottom: 0 }}>
            <span className={`pt${tim.ok ? '' : ' off'}`} />
            <span>{tim.detalhe}</span>
          </div>
          <div className="seta">Consultar →</div>
        </Link>

        <Link href="/nio" className="card card-op">
          <span className="op-sigla nio">NIO</span>
          <h2>Consultar NIO</h2>
          <p>Consulta à fonte de cobertura da NIO.</p>
          <div className="linha-status" style={{ marginTop: 14, marginBottom: 0 }}>
            <span className={`pt${nio.ok ? '' : ' off'}`} />
            <span>{nio.detalhe}</span>
          </div>
          <div className="seta">Consultar →</div>
        </Link>
      </div>

      <p style={{ marginTop: 28, fontSize: 14 }}>
        <Link href="/admin" style={{ color: 'var(--texto-3)' }}>
          Administração
        </Link>
      </p>
    </>
  );
}
