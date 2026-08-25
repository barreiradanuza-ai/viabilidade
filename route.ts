import { NextResponse } from 'next/server';
import { sessao } from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const s = await sessao();
  s.destroy();
  return NextResponse.json({ ok: true });
}
