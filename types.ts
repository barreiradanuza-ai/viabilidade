/**
 * Contrato único de operadora. A UI e as rotas de API só conhecem esta
 * interface; TIM, NIO e futuras operadoras (Claro, Vivo, Oi) implementam-na
 * cada uma com a sua fonte de dados, sem misturar lógica.
 */

export type StatusViabilidade =
  | 'VIAVEL'
  | 'SEM_VIABILIDADE'
  | 'ANALISE'
  | 'NAO_ENCONTRADO'
  | 'INDISPONIVEL';

export interface Endereco {
  /** Identificador opaco para selecionar este endereço depois. */
  ref: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
}

export interface ResultadoViabilidade {
  operadora: string;
  status: StatusViabilidade;
  rotulo: string;
  descricao: string;
  endereco: Endereco;
  /** Campos mostrados por padrão ao atendente. */
  resumo: Array<{ campo: string; valor: string }>;
  /** Campos técnicos, atrás de "Ver detalhes técnicos". */
  tecnico: Array<{ campo: string; valor: string }>;
  dataBase: string | null;
}

export interface ConsultaPorCep {
  modo: 'CEP';
  cep: string;
  numero?: string;
}

export interface ConsultaPorEndereco {
  modo: 'ENDERECO';
  municipio: string;
  logradouro: string;
  numero?: string;
  uf?: string;
}

export type Consulta = ConsultaPorCep | ConsultaPorEndereco;

/** Um endereço candidato quando a consulta retorna mais de um. */
export interface Candidato extends Endereco {
  status: StatusViabilidade;
  rotulo: string;
}

export type RespostaConsulta =
  | { tipo: 'RESULTADO'; resultado: ResultadoViabilidade }
  | { tipo: 'MULTIPLOS'; candidatos: Candidato[]; total: number; aviso?: string }
  | { tipo: 'NAO_ENCONTRADO'; mensagem: string }
  | { tipo: 'INDISPONIVEL'; mensagem: string };

export interface OperatorProvider {
  readonly id: string;
  readonly nome: string;
  /** Se a fonte está pronta para responder (base ativa, integração configurada). */
  disponivel(): Promise<{ ok: boolean; detalhe: string }>;
  consultar(c: Consulta): Promise<RespostaConsulta>;
  /** Detalhe de um candidato escolhido na lista. */
  detalhar(ref: string): Promise<RespostaConsulta>;
  /** Sugestões de digitação. Opcional. */
  autocompleteMunicipio?(termo: string): Promise<Array<{ municipio: string; uf: string }>>;
  autocompleteLogradouro?(
    municipio: string,
    termo: string,
  ): Promise<Array<{ logradouro: string; bairro: string | null }>>;
}
