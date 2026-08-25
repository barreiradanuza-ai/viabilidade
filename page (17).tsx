import ConsultaViabilidade from '@/components/ConsultaViabilidade';
import { exigirConsulta } from '@/lib/guardas';
import { TimProvider } from '@/providers/tim';

export const dynamic = 'force-dynamic';

export default async function PaginaTim() {
  await exigirConsulta();

  const d = await TimProvider.disponivel().catch(() => ({
    ok: false,
    detalhe: 'Base indisponível no momento.',
  }));

  return (
    <>
      <h1 className="titulo">Viabilidade TIM</h1>
      <p className="subtitulo">Como deseja consultar?</p>
      <div className="linha-status">
        <span className={`pt${d.ok ? '' : ' off'}`} />
        <span>{d.detalhe}</span>
      </div>
      <ConsultaViabilidade operadora="tim" autocomplete />
    </>
  );
}
