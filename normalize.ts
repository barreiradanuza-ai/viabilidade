/**
 * Espelho em TypeScript das funções norm_* do PostgreSQL
 * (prisma/sql/001_schema.sql). A entrada do usuário é normalizada aqui
 * antes de ser comparada com as colunas normalizadas do banco — as duas
 * implementações precisam produzir exatamente o mesmo resultado.
 *
 * O dado original nunca é alterado: normalização só existe para busca.
 */

const semAcento = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function normTxt(t: string | null | undefined): string {
  if (!t) return '';
  return semAcento(t)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PREFIXOS: Array<[RegExp, string]> = [
  [/^R\s+/, 'RUA '],
  [/^AV\s+/, 'AVENIDA '],
  [/^AVN\s+/, 'AVENIDA '],
  [/^TV\s+/, 'TRAVESSA '],
  [/^TRAV\s+/, 'TRAVESSA '],
  [/^AL\s+/, 'ALAMEDA '],
  [/^PC\s+/, 'PRACA '],
  [/^ROD\s+/, 'RODOVIA '],
  [/^EST\s+/, 'ESTRADA '],
  [/^SERV\s+/, 'SERVIDAO '],
];

export function normLogradouro(t: string | null | undefined): string {
  let s = normTxt(t);
  if (!s) return '';
  for (const [re, sub] of PREFIXOS) {
    if (re.test(s)) {
      s = s.replace(re, sub);
      break;
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

export function normCep(t: string | null | undefined): string {
  const d = (t ?? '').replace(/\D/g, '');
  if (!d) return '';
  const p = d.padStart(8, '0');
  return p === '00000000' ? '' : p.slice(-8);
}

export function normNum(t: string | null | undefined): string {
  const s = (t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  return s.replace(/^0+(?=.)/, '');
}

export function cepFormatado(cep: string | null | undefined): string {
  const d = normCep(cep);
  return d ? `${d.slice(0, 5)}-${d.slice(5)}` : '';
}

export function cepValido(t: string | null | undefined): boolean {
  return /^\d{8}$/.test((t ?? '').replace(/\D/g, ''));
}
