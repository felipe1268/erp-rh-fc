/**
 * SEED MASSIVO - ERP RH & DP
 * Gera 60 funcionários (15 por empresa) com dados completos em todos os módulos
 * Execução: node server/seed-massive.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL não definida"); process.exit(1); }

const pool = mysql.createPool(DATABASE_URL);

// ============================================================
// DADOS BASE
// ============================================================

const EMPRESAS = [
  { cnpj: "12.345.678/0001-95", razaoSocial: "FC Engenharia Ltda", nomeFantasia: "FC Engenharia", cidade: "Recife", estado: "PE", cep: "50000-000", telefone: "(81) 3333-1111", email: "contato@fcengenharia.com.br" },
  { cnpj: "23.456.789/0001-00", razaoSocial: "Lock Naul Locações Ltda", nomeFantasia: "Lock Naul", cidade: "Recife", estado: "PE", cep: "51000-000", telefone: "(81) 3333-2222", email: "contato@locknaul.com.br" },
  { cnpj: "34.567.890/0001-12", razaoSocial: "Hotel Consagrado Ltda", nomeFantasia: "Hotel Consagrado", cidade: "Recife", estado: "PE", cep: "52000-000", telefone: "(81) 3333-3333", email: "contato@hotelconsagrado.com.br" },
  { cnpj: "45.678.901/0001-23", razaoSocial: "Júlio Ferraz Construções Ltda", nomeFantasia: "Júlio Ferraz", cidade: "Recife", estado: "PE", cep: "53000-000", telefone: "(81) 3333-4444", email: "contato@julioferraz.com.br" },
];

const NOMES_M = ["João Silva", "Carlos Oliveira", "Pedro Santos", "Lucas Almeida", "Rafael Costa", "Marcos Pereira", "André Souza", "Fernando Lima", "Roberto Nascimento", "Paulo Ribeiro", "Gustavo Mendes", "Ricardo Barbosa", "Thiago Carvalho", "Diego Fernandes", "Bruno Martins", "Eduardo Gomes", "Fábio Araújo", "Henrique Rocha", "Leandro Correia", "Matheus Teixeira", "Vinícius Moura", "Alexandre Dias", "Sérgio Nunes", "Daniel Cardoso", "Renato Monteiro", "Cláudio Pinto", "Márcio Freitas", "Rogério Vieira", "Antônio Campos", "José Lopes"];
const NOMES_F = ["Maria Oliveira", "Ana Santos", "Juliana Costa", "Fernanda Lima", "Patrícia Souza", "Camila Pereira", "Luciana Almeida", "Tatiana Ribeiro", "Vanessa Mendes", "Cristina Barbosa", "Adriana Carvalho", "Renata Fernandes", "Simone Martins", "Débora Gomes", "Elaine Araújo", "Priscila Rocha", "Raquel Correia", "Sandra Teixeira", "Márcia Moura", "Cláudia Dias", "Rosana Nunes", "Beatriz Cardoso", "Denise Monteiro", "Flávia Pinto", "Gabriela Freitas", "Helena Vieira", "Isabela Campos", "Jéssica Lopes", "Karina Castro", "Larissa Ramos"];

const CARGOS_ENG = ["Engenheiro Civil", "Mestre de Obras", "Pedreiro", "Eletricista", "Encanador", "Pintor", "Carpinteiro", "Armador", "Operador de Máquinas", "Servente", "Almoxarife", "Técnico de Segurança", "Apontador", "Motorista", "Auxiliar Administrativo"];
const CARGOS_LOC = ["Gerente Operacional", "Mecânico", "Operador de Guindaste", "Motorista de Caminhão", "Auxiliar de Mecânica", "Eletricista Industrial", "Soldador", "Torneiro Mecânico", "Operador de Empilhadeira", "Almoxarife", "Auxiliar Administrativo", "Técnico de Segurança", "Supervisor de Campo", "Ajudante Geral", "Recepcionista"];
const CARGOS_HOTEL = ["Gerente Geral", "Recepcionista", "Camareiro(a)", "Cozinheiro(a)", "Auxiliar de Cozinha", "Garçom/Garçonete", "Porteiro", "Segurança", "Manutenção", "Governanta", "Auxiliar de Limpeza", "Barman", "Auxiliar Administrativo", "Contador", "Recursos Humanos"];
const CARGOS_JF = ["Engenheiro Civil", "Técnico em Edificações", "Mestre de Obras", "Pedreiro", "Eletricista", "Encanador", "Pintor", "Carpinteiro", "Armador", "Operador de Betoneira", "Servente", "Almoxarife", "Técnico de Segurança", "Apontador", "Auxiliar Administrativo"];

const SETORES = ["Administrativo", "Operacional", "Produção", "Manutenção", "Segurança", "RH", "Financeiro", "Logística", "Qualidade", "TI"];
const BANCOS = ["Caixa Econômica Federal", "Banco Santander", "Banco do Brasil", "Bradesco", "Itaú", "Nubank"];
const BAIRROS = ["Boa Viagem", "Casa Forte", "Espinheiro", "Aflitos", "Graças", "Madalena", "Torre", "Imbiribeira", "Pina", "Setúbal", "Várzea", "Cordeiro", "Encruzilhada", "Tamarineira", "Derby"];

const TREINAMENTOS = [
  { nome: "NR-06 - EPI", norma: "NR-06", cargaHoraria: 4 },
  { nome: "NR-10 - Segurança em Eletricidade", norma: "NR-10", cargaHoraria: 40 },
  { nome: "NR-12 - Máquinas e Equipamentos", norma: "NR-12", cargaHoraria: 8 },
  { nome: "NR-18 - Construção Civil", norma: "NR-18", cargaHoraria: 6 },
  { nome: "NR-33 - Espaço Confinado", norma: "NR-33", cargaHoraria: 16 },
  { nome: "NR-35 - Trabalho em Altura", norma: "NR-35", cargaHoraria: 8 },
  { nome: "Integração de Segurança", norma: "Interna", cargaHoraria: 4 },
  { nome: "Primeiros Socorros", norma: "NR-07", cargaHoraria: 8 },
  { nome: "Combate a Incêndio", norma: "NR-23", cargaHoraria: 4 },
  { nome: "CIPA", norma: "NR-05", cargaHoraria: 20 },
];

const EPIS = [
  { nome: "Capacete de Segurança", ca: "31469" },
  { nome: "Óculos de Proteção", ca: "15618" },
  { nome: "Protetor Auricular", ca: "14235" },
  { nome: "Luva de Vaqueta", ca: "10695" },
  { nome: "Bota de Segurança", ca: "31224" },
  { nome: "Cinto de Segurança", ca: "35529" },
  { nome: "Máscara PFF2", ca: "38504" },
  { nome: "Luva Nitrílica", ca: "27581" },
  { nome: "Protetor Facial", ca: "20573" },
  { nome: "Avental de PVC", ca: "18234" },
];

const PARTES_CORPO = ["Mão direita", "Mão esquerda", "Pé direito", "Pé esquerdo", "Cabeça", "Olho direito", "Olho esquerdo", "Costas", "Braço direito", "Braço esquerdo", "Perna direita", "Perna esquerda", "Tórax", "Coluna lombar", "Ombro direito"];
const LOCAIS_ACIDENTE = ["Canteiro de obras", "Almoxarifado", "Escritório", "Estacionamento", "Refeitório", "Banheiro", "Área de carga", "Oficina mecânica", "Cozinha", "Recepção"];

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
function formatDate(d) { return d.toISOString().split("T")[0]; }
function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function generateCPF() {
  const n = Array.from({length: 9}, () => randomInt(0, 9));
  let d1 = 0; for (let i = 0; i < 9; i++) d1 += n[i] * (10 - i); d1 = 11 - (d1 % 11); if (d1 >= 10) d1 = 0; n.push(d1);
  let d2 = 0; for (let i = 0; i < 10; i++) d2 += n[i] * (11 - i); d2 = 11 - (d2 % 11); if (d2 >= 10) d2 = 0; n.push(d2);
  return `${n.slice(0,3).join("")}.${n.slice(3,6).join("")}.${n.slice(6,9).join("")}-${n.slice(9).join("")}`;
}
function generateRG() { return `${randomInt(1,9)}.${randomInt(100,999)}.${randomInt(100,999)}`; }
function generatePIS() { return `${randomInt(100,999)}.${randomInt(10000,99999)}.${randomInt(10,99)}-${randomInt(0,9)}`; }
function generateCTPS() { return `${randomInt(10000,99999)}`; }

// ============================================================
// MAIN SEED
// ============================================================

async function seed() {
  const conn = await pool.getConnection();
  try {
    console.log("🌱 Iniciando seed massivo...");

    // 1. Limpar dados existentes (na ordem correta por causa de FKs)
    const tablesToClean = [
      "monthly_payroll_summary", "vr_benefits", "extra_payments", "advances",
      "payroll_uploads", "dixi_devices", "training_documents",
      "cipa_members", "cipa_elections", "dds", "chemicals",
      "action_plans", "deviations", "audits",
      "epi_deliveries", "epis", "warnings", "risks", "accidents",
      "trainings", "asos", "time_records", "payroll",
      "hydrants", "extinguishers", "equipment", "vehicles",
      "employee_history", "employees", "companies"
    ];
    for (const t of tablesToClean) {
      await conn.execute(`DELETE FROM \`${t}\``);
    }
    console.log("✅ Tabelas limpas");

    // 2. Inserir empresas
    const companyIds = [];
    for (const emp of EMPRESAS) {
      const [result] = await conn.execute(
        `INSERT INTO companies (cnpj, razaoSocial, nomeFantasia, cidade, estado, cep, telefone, email, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [emp.cnpj, emp.razaoSocial, emp.nomeFantasia, emp.cidade, emp.estado, emp.cep, emp.telefone, emp.email]
      );
      companyIds.push(result.insertId);
      console.log(`  Empresa: ${emp.nomeFantasia} (ID: ${result.insertId})`);
    }

    // 3. Inserir funcionários (15 por empresa)
    const allEmployees = []; // { id, companyId, nome, cargo, setor, ... }
    const cargosByCompany = [CARGOS_ENG, CARGOS_LOC, CARGOS_HOTEL, CARGOS_JF];

    for (let ci = 0; ci < 4; ci++) {
      const companyId = companyIds[ci];
      const cargos = cargosByCompany[ci];

      for (let ei = 0; ei < 15; ei++) {
        const isMale = ei < 10; // 10 homens, 5 mulheres por empresa
        const nomes = isMale ? NOMES_M : NOMES_F;
        const nameIndex = ci * 15 + ei;
        const nome = nomes[nameIndex % nomes.length];
        const sexo = isMale ? "M" : "F";
        const cargo = cargos[ei % cargos.length];
        const setor = SETORES[ei % SETORES.length];
        const banco = randomItem(BANCOS);
        const bairro = randomItem(BAIRROS);
        const dataNasc = formatDate(randomDate(new Date(1970, 0, 1), new Date(2000, 11, 31)));
        const dataAdm = formatDate(randomDate(new Date(2019, 0, 1), new Date(2025, 5, 30)));
        const salarioBase = (randomInt(1500, 8000)).toFixed(2);
        const valorHora = (parseFloat(salarioBase) / 220).toFixed(2);
        const cpf = generateCPF();

        // Status variado
        const statusOptions = ["Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Ativo", "Ferias", "Afastado", "Licenca", "Desligado", "Ativo"];
        const status = statusOptions[ei];
        const dataDemissao = status === "Desligado" ? formatDate(randomDate(new Date(2025, 0, 1), new Date(2025, 11, 30))) : null;
        const estadoCivil = randomItem(["Solteiro", "Casado", "Divorciado", "Uniao_Estavel"]);
        const tipoContrato = ei < 13 ? "CLT" : (ei === 13 ? "Temporario" : "Estagio");

        const [result] = await conn.execute(
          `INSERT INTO employees (companyId, matricula, nomeCompleto, cpf, rg, orgaoEmissor, dataNascimento, sexo, estadoCivil, nacionalidade, naturalidade, nomeMae, nomePai, ctps, serieCTPS, pis, logradouro, numero, bairro, cidade, estado, cep, celular, email, cargo, funcao, setor, dataAdmissao, dataDemissao, salarioBase, valorHora, horasMensais, tipoContrato, jornadaTrabalho, banco, bancoNome, agencia, conta, tipoConta, chavePix, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            companyId, `${1000 + ci * 100 + ei}`, nome, cpf, generateRG(), "SSP/PE",
            dataNasc, sexo, estadoCivil, "Brasileira", "Recife/PE",
            `Maria ${nome.split(" ")[1] || "Silva"}`, `José ${nome.split(" ")[1] || "Silva"}`,
            generateCTPS(), `000${ci}`, generatePIS(),
            `Rua ${randomItem(["das Flores", "do Sol", "da Paz", "dos Ventos", "da Liberdade", "do Mar"])}`,
            `${randomInt(1, 999)}`, bairro, "Recife", "PE", `5${randomInt(0,9)}${randomInt(0,9)}00-${randomInt(100,999)}`,
            `(81) 9${randomInt(8000,9999)}-${randomInt(1000,9999)}`,
            `${nome.toLowerCase().replace(/ /g, ".").normalize("NFD").replace(/[\u0300-\u036f]/g, "")}@email.com`,
            cargo, cargo, setor, dataAdm, dataDemissao,
            salarioBase, valorHora, "220", tipoContrato, "44h semanais",
            banco, banco, `${randomInt(1000,9999)}`, `${randomInt(10000,99999)}-${randomInt(0,9)}`,
            randomItem(["Corrente", "Poupanca"]), cpf, status
          ]
        );

        allEmployees.push({
          id: result.insertId, companyId, nome, cargo, setor, salarioBase, valorHora, dataAdm, status
        });
      }
    }
    console.log(`✅ ${allEmployees.length} funcionários inseridos`);

    // 4. Histórico funcional (admissão para todos)
    for (const emp of allEmployees) {
      await conn.execute(
        `INSERT INTO employee_history (employeeId, companyId, tipo, descricao, dataEvento) VALUES (?, ?, 'Admissao', ?, ?)`,
        [emp.id, emp.companyId, `Admissão - ${emp.cargo}`, emp.dataAdm]
      );
    }
    console.log("✅ Histórico funcional inserido");

    // 5. ASOs (2-3 por funcionário)
    let asoCount = 0;
    const medicos = ["Dr. Carlos Mendes", "Dra. Ana Paula", "Dr. Roberto Lima", "Dra. Fernanda Costa"];
    const clinicas = ["Clínica Saúde Total", "MedTrab Recife", "Clínica do Trabalho", "Saúde Ocupacional PE"];
    for (const emp of allEmployees) {
      const numAsos = randomInt(2, 3);
      for (let i = 0; i < numAsos; i++) {
        const tipos = ["Admissional", "Periodico", "Periodico"];
        const tipo = tipos[i] || "Periodico";
        const dataExame = formatDate(randomDate(new Date(2023, 0, 1), new Date(2025, 11, 30)));
        const dataVal = new Date(dataExame);
        dataVal.setFullYear(dataVal.getFullYear() + 1);
        const resultado = Math.random() > 0.1 ? "Apto" : (Math.random() > 0.5 ? "Apto_Restricao" : "Inapto");
        await conn.execute(
          `INSERT INTO asos (companyId, employeeId, tipo, dataExame, dataValidade, resultado, medico, crm, clinica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [emp.companyId, emp.id, tipo, dataExame, formatDate(dataVal), resultado, randomItem(medicos), `CRM-PE ${randomInt(10000,99999)}`, randomItem(clinicas)]
        );
        asoCount++;
      }
    }
    console.log(`✅ ${asoCount} ASOs inseridos`);

    // 6. Treinamentos (2-4 por funcionário)
    let trainCount = 0;
    const instrutores = ["José Carlos", "Maria Aparecida", "Roberto Alves", "Ana Beatriz", "Fernando Souza"];
    const entidades = ["SENAI", "SESI", "Empresa Interna", "Safety Training", "Prevenir Consultoria"];
    for (const emp of allEmployees) {
      const numTreinos = randomInt(2, 4);
      const selectedTreinos = [...TREINAMENTOS].sort(() => Math.random() - 0.5).slice(0, numTreinos);
      for (const treino of selectedTreinos) {
        const dataReal = formatDate(randomDate(new Date(2023, 0, 1), new Date(2025, 11, 30)));
        const dataVal = new Date(dataReal);
        dataVal.setFullYear(dataVal.getFullYear() + (treino.norma === "NR-35" ? 2 : 1));
        const now = new Date();
        const statusT = dataVal > now ? "Valido" : "Vencido";
        await conn.execute(
          `INSERT INTO trainings (companyId, employeeId, nome, norma, cargaHoraria, dataRealizacao, dataValidade, instrutor, entidade, statusTreinamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [emp.companyId, emp.id, treino.nome, treino.norma, treino.cargaHoraria, dataReal, formatDate(dataVal), randomItem(instrutores), randomItem(entidades), statusT]
        );
        trainCount++;
      }
    }
    console.log(`✅ ${trainCount} treinamentos inseridos`);

    // 7. EPIs e entregas
    let epiCount = 0;
    const epiIds = {};
    for (const cId of companyIds) {
      epiIds[cId] = [];
      for (const epi of EPIS) {
        const [result] = await conn.execute(
          `INSERT INTO epis (companyId, nome, ca, fabricante, quantidadeEstoque) VALUES (?, ?, ?, ?, ?)`,
          [cId, epi.nome, epi.ca, randomItem(["3M", "MSA", "Honeywell", "Delta Plus", "Vonder"]), randomInt(10, 200)]
        );
        epiIds[cId].push(result.insertId);
        epiCount++;
      }
    }
    // Entregas de EPI (3-5 por funcionário)
    let deliveryCount = 0;
    for (const emp of allEmployees) {
      const numEntregas = randomInt(3, 5);
      const compEpis = epiIds[emp.companyId];
      for (let i = 0; i < numEntregas; i++) {
        const epiId = compEpis[randomInt(0, compEpis.length - 1)];
        const dataEntrega = formatDate(randomDate(new Date(2023, 0, 1), new Date(2025, 11, 30)));
        await conn.execute(
          `INSERT INTO epi_deliveries (companyId, epiId, employeeId, quantidade, dataEntrega, motivo) VALUES (?, ?, ?, ?, ?, ?)`,
          [emp.companyId, epiId, emp.id, randomInt(1, 3), dataEntrega, randomItem(["Substituição", "Novo", "Desgaste", "Perda"])]
        );
        deliveryCount++;
      }
    }
    console.log(`✅ ${epiCount} EPIs e ${deliveryCount} entregas inseridos`);

    // 8. Advertências (1-2 para ~40% dos funcionários)
    let warnCount = 0;
    for (const emp of allEmployees) {
      if (Math.random() > 0.4) continue;
      const numWarn = randomInt(1, 2);
      for (let i = 0; i < numWarn; i++) {
        const tipo = randomItem(["Verbal", "Escrita", "Suspensao", "OSS"]);
        const motivos = ["Atraso reincidente", "Falta injustificada", "Uso incorreto de EPI", "Comportamento inadequado", "Descumprimento de norma de segurança", "Uso de celular em área restrita"];
        await conn.execute(
          `INSERT INTO warnings (companyId, employeeId, tipoAdvertencia, dataOcorrencia, motivo, descricao) VALUES (?, ?, ?, ?, ?, ?)`,
          [emp.companyId, emp.id, tipo, formatDate(randomDate(new Date(2024, 0, 1), new Date(2025, 11, 30))), randomItem(motivos), `Advertência ${tipo.toLowerCase()} aplicada ao colaborador ${emp.nome}`]
        );
        warnCount++;
      }
    }
    console.log(`✅ ${warnCount} advertências inseridas`);

    // 9. Acidentes (1 para ~20% dos funcionários)
    let accCount = 0;
    for (const emp of allEmployees) {
      if (Math.random() > 0.2) continue;
      const tipo = randomItem(["Tipico", "Trajeto", "Doenca_Ocupacional"]);
      const gravidade = randomItem(["Leve", "Leve", "Leve", "Moderado", "Moderado", "Grave"]);
      const diasAfast = gravidade === "Leve" ? randomInt(0, 3) : (gravidade === "Moderado" ? randomInt(3, 15) : randomInt(15, 60));
      await conn.execute(
        `INSERT INTO accidents (companyId, employeeId, dataAcidente, horaAcidente, tipoAcidente, gravidade, localAcidente, descricao, parteCorpoAtingida, diasAfastamento, acaoCorretiva) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emp.companyId, emp.id,
          formatDate(randomDate(new Date(2024, 0, 1), new Date(2025, 11, 30))),
          `${randomInt(6, 18)}:${randomInt(0, 59).toString().padStart(2, "0")}`,
          tipo, gravidade, randomItem(LOCAIS_ACIDENTE),
          `Acidente ${tipo.toLowerCase()} envolvendo ${emp.nome} durante atividade de ${emp.cargo.toLowerCase()}`,
          randomItem(PARTES_CORPO), diasAfast,
          `Investigação realizada. Medidas corretivas implementadas: ${randomItem(["Treinamento adicional", "Sinalização reforçada", "Revisão de procedimento", "Substituição de equipamento"])}`
        ]
      );
      accCount++;
    }
    console.log(`✅ ${accCount} acidentes inseridos`);

    // 10. Riscos ocupacionais (3-5 por empresa)
    let riskCount = 0;
    const agentesRisco = [
      { agente: "Ruído", tipo: "Fisico", fonte: "Máquinas e equipamentos" },
      { agente: "Poeira de cimento", tipo: "Quimico", fonte: "Processo de mistura" },
      { agente: "Vibração", tipo: "Fisico", fonte: "Ferramentas manuais" },
      { agente: "Postura inadequada", tipo: "Ergonomico", fonte: "Trabalho repetitivo" },
      { agente: "Queda de altura", tipo: "Acidente", fonte: "Trabalho em andaimes" },
      { agente: "Calor excessivo", tipo: "Fisico", fonte: "Exposição solar" },
      { agente: "Solventes orgânicos", tipo: "Quimico", fonte: "Pintura e acabamento" },
    ];
    for (const cId of companyIds) {
      const numRiscos = randomInt(3, 5);
      const selected = [...agentesRisco].sort(() => Math.random() - 0.5).slice(0, numRiscos);
      for (const r of selected) {
        await conn.execute(
          `INSERT INTO risks (companyId, setor, agenteRisco, tipoRisco, fonteGeradora, grauRisco, medidasControle) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [cId, randomItem(SETORES), r.agente, r.tipo, r.fonte, randomItem(["Baixo", "Medio", "Alto", "Critico"]), `Uso de EPI adequado. Monitoramento periódico. Treinamento dos colaboradores.`]
        );
        riskCount++;
      }
    }
    console.log(`✅ ${riskCount} riscos inseridos`);

    // 11. Registros de ponto (últimos 3 meses para funcionários ativos)
    let timeCount = 0;
    const activeEmps = allEmployees.filter(e => e.status === "Ativo");
    for (const emp of activeEmps) {
      for (let m = 0; m < 3; m++) {
        const month = new Date(2025, 10 - m, 1); // Nov, Oct, Sep 2025
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        for (let d = 1; d <= Math.min(daysInMonth, 22); d++) {
          const date = new Date(month.getFullYear(), month.getMonth(), d);
          if (date.getDay() === 0 || date.getDay() === 6) continue; // pular fins de semana
          const isFalta = Math.random() < 0.05;
          if (isFalta) {
            await conn.execute(
              `INSERT INTO time_records (companyId, employeeId, data, faltas, justificativa, fonte) VALUES (?, ?, ?, ?, ?, ?)`,
              [emp.companyId, emp.id, formatDate(date), "1", Math.random() > 0.5 ? "Atestado médico" : null, "seed"]
            );
          } else {
            const entrada1 = `07:${randomInt(0, 15).toString().padStart(2, "0")}`;
            const saida1 = `11:${randomInt(50, 59).toString().padStart(2, "0")}`;
            const entrada2 = `13:${randomInt(0, 10).toString().padStart(2, "0")}`;
            const hasExtra = Math.random() < 0.3;
            const saida2 = hasExtra ? `18:${randomInt(0, 59).toString().padStart(2, "0")}` : `17:${randomInt(0, 10).toString().padStart(2, "0")}`;
            const horasExtras = hasExtra ? `${randomInt(1, 3)}:${randomInt(0, 59).toString().padStart(2, "0")}` : "0:00";
            await conn.execute(
              `INSERT INTO time_records (companyId, employeeId, data, entrada1, saida1, entrada2, saida2, horasTrabalhadas, horasExtras, fonte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [emp.companyId, emp.id, formatDate(date), entrada1, saida1, entrada2, saida2, "8:48", horasExtras, "seed"]
            );
          }
          timeCount++;
        }
      }
    }
    console.log(`✅ ${timeCount} registros de ponto inseridos`);

    // 12. Folha de pagamento (últimos 3 meses)
    let payrollCount = 0;
    for (const emp of activeEmps) {
      for (let m = 0; m < 3; m++) {
        const mesRef = `2025-${(11 - m).toString().padStart(2, "0")}`;
        const salBruto = parseFloat(emp.salarioBase);
        const inss = (salBruto * 0.09).toFixed(2);
        const irrf = salBruto > 3000 ? (salBruto * 0.075).toFixed(2) : "0.00";
        const fgts = (salBruto * 0.08).toFixed(2);
        const vt = (salBruto * 0.06).toFixed(2);
        const totalDesc = (parseFloat(inss) + parseFloat(irrf) + parseFloat(vt)).toFixed(2);
        const liquido = (salBruto - parseFloat(totalDesc)).toFixed(2);
        await conn.execute(
          `INSERT INTO payroll (companyId, employeeId, mesReferencia, tipoFolha, salarioBruto, totalProventos, totalDescontos, salarioLiquido, inss, irrf, fgts, valeTransporte, bancoDestino) VALUES (?, ?, ?, 'Mensal', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [emp.companyId, emp.id, mesRef, salBruto.toFixed(2), salBruto.toFixed(2), totalDesc, liquido, inss, irrf, fgts, vt, randomItem(BANCOS)]
        );
        payrollCount++;
      }
    }
    console.log(`✅ ${payrollCount} registros de folha inseridos`);

    // 13. Adiantamentos (últimos 2 meses para funcionários ativos)
    let advCount = 0;
    for (const emp of activeEmps) {
      for (let m = 0; m < 2; m++) {
        const mesRef = `2025-${(11 - m).toString().padStart(2, "0")}`;
        const valorAdiant = (parseFloat(emp.salarioBase) * 0.4).toFixed(2);
        const descontoIR = parseFloat(emp.salarioBase) > 3000 ? (parseFloat(valorAdiant) * 0.075).toFixed(2) : "0.00";
        const liquido = (parseFloat(valorAdiant) - parseFloat(descontoIR)).toFixed(2);
        const diasFaltas = Math.random() < 0.1 ? randomInt(1, 5) : 0;
        const aprovado = diasFaltas >= 10 ? "Reprovado" : "Aprovado";
        await conn.execute(
          `INSERT INTO advances (companyId, employeeId, mesReferencia, valorAdiantamento, valorLiquido, descontoIR, bancoDestino, diasFaltas, aprovado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [emp.companyId, emp.id, mesRef, valorAdiant, liquido, descontoIR, randomItem(BANCOS), diasFaltas, aprovado]
        );
        advCount++;
      }
    }
    console.log(`✅ ${advCount} adiantamentos inseridos`);

    // 14. Pagamentos extras (horas extras para ~30% dos funcionários)
    let extraCount = 0;
    for (const emp of activeEmps) {
      if (Math.random() > 0.3) continue;
      const mesRef = "2025-11";
      const valorHora = parseFloat(emp.valorHora);
      const percentual = randomItem(["50", "75", "100"]);
      const qtdHoras = randomInt(5, 30).toString();
      const valorTotal = (valorHora * (1 + parseInt(percentual) / 100) * parseInt(qtdHoras)).toFixed(2);
      await conn.execute(
        `INSERT INTO extra_payments (companyId, employeeId, mesReferencia, tipoExtra, descricao, valorHoraBase, percentualAcrescimo, quantidadeHoras, valorTotal, bancoDestino) VALUES (?, ?, ?, 'Horas_Extras', ?, ?, ?, ?, ?, ?)`,
        [emp.companyId, emp.id, mesRef, `Horas extras ${percentual}% - ${emp.nome}`, emp.valorHora, percentual, qtdHoras, valorTotal, randomItem(BANCOS)]
      );
      extraCount++;
    }
    console.log(`✅ ${extraCount} pagamentos extras inseridos`);

    // 15. VR/iFood (todos os funcionários ativos)
    let vrCount = 0;
    for (const emp of activeEmps) {
      const mesRef = "2025-11";
      const valorDiario = randomItem(["25.00", "30.00", "35.00"]);
      const diasUteis = 22;
      const valorTotal = (parseFloat(valorDiario) * diasUteis).toFixed(2);
      await conn.execute(
        `INSERT INTO vr_benefits (companyId, employeeId, mesReferencia, valorDiario, diasUteis, valorTotal, operadora) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [emp.companyId, emp.id, mesRef, valorDiario, diasUteis, valorTotal, "iFood Benefícios"]
      );
      vrCount++;
    }
    console.log(`✅ ${vrCount} VR/iFood inseridos`);

    // 16. Veículos (3-5 por empresa)
    let vehCount = 0;
    const veiculos = [
      { tipo: "Caminhao", modelo: "VW Constellation 24.280", marca: "Volkswagen" },
      { tipo: "Carro", modelo: "Fiat Strada", marca: "Fiat" },
      { tipo: "Van", modelo: "Sprinter 415", marca: "Mercedes-Benz" },
      { tipo: "Maquina_Pesada", modelo: "Retroescavadeira 416F2", marca: "Caterpillar" },
      { tipo: "Carro", modelo: "Toyota Hilux", marca: "Toyota" },
      { tipo: "Moto", modelo: "Honda CG 160", marca: "Honda" },
    ];
    for (const cId of companyIds) {
      const numVeic = randomInt(3, 5);
      for (let i = 0; i < numVeic; i++) {
        const v = veiculos[i % veiculos.length];
        await conn.execute(
          `INSERT INTO vehicles (companyId, tipoVeiculo, placa, modelo, marca, anoFabricacao, responsavel, statusVeiculo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cId, v.tipo, `PE${randomInt(1,9)}${String.fromCharCode(65+randomInt(0,25))}${randomInt(10,99)}`, v.modelo, v.marca, `${randomInt(2018, 2025)}`, randomItem(allEmployees.filter(e => e.companyId === cId)).nome, randomItem(["Ativo", "Ativo", "Manutencao"])]
        );
        vehCount++;
      }
    }
    console.log(`✅ ${vehCount} veículos inseridos`);

    // 17. Equipamentos (3-5 por empresa)
    let equipCount = 0;
    const equips = [
      { nome: "Betoneira 400L", tipo: "Máquina" },
      { nome: "Furadeira Industrial", tipo: "Ferramenta" },
      { nome: "Compressor de Ar", tipo: "Máquina" },
      { nome: "Serra Circular", tipo: "Ferramenta" },
      { nome: "Gerador 50kVA", tipo: "Gerador" },
    ];
    for (const cId of companyIds) {
      const numEquip = randomInt(3, 5);
      for (let i = 0; i < numEquip; i++) {
        const eq = equips[i % equips.length];
        await conn.execute(
          `INSERT INTO equipment (companyId, nome, patrimonio, tipoEquipamento, marca, modelo, localizacao, responsavel, statusEquipamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cId, eq.nome, `PAT-${randomInt(1000, 9999)}`, eq.tipo, randomItem(["Makita", "Bosch", "DeWalt", "Tramontina"]), `Modelo ${randomInt(100, 999)}`, randomItem(["Almoxarifado", "Canteiro 1", "Canteiro 2", "Oficina"]), randomItem(allEmployees.filter(e => e.companyId === cId)).nome, randomItem(["Ativo", "Ativo", "Manutencao"])]
        );
        equipCount++;
      }
    }
    console.log(`✅ ${equipCount} equipamentos inseridos`);

    // 18. Extintores (4-6 por empresa)
    let extCount = 0;
    for (const cId of companyIds) {
      const numExt = randomInt(4, 6);
      for (let i = 0; i < numExt; i++) {
        const tipo = randomItem(["PQS", "CO2", "Agua", "AP"]);
        const dataRecarga = formatDate(randomDate(new Date(2024, 0, 1), new Date(2025, 6, 30)));
        const valRecarga = new Date(dataRecarga);
        valRecarga.setFullYear(valRecarga.getFullYear() + 1);
        await conn.execute(
          `INSERT INTO extinguishers (companyId, numero, tipoExtintor, capacidade, localizacao, dataRecarga, validadeRecarga, statusExtintor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cId, `EXT-${String(i + 1).padStart(3, "0")}`, tipo, randomItem(["4kg", "6kg", "8kg", "12kg"]), randomItem(["Recepção", "Corredor 1", "Corredor 2", "Almoxarifado", "Refeitório", "Escritório"]), dataRecarga, formatDate(valRecarga), valRecarga > new Date() ? "OK" : "Vencido"]
        );
        extCount++;
      }
    }
    console.log(`✅ ${extCount} extintores inseridos`);

    // 19. Hidrantes (2-3 por empresa)
    let hydCount = 0;
    for (const cId of companyIds) {
      const numHyd = randomInt(2, 3);
      for (let i = 0; i < numHyd; i++) {
        const ultimaInsp = formatDate(randomDate(new Date(2024, 0, 1), new Date(2025, 6, 30)));
        const proxInsp = new Date(ultimaInsp);
        proxInsp.setMonth(proxInsp.getMonth() + 6);
        await conn.execute(
          `INSERT INTO hydrants (companyId, numero, localizacao, tipoHidrante, ultimaInspecao, proximaInspecao, statusHidrante) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [cId, `HID-${String(i + 1).padStart(3, "0")}`, randomItem(["Entrada principal", "Estacionamento", "Área de produção", "Corredor central"]), randomItem(["Coluna", "Parede", "Subterrâneo"]), ultimaInsp, formatDate(proxInsp), randomItem(["OK", "OK", "Manutencao"])]
        );
        hydCount++;
      }
    }
    console.log(`✅ ${hydCount} hidrantes inseridos`);

    // 20. Auditorias (2-3 por empresa)
    let auditCount = 0;
    const auditIds = {};
    for (const cId of companyIds) {
      auditIds[cId] = [];
      const numAudits = randomInt(2, 3);
      for (let i = 0; i < numAudits; i++) {
        const [result] = await conn.execute(
          `INSERT INTO audits (companyId, titulo, tipoAuditoria, dataAuditoria, auditor, setor, resultadoAuditoria, descricao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cId, `Auditoria ${randomItem(["ISO 9001", "ISO 14001", "ISO 45001", "Interna SST", "Cliente"])} - ${randomItem(["Q1", "Q2", "Q3", "Q4"])} 2025`, randomItem(["Interna", "Externa", "Cliente", "Certificadora"]), formatDate(randomDate(new Date(2025, 0, 1), new Date(2025, 11, 30))), randomItem(["João Auditor", "Maria Auditora", "Carlos Perito"]), randomItem(SETORES), randomItem(["Conforme", "Nao_Conforme", "Observacao", "Pendente"]), "Auditoria realizada conforme procedimento interno."]
        );
        auditIds[cId].push(result.insertId);
        auditCount++;
      }
    }
    console.log(`✅ ${auditCount} auditorias inseridas`);

    // 21. Desvios (2-4 por empresa)
    let devCount = 0;
    const devIds = {};
    for (const cId of companyIds) {
      devIds[cId] = [];
      const numDevs = randomInt(2, 4);
      for (let i = 0; i < numDevs; i++) {
        const auditId = auditIds[cId].length > 0 ? randomItem(auditIds[cId]) : null;
        const [result] = await conn.execute(
          `INSERT INTO deviations (companyId, auditId, titulo, tipoDesvio, setor, descricao, causaRaiz, statusDesvio, responsavel, prazo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cId, auditId, `Desvio ${randomItem(["Procedimento", "Documentação", "EPI", "Sinalização", "Treinamento"])} - ${randomItem(SETORES)}`, randomItem(["NC_Maior", "NC_Menor", "Observacao", "Oportunidade_Melhoria"]), randomItem(SETORES), "Desvio identificado durante auditoria.", randomItem(["Falta de treinamento", "Procedimento desatualizado", "Falha de comunicação", "Equipamento inadequado"]), randomItem(["Aberto", "Em_Andamento", "Fechado"]), randomItem(allEmployees.filter(e => e.companyId === cId)).nome, formatDate(randomDate(new Date(2025, 6, 1), new Date(2026, 5, 30)))]
        );
        devIds[cId].push(result.insertId);
        devCount++;
      }
    }
    console.log(`✅ ${devCount} desvios inseridos`);

    // 22. Planos de ação 5W2H (1-2 por desvio)
    let planCount = 0;
    for (const cId of companyIds) {
      for (const devId of devIds[cId]) {
        const numPlans = randomInt(1, 2);
        for (let i = 0; i < numPlans; i++) {
          await conn.execute(
            `INSERT INTO action_plans (companyId, deviationId, oQue, porQue, onde, quando, quem, como, quantoCusta, statusPlano) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cId, devId, randomItem(["Revisar procedimento operacional", "Realizar treinamento de reciclagem", "Instalar sinalização adequada", "Substituir equipamento defeituoso", "Atualizar documentação"]), randomItem(["Para atender requisito normativo", "Para prevenir reincidência", "Para melhorar segurança", "Para adequar ao padrão"]), randomItem(["Canteiro de obras", "Escritório", "Almoxarifado", "Área de produção"]), formatDate(randomDate(new Date(2025, 6, 1), new Date(2026, 3, 30))), randomItem(allEmployees.filter(e => e.companyId === cId)).nome, "Implementar ação conforme plano definido em reunião de análise crítica.", randomItem(["R$ 500", "R$ 1.000", "R$ 2.500", "R$ 5.000", "Sem custo"]), randomItem(["Pendente", "Em_Andamento", "Concluido"])]
          );
          planCount++;
        }
      }
    }
    console.log(`✅ ${planCount} planos de ação inseridos`);

    // 23. DDS (4-6 por empresa)
    let ddsCount = 0;
    const temasDDS = ["Uso correto de EPI", "Prevenção de quedas", "Ergonomia no trabalho", "Proteção auditiva", "Riscos elétricos", "Trabalho em altura", "Primeiros socorros", "Organização do ambiente", "Hidratação e alimentação", "Proteção solar"];
    for (const cId of companyIds) {
      const numDDS = randomInt(4, 6);
      for (let i = 0; i < numDDS; i++) {
        const participantes = allEmployees.filter(e => e.companyId === cId).slice(0, randomInt(5, 12)).map(e => e.nome).join(", ");
        await conn.execute(
          `INSERT INTO dds (companyId, tema, dataRealizacao, responsavel, participantes, descricao) VALUES (?, ?, ?, ?, ?, ?)`,
          [cId, randomItem(temasDDS), formatDate(randomDate(new Date(2025, 0, 1), new Date(2025, 11, 30))), randomItem(allEmployees.filter(e => e.companyId === cId)).nome, participantes, "DDS realizado com todos os colaboradores presentes. Tema abordado com exemplos práticos."]
        );
        ddsCount++;
      }
    }
    console.log(`✅ ${ddsCount} DDS inseridos`);

    // 24. CIPA (1 eleição por empresa com 4-6 membros)
    let cipaCount = 0;
    for (const cId of companyIds) {
      const [elResult] = await conn.execute(
        `INSERT INTO cipa_elections (companyId, mandatoInicio, mandatoFim, statusEleicao, dataEdital, dataEleicao, dataPosse) VALUES (?, ?, ?, 'Concluida', ?, ?, ?)`,
        [cId, "2025-01-01", "2026-12-31", "2024-10-01", "2024-11-15", "2025-01-02"]
      );
      const electionId = elResult.insertId;
      const cargos = ["Presidente", "Vice_Presidente", "Secretario", "Membro_Titular", "Membro_Titular", "Membro_Suplente"];
      const compEmps = allEmployees.filter(e => e.companyId === cId && e.status === "Ativo");
      const numMembros = Math.min(randomInt(4, 6), compEmps.length);
      for (let i = 0; i < numMembros; i++) {
        await conn.execute(
          `INSERT INTO cipa_members (companyId, electionId, employeeId, cargoCipa, representacao, inicioEstabilidade, fimEstabilidade, statusMembro) VALUES (?, ?, ?, ?, ?, ?, ?, 'Ativo')`,
          [cId, electionId, compEmps[i].id, cargos[i % cargos.length], i % 2 === 0 ? "Empregador" : "Empregados", "2025-01-01", "2027-12-31"]
        );
        cipaCount++;
      }
    }
    console.log(`✅ ${cipaCount} membros CIPA inseridos`);

    // 25. Químicos (2-3 por empresa)
    let chemCount = 0;
    const quimicos = [
      { nome: "Thinner", fabricante: "Anjo Tintas", cas: "64-17-5", perigo: "Inflamável, Tóxico" },
      { nome: "Ácido Muriático", fabricante: "Start Química", cas: "7647-01-0", perigo: "Corrosivo" },
      { nome: "Tinta Epóxi", fabricante: "Sherwin-Williams", cas: "N/A", perigo: "Irritante" },
      { nome: "Solvente Industrial", fabricante: "Limpol", cas: "67-64-1", perigo: "Inflamável" },
    ];
    for (const cId of companyIds) {
      const numChem = randomInt(2, 3);
      for (let i = 0; i < numChem; i++) {
        const q = quimicos[i % quimicos.length];
        await conn.execute(
          `INSERT INTO chemicals (companyId, nome, fabricante, numeroCAS, classificacaoPerigo, localArmazenamento, quantidadeEstoque) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [cId, q.nome, q.fabricante, q.cas, q.perigo, randomItem(["Almoxarifado químico", "Depósito externo", "Área ventilada"]), `${randomInt(5, 50)} litros`]
        );
        chemCount++;
      }
    }
    console.log(`✅ ${chemCount} químicos inseridos`);

    console.log("\n🎉 SEED MASSIVO CONCLUÍDO!");
    console.log(`   Empresas: ${EMPRESAS.length}`);
    console.log(`   Funcionários: ${allEmployees.length}`);
    console.log(`   ASOs: ${asoCount}`);
    console.log(`   Treinamentos: ${trainCount}`);
    console.log(`   EPIs: ${epiCount} + ${deliveryCount} entregas`);
    console.log(`   Advertências: ${warnCount}`);
    console.log(`   Acidentes: ${accCount}`);
    console.log(`   Riscos: ${riskCount}`);
    console.log(`   Registros de ponto: ${timeCount}`);
    console.log(`   Folha de pagamento: ${payrollCount}`);
    console.log(`   Adiantamentos: ${advCount}`);
    console.log(`   Pagamentos extras: ${extraCount}`);
    console.log(`   VR/iFood: ${vrCount}`);
    console.log(`   Veículos: ${vehCount}`);
    console.log(`   Equipamentos: ${equipCount}`);
    console.log(`   Extintores: ${extCount}`);
    console.log(`   Hidrantes: ${hydCount}`);
    console.log(`   Auditorias: ${auditCount}`);
    console.log(`   Desvios: ${devCount}`);
    console.log(`   Planos de ação: ${planCount}`);
    console.log(`   DDS: ${ddsCount}`);
    console.log(`   CIPA membros: ${cipaCount}`);
    console.log(`   Químicos: ${chemCount}`);

  } catch (error) {
    console.error("❌ Erro no seed:", error);
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();
