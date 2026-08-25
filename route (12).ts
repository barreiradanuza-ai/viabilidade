import { NextResponse } from 'next/server';
import { TimProvider } from '@/providers/tim';
import { limitar } from '@/lib/limite';
import { hashIp, ipDaRequisicao } from '@/lib/log';
import { podeConsultar } from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await podeConsultar();
  } catch {
    return NextResponse.json({ itens: [] }, { status: 401 });
  }

  const ipH = hashIp(ipDaRequisicao(req));
  if (!limitar(`ac:${ipH}`, 120, 60_000).ok) {
    return NextResponse.json({ itens: [] }, { status: 429 });
  }

  const url = new URL(req.url);
  const tipo = url.searchParams.get('tipo') ?? 'municipio';
  const termo = (url.searchParams.get('q') ?? '').slice(0, 120);
  const municipio = (url.searchParams.get('municipio') ?? '').slice(0, 120);

  try {
    if (tipo === 'logradouro') {
      const itens = await TimProvider.autocompleteLogradouro!(municipio, termo);
      return NextResponse.json({ itens });
    }
    const itens = await TimProvider.autocompleteMunicipio!(termo);
    return NextResponse.json({ itens });
  } catch {
    return NextResponse.json({ itens: [] });
  }
}
