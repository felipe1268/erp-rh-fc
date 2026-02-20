// Seed script: 8 colaboradores (2 por empresa) + dados completos em TODOS os módulos
// Executa via: node seed-data.mjs

import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env
const envPath = resolve(process.cwd(), ".env");
let DATABASE_URL;
try {
  const envContent = readFileSync(envPath, "utf-8");
  const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)/);
  if (match) DATABASE_URL = match[1];
} catch { }
if (!DATABASE_URL) DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not found"); process.exit(1); }

const conn = await mysql.createConnection({ uri: DATABASE_URL, ssl: { rejectUnauthorized: false } });
console.log("✅ Conectado ao banco de dados");

// ========== HELPER ==========
async function insert(table, data) {
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = keys.map(() => "?").join(", ");
  const [result] = await conn.execute(
    `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`,
    vals
  );
  return result.insertId;
}

// ========== 1. VERIFICAR/CRIAR EMPRESAS ==========
console.log("\n📋 Verificando empresas...");
const [existingCompanies] = await conn.execute("SELECT id, nomeFantasia FROM companies");
const companyMap = {};
for (const c of existingCompanies) companyMap[c.nomeFantasia?.toUpperCase()] = c.id;

const empresas = [
  { cnpj: "12.345.678/0001-01", razaoSocial: "FC ENGENHARIA LTDA", nomeFantasia: "FC ENGENHARIA", endereco: "Rua das Obras, 100", cidade: "Fortaleza", estado: "CE", cep: "60000-000", telefone: "(85) 3333-1000", email: "contato@fcengenharia.com.br" },
  { cnpj: "23.456.789/0001-02", razaoSocial: "LOCK NAUL LOCACOES LTDA", nomeFantasia: "LOCK NAUL", endereco: "Av. Industrial, 500", cidade: "Fortaleza", estado: "CE", cep: "60100-000", telefone: "(85) 3333-2000", email: "contato@locknaul.com.br" },
  { cnpj: "34.567.890/0001-03", razaoSocial: "HOTEL CONSAGRADO LTDA", nomeFantasia: "HOTEL CONSAGRADO", endereco: "Av. Beira Mar, 2000", cidade: "Fortaleza", estado: "CE", cep: "60200-000", telefone: "(85) 3333-3000", email: "contato@hotelconsagrado.com.br" },
  { cnpj: "45.678.901/0001-04", razaoSocial: "JULIO FERRAZ CONSTRUCOES LTDA", nomeFantasia: "JULIO FERRAZ", endereco: "Rua dos Construtores, 300", cidade: "Fortaleza", estado: "CE", cep: "60300-000", telefone: "(85) 3333-4000", email: "contato@julioferraz.com.br" },
];

const companyIds = [];
for (const emp of empresas) {
  const key = emp.nomeFantasia.toUpperCase();
  if (companyMap[key]) {
    companyIds.push(companyMap[key]);
    console.log(`  ✓ ${emp.nomeFantasia} já existe (ID: ${companyMap[key]})`);
  } else {
    const id = await insert("companies", emp);
    companyIds.push(id);
    console.log(`  + ${emp.nomeFantasia} criada (ID: ${id})`);
  }
}

// ========== 2. CRIAR 8 COLABORADORES ==========
console.log("\n👥 Criando colaboradores...");
const colaboradores = [
  // FC ENGENHARIA (2)
  { companyId: companyIds[0], matricula: "FC-001", nomeCompleto: "CARLOS EDUARDO SILVA", cpf: "111.222.333-44", rg: "2001001", orgaoEmissor: "SSP-CE", dataNascimento: "1988-03-15", sexo: "M", estadoCivil: "Casado", nacionalidade: "Brasileiro", naturalidade: "Fortaleza-CE", nomeMae: "Maria das Graças Silva", nomePai: "José Carlos Silva", ctps: "12345", serieCTPS: "001", pis: "123.45678.90-1", cnh: "01234567890", categoriaCNH: "AB", validadeCNH: "2027-06-30", logradouro: "Rua A, 100", numero: "100", bairro: "Aldeota", cidade: "Fortaleza", estado: "CE", cep: "60100-100", telefone: "(85) 99999-0001", celular: "(85) 99999-0001", email: "carlos.silva@email.com", contatoEmergencia: "Maria Silva", telefoneEmergencia: "(85) 98888-0001", cargo: "Engenheiro Civil", funcao: "Engenheiro de Obras", setor: "Engenharia", dataAdmissao: "2020-02-01", salarioBase: "12500.00", horasMensais: "220", tipoContrato: "CLT", jornadaTrabalho: "08:00-17:00", banco: "Bradesco", agencia: "1234", conta: "56789-0", tipoConta: "Corrente", chavePix: "carlos.silva@email.com", status: "Ativo" },
  { companyId: companyIds[0], matricula: "FC-002", nomeCompleto: "ANA BEATRIZ OLIVEIRA", cpf: "222.333.444-55", rg: "2002002", orgaoEmissor: "SSP-CE", dataNascimento: "1995-07-22", sexo: "F", estadoCivil: "Solteiro", nacionalidade: "Brasileira", naturalidade: "Fortaleza-CE", nomeMae: "Francisca Oliveira", ctps: "23456", serieCTPS: "002", pis: "234.56789.01-2", logradouro: "Rua B, 200", numero: "200", bairro: "Meireles", cidade: "Fortaleza", estado: "CE", cep: "60200-200", telefone: "(85) 99999-0002", celular: "(85) 99999-0002", email: "ana.oliveira@email.com", contatoEmergencia: "Francisca Oliveira", telefoneEmergencia: "(85) 98888-0002", cargo: "Técnica de Segurança", funcao: "Técnica de Segurança do Trabalho", setor: "SST", dataAdmissao: "2021-05-10", salarioBase: "5800.00", horasMensais: "220", tipoContrato: "CLT", jornadaTrabalho: "07:00-16:00", banco: "Itaú", agencia: "2345", conta: "67890-1", tipoConta: "Corrente", chavePix: "22233344455", status: "Ativo" },
  // LOCK NAUL (2)
  { companyId: companyIds[1], matricula: "LN-001", nomeCompleto: "MARCOS ANTONIO PEREIRA", cpf: "333.444.555-66", rg: "3003003", orgaoEmissor: "SSP-CE", dataNascimento: "1990-11-08", sexo: "M", estadoCivil: "Casado", nacionalidade: "Brasileiro", naturalidade: "Caucaia-CE", nomeMae: "Joana Pereira", ctps: "34567", serieCTPS: "003", pis: "345.67890.12-3", cnh: "02345678901", categoriaCNH: "D", validadeCNH: "2026-12-15", logradouro: "Av. C, 300", numero: "300", bairro: "Centro", cidade: "Caucaia", estado: "CE", cep: "61600-000", telefone: "(85) 99999-0003", celular: "(85) 99999-0003", email: "marcos.pereira@email.com", contatoEmergencia: "Joana Pereira", telefoneEmergencia: "(85) 98888-0003", cargo: "Operador de Máquinas", funcao: "Operador de Retroescavadeira", setor: "Operações", dataAdmissao: "2019-08-15", salarioBase: "4200.00", horasMensais: "220", tipoContrato: "CLT", jornadaTrabalho: "06:00-15:00", banco: "Caixa", agencia: "3456", conta: "78901-2", tipoConta: "Poupanca", chavePix: "33344455566", status: "Ativo" },
  { companyId: companyIds[1], matricula: "LN-002", nomeCompleto: "FERNANDA COSTA LIMA", cpf: "444.555.666-77", rg: "4004004", orgaoEmissor: "SSP-CE", dataNascimento: "1992-01-30", sexo: "F", estadoCivil: "Uniao_Estavel", nacionalidade: "Brasileira", naturalidade: "Maracanaú-CE", nomeMae: "Tereza Costa", ctps: "45678", serieCTPS: "004", pis: "456.78901.23-4", logradouro: "Rua D, 400", numero: "400", bairro: "Jangurussu", cidade: "Fortaleza", estado: "CE", cep: "60870-000", telefone: "(85) 99999-0004", celular: "(85) 99999-0004", email: "fernanda.lima@email.com", contatoEmergencia: "Tereza Costa", telefoneEmergencia: "(85) 98888-0004", cargo: "Assistente Administrativo", funcao: "Assistente de Locação", setor: "Administrativo", dataAdmissao: "2022-03-01", salarioBase: "2800.00", horasMensais: "220", tipoContrato: "CLT", jornadaTrabalho: "08:00-17:00", banco: "Banco do Brasil", agencia: "4567", conta: "89012-3", tipoConta: "Corrente", chavePix: "fernanda.lima@email.com", status: "Ativo" },
  // HOTEL CONSAGRADO (2)
  { companyId: companyIds[2], matricula: "HC-001", nomeCompleto: "RICARDO SOUZA MENDES", cpf: "555.666.777-88", rg: "5005005", orgaoEmissor: "SSP-CE", dataNascimento: "1985-09-12", sexo: "M", estadoCivil: "Divorciado", nacionalidade: "Brasileiro", naturalidade: "Fortaleza-CE", nomeMae: "Lúcia Souza", ctps: "56789", serieCTPS: "005", pis: "567.89012.34-5", logradouro: "Rua E, 500", numero: "500", bairro: "Praia de Iracema", cidade: "Fortaleza", estado: "CE", cep: "60060-000", telefone: "(85) 99999-0005", celular: "(85) 99999-0005", email: "ricardo.mendes@email.com", contatoEmergencia: "Lúcia Souza", telefoneEmergencia: "(85) 98888-0005", cargo: "Gerente de Manutenção", funcao: "Gerente de Manutenção Predial", setor: "Manutenção", dataAdmissao: "2018-01-10", salarioBase: "6500.00", horasMensais: "220", tipoContrato: "CLT", jornadaTrabalho: "08:00-17:00", banco: "Santander", agencia: "5678", conta: "90123-4", tipoConta: "Corrente", chavePix: "55566677788", status: "Ativo" },
  { companyId: companyIds[2], matricula: "HC-002", nomeCompleto: "JULIANA FERREIRA SANTOS", cpf: "666.777.888-99", rg: "6006006", orgaoEmissor: "SSP-CE", dataNascimento: "1998-04-05", sexo: "F", estadoCivil: "Solteiro", nacionalidade: "Brasileira", naturalidade: "Fortaleza-CE", nomeMae: "Sandra Ferreira", ctps: "67890", serieCTPS: "006", pis: "678.90123.45-6", logradouro: "Rua F, 600", numero: "600", bairro: "Mucuripe", cidade: "Fortaleza", estado: "CE", cep: "60165-000", telefone: "(85) 99999-0006", celular: "(85) 99999-0006", email: "juliana.santos@email.com", contatoEmergencia: "Sandra Ferreira", telefoneEmergencia: "(85) 98888-0006", cargo: "Camareira", funcao: "Camareira Senior", setor: "Hospedagem", dataAdmissao: "2023-06-15", salarioBase: "2200.00", horasMensais: "220", tipoContrato: "CLT", jornadaTrabalho: "06:00-14:00", banco: "Nubank", agencia: "0001", conta: "12345-6", tipoConta: "Corrente", chavePix: "juliana.santos@email.com", status: "Ferias" },
  // JULIO FERRAZ (2)
  { companyId: companyIds[3], matricula: "JF-001", nomeCompleto: "PEDRO HENRIQUE ALMEIDA", cpf: "777.888.999-00", rg: "7007007", orgaoEmissor: "SSP-CE", dataNascimento: "1987-12-20", sexo: "M", estadoCivil: "Casado", nacionalidade: "Brasileiro", naturalidade: "Sobral-CE", nomeMae: "Rosa Almeida", nomePai: "Antônio Almeida", ctps: "78901", serieCTPS: "007", pis: "789.01234.56-7", cnh: "03456789012", categoriaCNH: "C", validadeCNH: "2028-03-20", logradouro: "Rua G, 700", numero: "700", bairro: "Papicu", cidade: "Fortaleza", estado: "CE", cep: "60175-000", telefone: "(85) 99999-0007", celular: "(85) 99999-0007", email: "pedro.almeida@email.com", contatoEmergencia: "Rosa Almeida", telefoneEmergencia: "(85) 98888-0007", cargo: "Mestre de Obras", funcao: "Mestre de Obras Senior", setor: "Produção", dataAdmissao: "2017-04-01", salarioBase: "7800.00", horasMensais: "220", tipoContrato: "CLT", jornadaTrabalho: "07:00-16:00", banco: "Bradesco", agencia: "6789", conta: "01234-5", tipoConta: "Corrente", chavePix: "77788899900", status: "Ativo" },
  { companyId: companyIds[3], matricula: "JF-002", nomeCompleto: "LUCIANA MARIA RODRIGUES", cpf: "888.999.000-11", rg: "8008008", orgaoEmissor: "SSP-CE", dataNascimento: "1993-06-18", sexo: "F", estadoCivil: "Casado", nacionalidade: "Brasileira", naturalidade: "Fortaleza-CE", nomeMae: "Marta Rodrigues", ctps: "89012", serieCTPS: "008", pis: "890.12345.67-8", logradouro: "Rua H, 800", numero: "800", bairro: "Fátima", cidade: "Fortaleza", estado: "CE", cep: "60040-000", telefone: "(85) 99999-0008", celular: "(85) 99999-0008", email: "luciana.rodrigues@email.com", contatoEmergencia: "Marta Rodrigues", telefoneEmergencia: "(85) 98888-0008", cargo: "Engenheira Ambiental", funcao: "Engenheira Ambiental", setor: "Meio Ambiente", dataAdmissao: "2021-09-01", salarioBase: "9500.00", horasMensais: "220", tipoContrato: "CLT", jornadaTrabalho: "08:00-17:00", banco: "Itaú", agencia: "7890", conta: "12345-7", tipoConta: "Corrente", chavePix: "luciana.rodrigues@email.com", status: "Ativo" },
];

const empIds = [];
for (const col of colaboradores) {
  // Check if CPF already exists
  const [existing] = await conn.execute("SELECT id FROM employees WHERE cpf = ?", [col.cpf]);
  if (existing.length > 0) {
    empIds.push(existing[0].id);
    console.log(`  ✓ ${col.nomeCompleto} já existe (ID: ${existing[0].id})`);
  } else {
    const id = await insert("employees", col);
    empIds.push(id);
    console.log(`  + ${col.nomeCompleto} criado (ID: ${id})`);
  }
}

// ========== 3. TREINAMENTOS ==========
console.log("\n📚 Criando treinamentos...");
const treinamentos = [
  { nome: "NR-35 Trabalho em Altura", norma: "NR-35", cargaHoraria: "8h" },
  { nome: "NR-10 Segurança em Eletricidade", norma: "NR-10", cargaHoraria: "40h" },
  { nome: "NR-33 Espaço Confinado", norma: "NR-33", cargaHoraria: "16h" },
  { nome: "NR-18 Condições de Trabalho na Construção", norma: "NR-18", cargaHoraria: "6h" },
  { nome: "NR-06 Uso de EPI", norma: "NR-06", cargaHoraria: "4h" },
  { nome: "Primeiros Socorros", norma: "NR-07", cargaHoraria: "8h" },
  { nome: "Combate a Incêndio", norma: "NR-23", cargaHoraria: "8h" },
  { nome: "Integração de Segurança", norma: "NR-01", cargaHoraria: "4h" },
];

for (let i = 0; i < empIds.length; i++) {
  const cId = colaboradores[i].companyId;
  // Each employee gets 2-3 trainings
  const numTrainings = 2 + (i % 2);
  for (let t = 0; t < numTrainings; t++) {
    const tr = treinamentos[(i + t) % treinamentos.length];
    const dataReal = `2025-${String(1 + (t * 3) + (i % 3)).padStart(2, "0")}-${String(10 + i).padStart(2, "0")}`;
    const dataVal = `2026-${String(1 + (t * 3) + (i % 3)).padStart(2, "0")}-${String(10 + i).padStart(2, "0")}`;
    const status = new Date(dataVal) < new Date() ? "Vencido" : "Valido";
    await insert("trainings", {
      companyId: cId, employeeId: empIds[i], nome: tr.nome, norma: tr.norma, cargaHoraria: tr.cargaHoraria,
      dataRealizacao: dataReal, dataValidade: dataVal, instrutor: "Eng. Roberto Campos", entidade: "SENAI-CE",
      statusTreinamento: status, observacoes: `Treinamento realizado na sede da empresa`
    });
  }
  console.log(`  + ${colaboradores[i].nomeCompleto}: ${numTrainings} treinamentos`);
}

// ========== 4. ASOs ==========
console.log("\n🏥 Criando ASOs...");
for (let i = 0; i < empIds.length; i++) {
  const cId = colaboradores[i].companyId;
  // Admissional
  await insert("asos", {
    companyId: cId, employeeId: empIds[i], tipo: "Admissional",
    dataExame: colaboradores[i].dataAdmissao, dataValidade: "2026-12-31",
    resultado: "Apto", medico: "Dr. Paulo Mendes", crm: "CRM-CE 12345",
    clinica: "Clínica Saúde Ocupacional", observacoes: "Exame admissional sem restrições"
  });
  // Periódico
  const mesPerio = String(3 + (i % 6)).padStart(2, "0");
  const valPerio = i < 4 ? "2026-08-15" : "2025-08-15"; // 4 válidos, 4 vencidos
  await insert("asos", {
    companyId: cId, employeeId: empIds[i], tipo: "Periodico",
    dataExame: `2025-${mesPerio}-15`, dataValidade: valPerio,
    resultado: i === 5 ? "Apto_Restricao" : "Apto",
    medico: "Dra. Carla Vasconcelos", crm: "CRM-CE 23456",
    clinica: "MedTrab Fortaleza", observacoes: i === 5 ? "Restrição para trabalho em altura" : "Periódico normal"
  });
  console.log(`  + ${colaboradores[i].nomeCompleto}: 2 ASOs`);
}

// ========== 5. ADVERTÊNCIAS ==========
console.log("\n⚠️ Criando advertências...");
const advertencias = [
  { empIdx: 0, tipo: "Verbal", motivo: "Atraso reiterado sem justificativa", descricao: "Colaborador chegou atrasado 3 vezes na mesma semana", dataOcorrencia: "2025-06-10" },
  { empIdx: 2, tipo: "Escrita", motivo: "Não utilização de EPI obrigatório", descricao: "Flagrado operando máquina sem capacete de proteção", dataOcorrencia: "2025-07-22" },
  { empIdx: 3, tipo: "Verbal", motivo: "Uso indevido de celular em horário de trabalho", descricao: "Uso de celular durante operação de empilhadeira", dataOcorrencia: "2025-08-05" },
  { empIdx: 4, tipo: "Suspensao", motivo: "Insubordinação", descricao: "Recusou-se a realizar tarefa designada pelo supervisor", dataOcorrencia: "2025-09-15" },
  { empIdx: 6, tipo: "Escrita", motivo: "Falta injustificada", descricao: "Faltou 2 dias consecutivos sem apresentar justificativa", dataOcorrencia: "2025-10-01" },
  { empIdx: 7, tipo: "OSS", motivo: "Descumprimento de procedimento de segurança", descricao: "Não seguiu procedimento de bloqueio de energia (LOTO)", dataOcorrencia: "2025-11-12" },
];
for (const adv of advertencias) {
  await insert("warnings", {
    companyId: colaboradores[adv.empIdx].companyId, employeeId: empIds[adv.empIdx],
    tipoAdvertencia: adv.tipo, dataOcorrencia: adv.dataOcorrencia, motivo: adv.motivo,
    descricao: adv.descricao, testemunhas: "Supervisor José Raimundo"
  });
  console.log(`  + ${colaboradores[adv.empIdx].nomeCompleto}: ${adv.tipo}`);
}

// ========== 6. EPIs ==========
console.log("\n🦺 Criando EPIs e entregas...");
const episData = [
  { nome: "Capacete de Segurança", ca: "31469", fabricante: "MSA", quantidadeEstoque: 50 },
  { nome: "Luva de Vaqueta", ca: "10695", fabricante: "Danny", quantidadeEstoque: 100 },
  { nome: "Bota de Segurança", ca: "38200", fabricante: "Marluvas", quantidadeEstoque: 40 },
  { nome: "Óculos de Proteção", ca: "26282", fabricante: "Kalipso", quantidadeEstoque: 80 },
  { nome: "Protetor Auricular", ca: "14235", fabricante: "3M", quantidadeEstoque: 200 },
  { nome: "Cinto de Segurança Tipo Paraquedista", ca: "35529", fabricante: "Carbografite", quantidadeEstoque: 15 },
];

const epiIds = [];
for (const epi of episData) {
  // Use companyId 1 (FC) as base, but EPIs are shared
  const id = await insert("epis", { ...epi, companyId: companyIds[0], validadeCA: "2027-12-31" });
  epiIds.push(id);
}
// Also create for other companies
for (let c = 1; c < companyIds.length; c++) {
  for (const epi of episData) {
    await insert("epis", { ...epi, companyId: companyIds[c], validadeCA: "2027-12-31" });
  }
}

// Entregas de EPI
for (let i = 0; i < empIds.length; i++) {
  const cId = colaboradores[i].companyId;
  // Get EPIs for this company
  const [compEpis] = await conn.execute("SELECT id FROM epis WHERE companyId = ? LIMIT 3", [cId]);
  for (let e = 0; e < Math.min(3, compEpis.length); e++) {
    await insert("epi_deliveries", {
      companyId: cId, epiId: compEpis[e].id, employeeId: empIds[i],
      quantidade: 1 + (i % 2), dataEntrega: `2025-${String(3 + e).padStart(2, "0")}-01`,
      motivo: e === 0 ? "Admissão" : "Substituição", observacoes: "Entrega registrada"
    });
  }
  console.log(`  + ${colaboradores[i].nomeCompleto}: 3 EPIs entregues`);
}

// ========== 7. ACIDENTES ==========
console.log("\n🚨 Criando acidentes...");
const acidentes = [
  { empIdx: 0, dataAcidente: "2025-05-20", horaAcidente: "10:30", tipo: "Tipico", gravidade: "Leve", localAcidente: "Canteiro de obras - Bloco A", descricao: "Corte superficial na mão ao manusear vergalhão", parteCorpoAtingida: "Mão Direita", diasAfastamento: 0, acaoCorretiva: "Reforçar uso de luvas de proteção" },
  { empIdx: 2, dataAcidente: "2025-08-12", horaAcidente: "14:15", tipo: "Tipico", gravidade: "Moderado", localAcidente: "Pátio de máquinas", descricao: "Entorse no tornozelo ao descer da retroescavadeira", parteCorpoAtingida: "Tornozelo Esquerdo", diasAfastamento: 7, catNumero: "CAT-2025-001", catData: "2025-08-13", acaoCorretiva: "Instalar degraus antiderrapantes nas máquinas" },
  { empIdx: 4, dataAcidente: "2025-10-05", horaAcidente: "08:45", tipo: "Trajeto", gravidade: "Leve", localAcidente: "Trajeto casa-trabalho", descricao: "Queda de moto no trajeto para o trabalho", parteCorpoAtingida: "Joelho Direito", diasAfastamento: 3, catNumero: "CAT-2025-002", catData: "2025-10-06", acaoCorretiva: "Orientação sobre segurança no trânsito" },
  { empIdx: 6, dataAcidente: "2025-11-18", horaAcidente: "16:00", tipo: "Tipico", gravidade: "Grave", localAcidente: "Obra Residencial - 3º andar", descricao: "Queda de escada com fratura no braço", parteCorpoAtingida: "Braço Esquerdo", diasAfastamento: 30, catNumero: "CAT-2025-003", catData: "2025-11-19", testemunhas: "João Batista, Francisco Neto", acaoCorretiva: "Substituir escadas danificadas, treinamento NR-35" },
];
for (const ac of acidentes) {
  await insert("accidents", {
    companyId: colaboradores[ac.empIdx].companyId, employeeId: empIds[ac.empIdx],
    dataAcidente: ac.dataAcidente, horaAcidente: ac.horaAcidente, tipoAcidente: ac.tipo,
    gravidade: ac.gravidade, localAcidente: ac.localAcidente, descricao: ac.descricao,
    parteCorpoAtingida: ac.parteCorpoAtingida, diasAfastamento: ac.diasAfastamento,
    catNumero: ac.catNumero || null, catData: ac.catData || null,
    testemunhas: ac.testemunhas || null, acaoCorretiva: ac.acaoCorretiva
  });
  console.log(`  + ${colaboradores[ac.empIdx].nomeCompleto}: Acidente ${ac.gravidade}`);
}

// ========== 8. RISCOS ==========
console.log("\n☢️ Criando riscos ocupacionais...");
const riscosData = [
  { companyIdx: 0, setor: "Engenharia", agenteRisco: "Ruído contínuo acima de 85dB", tipoRisco: "Fisico", fonteGeradora: "Máquinas e equipamentos", grauRisco: "Alto", medidasControle: "Uso de protetor auricular, rodízio de funções" },
  { companyIdx: 0, setor: "Produção", agenteRisco: "Poeira de cimento", tipoRisco: "Quimico", fonteGeradora: "Mistura de concreto", grauRisco: "Medio", medidasControle: "Uso de máscara PFF2, ventilação adequada" },
  { companyIdx: 1, setor: "Operações", agenteRisco: "Vibração de corpo inteiro", tipoRisco: "Fisico", fonteGeradora: "Operação de retroescavadeira", grauRisco: "Alto", medidasControle: "Assento com amortecimento, pausas regulares" },
  { companyIdx: 1, setor: "Administrativo", agenteRisco: "Postura inadequada", tipoRisco: "Ergonomico", fonteGeradora: "Trabalho prolongado em computador", grauRisco: "Baixo", medidasControle: "Ginástica laboral, mobiliário ergonômico" },
  { companyIdx: 2, setor: "Manutenção", agenteRisco: "Choque elétrico", tipoRisco: "Acidente", fonteGeradora: "Instalações elétricas", grauRisco: "Critico", medidasControle: "Bloqueio e etiquetagem (LOTO), NR-10" },
  { companyIdx: 2, setor: "Hospedagem", agenteRisco: "Agentes biológicos", tipoRisco: "Biologico", fonteGeradora: "Limpeza de banheiros e quartos", grauRisco: "Medio", medidasControle: "Uso de luvas, desinfecção adequada" },
  { companyIdx: 3, setor: "Produção", agenteRisco: "Queda de altura", tipoRisco: "Acidente", fonteGeradora: "Trabalho em andaimes e lajes", grauRisco: "Critico", medidasControle: "Cinto paraquedista, linha de vida, NR-35" },
  { companyIdx: 3, setor: "Meio Ambiente", agenteRisco: "Produtos químicos", tipoRisco: "Quimico", fonteGeradora: "Análise de amostras ambientais", grauRisco: "Medio", medidasControle: "Capela de exaustão, EPI químico" },
];
for (const r of riscosData) {
  await insert("risks", { companyId: companyIds[r.companyIdx], setor: r.setor, agenteRisco: r.agenteRisco, tipoRisco: r.tipoRisco, fonteGeradora: r.fonteGeradora, grauRisco: r.grauRisco, medidasControle: r.medidasControle });
  console.log(`  + ${empresas[r.companyIdx].nomeFantasia} - ${r.setor}: ${r.agenteRisco}`);
}

// ========== 9. AUDITORIAS ==========
console.log("\n📋 Criando auditorias...");
const auditoriasData = [
  { companyIdx: 0, titulo: "Auditoria Interna ISO 9001", tipo: "Interna", dataAuditoria: "2025-03-15", auditor: "Eng. Roberto Campos", setor: "Engenharia", resultado: "Conforme" },
  { companyIdx: 0, titulo: "Auditoria Externa PBQP-H", tipo: "Externa", dataAuditoria: "2025-06-20", auditor: "Bureau Veritas", setor: "Qualidade", resultado: "Observacao" },
  { companyIdx: 1, titulo: "Auditoria de Segurança NR-12", tipo: "Interna", dataAuditoria: "2025-04-10", auditor: "Ana Beatriz Oliveira", setor: "Operações", resultado: "Nao_Conforme" },
  { companyIdx: 2, titulo: "Auditoria Sanitária ANVISA", tipo: "Cliente", dataAuditoria: "2025-07-05", auditor: "Vigilância Sanitária", setor: "Hospedagem", resultado: "Conforme" },
  { companyIdx: 3, titulo: "Auditoria Ambiental IBAMA", tipo: "Certificadora", dataAuditoria: "2025-09-12", auditor: "IBAMA-CE", setor: "Meio Ambiente", resultado: "Pendente" },
];
const auditIds = [];
for (const a of auditoriasData) {
  const id = await insert("audits", { companyId: companyIds[a.companyIdx], titulo: a.titulo, tipoAuditoria: a.tipo, dataAuditoria: a.dataAuditoria, auditor: a.auditor, setor: a.setor, resultadoAuditoria: a.resultado, descricao: `Auditoria realizada no setor ${a.setor}` });
  auditIds.push(id);
  console.log(`  + ${empresas[a.companyIdx].nomeFantasia}: ${a.titulo}`);
}

// ========== 10. DESVIOS ==========
console.log("\n🔴 Criando desvios...");
const desviosData = [
  { companyIdx: 0, titulo: "Falta de sinalização na obra", tipo: "NC_Menor", setor: "Engenharia", descricao: "Área de escavação sem sinalização adequada", responsavel: "Carlos Eduardo Silva", prazo: "2025-04-30", status: "Fechado" },
  { companyIdx: 0, titulo: "Extintores sem manutenção", tipo: "NC_Maior", setor: "SST", descricao: "3 extintores com recarga vencida no canteiro", responsavel: "Ana Beatriz Oliveira", prazo: "2025-07-15", status: "Em_Andamento" },
  { companyIdx: 1, titulo: "Máquina sem check-list diário", tipo: "NC_Menor", setor: "Operações", descricao: "Retroescavadeira operando sem check-list preenchido", responsavel: "Marcos Antonio Pereira", prazo: "2025-05-10", status: "Fechado" },
  { companyIdx: 2, titulo: "Produto de limpeza sem FISPQ", tipo: "Observacao", setor: "Hospedagem", descricao: "Produtos químicos de limpeza sem ficha de segurança disponível", responsavel: "Ricardo Souza Mendes", prazo: "2025-08-30", status: "Aberto" },
  { companyIdx: 3, titulo: "EPI danificado em uso", tipo: "NC_Maior", setor: "Produção", descricao: "Colaborador usando cinto de segurança com talabarte danificado", responsavel: "Pedro Henrique Almeida", prazo: "2025-12-01", status: "Aberto" },
];
for (const d of desviosData) {
  await insert("deviations", { companyId: companyIds[d.companyIdx], titulo: d.titulo, tipoDesvio: d.tipo, setor: d.setor, descricao: d.descricao, responsavel: d.responsavel, prazo: d.prazo, statusDesvio: d.status });
  console.log(`  + ${empresas[d.companyIdx].nomeFantasia}: ${d.titulo}`);
}

// ========== 11. PLANOS DE AÇÃO 5W2H ==========
console.log("\n📝 Criando planos de ação 5W2H...");
const planosData = [
  { companyIdx: 0, oQue: "Instalar sinalização de segurança na obra", porQue: "Atender NR-18 e evitar acidentes", onde: "Canteiro de obras - Bloco A", quando: "2025-05-15", quem: "Carlos Eduardo Silva", como: "Contratar empresa de sinalização, instalar placas e fitas", quantoCusta: "R$ 3.500,00", status: "Concluido" },
  { companyIdx: 0, oQue: "Recarregar extintores vencidos", porQue: "Conformidade com NR-23", onde: "Canteiro de obras", quando: "2025-07-30", quem: "Ana Beatriz Oliveira", como: "Enviar extintores para empresa credenciada", quantoCusta: "R$ 1.200,00", status: "Em_Andamento" },
  { companyIdx: 1, oQue: "Implementar check-list digital para máquinas", porQue: "Garantir inspeção diária das máquinas", onde: "Pátio de máquinas", quando: "2025-06-01", quem: "Fernanda Costa Lima", como: "Desenvolver formulário digital no tablet", quantoCusta: "R$ 800,00", status: "Concluido" },
  { companyIdx: 2, oQue: "Elaborar FISPQ dos produtos de limpeza", porQue: "Atender NR-26 e proteger colaboradores", onde: "Almoxarifado de limpeza", quando: "2025-09-30", quem: "Ricardo Souza Mendes", como: "Solicitar FISPQ aos fornecedores, organizar pasta", quantoCusta: "R$ 0,00", status: "Pendente" },
  { companyIdx: 3, oQue: "Substituir EPIs danificados", porQue: "Evitar acidentes por EPI inadequado", onde: "Obra Residencial", quando: "2025-12-15", quem: "Pedro Henrique Almeida", como: "Inspecionar todos os EPIs, substituir os danificados", quantoCusta: "R$ 5.000,00", status: "Pendente" },
];
for (const p of planosData) {
  await insert("action_plans", { companyId: companyIds[p.companyIdx], oQue: p.oQue, porQue: p.porQue, onde: p.onde, quando: p.quando, quem: p.quem, como: p.como, quantoCusta: p.quantoCusta, statusPlano: p.status });
  console.log(`  + ${empresas[p.companyIdx].nomeFantasia}: ${p.oQue}`);
}

// ========== 12. DDS ==========
console.log("\n💬 Criando DDS...");
const ddsData = [
  { companyIdx: 0, tema: "Uso correto de EPI na construção civil", dataRealizacao: "2025-03-10", responsavel: "Ana Beatriz Oliveira", participantes: "Carlos Eduardo, Equipe Engenharia (12 pessoas)", descricao: "Abordagem sobre a importância do uso correto de cada EPI no canteiro de obras" },
  { companyIdx: 0, tema: "Prevenção de quedas em altura", dataRealizacao: "2025-06-15", responsavel: "Ana Beatriz Oliveira", participantes: "Toda equipe de obra (25 pessoas)", descricao: "Demonstração prática de uso do cinto paraquedista e linha de vida" },
  { companyIdx: 1, tema: "Operação segura de máquinas pesadas", dataRealizacao: "2025-04-20", responsavel: "Marcos Antonio Pereira", participantes: "Equipe de operações (8 pessoas)", descricao: "Check-list de segurança antes de operar retroescavadeira" },
  { companyIdx: 2, tema: "Ergonomia no trabalho", dataRealizacao: "2025-07-08", responsavel: "Ricardo Souza Mendes", participantes: "Equipe de manutenção e hospedagem (15 pessoas)", descricao: "Postura correta ao levantar peso e trabalhar em pé" },
  { companyIdx: 3, tema: "Primeiros socorros no canteiro", dataRealizacao: "2025-09-25", responsavel: "Luciana Maria Rodrigues", participantes: "Toda equipe (20 pessoas)", descricao: "Procedimentos básicos de primeiros socorros e uso do kit emergência" },
];
for (const d of ddsData) {
  await insert("dds", { companyId: companyIds[d.companyIdx], tema: d.tema, dataRealizacao: d.dataRealizacao, responsavel: d.responsavel, participantes: d.participantes, descricao: d.descricao });
  console.log(`  + ${empresas[d.companyIdx].nomeFantasia}: ${d.tema}`);
}

// ========== 13. EXTINTORES ==========
console.log("\n🧯 Criando extintores...");
const extintoresData = [
  { companyIdx: 0, numero: "EXT-001", tipo: "PQS", capacidade: "6kg", localizacao: "Escritório - Térreo", dataRecarga: "2025-01-15", validadeRecarga: "2026-01-15", status: "OK" },
  { companyIdx: 0, numero: "EXT-002", tipo: "CO2", capacidade: "6kg", localizacao: "Almoxarifado", dataRecarga: "2024-06-10", validadeRecarga: "2025-06-10", status: "Vencido" },
  { companyIdx: 0, numero: "EXT-003", tipo: "Agua", capacidade: "10L", localizacao: "Canteiro - Bloco A", dataRecarga: "2025-03-20", validadeRecarga: "2026-03-20", status: "OK" },
  { companyIdx: 1, numero: "EXT-004", tipo: "PQS", capacidade: "12kg", localizacao: "Pátio de máquinas", dataRecarga: "2025-02-01", validadeRecarga: "2026-02-01", status: "OK" },
  { companyIdx: 1, numero: "EXT-005", tipo: "CO2", capacidade: "6kg", localizacao: "Escritório", dataRecarga: "2024-08-15", validadeRecarga: "2025-08-15", status: "Vencido" },
  { companyIdx: 2, numero: "EXT-006", tipo: "PQS", capacidade: "6kg", localizacao: "Recepção", dataRecarga: "2025-04-10", validadeRecarga: "2026-04-10", status: "OK" },
  { companyIdx: 2, numero: "EXT-007", tipo: "AP", capacidade: "10L", localizacao: "Cozinha", dataRecarga: "2025-05-20", validadeRecarga: "2026-05-20", status: "OK" },
  { companyIdx: 3, numero: "EXT-008", tipo: "PQS", capacidade: "12kg", localizacao: "Obra - Térreo", dataRecarga: "2025-01-05", validadeRecarga: "2026-01-05", status: "OK" },
  { companyIdx: 3, numero: "EXT-009", tipo: "CO2", capacidade: "6kg", localizacao: "Escritório de obra", dataRecarga: "2024-09-01", validadeRecarga: "2025-09-01", status: "Vencido" },
];
for (const ext of extintoresData) {
  await insert("extinguishers", { companyId: companyIds[ext.companyIdx], numero: ext.numero, tipoExtintor: ext.tipo, capacidade: ext.capacidade, localizacao: ext.localizacao, dataRecarga: ext.dataRecarga, validadeRecarga: ext.validadeRecarga, statusExtintor: ext.status });
  console.log(`  + ${empresas[ext.companyIdx].nomeFantasia}: ${ext.numero} (${ext.tipo})`);
}

// ========== 14. HIDRANTES ==========
console.log("\n🔴 Criando hidrantes...");
const hidrantesData = [
  { companyIdx: 0, numero: "HID-001", localizacao: "Entrada principal", tipo: "Coluna", ultimaInspecao: "2025-02-10", proximaInspecao: "2025-08-10", status: "OK" },
  { companyIdx: 0, numero: "HID-002", localizacao: "Subsolo - Garagem", tipo: "Parede", ultimaInspecao: "2025-03-15", proximaInspecao: "2025-09-15", status: "OK" },
  { companyIdx: 2, numero: "HID-003", localizacao: "Hall do hotel - Térreo", tipo: "Coluna", ultimaInspecao: "2025-01-20", proximaInspecao: "2025-07-20", status: "Manutencao" },
  { companyIdx: 2, numero: "HID-004", localizacao: "Corredor 3º andar", tipo: "Parede", ultimaInspecao: "2025-04-05", proximaInspecao: "2025-10-05", status: "OK" },
  { companyIdx: 3, numero: "HID-005", localizacao: "Obra - Área externa", tipo: "Coluna", ultimaInspecao: "2025-05-12", proximaInspecao: "2025-11-12", status: "OK" },
];
for (const hid of hidrantesData) {
  await insert("hydrants", { companyId: companyIds[hid.companyIdx], numero: hid.numero, localizacao: hid.localizacao, tipoHidrante: hid.tipo, ultimaInspecao: hid.ultimaInspecao, proximaInspecao: hid.proximaInspecao, statusHidrante: hid.status });
  console.log(`  + ${empresas[hid.companyIdx].nomeFantasia}: ${hid.numero}`);
}

// ========== 15. VEÍCULOS ==========
console.log("\n🚗 Criando veículos...");
const veiculosData = [
  { companyIdx: 0, tipo: "Caminhao", placa: "ABC-1234", modelo: "VW Constellation 24.280", marca: "Volkswagen", anoFabricacao: "2021", renavam: "12345678901", responsavel: "Carlos Eduardo Silva", status: "Ativo", proximaManutencao: "2026-03-15" },
  { companyIdx: 1, tipo: "Maquina_Pesada", placa: "N/A", modelo: "Retroescavadeira 416F2", marca: "Caterpillar", anoFabricacao: "2019", responsavel: "Marcos Antonio Pereira", status: "Ativo", proximaManutencao: "2026-02-01" },
  { companyIdx: 1, tipo: "Van", placa: "DEF-5678", modelo: "Sprinter 415", marca: "Mercedes-Benz", anoFabricacao: "2022", renavam: "23456789012", responsavel: "Fernanda Costa Lima", status: "Manutencao" },
  { companyIdx: 3, tipo: "Carro", placa: "GHI-9012", modelo: "Hilux SW4", marca: "Toyota", anoFabricacao: "2023", renavam: "34567890123", responsavel: "Pedro Henrique Almeida", status: "Ativo", proximaManutencao: "2026-06-01" },
];
for (const v of veiculosData) {
  await insert("vehicles", { companyId: companyIds[v.companyIdx], tipoVeiculo: v.tipo, placa: v.placa, modelo: v.modelo, marca: v.marca, anoFabricacao: v.anoFabricacao, renavam: v.renavam || null, responsavel: v.responsavel, statusVeiculo: v.status, proximaManutencao: v.proximaManutencao || null });
  console.log(`  + ${empresas[v.companyIdx].nomeFantasia}: ${v.modelo}`);
}

// ========== 16. EQUIPAMENTOS ==========
console.log("\n🔧 Criando equipamentos...");
const equipamentosData = [
  { companyIdx: 0, nome: "Betoneira 400L", patrimonio: "PAT-001", tipo: "Construção", marca: "CSM", modelo: "CS 400", numeroSerie: "CSM-2021-001", localizacao: "Canteiro Bloco A", status: "Ativo", dataAquisicao: "2021-03-10" },
  { companyIdx: 0, nome: "Andaime Tubular 1.5m", patrimonio: "PAT-002", tipo: "Construção", marca: "Metax", modelo: "MT-150", localizacao: "Almoxarifado", status: "Ativo", dataAquisicao: "2020-08-15" },
  { companyIdx: 1, nome: "Compactador de Solo", patrimonio: "PAT-003", tipo: "Terraplanagem", marca: "Wacker Neuson", modelo: "DPU 6555", numeroSerie: "WN-2020-045", localizacao: "Pátio", status: "Manutencao", dataAquisicao: "2020-05-20" },
  { companyIdx: 2, nome: "Gerador de Energia 150kVA", patrimonio: "PAT-004", tipo: "Elétrico", marca: "Cummins", modelo: "C150D5", numeroSerie: "CUM-2022-012", localizacao: "Casa de máquinas", status: "Ativo", dataAquisicao: "2022-01-10" },
  { companyIdx: 3, nome: "Grua Torre 40m", patrimonio: "PAT-005", tipo: "Construção", marca: "Liebherr", modelo: "81K.1", numeroSerie: "LBH-2023-001", localizacao: "Obra Residencial", status: "Ativo", dataAquisicao: "2023-02-28" },
];
for (const eq of equipamentosData) {
  await insert("equipment", { companyId: companyIds[eq.companyIdx], nome: eq.nome, patrimonio: eq.patrimonio, tipoEquipamento: eq.tipo, marca: eq.marca, modelo: eq.modelo, numeroSerie: eq.numeroSerie || null, localizacao: eq.localizacao, statusEquipamento: eq.status, dataAquisicao: eq.dataAquisicao });
  console.log(`  + ${empresas[eq.companyIdx].nomeFantasia}: ${eq.nome}`);
}

// ========== 17. CIPA ELEIÇÕES ==========
console.log("\n🗳️ Criando eleições CIPA...");
const eleicoesData = [
  { companyIdx: 0, mandatoInicio: "2025-01-01", mandatoFim: "2026-12-31", statusEleicao: "Concluida", dataEdital: "2024-10-01", dataInscricaoInicio: "2024-10-15", dataInscricaoFim: "2024-10-30", dataEleicao: "2024-11-15", dataPosse: "2025-01-02" },
  { companyIdx: 2, mandatoInicio: "2025-06-01", mandatoFim: "2027-05-31", statusEleicao: "Concluida", dataEdital: "2025-03-01", dataInscricaoInicio: "2025-03-15", dataInscricaoFim: "2025-03-30", dataEleicao: "2025-04-15", dataPosse: "2025-06-01" },
  { companyIdx: 3, mandatoInicio: "2026-01-01", mandatoFim: "2027-12-31", statusEleicao: "Planejamento", dataEdital: "2025-09-01" },
];
const electionIds = [];
for (const el of eleicoesData) {
  const id = await insert("cipa_elections", {
    companyId: companyIds[el.companyIdx], mandatoInicio: el.mandatoInicio, mandatoFim: el.mandatoFim,
    statusEleicao: el.statusEleicao, dataEdital: el.dataEdital || null,
    dataInscricaoInicio: el.dataInscricaoInicio || null, dataInscricaoFim: el.dataInscricaoFim || null,
    dataEleicao: el.dataEleicao || null, dataPosse: el.dataPosse || null,
    observacoes: `Eleição CIPA ${empresas[el.companyIdx].nomeFantasia}`
  });
  electionIds.push(id);
  console.log(`  + ${empresas[el.companyIdx].nomeFantasia}: Gestão ${el.mandatoInicio.slice(0, 4)}/${el.mandatoFim.slice(0, 4)}`);
}

// ========== 18. CIPA MEMBROS ==========
console.log("\n👤 Criando membros CIPA...");
// FC Engenharia - eleição 0
await insert("cipa_members", { companyId: companyIds[0], electionId: electionIds[0], employeeId: empIds[0], cargoCipa: "Presidente", representacao: "Empregador", inicioEstabilidade: "2025-01-01", fimEstabilidade: "2027-12-31", statusMembro: "Ativo" });
await insert("cipa_members", { companyId: companyIds[0], electionId: electionIds[0], employeeId: empIds[1], cargoCipa: "Vice_Presidente", representacao: "Empregados", inicioEstabilidade: "2025-01-01", fimEstabilidade: "2027-12-31", statusMembro: "Ativo" });
console.log("  + FC ENGENHARIA: Carlos (Presidente) + Ana (Vice)");

// Hotel - eleição 1
await insert("cipa_members", { companyId: companyIds[2], electionId: electionIds[1], employeeId: empIds[4], cargoCipa: "Presidente", representacao: "Empregador", inicioEstabilidade: "2025-06-01", fimEstabilidade: "2028-05-31", statusMembro: "Ativo" });
await insert("cipa_members", { companyId: companyIds[2], electionId: electionIds[1], employeeId: empIds[5], cargoCipa: "Membro_Titular", representacao: "Empregados", inicioEstabilidade: "2025-06-01", fimEstabilidade: "2028-05-31", statusMembro: "Ativo" });
console.log("  + HOTEL CONSAGRADO: Ricardo (Presidente) + Juliana (Membro)");

// ========== 19. FOLHA DE PAGAMENTO ==========
console.log("\n💰 Criando folha de pagamento...");
for (let i = 0; i < empIds.length; i++) {
  const salBase = parseFloat(colaboradores[i].salarioBase);
  const inss = Math.min(salBase * 0.14, 908.85).toFixed(2);
  const baseIR = salBase - parseFloat(inss);
  const irrf = baseIR > 4664.68 ? (baseIR * 0.275 - 896.00).toFixed(2) : baseIR > 3751.06 ? (baseIR * 0.225 - 662.77).toFixed(2) : baseIR > 2826.66 ? (baseIR * 0.15 - 381.44).toFixed(2) : "0.00";
  const fgts = (salBase * 0.08).toFixed(2);
  const vt = (salBase * 0.06).toFixed(2);
  const va = "600.00";
  const totalProv = salBase.toFixed(2);
  const totalDesc = (parseFloat(inss) + parseFloat(irrf) + parseFloat(vt)).toFixed(2);
  const liquido = (salBase - parseFloat(totalDesc)).toFixed(2);

  // Jan and Feb 2026
  for (const mes of ["2026-01", "2026-02"]) {
    await insert("payroll", {
      companyId: colaboradores[i].companyId, employeeId: empIds[i], mesReferencia: mes,
      tipoFolha: "Mensal", salarioBruto: salBase.toFixed(2), totalProventos: totalProv,
      totalDescontos: totalDesc, salarioLiquido: liquido, inss, irrf, fgts,
      valeTransporte: vt, valeAlimentacao: va,
      bancoDestino: colaboradores[i].banco, dataPagamento: `${mes}-05`,
      observacoes: `Folha ${mes} processada`
    });
  }
  console.log(`  + ${colaboradores[i].nomeCompleto}: Folha Jan/Fev 2026`);
}

// ========== 20. HISTÓRICO FUNCIONAL ==========
console.log("\n📜 Criando histórico funcional...");
for (let i = 0; i < empIds.length; i++) {
  await insert("employee_history", {
    employeeId: empIds[i], companyId: colaboradores[i].companyId,
    tipo: "Admissao", descricao: `Admissão como ${colaboradores[i].cargo}`,
    valorNovo: colaboradores[i].cargo, dataEvento: colaboradores[i].dataAdmissao
  });
}
// Promoção para Carlos
await insert("employee_history", {
  employeeId: empIds[0], companyId: companyIds[0],
  tipo: "Promocao", descricao: "Promovido a Engenheiro Sênior",
  valorAnterior: "Engenheiro Civil", valorNovo: "Engenheiro Civil Sênior",
  dataEvento: "2023-01-15"
});
// Mudança de salário para Pedro
await insert("employee_history", {
  employeeId: empIds[6], companyId: companyIds[3],
  tipo: "Mudanca_Salario", descricao: "Reajuste salarial anual",
  valorAnterior: "R$ 7.000,00", valorNovo: "R$ 7.800,00",
  dataEvento: "2025-01-01"
});
console.log("  + Histórico funcional criado para todos");

// ========== 21. QUÍMICOS ==========
console.log("\n🧪 Criando produtos químicos...");
const quimicosData = [
  { companyIdx: 0, nome: "Cimento Portland CP-II", fabricante: "Votorantim", classificacaoPerigo: "Irritante para pele e olhos", localArmazenamento: "Almoxarifado - Área coberta", quantidadeEstoque: "500 sacos" },
  { companyIdx: 2, nome: "Hipoclorito de Sódio 12%", fabricante: "Química Amparo", numeroCAS: "7681-52-9", classificacaoPerigo: "Corrosivo", localArmazenamento: "DML - Subsolo", quantidadeEstoque: "50 litros" },
  { companyIdx: 3, nome: "Tinta Epóxi Bicomponente", fabricante: "Sherwin-Williams", classificacaoPerigo: "Inflamável, vapores tóxicos", localArmazenamento: "Depósito de tintas", quantidadeEstoque: "20 galões" },
];
for (const q of quimicosData) {
  await insert("chemicals", { companyId: companyIds[q.companyIdx], nome: q.nome, fabricante: q.fabricante, numeroCAS: q.numeroCAS || null, classificacaoPerigo: q.classificacaoPerigo, localArmazenamento: q.localArmazenamento, quantidadeEstoque: q.quantidadeEstoque });
  console.log(`  + ${empresas[q.companyIdx].nomeFantasia}: ${q.nome}`);
}

console.log("\n✅ ============================================");
console.log("✅ SEED COMPLETO! Dados inseridos com sucesso:");
console.log("✅ ============================================");
console.log(`   📋 4 Empresas`);
console.log(`   👥 8 Colaboradores (2 por empresa)`);
console.log(`   📚 20 Treinamentos`);
console.log(`   🏥 16 ASOs`);
console.log(`   ⚠️  6 Advertências`);
console.log(`   🦺 24 EPIs + 24 Entregas`);
console.log(`   🚨 4 Acidentes`);
console.log(`   ☢️  8 Riscos Ocupacionais`);
console.log(`   📋 5 Auditorias`);
console.log(`   🔴 5 Desvios`);
console.log(`   📝 5 Planos 5W2H`);
console.log(`   💬 5 DDS`);
console.log(`   🧯 9 Extintores`);
console.log(`   🔴 5 Hidrantes`);
console.log(`   🚗 4 Veículos`);
console.log(`   🔧 5 Equipamentos`);
console.log(`   🗳️  3 Eleições CIPA + 4 Membros`);
console.log(`   💰 16 Folhas de Pagamento`);
console.log(`   📜 10 Históricos Funcionais`);
console.log(`   🧪 3 Produtos Químicos`);
console.log("✅ ============================================");

await conn.end();
process.exit(0);
