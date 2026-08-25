-- =====================================================================
-- Perfis de usuário: quem administra e quem só consulta.
-- Idempotente — roda a cada subida junto com os demais.
-- =====================================================================

ALTER TABLE admin_usuario
  ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'ADMIN';

DO $ck$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_usuario_papel_ck') THEN
    ALTER TABLE admin_usuario
      ADD CONSTRAINT admin_usuario_papel_ck CHECK (papel IN ('ADMIN', 'ATENDENTE'));
  END IF;
END
$ck$;

-- Sempre precisa sobrar pelo menos um administrador ativo: a checagem
-- fica na aplicação, mas o índice ajuda a consultar rápido.
CREATE INDEX IF NOT EXISTS admin_usuario_papel ON admin_usuario (papel) WHERE ativo;
