import mysql from 'mysql2/promise';

const revisions = [
  {
    version: 1,
    titulo: "Estrutura Inicial do ERP",
    descricao: "Criação da estrutura base do sistema ERP RH & DP com autenticação OAuth, banco de dados, e layout do dashboard com sidebar.",
    tipo: "feature",
    modulos: "Sistema, Autenticação, Layout",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-10 10:00:00",
  },
  {
    version: 10,
    titulo: "Módulo de Empresas e Colaboradores",
    descricao: "Implementação completa do CRUD de empresas (multi-tenant) e colaboradores com dados pessoais, documentos, endereço e dependentes.",
    tipo: "feature",
    modulos: "Empresas, Colaboradores",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-12 14:00:00",
  },
  {
    version: 20,
    titulo: "Módulo de Obras e Relógios de Ponto",
    descricao: "Cadastro de obras com vinculação de SNs (relógios de ponto), alocação de funcionários por obra, e controle de status.",
    tipo: "feature",
    modulos: "Obras, Relógios de Ponto",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-14 10:00:00",
  },
  {
    version: 30,
    titulo: "Fechamento de Ponto e Upload DIXI",
    descricao: "Módulo completo de fechamento de ponto com upload de arquivos DIXI, processamento automático, detecção de conflitos, e consolidação mensal.",
    tipo: "feature",
    modulos: "Fechamento de Ponto, Upload DIXI",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-16 10:00:00",
  },
  {
    version: 40,
    titulo: "Folha de Pagamento e Vale Alimentação",
    descricao: "Módulo de folha de pagamento com upload de planilhas, cálculos automáticos, e módulo de vale alimentação com controle de créditos.",
    tipo: "feature",
    modulos: "Folha de Pagamento, Vale Alimentação",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-17 10:00:00",
  },
  {
    version: 50,
    titulo: "Dashboards e Relatórios",
    descricao: "Implementação de dashboards interativos para Funcionários, Cartão de Ponto, Folha de Pagamento, Horas Extras, EPIs e Jurídico. Relatório Raio-X do Funcionário.",
    tipo: "feature",
    modulos: "Dashboards, Relatórios",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-19 10:00:00",
  },
  {
    version: 55,
    titulo: "Módulos de Gestão de Pessoas",
    descricao: "Implementação de Aviso Prévio, Férias, CIPA, Contratos PJ, Processos Trabalhistas e Controle de EPIs.",
    tipo: "feature",
    modulos: "Aviso Prévio, Férias, CIPA, Contratos PJ, Processos Trabalhistas, EPIs",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-20 10:00:00",
  },
  {
    version: 60,
    titulo: "Configurações e Painel de Controle",
    descricao: "Módulo de configurações com Painel de Controle (drag and drop), Regras de Ouro, Critérios do Sistema, Minha Senha, Notificações por E-mail, Contrato PJ e Limpeza de Dados.",
    tipo: "feature",
    modulos: "Configurações, Painel de Controle",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-21 10:00:00",
  },
  {
    version: 61,
    titulo: "Auditoria e Lixeira",
    descricao: "Sistema de auditoria com log de todas as ações do sistema. Lixeira com soft delete e restauração de registros excluídos.",
    tipo: "feature",
    modulos: "Auditoria, Lixeira",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-21 16:00:00",
  },
  {
    version: 62,
    titulo: "Setores, Funções e Contas Bancárias",
    descricao: "Módulos de cadastro de Setores, Funções e Contas Bancárias com CRUD completo e vinculação por empresa.",
    tipo: "feature",
    modulos: "Setores, Funções, Contas Bancárias",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-22 10:00:00",
  },
  {
    version: 63,
    titulo: "Correções de Permissões e Perfis de Usuário",
    descricao: "Correção do sistema de permissões (Admin Master, Admin, Usuário). Unificação da página de Usuários e Permissões. Filtro de menu por role no sidebar.",
    tipo: "bugfix",
    modulos: "Usuários e Permissões, Configurações, Sidebar",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-23 10:00:00",
  },
  {
    version: 64,
    titulo: "Correção Desconsolidação + Relógios na Obra + Controle de Revisões",
    descricao: "Correção definitiva do bug de desconsolidação (Admin Master bloqueado). Adição de multi-select de relógios no formulário de Nova Obra. Criação do módulo Controle de Revisões visível apenas para Admin Master. Correção de permissões em adminProcedure para aceitar admin e admin_master.",
    tipo: "bugfix",
    modulos: "Fechamento de Ponto, Obras, Revisões do Sistema, Permissões",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-23 19:30:00",
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  const conn = await mysql.createConnection(url);
  
  for (const rev of revisions) {
    try {
      await conn.execute(
        `INSERT INTO system_revisions (version, titulo, descricao, tipo, modulos, criadoPor, dataPublicacao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [rev.version, rev.titulo, rev.descricao, rev.tipo, rev.modulos, rev.criadoPor, rev.dataPublicacao]
      );
      console.log(`✓ Rev. ${rev.version}: ${rev.titulo}`);
    } catch (err) {
      console.error(`✗ Rev. ${rev.version}: ${err.message}`);
    }
  }
  
  await conn.end();
  console.log('\nDone! All revisions seeded.');
}

main().catch(console.error);
