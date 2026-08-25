import { exigirConsulta } from '@/lib/guardas';
import ConsultaViabilidade from '@/components/ConsultaViabilidade';
import { NioProvider, estadoSync } from '@/providers/nio';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function PaginaNio() {
  await exigirConsulta();

  const [d, sync] = await Promise.all([
    NioProvider.disponivel().catch(() => ({
      ok: false,
      detalhe: 'Fonte indisponível no momento.',
    })),
    env.nio.modo === 'BASE_LOCAL' ? estadoSync().catch(() => null) : Promise.resolve(null),
  ]);

  const avisos: string[] = [];
  if (sync?.desatualizada && sync.atualizadoEm) {
    avisos.push(
      `A base da NIO não é sincronizada há ${Math.floor(sync.idadeHoras ?? 0)} horas. ` +
        'O resultado pode estar desatualizado — confirme antes de fechar a venda.',
    );
  }
  if (sync?.status === 'ERRO') {
    avisos.push(
      'A última tentativa de sincronização falhou. As consultas seguem usando a base anterior.',
    );
  }

  return (
    <>
      <h1 className="titulo">Viabilidade NIO</h1>
      <p className="subtitulo">Como deseja consultar?</p>

      <div className="linha-status">
        <span className={`pt${d.ok ? '' : ' off'}`} />
        <span>{d.detalhe}</span>
      </div>

      {avisos.map((a) => (
        <div className="aviso" key={a} style={{ marginTop: 0, marginBottom: 18 }}>
          {a}
        </div>
      ))}

      <div className="aviso info" style={{ marginTop: 0, marginBottom: 20 }}>
        A fonte da NIO informa apenas o CEP — não traz número, motivo nem
        tecnologia. Por isso a resposta é somente <strong>com</strong> ou{' '}
        <strong>sem</strong> cobertura.
      </div>

      <ConsultaViabilidade operadora="nio" />
    </>
  );
}
