import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Usado pelo healthcheck da hospedagem. Confere que a aplicação responde
 * E que o banco está alcançável — um app de pé com banco fora não serve.
 */
export async function GET() {
  try {
    await query('SELECT 1');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, erro: 'banco indisponível' }, { status: 503 });
  }
}
