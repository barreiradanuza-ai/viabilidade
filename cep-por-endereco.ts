import { query } from './db';
import { normLogradouro, normNum, normTxt } from './normalize';

/**
 * Resolve "cidade + logradouro + número" em CEPs, usando a base ativa da TIM
 * como diretório de endereços.
 *
 * Existe porque a fonte da NIO só responde por CEP: o slicer do relatório
 * expõe CEP e mais nada. Como a base da TIM já traz logradouro, número e CEP
 * do país inteiro, ela serve de tradutor — sem inventar dado nenhum.
 *
 * Limite conhecido e assumido: um endereço que não esteja na base da TIM não
 * é resolvido. Nesse caso o atendente informa o CEP diretamente, e a tela diz
 * isso com essas palavras em vez de responder "sem cobertura".
 */
export interface EnderecoResolvido {
  cep: string;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
}

export async function cepsPorEndereco(
  municipio: string,
  logradouro: string,
  numero?: string,
  limite = 25,
): Promise<EnderecoResolvido[]> {
  const base = await query<{ id: string }>(
    `SELECT id FROM base_versao WHERE operadora = 'TIM' AND status = 'ATIVA' LIMIT 1`,
  );
  if (!base.length) return [];

  const baseId = Number(base[0].id);
  const mun = normTxt(municipio);
  const log = normLogradouro(logradouro);
  const num = normNum(numero ?? '');
  if (!mun || !log) return [];

  return query<EnderecoResolvido>(
    `SELECT DISTINCT ON (cep_norm, num_norm)
            cep_norm AS cep, logradouro, numero,
            bairro, municipio, uf
       FROM tim_endereco
      WHERE base_id = $1 AND cidade_norm = $2 AND logradouro_norm = $3
        AND cep_norm IS NOT NULL
        AND ($4::text IS NULL OR num_norm = $4)
      ORDER BY cep_norm, num_norm
      LIMIT ${limite}`,
    [baseId, mun, log, num || null],
  );
}
