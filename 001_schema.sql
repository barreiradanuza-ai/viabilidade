-- =====================================================================
-- Consulta de Viabilidade — schema PostgreSQL
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/001_schema.sql
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ---------------------------------------------------------------------
-- Normalização. unaccent(regdictionary, text) é IMMUTABLE e por isso
-- pode ser usada em colunas geradas e índices de expressão.
-- O dado original NUNCA é alterado; estas colunas são adicionais.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION norm_txt(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(
           btrim(regexp_replace(
             regexp_replace(
               upper(unaccent('unaccent'::regdictionary, coalesce(t, ''))),
               '[^A-Z0-9]+', ' ', 'g'),
             '\s+', ' ', 'g')),
           '')
$$;

CREATE OR REPLACE FUNCTION norm_logradouro(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(norm_txt(t), '^R\s+',   'RUA ',      ''),
                    '^AV\s+',  'AVENIDA ',  ''),
                  '^AVN\s+', 'AVENIDA ',  ''),
                '^TV\s+',  'TRAVESSA ', ''),
              '^TRAV\s+','TRAVESSA ', ''),
            '^AL\s+',  'ALAMEDA ',  ''),
          '^PC\s+',  'PRACA ',    ''),
        '^ROD\s+', 'RODOVIA ',  ''),
      '^EST\s+', 'ESTRADA ',  ''),
    '^SERV\s+','SERVIDAO ', ''),
  '\s+', ' ', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION norm_cep(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(lpad(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8, '0'), '00000000')
$$;

-- Número: alfanumérico sem zeros à esquerda. "SN" (sem número) é
-- preservado como SN, que é como a base da TIM registra lote sem número.
CREATE OR REPLACE FUNCTION norm_num(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(regexp_replace(
           regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9]', '', 'g'),
           '^0+(?=.)', '', ''), '')
$$;

-- ---------------------------------------------------------------------
-- Versões da base. Uma base pode ser formada por VÁRIOS arquivos (a TIM
-- entrega um CSV por parceiro/estado). Todos entram na mesma versão e a
-- versão só entra no ar depois de validada.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS base_versao (
  id                    bigserial PRIMARY KEY,
  operadora             text        NOT NULL DEFAULT 'TIM',
  arquivo_nome          text        NOT NULL,   -- resumo legível dos arquivos
  arquivos              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  arquivo_bytes         bigint      NOT NULL DEFAULT 0,
  arquivo_sha256        text,
  dt_ref                text,                   -- maior DATA_CABEAMENTO da carga
  status                text        NOT NULL DEFAULT 'PROCESSANDO',
  registros_lidos       bigint      NOT NULL DEFAULT 0,
  registros_validos     bigint      NOT NULL DEFAULT 0,
  registros_invalidos   bigint      NOT NULL DEFAULT 0,
  registros_duplicados  bigint      NOT NULL DEFAULT 0,
  erro_mensagem         text,
  relatorio             jsonb,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  processado_em         timestamptz,
  ativado_em            timestamptz,
  CONSTRAINT base_versao_status_ck CHECK (
    status IN ('PROCESSANDO','PROCESSADA','ATIVA','ERRO','ARQUIVADA')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS base_versao_uma_ativa
  ON base_versao (operadora) WHERE status = 'ATIVA';
CREATE INDEX IF NOT EXISTS base_versao_operadora_criado
  ON base_versao (operadora, criado_em DESC);

-- ---------------------------------------------------------------------
-- Endereços da TIM.
--
-- As colunas cobrem os DOIS layouts já vistos na base:
--   • layout de rede (atual): CEP_NUM, CIDADE, NUMERO, RESTRICAO_FTTH,
--     DESCRICAO_RESTRICA_FTTH, OLT_FTTH, HH, INDICADOR, TOPOLOGIA...
--   • layout antigo: MUNICIPIO, NUM_LOGRADOURO, VIABILIDADE, MOTIVO, QTD_HH
-- O importador detecta qual chegou pelo NOME das colunas e preenche o que
-- existir; o que não existir fica nulo. Colunas desconhecidas e não vazias
-- vão para `extras`, em vez de serem descartadas em silêncio.
--
-- Particionado por base_id: cada importação vira uma partição própria,
-- indexada fora do caminho de consulta e anexada só no fim.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tim_endereco (
  base_id                  bigint NOT NULL,
  id                       bigint NOT NULL,
  parceiro                 text,              -- derivado do nome do arquivo
  arquivo                  text,

  -- endereço
  uf                       text,
  cidade                   text,
  bairro                   text,
  zoneamento               text,
  cep                      text,
  logradouro               text,
  numero                   text,
  num_real                 text,
  cep_num                  text,
  complemento              text,
  quadra                   text,
  lote                     text,
  quadra_real              text,
  lote_real                text,
  conjunto                 text,
  bloco                    text,

  -- identificação do lote
  id_lote                  text,
  indicador                text,              -- Residencial casa, Comercial...
  hh                       integer,           -- domicílios (HH / QTD_HH)
  topologia                text,
  data_cabeamento          text,

  -- FTTH
  predio_ftth              text,
  restricao_ftth           text,              -- Sim / Não
  descricao_restricao_ftth text,
  olt_ftth                 text,
  caixa_olt_ftth           text,
  vagos_caixa_ftth         integer,
  ocupados_caixa_ftth      integer,
  segmento_ftth            text,

  -- FTTC
  predio_fttc              text,
  restricao_fttc           text,
  descricao_restricao_fttc text,
  msan_fttc                text,
  vagos_msan               integer,
  per_oc_prim_msan_fttc    text,
  tipo_35b_msan_fttc       text,
  caixa_msan_fttc          text,
  vagos_caixa_fttc         integer,
  ocupados_caixa_fttc      integer,
  segmento_fttc            text,

  -- comercial
  oferta_foco              text,
  oferta_corp              text,

  -- layout antigo (nulos quando o arquivo é do layout de rede)
  viabilidade              text,
  motivo                   text,
  tipo_lote                text,
  infraco_principal        text,
  latitude                 double precision,
  longitude                double precision,

  extras                   jsonb,

  -- ------------------ colunas derivadas, só para busca ---------------
  cep_norm        text GENERATED ALWAYS AS (norm_cep(cep))               STORED,
  cidade_norm     text GENERATED ALWAYS AS (norm_txt(cidade))            STORED,
  logradouro_norm text GENERATED ALWAYS AS (norm_logradouro(logradouro)) STORED,
  num_norm        text GENERATED ALWAYS AS (norm_num(numero))            STORED,
  bairro_norm     text GENERATED ALWAYS AS (norm_txt(bairro))            STORED,

  -- Sinal de viabilidade unificado entre os dois layouts.
  -- No layout de rede não existe coluna VIABILIDADE: o que existe é
  -- RESTRICAO_FTTH / RESTRICAO_FTTC. Estar na base já significa que há
  -- rede; "Não" quer dizer "sem restrição".
  sinal_norm text GENERATED ALWAYS AS (
    coalesce(
      nullif(norm_txt(viabilidade), ''),
      CASE
        WHEN norm_txt(restricao_ftth) = 'NAO' OR norm_txt(restricao_fttc) = 'NAO' THEN 'NAO'
        WHEN norm_txt(restricao_ftth) = 'SIM' OR norm_txt(restricao_fttc) = 'SIM' THEN 'SIM'
      END
    )
  ) STORED,

  motivo_norm text GENERATED ALWAYS AS (
    coalesce(
      nullif(norm_txt(motivo), ''),
      nullif(norm_txt(descricao_restricao_ftth), ''),
      nullif(norm_txt(descricao_restricao_fttc), '')
    )
  ) STORED,

  tecnologia text GENERATED ALWAYS AS (
    CASE
      WHEN restricao_ftth IS NOT NULL AND restricao_fttc IS NOT NULL THEN 'FTTH/FTTC'
      WHEN restricao_ftth IS NOT NULL OR olt_ftth IS NOT NULL        THEN 'FTTH'
      WHEN restricao_fttc IS NOT NULL OR msan_fttc IS NOT NULL       THEN 'FTTC'
    END
  ) STORED
) PARTITION BY LIST (base_id);

-- Idempotente: este arquivo roda a cada subida do container, e
-- ALTER TABLE ... ADD CONSTRAINT não aceita IF NOT EXISTS.
DO $ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tim_endereco_pk'
  ) THEN
    ALTER TABLE tim_endereco ADD CONSTRAINT tim_endereco_pk PRIMARY KEY (base_id, id);
  END IF;
END
$ck$;

CREATE INDEX IF NOT EXISTS tim_endereco_cep
  ON tim_endereco (cep_norm, num_norm);
CREATE INDEX IF NOT EXISTS tim_endereco_endereco
  ON tim_endereco (cidade_norm, logradouro_norm, num_norm);
CREATE INDEX IF NOT EXISTS tim_endereco_logradouro_trgm
  ON tim_endereco USING gin (cidade_norm, logradouro_norm gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Agregados por base — alimentam o autocomplete
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tim_municipio (
  base_id      bigint NOT NULL,
  uf           text   NOT NULL,
  cidade       text   NOT NULL,
  cidade_norm  text   NOT NULL,
  qtd          bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (base_id, uf, cidade)
);

CREATE INDEX IF NOT EXISTS tim_municipio_trgm
  ON tim_municipio USING gin (cidade_norm gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Camada configurável de interpretação.
--
-- A base da TIM não traz um campo "viável". Traz RESTRICAO_FTTH (Sim/Não)
-- e, quando "Sim", uma descrição do impedimento. Estar na base já
-- significa que existe rede no endereço.
--
-- A distinção que mais importa é entre IMPEDIMENTO TÉCNICO (não tem como
-- instalar) e PENDÊNCIA ADMINISTRATIVA (tem rede, falta resolver algo).
-- Tratar "Lote S/N" como "sem viabilidade" jogaria fora venda: o imóvel
-- tem rede, só está cadastrado sem número.
--
-- As regras vivem aqui e podem ser ajustadas por SQL, sem tocar em código.
-- A de menor prioridade que casar decide. Os padrões são expressões
-- regulares aplicadas ao valor NORMALIZADO (maiúsculas, sem acento).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viabilidade_regra (
  id             bigserial PRIMARY KEY,
  operadora      text NOT NULL,
  prioridade     integer NOT NULL DEFAULT 100,
  sinal_padrao   text,   -- casa contra sinal_norm  ('NAO'/'SIM'/'1'/'0')
  motivo_padrao  text,   -- casa contra motivo_norm (descrição da restrição)
  status         text NOT NULL,   -- VIAVEL | SEM_VIABILIDADE | ANALISE
  rotulo         text NOT NULL,
  descricao      text,
  ativo          boolean NOT NULL DEFAULT true,
  CONSTRAINT viabilidade_regra_status_ck CHECK (
    status IN ('VIAVEL','SEM_VIABILIDADE','ANALISE')
  )
);

INSERT INTO viabilidade_regra
  (operadora, prioridade, sinal_padrao, motivo_padrao, status, rotulo, descricao)
SELECT * FROM (VALUES
  -- Sem restrição: o caso comum (96% da base analisada).
  ('TIM',  10, '^(NAO|1)$', NULL, 'VIAVEL', 'Viável',
   'Endereço com rede e sem restrição.'),

  -- Pendências administrativas: há rede, falta acerto. Não são "não".
  ('TIM',  20, '^SIM$', '^LOTE S N$', 'ANALISE', 'Necessita de análise',
   'Lote cadastrado sem número. Confirme o endereço exato com o cliente para liberar.'),
  ('TIM',  30, '^SIM$', 'PENDENCIA ADEQUACAO', 'ANALISE', 'Necessita de análise',
   'Pendência de adequação da rede no endereço. Abra análise técnica.'),
  ('TIM',  40, '^SIM$', 'PROLONGAMENTO DE REDE', 'ANALISE', 'Necessita de análise',
   'Depende de prolongamento de rede. Abra análise de viabilidade.'),

  -- Bloqueio comercial, não técnico.
  ('TIM',  50, '^SIM$', 'OFENSOR CHURN', 'ANALISE', 'Necessita de análise',
   'Endereço com bloqueio comercial (histórico de churn involuntário). Consulte a retenção.'),
  ('TIM',  60, '^SIM$', 'BLOQUEIO LOTE', 'ANALISE', 'Necessita de análise',
   'Lote bloqueado pela TIM. Consulte o responsável antes de prometer prazo.'),

  -- Impedimento técnico de verdade.
  ('TIM', 100, '^SIM$', 'SEM FACILIDADES', 'SEM_VIABILIDADE', 'Sem viabilidade',
   'Sem facilidades de rede no endereço.'),
  ('TIM', 110, '^SIM$', 'CDO BLOQUEADA', 'SEM_VIABILIDADE', 'Sem viabilidade',
   'Caixa de distribuição bloqueada.'),
  ('TIM', 120, '^SIM$', 'FORA DA DISTANCIA TECNICA', 'SEM_VIABILIDADE', 'Sem viabilidade',
   'Endereço fora da distância técnica atendida.'),
  ('TIM', 130, '^SIM$', 'CABEAMENTO NAO AUTORIZADO', 'SEM_VIABILIDADE', 'Sem viabilidade',
   'Cabeamento não autorizado no local.'),

  -- Layout antigo, quando aparecer.
  ('TIM', 200, '^0$', NULL, 'SEM_VIABILIDADE', 'Sem viabilidade',
   'Endereço sem cobertura na base consultada.'),

  -- Restrição desconhecida nunca vira "viável" nem "sem viabilidade":
  -- vai para análise, e o valor bruto aparece nos detalhes técnicos.
  ('TIM', 900, '^SIM$', NULL, 'ANALISE', 'Necessita de análise',
   'Restrição não prevista na configuração atual. Confira os detalhes técnicos.'),
  ('TIM', 990, NULL, NULL, 'ANALISE', 'Necessita de análise',
   'Não foi possível classificar o retorno da base.')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM viabilidade_regra WHERE operadora = 'TIM');

-- ---------------------------------------------------------------------
-- Administração, histórico e logs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_usuario (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  nome          text NOT NULL,
  senha_hash    text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  ultimo_login  timestamptz
);

CREATE TABLE IF NOT EXISTS consulta_log (
  id            bigserial PRIMARY KEY,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  operadora     text NOT NULL,
  operador      text,
  modo          text,
  cep           text,
  municipio     text,
  logradouro    text,
  numero        text,
  status        text,
  resultados    integer NOT NULL DEFAULT 0,
  duracao_ms    integer,
  ip_hash       text
);

CREATE INDEX IF NOT EXISTS consulta_log_criado ON consulta_log (criado_em DESC);
CREATE INDEX IF NOT EXISTS consulta_log_operadora ON consulta_log (operadora, criado_em DESC);

CREATE TABLE IF NOT EXISTS evento_log (
  id            bigserial PRIMARY KEY,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  nivel         text NOT NULL DEFAULT 'INFO',
  origem        text NOT NULL,
  mensagem      text NOT NULL,
  detalhe       jsonb
);

CREATE INDEX IF NOT EXISTS evento_log_criado ON evento_log (criado_em DESC);
