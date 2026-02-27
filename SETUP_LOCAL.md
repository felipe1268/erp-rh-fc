# ERP RH & DP — FC Engenharia — Guia de Setup Local

## Pré-requisitos

- **Node.js** 22+ (recomendado: 22.13.0)
- **pnpm** 9+ (gerenciador de pacotes)
- **MySQL 8+** ou **TiDB** (banco de dados)

## Instalação

```bash
# 1. Instalar dependências
pnpm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais (ver seção abaixo)

# 3. Criar/atualizar tabelas no banco de dados
pnpm db:push

# 4. Iniciar servidor de desenvolvimento
pnpm dev
```

O sistema estará disponível em `http://localhost:3000`

## Variáveis de Ambiente Necessárias

Crie um arquivo `.env` na raiz do projeto com:

```env
# Banco de Dados (MySQL/TiDB)
DATABASE_URL=mysql://usuario:senha@host:porta/nome_banco

# Autenticação
JWT_SECRET=sua_chave_secreta_jwt_aqui

# OAuth (Manus - pode ser substituído por outro provider)
VITE_APP_ID=seu_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://id.manus.im

# Dono do sistema
OWNER_OPEN_ID=seu_open_id
OWNER_NAME=Seu Nome

# APIs internas (LLM, Storage, etc.)
BUILT_IN_FORGE_API_URL=url_da_api
BUILT_IN_FORGE_API_KEY=sua_chave_api
VITE_FRONTEND_FORGE_API_KEY=chave_frontend
VITE_FRONTEND_FORGE_API_URL=url_frontend

# Título e Logo
VITE_APP_TITLE=ERP RH & DP - FC Engenharia
VITE_APP_LOGO=/fc-logo.png
```

## Estrutura do Projeto

```
erp-rh-fc/
├── client/                 # Frontend React 19 + Tailwind 4
│   ├── src/
│   │   ├── pages/          # Páginas do sistema (30+ módulos)
│   │   ├── components/     # Componentes reutilizáveis (shadcn/ui)
│   │   ├── data/           # Dados da Biblioteca de Conhecimento
│   │   ├── contexts/       # Contextos React
│   │   ├── hooks/          # Hooks customizados
│   │   ├── lib/            # tRPC client, utils
│   │   ├── App.tsx         # Rotas e layout
│   │   └── index.css       # Tema global (CSS variables)
│   └── public/             # Assets estáticos (logo, favicon)
├── server/                 # Backend Express + tRPC 11
│   ├── _core/              # Infraestrutura (auth, LLM, storage, etc.)
│   ├── routers/            # Routers tRPC por módulo
│   ├── routers.ts          # Router principal (appRouter)
│   └── db.ts               # Helpers de banco de dados
├── drizzle/                # Schema e migrações (Drizzle ORM)
│   └── schema.ts           # Todas as tabelas do banco (2300+ linhas)
├── shared/                 # Tipos e constantes compartilhados
│   ├── modules.ts          # Definição dos módulos e perfis
│   └── version.ts          # Controle de versão
├── storage/                # Helpers S3
├── package.json            # Dependências
├── pnpm-lock.yaml          # Lock de dependências
├── tsconfig.json           # Configuração TypeScript
├── drizzle.config.ts       # Configuração Drizzle
└── todo.md                 # Histórico de funcionalidades
```

## Módulos do Sistema

### RH & DP
- Hub de Módulos, Painel RH, Colaboradores, Empresas, Obras, Setores, Funções
- Fechamento de Ponto, Folha de Pagamento, Horas Extras
- Aviso Prévio / Rescisão, Férias, Dissídio, Feriados
- Contratos PJ, PJ Medições, Vale Alimentação
- Controle de Documentos, Contas Bancárias, Relógios de Ponto
- Avaliação de Desempenho (questionários, ciclos, ranking)
- Raio-X do Funcionário, Lixeira, Revisões

### SST
- Controle de EPIs, CIPA

### Jurídico
- Processos Trabalhistas

### Dashboards
- Funcionários, Cartão de Ponto, Folha de Pagamento, Horas Extras, EPIs

### Administração
- Usuários e Permissões, Auditoria, Configurações
- Biblioteca de Conhecimento (/ajuda)

## Banco de Dados

O schema está em `drizzle/schema.ts` com 40+ tabelas incluindo:
- `user`, `employees`, `companies`, `obras`, `setores`, `funcoes`
- `time_records`, `payroll_files`, `overtime_records`, `advance_payments`
- `trainings`, `asos`, `warnings`, `epis`, `epi_deliveries`
- `accidents`, `risks`, `audits`, `deviations`, `action_plans_5w2h`
- `cipa_elections`, `cipa_members`, `extinguishers`, `hydrants`
- `avaliacao_questionarios`, `avaliacao_perguntas`, `avaliacao_ciclos`, `avaliacao_avaliacoes`
- E muitas outras...

## Scripts Disponíveis

```bash
pnpm dev          # Servidor de desenvolvimento
pnpm build        # Build de produção
pnpm test         # Rodar testes (Vitest)
pnpm db:push      # Aplicar schema no banco
```

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Wouter |
| Backend | Express 4, tRPC 11, Drizzle ORM |
| Banco | MySQL 8 / TiDB |
| Auth | Manus OAuth (JWT) |
| Build | Vite 7, TypeScript 5 |
| Testes | Vitest |
