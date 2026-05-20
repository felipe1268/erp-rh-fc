-- Rev. 2207 — coluna sigilo opt-in do status "Aviso Prévio" do colaborador
-- (ver shared/changelog.ts). Aditiva, default 0, NOT NULL — segura por
-- defeito: nenhum grupo passa a ver Aviso ao aplicar a migration.
ALTER TABLE "user_groups" ADD COLUMN IF NOT EXISTS "ver_status_aviso" smallint DEFAULT 0 NOT NULL;
