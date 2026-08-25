/**
 * Rate limiting em memória: suficiente para uma instância única.
 * Com várias instâncias, troque o Map por Redis mantendo esta assinatura.
 */
const janelas = new Map<string, { inicio: number; contagem: number }>();

export function limitar(
  chave: string,
  maximo: number,
  janelaMs: number,
): { ok: boolean; restante: number; resetEmMs: number } {
  const agora = Date.now();
  const j = janelas.get(chave);
  if (!j || agora - j.inicio > janelaMs) {
    janelas.set(chave, { inicio: agora, contagem: 1 });
    return { ok: true, restante: maximo - 1, resetEmMs: janelaMs };
  }
  j.contagem++;
  const resetEmMs = janelaMs - (agora - j.inicio);
  if (j.contagem > maximo) return { ok: false, restante: 0, resetEmMs };
  return { ok: true, restante: maximo - j.contagem, resetEmMs };
}

// Limpeza periódica para o Map não crescer indefinidamente.
if (typeof setInterval !== 'undefined') {
  const t = setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of janelas) {
      if (agora - v.inicio > 10 * 60_000) janelas.delete(k);
    }
  }, 60_000);
  if (typeof t === 'object' && 'unref' in t) t.unref();
}
