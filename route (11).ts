import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from '@/lib/env';
import { exigirAdmin } from '@/lib/sessao';
import { importarBaseTim } from '@/lib/importador';
import { registrarEvento } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

/**
 * A base da TIM vem em vários arquivos (um por parceiro/estado), e juntos
 * eles formam UMA base. O envio é em duas etapas:
 *
 *   POST ?acao=upload&sessao=<id>&nome=<arquivo.csv>   corpo = o arquivo
 *   POST ?acao=processar&sessao=<id>                   importa tudo junto
 *
 * O arquivo vai como corpo bruto (não multipart), então é gravado em disco
 * por streaming — sem carregar 150 MB na memória do servidor e sem o CSV
 * passar pelo navegador.
 */

/** Só aceita id de sessão no formato esperado: evita subir de diretório. */
function pastaDaSessao(sessao: string | null): string {
  if (!sessao || !/^[a-z0-9-]{8,64}$/i.test(sessao)) {
    throw new Error('Sessão de upload inválida.');
  }
  return path.join(env.uploadDir, `sessao-${sessao}`);
}

/**
 * Mantém o nome que a TIM usa — inclusive o travessão de
 * "Rede TIM – Parceiro IHSsc.csv", que é de onde sai o nome do parceiro —
 * e tira só o que é perigoso num caminho de arquivo.
 */
function nomeSeguro(bruto: string): string {
  const base = path.basename(bruto)
    // separadores de caminho, curingas e caracteres proibidos no Windows
    .replace(/[/\\:*?"<>|]/g, '_')
    // caracteres de controle
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return (base || 'base.csv').slice(0, 160);
}

export async function POST(req: Request) {
  try {
    await exigirAdmin();
  } catch {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const url = new URL(req.url);
  const acao = url.searchParams.get('acao') ?? 'upload';

  let pasta: string;
  try {
    pasta = pastaDaSessao(url.searchParams.get('sessao'));
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'Sessão inválida.' },
      { status: 400 },
    );
  }

  /* ---------------- envio de um arquivo ---------------- */
  if (acao === 'upload') {
    const nome = nomeSeguro(url.searchParams.get('nome') ?? 'base.csv');
    if (!/\.(csv|txt)$/i.test(nome)) {
      return NextResponse.json({ erro: 'Envie arquivos .csv.' }, { status: 400 });
    }

    const tamanho = Number(req.headers.get('content-length') ?? '0');
    if (tamanho > env.uploadMaxBytes) {
      return NextResponse.json(
        {
          erro: `"${nome}" é maior que o limite de ${Math.round(
            env.uploadMaxBytes / 1024 / 1024,
          )} MB.`,
        },
        { status: 413 },
      );
    }
    if (!req.body) {
      return NextResponse.json({ erro: `"${nome}" chegou vazio.` }, { status: 400 });
    }

    fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
    const destino = path.join(pasta, nome);
    try {
      await pipeline(
        Readable.fromWeb(req.body as never),
        fs.createWriteStream(destino, { mode: 0o600 }),
      );
      return NextResponse.json({ ok: true, nome, bytes: fs.statSync(destino).size });
    } catch {
      fs.rm(destino, { force: true }, () => undefined);
      return NextResponse.json({ erro: `Falha ao receber "${nome}".` }, { status: 500 });
    }
  }

  /* ---------------- processamento do conjunto ---------------- */
  if (acao === 'processar') {
    if (!fs.existsSync(pasta)) {
      return NextResponse.json({ erro: 'Nenhum arquivo foi enviado.' }, { status: 400 });
    }
    const arquivos = fs
      .readdirSync(pasta)
      .filter((f) => /\.(csv|txt)$/i.test(f))
      .sort()
      .map((f) => ({ caminho: path.join(pasta, f), nome: f }));

    if (!arquivos.length) {
      return NextResponse.json({ erro: 'Nenhum arquivo foi enviado.' }, { status: 400 });
    }

    try {
      const r = await importarBaseTim({ arquivos, ativar: false });
      registrarEvento('INFO', 'importacao', `Base #${r.baseId} processada`, {
        arquivos: arquivos.map((a) => a.nome),
        validos: r.validos,
      });
      return NextResponse.json({ ok: true, resultado: r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao processar os arquivos.';
      registrarEvento('ERRO', 'importacao', msg, {
        arquivos: arquivos.map((a) => a.nome),
      });
      return NextResponse.json(
        { erro: msg, aviso: 'A base anterior continua ativa.' },
        { status: 400 },
      );
    } finally {
      fs.rm(pasta, { recursive: true, force: true }, () => undefined);
    }
  }

  return NextResponse.json({ erro: 'Ação desconhecida.' }, { status: 400 });
}
