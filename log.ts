import crypto from 'node:crypto';
import { query } from './db';
import { env } from './env';

/** IPs são gravados como hash: serve para rate limit e auditoria, não identifica. */
export function hashIp(ip: string): string {
  return crypto
    .createHmac('sha256', env.sessionSecret)
    .update(ip)
    .digest('hex')
    .slice(0, 32);
}

export function ipDaRequisicao(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'desconhecido'
  );
}

export interface RegistroConsulta {
  operadora: string;
  operador?: string | null;
  modo: string;
  cep?: string | null;
  municipio?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  status: string;
  resultados: number;
  duracaoMs: number;
  ipHash: string;
}

/** Nunca bloqueia a resposta ao atendente: falha de log não é falha de consulta. */
export function registrarConsulta(r: RegistroConsulta): void {
  void query(
    `INSERT INTO consulta_log
       (operadora, operador, modo, cep, municipio, logradouro, numero,
        status, resultados, duracao_ms, ip_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      r.operadora, r.operador ?? null, r.modo, r.cep ?? null, r.municipio ?? null,
      r.logradouro ?? null, r.numero ?? null, r.status, r.resultados,
      r.duracaoMs, r.ipHash,
    ],
  ).catch(() => undefined);
}

export function registrarEvento(
  nivel: 'INFO' | 'AVISO' | 'ERRO',
  origem: string,
  mensagem: string,
  detalhe?: unknown,
): void {
  void query(
    `INSERT INTO evento_log (nivel, origem, mensagem, detalhe) VALUES ($1,$2,$3,$4)`,
    [nivel, origem, mensagem.slice(0, 2000), detalhe ? JSON.stringify(detalhe) : null],
  ).catch(() => undefined);
}
