declare module 'pg-copy-streams' {
  import type { Writable, Readable } from 'node:stream';
  export function from(text: string): Writable;
  export function to(text: string): Readable;
  const _default: { from: typeof from; to: typeof to };
  export default _default;
}
