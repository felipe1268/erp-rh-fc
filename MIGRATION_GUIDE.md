# Guia de Migração - ERP FC Engenharia

## Visão Geral

Este guia explica como migrar o ERP FC Engenharia do Manus para outro provedor de hospedagem (Replit, Railway, VPS, etc.).

O sistema é composto por 3 camadas independentes:

| Camada | Tecnologia | Localização Atual |
|--------|-----------|-------------------|
| **Código-fonte** | React + Express + tRPC | GitHub (sincronizado) |
| **Banco de dados** | MySQL/TiDB | Nuvem do Manus (TiDB) |
| **Armazenamento** | S3 (arquivos/documentos) | Manus Forge Storage |

---

## 1. Código-fonte

O código está sincronizado com o GitHub. Para clonar:

```bash
git clone https://github.com/SEU_USUARIO/SEU_REPO.git
cd erp-rh-fc
pnpm install
```

### Stack Tecnológica

- **Frontend:** React 19 + Tailwind CSS 4 + shadcn/ui
- **Backend:** Express 4 + tRPC 11
- **ORM:** Drizzle ORM
- **Banco:** MySQL/TiDB (compatível com qualquer MySQL 5.7+)
- **Auth:** Login local (email/senha) + OAuth Manus (opcional)

---

## 2. Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

### Obrigatórias

```env
# Banco de dados (MySQL/TiDB)
DATABASE_URL=mysql://USUARIO:SENHA@HOST:PORTA/DATABASE?ssl={"rejectUnauthorized":true}

# Chave para assinar cookies de sessão (gere uma nova)
JWT_SECRET=gere_com_openssl_rand_hex_32

# Ambiente
NODE_ENV=production
```

### Opcionais (funcionalidades extras)

```env
# E-mail (SMTP) - para notificações
SMTP_HOST=smtp.seuservidor.com
SMTP_PORT=465
SMTP_EMAIL=erp@suaempresa.com
SMTP_PASSWORD=sua_senha_smtp

# App
VITE_APP_ID=erp-fc
VITE_APP_TITLE=ERP FC Engenharia

# Storage S3 (Manus) - URLs públicas continuam funcionando
BUILT_IN_FORGE_API_URL=https://api.manus.im/forge
BUILT_IN_FORGE_API_KEY=seu_token_aqui

# OAuth Manus (NÃO funciona fora do Manus - use login local)
# OAUTH_SERVER_URL=https://api.manus.im
# VITE_OAUTH_PORTAL_URL=https://portal.manus.im
```

> **Nota:** Para obter os valores reais das variáveis, acesse a página **Portabilidade** no ERP (menu do usuário > Portabilidade) e baixe o arquivo `.env`.

---

## 3. Banco de Dados

### Opção A: Continuar usando o banco do Manus (recomendado inicialmente)

O banco de dados do Manus é acessível remotamente. Basta manter a mesma `DATABASE_URL` no novo host. O banco continuará funcionando enquanto o projeto existir no Manus.

**Importante:** Habilite SSL na conexão. O TiDB do Manus exige SSL.

### Opção B: Migrar para outro banco MySQL

1. Faça um backup pelo ERP (Configurações > Backup ou Portabilidade)
2. O backup é um JSON comprimido (gzip) com todas as tabelas
3. Crie um banco MySQL 5.7+ no novo provedor
4. Execute `pnpm db:push` para criar as tabelas
5. Importe os dados do backup JSON

### Provedores MySQL compatíveis

| Provedor | Plano Gratuito | SSL | Observação |
|----------|---------------|-----|------------|
| PlanetScale | Sim (hobby) | Sim | Compatível com TiDB |
| Railway | Sim (trial) | Sim | MySQL nativo |
| Neon | Sim | Sim | PostgreSQL (requer adaptação) |
| Supabase | Sim | Sim | PostgreSQL (requer adaptação) |
| AWS RDS | Não | Sim | MySQL nativo |

---

## 4. Armazenamento (S3)

Os arquivos (fotos, documentos, certificados) estão no S3 do Manus.

### URLs públicas

Todas as URLs de arquivos já armazenados são **públicas e permanentes** (enquanto o projeto existir). Não é necessário migrar os arquivos existentes imediatamente.

### Para novos uploads

Se quiser que novos uploads vão para outro S3:

1. Configure um bucket S3 (AWS, Cloudflare R2, MinIO, etc.)
2. Modifique `server/storage.ts` para apontar para o novo S3
3. As URLs antigas continuam funcionando

---

## 5. Autenticação

### Login Local (recomendado para migração)

O sistema já possui login por email/senha implementado:

- Acesse `/login` para fazer login
- Crie usuários em **Configurações > Usuários**
- Senha padrão para novos usuários: `asdf1020`
- No primeiro login, o usuário é obrigado a trocar a senha

### OAuth Manus

O OAuth do Manus **NÃO funciona** fora da plataforma Manus. Use exclusivamente o login local.

---

## 6. Deploy no Replit

1. Crie um novo Repl (Node.js)
2. Importe do GitHub
3. Configure as variáveis de ambiente no painel Secrets do Replit
4. Execute:

```bash
pnpm install
pnpm db:push
pnpm build
pnpm start
```

5. O Replit vai expor a porta automaticamente

### Configuração do Replit (.replit)

```toml
run = "pnpm start"
entrypoint = "server/_core/index.ts"

[nix]
channel = "stable-24_05"

[env]
NODE_ENV = "production"
```

---

## 7. Deploy no Railway

1. Conecte o repositório GitHub
2. Configure as variáveis de ambiente
3. Railway detecta automaticamente o Node.js
4. Build command: `pnpm install && pnpm build`
5. Start command: `pnpm start`

---

## 8. Checklist de Migração

- [ ] Clonar repositório do GitHub
- [ ] Configurar variáveis de ambiente (.env)
- [ ] Testar conexão com banco de dados
- [ ] Executar `pnpm db:push` para verificar schema
- [ ] Testar login local (email/senha)
- [ ] Verificar se documentos S3 estão acessíveis
- [ ] Testar funcionalidades principais (cadastro, consulta, etc.)
- [ ] Configurar SMTP para e-mails (opcional)
- [ ] Fazer backup antes de desativar o Manus

---

## Suporte

Em caso de dúvidas sobre a migração, consulte a página **Portabilidade** no ERP para ver credenciais atualizadas e executar backups.
