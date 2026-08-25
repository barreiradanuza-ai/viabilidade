-- =====================================================================
-- Cobertura NIO — tabelas alimentadas pelo sync (sync_nio_ceps.py).
-- Compatíveis com o esquema já usado pelo mcc-back: os dois sistemas
-- podem apontar para o mesmo banco e o sync roda uma vez só.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/002_nio.sql
-- =====================================================================

-- A fonte da NIO entrega apenas o CEP: o slicer do relatório não expõe
-- logradouro, número nem motivo. Por isso a resposta da NIO é binária.
CREATE TABLE IF NOT EXISTS ceps_nio (
  cep CHAR(8) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS nio_cache_meta (
  id         INT PRIMARY KEY CHECK (id = 1),
  updated_at TIMESTAMPTZ,   -- último sync BEM-SUCEDIDO
  total      INT
);

-- Acrescentadas depois; idempotentes para não quebrar bases já existentes.
ALTER TABLE nio_cache_meta ADD COLUMN IF NOT EXISTS status     TEXT;
ALTER TABLE nio_cache_meta ADD COLUMN IF NOT EXISTS duracao_s  INT;
ALTER TABLE nio_cache_meta ADD COLUMN IF NOT EXISTS erro       TEXT;
ALTER TABLE nio_cache_meta ADD COLUMN IF NOT EXISTS tentado_em TIMESTAMPTZ;  -- última TENTATIVA
