import { createConnection } from 'mysql2/promise';

const revisions = [
  {
    version: 122,
    titulo: "Dialog Férias Full Screen + Filtro por Ano nos Dashboards",
    descricao: "Dialog 'Férias do Funcionário' convertido para tela cheia. Filtro por ano adicionado no Dashboard de Aviso Prévio (backend + frontend). Dashboard de Férias corrigido para filtrar períodos antigos.",
    tipo: "melhoria",
    modulos: "Dashboard de Férias,Aviso Prévio",
    criadoPor: "Manus AI"
  },
  {
    version: 123,
    titulo: "Vinculação de Funcionários a Obras (Alocação de Efetivo)",
    descricao: "Sistema completo de alocação de efetivo por obra. Tabelas employee_site_history e obra_ponto_inconsistencies criadas. CRUD de alocações com histórico, transferência e encerramento. Tela Efetivo por Obra com 3 abas (Efetivo, Sem Obra, Inconsistências). Dashboard Efetivo por Obra com histograma e evolução mensal. Integração automática com importação de AFD para detecção de inconsistências ponto x obra.",
    tipo: "feature",
    modulos: "Obras,Efetivo,Ponto Eletrônico,Dashboard Efetivo",
    criadoPor: "Manus AI"
  },
  {
    version: 124,
    titulo: "KPIs Clicáveis no Dashboard de Férias",
    descricao: "KPIs de status e financeiros no Dashboard de Férias agora são clicáveis, filtrando todos os dados do dashboard para o status selecionado. Feedback visual com destaque no KPI ativo.",
    tipo: "melhoria",
    modulos: "Dashboard de Férias",
    criadoPor: "Manus AI"
  },
  {
    version: 125,
    titulo: "Dialog Alocar Funcionário com Multi-Select",
    descricao: "Dialog de alocação de funcionários melhorado com campo de busca, seleção múltipla com chips/tags, filtro por nome/matrícula/CPF e alocação em lote na mesma obra.",
    tipo: "melhoria",
    modulos: "Obras,Efetivo",
    criadoPor: "Manus AI"
  },
  {
    version: 126,
    titulo: "Correções e Melhorias Diversas",
    descricao: "Horário UTC corrigido para GMT-3 (Brasília) no módulo jurídico. Raio-X full screen ao clicar no nome do funcionário em ASO, ObraEfetivo, EPIs, Processos Trabalhistas, Vale Alimentação e Solicitação HE. KPIs financeiros do Dashboard de Férias clicáveis. Tipo de contrato 'Horista' removido (127 registros migrados para CLT). Mapa de Distribuição por Estado com 'Não informado' e total no ranking.",
    tipo: "bugfix",
    modulos: "Jurídico,ASO,Obras,EPIs,Férias,Colaboradores",
    criadoPor: "Manus AI"
  },
  {
    version: 127,
    titulo: "Dashboard Análise de Perfil por Tempo de Casa",
    descricao: "Novo dashboard que agrupa funcionários por faixa de tempo de casa e cruza com estado civil, localidade, função, gênero, faixa etária e obra. Inclui análise de IA com insights de pontos positivos e negativos.",
    tipo: "feature",
    modulos: "Dashboard Perfil,Análise IA",
    criadoPor: "Manus AI"
  },
  {
    version: 128,
    titulo: "Correções Assistente IA + Dialog Alocação Full Screen",
    descricao: "Assistente renomeado de 'Assistente FC' para 'Assistente'. Botão X fecha/minimiza o chat completamente no celular. Tamanho do chat ajustado no mobile. Dialog 'Alocar Funcionários' convertido para FullScreenDialog com filtros (Todos/Sem Obra/Com Obra).",
    tipo: "bugfix",
    modulos: "Assistente IA,Obras,Efetivo",
    criadoPor: "Manus AI"
  },
  {
    version: 129,
    titulo: "Busca sem Acentos + LGPD + Regra de Alocação Única",
    descricao: "Busca ignorando acentos/caracteres especiais no dialog de alocação e demais telas de pesquisa. Rodapé LGPD adicionado em todas as páginas com DashboardLayout. Validação de alocação única por obra com dialog de transferência.",
    tipo: "melhoria",
    modulos: "Busca,LGPD,Obras,Efetivo",
    criadoPor: "Manus AI"
  },
  {
    version: 130,
    titulo: "Dashboard Efetivo por Obra + Regra Alocação",
    descricao: "Validação backend de alocação única por obra com dialog de transferência. PrintFooterLGPD adicionado em 11 páginas. Dashboard Efetivo por Obra cruzando dados de alocação com cartão de ponto mensal, filtro por mês/ano, efetivo real baseado em ponto + alocação.",
    tipo: "feature",
    modulos: "Dashboard Efetivo,Obras,LGPD",
    criadoPor: "Manus AI"
  },
  {
    version: 131,
    titulo: "Correções ObraEfetivo: Clicar na Obra",
    descricao: "Clicar no card da obra abre FullScreenDialog com equipe e opção de alocar. Atualização em tempo real ao alocar funcionário. Linha de TOTAL na tabela Detalhamento por Obra. Correção da discrepância 'Sem Obra' (KPIs vs dialog). Equipe separada por status (Ativo, Aviso Prévio, Férias, Afastado, Recluso).",
    tipo: "bugfix",
    modulos: "Dashboard Efetivo,Obras",
    criadoPor: "Manus AI"
  },
  {
    version: 132,
    titulo: "Dashboard Efetivo: FullScreen Equipe + Histograma + Auto-desligamento",
    descricao: "Ver equipe abre FullScreenDialog com tabela agrupada por função e histograma. Auto-remoção de funcionário da obra quando desligado. Colunas Aviso Prévio, Afastados e Férias no Detalhamento por Obra com atualização automática.",
    tipo: "feature",
    modulos: "Dashboard Efetivo,Obras,Colaboradores",
    criadoPor: "Manus AI"
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const conn = await createConnection(url);
  
  for (const rev of revisions) {
    // Check if already exists
    const [existing] = await conn.execute('SELECT id FROM system_revisions WHERE version = ?', [rev.version]);
    if (existing.length > 0) {
      console.log(`Rev. ${rev.version} already exists, skipping`);
      continue;
    }
    await conn.execute(
      'INSERT INTO system_revisions (version, titulo, descricao, tipo, modulos, criadoPor) VALUES (?, ?, ?, ?, ?, ?)',
      [rev.version, rev.titulo, rev.descricao, rev.tipo, rev.modulos, rev.criadoPor]
    );
    console.log(`Inserted Rev. ${rev.version}: ${rev.titulo}`);
  }
  
  // Also insert Rev 134 and 135 if missing
  const extras = [
    {
      version: 134,
      titulo: "Dashboard Controle de Documentos + Fix Gráfico Aviso Prévio",
      descricao: "Novo Dashboard de Controle de Documentos com 6 KPIs (total, em dia, vencidos, a vencer 30d/90d, compliance %), gráficos por categoria (ASO, Treinamento, CNH, Docs Pessoais), timeline de vencimentos 13 semanas, tabela de alertas com filtros e Raio-X clicável. Gráfico Evolução Mensal de Avisos Prévios corrigido para mostrar todos os 12 meses do ano.",
      tipo: "feature",
      modulos: "Dashboard Documentos,Aviso Prévio,ASO,Treinamentos,CNH",
      criadoPor: "Manus AI"
    },
    {
      version: 135,
      titulo: "Correção Funcionários na Solicitação de HE",
      descricao: "Corrigido bug onde funcionários não apareciam ao selecionar obra na Solicitação de Horas Extras. Causa: filtro usava campos inexistentes. Agora busca pela tabela obraFuncionarios (alocações ativas) + fallback pelo obraAtualId. Seleção limpa ao trocar de obra.",
      tipo: "bugfix",
      modulos: "Horas Extras,Obras",
      criadoPor: "Manus AI"
    }
  ];
  
  for (const rev of extras) {
    const [existing] = await conn.execute('SELECT id FROM system_revisions WHERE version = ?', [rev.version]);
    if (existing.length > 0) {
      console.log(`Rev. ${rev.version} already exists, skipping`);
      continue;
    }
    await conn.execute(
      'INSERT INTO system_revisions (version, titulo, descricao, tipo, modulos, criadoPor) VALUES (?, ?, ?, ?, ?, ?)',
      [rev.version, rev.titulo, rev.descricao, rev.tipo, rev.modulos, rev.criadoPor]
    );
    console.log(`Inserted Rev. ${rev.version}: ${rev.titulo}`);
  }
  
  console.log("\nDone! Current revisions 120+:");
  const [rows] = await conn.execute('SELECT version, titulo, tipo FROM system_revisions WHERE version >= 120 ORDER BY version DESC');
  for (const r of rows) {
    console.log(`  Rev. ${r.version} [${r.tipo}] ${r.titulo}`);
  }
  
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
