-- ============================================================================
-- Rev. 2606 — Cadastro reutilizável de Gerenciadoras (com logo)
-- ============================================================================
-- Permite cadastrar gerenciadoras uma vez (nome + logo + contatos) e
-- reaproveitar em obras futuras, com logo preenchido automaticamente.
-- 100% aditivo (CREATE TABLE IF NOT EXISTS). Nenhum DROP/RENAME/ALTER
-- destrutivo — R-001/R-007/R-010 respeitadas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "gerenciadoras" (
  "id"            serial PRIMARY KEY,
  "company_id"    integer NOT NULL,
  "nome"          varchar(255) NOT NULL,
  "logo_url"      text,
  "cnpj"          varchar(18),
  "telefone"      varchar(20),
  "email"         varchar(255),
  "observacoes"   text,
  "ativo"         boolean DEFAULT true,
  "criado_em"     timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_gerenciadoras_company" ON "gerenciadoras" ("company_id");
