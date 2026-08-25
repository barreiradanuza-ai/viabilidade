import ImportarBase from '@/components/ImportarBase';

export const dynamic = 'force-dynamic';

export default function PaginaImportar() {
  return (
    <>
      <h1 className="titulo">Importar nova base TIM</h1>
      <p className="subtitulo">
        Selecione todos os CSVs de uma vez. Eles são enviados, validados,
        importados e indexados antes de qualquer troca — se algo falhar, nada é
        substituído e a base atual continua respondendo.
      </p>
      <ImportarBase />
    </>
  );
}
