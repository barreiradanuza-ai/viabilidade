import type { OperatorProvider } from './types';
import { TimProvider } from './tim';
import { NioProvider } from './nio';

/**
 * Registro de operadoras. Para acrescentar Claro, Vivo ou Oi, basta
 * implementar OperatorProvider e registrar aqui — nada mais muda.
 */
const REGISTRO: Record<string, OperatorProvider> = {
  tim: TimProvider,
  nio: NioProvider,
};

export function provider(id: string): OperatorProvider | null {
  return REGISTRO[id.toLowerCase()] ?? null;
}

export function operadoras(): OperatorProvider[] {
  return Object.values(REGISTRO);
}

export { TimProvider, NioProvider };
export type { OperatorProvider };
