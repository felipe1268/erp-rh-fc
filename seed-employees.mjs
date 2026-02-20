import mysql from "mysql2/promise";
import { readFileSync } from "fs";

// Read DATABASE_URL from .env
const envContent = readFileSync(".env", "utf-8");
const dbUrl = envContent.split("\n").find(l => l.startsWith("DATABASE_URL="))?.split("=").slice(1).join("=")?.replace(/"/g, "");

if (!dbUrl) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);

// First, find the FC Engenharia company ID
const [companies] = await conn.execute("SELECT id, nomeFantasia, cnpj FROM companies");
console.log("Empresas cadastradas:");
companies.forEach(c => console.log(`  ID=${c.id} | ${c.nomeFantasia} | ${c.cnpj}`));

// Find FC Engenharia by CNPJ 29.353.906/0001-71
let companyId = null;
for (const c of companies) {
  if (c.cnpj && c.cnpj.includes("29.353.906")) {
    companyId = c.id;
    console.log(`\nFC Engenharia encontrada: ID=${c.id}`);
    break;
  }
}

if (!companyId) {
  // Try by name
  for (const c of companies) {
    if (c.nomeFantasia && c.nomeFantasia.toUpperCase().includes("FC ENGENHARIA")) {
      companyId = c.id;
      console.log(`\nFC Engenharia encontrada por nome: ID=${c.id}`);
      break;
    }
  }
}

if (!companyId) {
  console.log("\nFC Engenharia não encontrada. Usando ID=1 como fallback.");
  companyId = 1;
}

// Parse the employee data
const employees = [
  { status: "Ativo", nome: "ACACIO LESCURA DE CAMARGO", cpf: "199.141.028-08", setor: "OBRA", funcao: "AUXILIAR DE PINTURA", sexo: "M", nascimento: "1970-08-31", admissao: "2022-09-27", endereco: "RUA ANTONIO ARNEIRO, N°8, SÃO GERALDO/CEP 12576-418 - APARECIDA" },
  { status: "Ativo", nome: "ADRIANO PAZ FERREIRA", cpf: "067.237.744-69", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1985-12-22", admissao: "2025-08-04", endereco: "RUA CANAVIEIRA, N°44, CENTRO/CEP 53690-000 - ARAÇOIABA" },
  { status: "Ativo", nome: "AGOSTINHO DIJALMA FERREIRA", cpf: "183.907.808-10", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1974-05-28", admissao: "2023-06-01", endereco: "ESTRADA MUNICIPAL DOUTOR RAFAEL AMÉRICO RANIÉRI, N°426, SANTA LUZIA/CEP 12507-330 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ALEX ALESSANDRO MONTEIRO DA SILVA", cpf: "405.690.998-97", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1990-09-12", admissao: "2025-03-06", endereco: "RUA EULALIA ARANTES CASSINHA, N°32, NOVA GUARÁ/CEP 12515-546 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ALEX DA SILVA DOMINGOS", cpf: "489.909.558-90", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1999-05-18", admissao: "2025-03-03", endereco: "RUA JOSE NOGUEIRA GALVAO, N°44, BEIRA RIO/CEP 12519-010 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ALEX PAULO RODRIGUES", cpf: "027.664.011-05", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1990-10-21", admissao: "2025-03-17", endereco: "RUA RAULINO JOSÉ DA SILVEIRA, N°160, JARDIM TAMANDARÉ/CEP 12503-640 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ALEXANDRO GONÇALVES DO NASCIMENTO", cpf: "259.915.518-55", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1976-09-06", admissao: "2023-07-24", endereco: "AVENIDA BASF, N°2210, ENGENHEIRO NEIVA/CEP 12521-130 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ALEXSANDRO DE LIMA", cpf: "054.474.594-94", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1978-07-02", admissao: "2022-12-22", endereco: "RUA SANTA ROSA, N°480, CENTRO/CEP 53610-350 - IGARASSU" },
  { status: "Ativo", nome: "ANDERSON BRAGA SILVA", cpf: "383.091.708-23", setor: "OBRA", funcao: "AUXILIAR DE PINTURA", sexo: "M", nascimento: "1984-09-27", admissao: "2022-07-11", endereco: "RUA PEDRO MARIA FILIPPO, N°117, VILA MARIANA/CEP 12573-530 - APARECIDA" },
  { status: "Ativo", nome: "ANDERSON DOS ANJOS ALKMIN JUNIOR", cpf: "458.465.648-79", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "2000-06-19", admissao: "2018-07-16", endereco: "RUA CEL AFONSO DE CARVALHO, N°160, PARQUE SÃO MIGUEL/CEP 12620-000 - PIQUETE" },
  { status: "Ativo", nome: "ANDRÉ LUIZ BARLETTA DAS CHAGAS", cpf: "070.835.548-03", setor: "OBRA", funcao: "ALMOXARIFE", sexo: "M", nascimento: "1965-11-17", admissao: "2025-06-09", endereco: "RUA ITABAIANA, N°713, ITAGUAÇU/CEP 12570-000 - APARECIDA" },
  { status: "Ativo", nome: "ANDREI DA SILVA", cpf: "315.449.308-52", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1982-07-22", admissao: "2020-03-12", endereco: "RUA DOIS, N°28, RETIRO/CEP 12500-970 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ANTONIO CARLOS SANTOS", cpf: "092.826.728-83", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1966-07-24", admissao: "2023-04-24", endereco: "RUA NOSSA SENHORA DE LOURDES, N°707, ENGENHEIRO NEIVA/CEP 12521-280 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ANTONIO RENATO DE SANTANA", cpf: "451.326.743-72", setor: "OBRA", funcao: "ENCARREGADO DE OBRA", sexo: "M", nascimento: "1971-07-07", admissao: "2025-05-12", endereco: "RUA PEDRO MARCON, N° 331, BONFIM/CEP 12040-550 - TAUBATÉ" },
  { status: "Ativo", nome: "ANTONIO WAGNER BARBOSA DE SOUSA", cpf: "283.738.288-42", setor: "OBRA", funcao: "ARMADOR DE FERRAGENS", sexo: "M", nascimento: "1979-09-13", admissao: "2024-10-23", endereco: "RUA LUZIA BAPTISTA DE SOUZA, N°169, JARDIM REGINA/CEP 12442-430 - PINDAMONHANGABA" },
  { status: "Ativo", nome: "BRUNO LUIS FARIA MACHADO", cpf: "339.752.168-83", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1989-05-30", admissao: "2025-11-24", endereco: "RUA WILSON MATHIAS, N°48, PARQUE SÃO FRANCISCO/ CEP 12509-600 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "BRUNO RAFAEL BATISTA DA SILVA", cpf: "437.118.938-56", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1994-10-23", admissao: "2025-06-02", endereco: "" },
  { status: "Ativo", nome: "CAIO AUGUSTO DA SILVA GARUFE", cpf: "421.511.388-10", setor: "OBRA", funcao: "ENGENHEIRO CIVIL", sexo: "M", nascimento: "1993-04-23", admissao: "2023-10-09", endereco: "RUA DOUTOR GERALDO NESTOR DE RESENDE, N°284, VILLAGE SANTANA/CEP 12513-520 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "CAIO MATHEUS PEREIRA ANTUNES", cpf: "507.897.708-22", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1999-12-20", admissao: "2025-01-21", endereco: "RUA BENEDITO GARCIA DOS REIS, N°1205, SÃO FRANCISCO/CEP 12570-416 - APARECIDA" },
  { status: "Ativo", nome: "CARLOS ALBERTO GONÇALVES", cpf: "249.394.688-01", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1972-12-29", admissao: "2025-04-07", endereco: "RUA BANANAL, N°168, MORADA DOS MARQUES/CEP 12525-000 - POTIM" },
  { status: "Ativo", nome: "CARLOS VITORIANO TOBIAS", cpf: "150.209.888-12", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1970-11-02", admissao: "2023-04-24", endereco: "RUA UM, N°5, COOPERI/CEP 12500-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "CAROLINA DA SILVA PENA FIRME", cpf: "478.665.718-21", setor: "ESCRITORIO CENTRAL", funcao: "DESENHISTA", sexo: "F", nascimento: "1998-05-13", admissao: "2025-05-15", endereco: "RUA GILBERTO LEONEL FORTES AZEVEDO, N°59, VILLAGE SANTANA/CEP 12513-480 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "CATARINE APARECIDA CORREA LIMA", cpf: "384.986.088-48", setor: "ESCRITORIO CENTRAL", funcao: "COMPRADOR", sexo: "F", nascimento: "1998-11-12", admissao: "2024-03-05", endereco: "RUA SANTO AFONSO, N°93, CENTRO/CEP 12570-075 - APARECIDA" },
  { status: "Ativo", nome: "CLAUDIO JOSE GONÇALVES DIAS", cpf: "065.672.578-81", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1965-09-16", admissao: "2024-10-30", endereco: "RUA 1° DE MAIO, N°184, SANTA LUZIA/CEP 12570-304 - APARECIDA" },
  { status: "Ativo", nome: "CLAUDIO SILVA", cpf: "234.020.938-20", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1970-04-06", admissao: "2025-04-14", endereco: "RUA MARIO GALVÃO NOGUEIRA, N°11, JARDIM DO VALE/CEP 12500-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "DESILDO DA COSTA SANTOS", cpf: "121.876.918-10", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1967-06-10", admissao: "2024-03-18", endereco: "RUA RAULINO JOSÉ DA SILVEIRA, N°180, JARDIM TAMANDARÉ/CEP 12503-640 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "DIEGO HENRIQUE ESPINELI DOS SANTOS", cpf: "392.434.018-82", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1989-06-17", admissao: "2025-08-19", endereco: "RUA RONALD0 DE SOUZA GAY, N°314, SANTA LUZIA/CEP 12507-260 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "DIOGO SOARES DA SILVA", cpf: "130.387.724-45", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1998-09-20", admissao: "2023-09-20", endereco: "RUA I, N°600, BOTAFOGO/CEP 53700-000 - ITAPISSUMA" },
  { status: "Afastado", nome: "DOUGLAS DE SOUZA ROCHA", cpf: "298.269.958-35", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1980-09-17", admissao: "2023-10-25", endereco: "RUA DOUTOR LUIS RIBEIRO DE CASTILHO, N°39, PINGO DE OURO/CEP 12510-460 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "EDENILSON SOUZA LIMA", cpf: "042.201.975-59", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1989-06-08", admissao: "2023-07-03", endereco: "AVENIDA BENEDITO DE TOLEDO, N°300, JARDIM PRIMAVERA/CEP 12520-350 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "EDSON FERNANDO MACHADO", cpf: "495.854.318-07", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1999-10-16", admissao: "2023-10-25", endereco: "RUA ABRAÃO KALIL MECHICA, N°336, SÃO FRANCISCO/CEP 12570-426 - APARECIDA" },
  { status: "Ativo", nome: "ELIAS VIEIRA DO NASCIMENTO", cpf: "399.004.768-08", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1977-06-23", admissao: "2019-03-25", endereco: "RUA DR IRBIS FERREIRA VIEIRA, N°180, PEDRO LEME/CEP 12580-000 - ROSEIRA" },
  { status: "Ativo", nome: "ELIEL BRENDON DE LIMA MARQUES", cpf: "100.108.495-05", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "2002-01-05", admissao: "2025-11-17", endereco: "RUA DOUTOR LUIS RIBEIRO DE CASTILHO, N°39, PINGO DE OURO/CEP 12510-460 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ELIZEU FRANCISCO DE SOUZA", cpf: "104.710.634-52", setor: "OBRA", funcao: "TECNICO DE SEGURANÇA", sexo: "M", nascimento: "1993-01-24", admissao: "2025-06-26", endereco: "RUA DA FELICIDADE, N°345, RUBINA/CEP 53635-640 - IGARASSU" },
  { status: "Recluso", nome: "EMERSON RODRIGO DOS SANTOS", cpf: "366.221.528-45", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1985-09-28", admissao: "2024-04-17", endereco: "AVENIDA MONTEIRO LOBATO, N°2116, CENTRO/CEP 14801-220 - ARARAQUARA" },
  { status: "Ativo", nome: "ERIC GUSTAVO DE SOUZA", cpf: "454.097.098-45", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1994-10-07", admissao: "2025-05-19", endereco: "RUA ZEQUINHA LEMES, N°468, SÃO ROQUE/CEP 12570-000 - APARECIDA" },
  { status: "Ativo", nome: "ERITON ANDRE SEVERINO DA SILVA", cpf: "103.759.864-48", setor: "OBRA", funcao: "MONTADOR DE ANDAIME", sexo: "M", nascimento: "1991-10-21", admissao: "2023-06-12", endereco: "RUA A, N°71, BOTAFOGO/CEP 53700-000 - ITAPISSUMA" },
  { status: "Ativo", nome: "FERNANDO RODRIGO DE CASTILHO PRADO", cpf: "399.329.138-71", setor: "OBRA", funcao: "MEIA OFICIAL", sexo: "M", nascimento: "1991-02-02", admissao: "2021-11-18", endereco: "ESTRADA VICINAL PLINIO GALVÃO CESAR, N°9010, CAPITUBA/CEP 12512-305 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "FRANCISCO DAS CHAGAS DIAS", cpf: "114.029.178-56", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1966-03-18", admissao: "2023-08-30", endereco: "RUA ITAPIRA, N°680, PARQUE ITAGUAÇU/CEP 12576-644 - APARECIDA" },
  { status: "Ativo", nome: "FRANCISCO EUDICE CARVALHO BIZERRA", cpf: "012.706.541-52", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1986-03-14", admissao: "2020-03-12", endereco: "RUA JOSE CARLOS EVILASIO, N°1, ITAGUAÇU/CEP 12570-000 - APARECIDA" },
  { status: "Ativo", nome: "GENILSON DE SOUZA LOPES", cpf: "728.546.007-97", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1962-08-17", admissao: "2025-08-19", endereco: "RUA DOS JASMIN, N°105, BELVEDER CLUBE DOS 500/CEP 12523-420 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "GERALDO MACHADO", cpf: "244.473.958-27", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1973-04-28", admissao: "2024-03-18", endereco: "RUA FLORIANO PEIXOTO, N°149, CHACARA TROPICAL/CEP 12525-102 - POTIM" },
  { status: "Ativo", nome: "GILBERTO DA COSTA BARBOZA", cpf: "302.330.158-17", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1981-10-29", admissao: "2025-04-01", endereco: "RUA JOSÉ AUGUSTO MESQUITA, N°163, SÃO VICENTE DO PAUL/CEP 12440-010 - PINDAMONHANGABA" },
  { status: "Ativo", nome: "GILMAR PEREIRA DE BRITO", cpf: "086.462.196-58", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1983-04-29", admissao: "2023-12-13", endereco: "RUA EXPEDITO MACEDO, N°469, PONTA ALTA/CEP 12575-010 - APARECIDA" },
  { status: "Ativo", nome: "GILMAR SANTOS DO NASCIMENTO", cpf: "084.196.324-06", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1989-05-30", admissao: "2023-09-20", endereco: "RUA DO CAMPO, N°9, ATAPUZ/CEP 55900-000 - GOIANA" },
  { status: "Ativo", nome: "GISLEI RODRIGO DE CARVALHO", cpf: "378.344.588-41", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1986-10-08", admissao: "2025-06-17", endereco: "RUA SIMPLICIO SOARES DA CUNHA NETO, N°88, VILA OLIVIA/CEP 12525-412 - POTIM" },
  { status: "Ativo", nome: "GIVALDO DOS SANTOS", cpf: "108.474.408-26", setor: "OBRA", funcao: "ENCARREGADO DE OBRA", sexo: "M", nascimento: "1971-01-20", admissao: "2025-06-02", endereco: "RUA SARGENTO VIRGILIO SIMOES FILHO, N°42, ARARETAMA/CEP 12423-520 - PINDAMONHANGABA" },
  { status: "Ativo", nome: "GLEDSON FERREIRA SANTOS", cpf: "319.065.078-05", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1981-04-04", admissao: "2025-04-28", endereco: "RUA LUIZ THOMAZ DE LIMA, N°471, CEP 12525-000 - POTIM" },
  { status: "Afastado", nome: "IRAEL ALVES DE SOUZA", cpf: "026.290.844-18", setor: "OBRA", funcao: "ARMADOR DE FERRAGENS", sexo: "M", nascimento: "1978-10-26", admissao: "2024-03-11", endereco: "RUA TANGARA, N°360, TABATINGA/CEP 53610-315 - IGARASSU" },
  { status: "Ativo", nome: "ISABELA AUGUSTA DA SILVA VELLOSO MONTEIRO", cpf: "558.057.098-80", setor: "ESCRITORIO CENTRAL", funcao: "AUXILIAR ADMINISTRATIVO", sexo: "F", nascimento: "2007-05-31", admissao: "2025-04-02", endereco: "RUA MARIA DO CARMO GUIMARÃES FRANÇA, N°515, JARDIM SÃO MANOEL/CEP 12512-350", celular: "12 99606-8218" },
  { status: "Ativo", nome: "ISAIAS COELHO MUYAGUTI MONTEIRO", cpf: "477.547.478-20", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1999-06-20", admissao: "2025-06-17", endereco: "RUA IRENEU NALDI, N°81, CENTRO/CEP 12525-000 - POTIM" },
  { status: "Ativo", nome: "IVAN DOS SANTOS", cpf: "081.146.678-77", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1971-02-22", admissao: "2025-03-17", endereco: "RUA LUIZ THOMAZ DE LIMA, N°105, CEP 12525-000 - POTIM" },
  { status: "Ativo", nome: "JAMIELSON GOMES DOS SANTOS SILVA", cpf: "123.193.034-99", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1996-08-17", admissao: "2025-07-01", endereco: "TRAVESSA JOAO PAULO II, N°470, CENTRO/CEP 53600-000 - IGARASSU" },
  { status: "Ativo", nome: "JEAN CARLOS MARTINS", cpf: "421.624.018-60", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1993-02-16", admissao: "2025-03-17", endereco: "RUA INEZ TEODORA, N°190, SANTA RITA/CEP 12502-410 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "JEAN CARLOS RIBEIRO DA SILVA", cpf: "271.184.008-58", setor: "OBRA", funcao: "CONTROLADOR DE ACESSO", sexo: "M", nascimento: "1978-09-19", admissao: "2025-06-09", endereco: "RUA MARIA H VIEIRA PERGAMINI, N°8, ALTO SÃO ROQUE/CEP 12570-000 - APARECIDA" },
  { status: "Ativo", nome: "JEFTER EMANOEL CRISPINIANO DE MELO SILVA", cpf: "150.459.844-03", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "2004-06-23", admissao: "2024-03-11", endereco: "RUA DO CAMPO, N°83, ATAPUZ/CEP 55900-000 - GOIANA" },
  { status: "Ativo", nome: "JERRYALITON AUGUSTO BEZERRA", cpf: "746.007.614-72", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1971-07-01", admissao: "2023-06-01", endereco: "RUA ARI LEITE RIBEIRO, N°176, SANTA LUZIA/CEP 12507-110 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "JOÃO CARLOS DA SILVA CONCEIÇÃO", cpf: "164.974.247-92", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1999-02-08", admissao: "2025-03-17", endereco: "RUA RANGEL PESTANA, N°838, PEDREIRA/CEP 12503-090 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "JOÃO HENRIQUE SOARES", cpf: "350.648.228-98", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1981-06-24", admissao: "2025-01-16", endereco: "RUA ORLANDO NENZINHO MACEDO, N°38, PONTE ALTA/CEP 12575-016 - APARECIDA" },
  { status: "Ativo", nome: "JOÃO JOSE DE PAULA OLIVEIRA", cpf: "313.338.308-66", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1984-05-17", admissao: "2021-12-02", endereco: "RUA DOS PINHEIROS, N°41, BELVEDER CLUBE DOS 500/CEP 12523-450 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "JOÃO MACHADO DE AZEVEDO", cpf: "138.310.688-60", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1972-01-28", admissao: "2025-04-07", endereco: "RUA ITAICI, N°422, ITAGUASSU/CEP 12576-638 - APARECIDA" },
  { status: "Ativo", nome: "JOÃO ODAIR DOMINGOS", cpf: "183.174.368-02", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1973-09-28", admissao: "2023-05-02", endereco: "RUA RAULINO JOSÉ DA SILVEIRA, N°275, TAMANDARÉ/CEP 12503-640 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "JORGE MARCELINO DA SILVA MOREIRA", cpf: "357.584.688-00", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1985-08-16", admissao: "2025-11-17", endereco: "RUA MARCILIO DOS SANTOS, N°41, SANTA RITA/CEP 12576-044 - APARECIDA" },
  { status: "Ativo", nome: "JOSÉ ASTOR BATISTA", cpf: "065.436.158-42", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1956-01-29", admissao: "2025-04-01", endereco: "PRAÇA MACHADO DE ASSIS, N°47, ENGENHEIRO NEIVA/CEP 12521-260 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "JOSUE DO NASCIMENTO ALVES", cpf: "269.866.658-73", setor: "OBRA", funcao: "CARPINTEIRO", sexo: "M", nascimento: "1978-08-17", admissao: "2023-12-04", endereco: "RUA VICENTE DE PAULO PENIDO, N°135, PARQUE DAS ARVORES/CEP 12506-210 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "JOVANILDO INACIO", cpf: "255.014.168-75", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1975-07-11", admissao: "2025-04-01", endereco: "RUA ORCAR LORENA, N°57, SÃO ROQUE/CEP 12573-208 - APARECIDA" },
  { status: "Ativo", nome: "JULIO CESAR LEMES DE OLIVEIRA", cpf: "358.639.068-80", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1980-12-13", admissao: "2025-10-14", endereco: "RUA MARIA JOSÉ CATALBIANO DOS SANTOS, N°114, VELLA VELHA/CEP 12582-008 - ROSEIRA" },
  { status: "Ativo", nome: "JURANDI PEREIRA DOS SANTOS", cpf: "537.590.443-87", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1968-09-26", admissao: "2025-10-14", endereco: "RUA SÃO VICENTE, N°111, VISTA ALEGRE/CEP 12526-106 - POTIM" },
  { status: "Ativo", nome: "KELBEM CARLOS DE LIMA SILVA", cpf: "134.155.024-90", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1999-05-24", admissao: "2025-08-04", endereco: "RUA DO CAMPO, N°5, BOTAFOGO/CEP 53700-000 - ITAPISSUMA" },
  { status: "Ativo", nome: "KELLEN LARISSA LOURENÇO CLARO", cpf: "489.701.768-88", setor: "ESCRITORIO CENTRAL", funcao: "ENGENHEIRO CIVIL", sexo: "F", nascimento: "2000-02-10", admissao: "2024-03-04", endereco: "RUA XAVANTES, N°1425, JARDIM AEROPORTO/CEP 12512-010 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "LUCAS MATEUS RIBEIRO NEVES", cpf: "450.803.948-03", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1997-07-11", admissao: "2024-07-15", endereco: "RUA JOÃO ALVES DA SILVA FILHO, N°27, SÃO MANOEL/CEP 12512-320 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "LUIS CARLOS DA SILVA", cpf: "055.333.978-84", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1963-11-14", admissao: "2024-01-08", endereco: "RUA PEDRO MARIA FILIPPO, N°460, VILA MARIANA/CEP 12573-530 - APARECIDA" },
  { status: "Ativo", nome: "LUIS CLAUDIO ANDRADE CARNEIRO", cpf: "286.554.878-30", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1977-09-15", admissao: "2023-07-24", endereco: "RUA MANOEL MOREIRA FIGUEIREDO, N°77, JARDIM DO VALE/CEP 12518-610 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "LUIS GUSTAVO RODRIGUES DE CASTRO", cpf: "419.420.308-94", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1995-02-14", admissao: "2025-09-08", endereco: "RUA MARIA HERONDINA VIEIRA BERGAMINE, N°62, SÃO ROQUE/CEP 12573-212 - APARECIDA" },
  { status: "Ativo", nome: "LUIS HENRIQUE DO NASCIMENTO", cpf: "434.791.418-03", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1992-04-03", admissao: "2025-04-28", endereco: "RUA LUIZ MEDEIROS, N°92, FIGUEIRA/CEP 12504-110 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "LUIZ HENRIQUE DE MACEDO", cpf: "159.458.668-30", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1973-05-10", admissao: "2025-04-01", endereco: "AVENIDA GERALDO DE OLIVEIRA PORTES, N°686, VILA SÃO PEDRO/CEP 12525-066 - POTIM" },
  { status: "Ativo", nome: "MANOEL WAGNER ROCHA GUIMARAES", cpf: "303.495.308-90", setor: "OBRA", funcao: "ALMOXARIFE", sexo: "M", nascimento: "1970-09-04", admissao: "2023-11-16", endereco: "ESTRADA PAULO VIRGILIO, N°5200, ZONA RURAL/CEP 12500-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "MARCELO ALEXANDRE PEREIRA", cpf: "276.256.258-93", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1979-09-26", admissao: "2025-09-08", endereco: "RUA RIACHUELO, N°180, NOVA GUARA/CEP 12515-555 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "MARCELO DE LIMA FELISBERTO", cpf: "331.664.528-42", setor: "OBRA", funcao: "PEDREIRO II", sexo: "M", nascimento: "1980-06-25", admissao: "2023-06-01", endereco: "RUA CLELIO LUIZ DE PAIVA NUNES, N°33, ATERRADO/CEP 12610-491 - LORENA" },
  { status: "Ativo", nome: "MARCIO DE TOLEDO", cpf: "326.851.898-23", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1983-06-16", admissao: "2020-08-17", endereco: "RUA NOE SOTILHO, N°11, MORRO DO CRUZEIRO/CEP 12570-000 - APARECIDA" },
  { status: "Ativo", nome: "MARCIO ELOY DOS SANTOS", cpf: "782.247.566-53", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1966-01-30", admissao: "2018-03-01", endereco: "RUA JOAO MARIA GUIMARAES FELIPO, N°197, VILA MARIANA/CEP 12570-000 - APARECIDA" },
  { status: "Ativo", nome: "MARCO ANTONIO DOS SANTOS BATISTA", cpf: "199.149.678-84", setor: "OBRA", funcao: "CARPINTEIRO", sexo: "M", nascimento: "1975-06-17", admissao: "2024-11-13", endereco: "RUA DOS OPERARIOS, N°26, VILA SANTA RITA/CEP 12520-030 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "MARIANA CASTILHO DE LIMA", cpf: "401.827.378-96", setor: "ESCRITORIO CENTRAL", funcao: "COORDENADOR (A) DE PLANEJAMENTO", sexo: "F", nascimento: "1997-01-21", admissao: "2024-05-07", endereco: "RUA DAS AZALÉIAS, N°180, JARDIM PRIMAVERA/CEP 12712-160 - CRUZEIRO" },
  { status: "Ativo", nome: "MATEUS OLIVEIRA BRITO PIRES", cpf: "443.679.498-93", setor: "OBRA", funcao: "ENGENHEIRO CIVIL", sexo: "M", nascimento: "1995-07-03", admissao: "2020-11-03", endereco: "RUA JOSE ALBERTO SOUZA AQUINO, N°271, JARDIM ESPERANÇA/CEP 12518-440 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "MATHEUS DONIZETTI ALVES RODRIGUES", cpf: "547.148.568-80", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "2002-06-12", admissao: "2025-04-01", endereco: "RUA MANOEL ANTONIO DE ALMEIDA, N°152, VILA BELA/CEP 12522-590 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "MAURICIO BENEDITO ELESBÃO", cpf: "081.016.508-22", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1968-07-11", admissao: "2020-04-23", endereco: "RUA BENEDITO LINO, N°91, CENTRO/CEP 12525-000 - POTIM" },
  { status: "Ativo", nome: "MAYCON ADREAN POLYCARPO CORREA", cpf: "485.339.388-96", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1998-12-06", admissao: "2025-06-17", endereco: "RUA PEDRO LOPES FIGUEIRA, N°33, SANTA RITA/CEP 12576-012 - APARECIDA" },
  { status: "Ativo", nome: "MYRIÉLLE FIALHO BORGES ARCANJO", cpf: "388.177.788-18", setor: "ESCRITORIO CENTRAL", funcao: "AUXILIAR ADMINISTRATIVO", sexo: "F", nascimento: "2005-05-12", admissao: "2024-05-07", endereco: "RUA MANOEL DE CASTRO NOGUEIRA, N°313, JARDIM DO VALE/CEP 12519-500 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "NAYARA APARECIDA DOS SANTOS RODRIGUES BASTOS", cpf: "388.809.058-05", setor: "ESCRITORIO CENTRAL", funcao: "RH", sexo: "F", nascimento: "1988-12-27", admissao: "2024-01-23", endereco: "RUA PARAIBA, N°307, CIDADE INDUSTRIAL/CEP 12609-250 - LORENA" },
  { status: "Ativo", nome: "NELSON MOREIRA GOMES", cpf: "185.666.988-27", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1976-09-20", admissao: "2023-12-04", endereco: "RUA PAULO SANTOS VIEIRA, N°205, RESIDENCIAL ITALIA/CEP 12510-570 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ODAIR JOSE PEREIRA", cpf: "279.448.498-29", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1978-11-23", admissao: "2019-02-11", endereco: "RUA ITAICI, N°392, ITAGUAÇU/CEP 12570-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "OSMAR MAGNO DE OLIVEIRA", cpf: "103.466.104-35", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1991-05-06", admissao: "2024-08-06", endereco: "RUA DO CAMPO NOVO, N°06, ATAPUZ/CEP 55940-000 - GOIANA" },
  { status: "Ativo", nome: "PATRICIA SIMÕES DE SOUSA", cpf: "257.924.718-19", setor: "ESCRITORIO CENTRAL", funcao: "AUXILIAR FINANCEIRO", sexo: "F", nascimento: "1978-07-21", admissao: "2026-01-05", endereco: "RUA BENEDITO PERPETUO DE OLIVEIRA, N°4, COELHO NETO/CEP 12514-050 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "PAULO DANIEL ALVES", cpf: "440.498.428-66", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1996-08-12", admissao: "2025-07-21", endereco: "RUA GERMANO DE CARVALHO, N°107, ANDRÉ BROCA FILHO/CEP 12509-360 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "PAULO HENRIQUE LIMA GUIMARÃES", cpf: "098.403.828-02", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1974-01-09", admissao: "2025-05-19", endereco: "RUA CORONEL TAMARINDO, N°884, PEDREIRA/CEP 12500-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "PAULO HENRIQUE MONTEIRO XAVIER", cpf: "111.703.324-47", setor: "OBRA", funcao: "MONTADOR DE ANDAIME", sexo: "M", nascimento: "1992-11-13", admissao: "2023-06-14", endereco: "RUA DO CAMPO, N°42, CENTRO/CEP 53700-000 - ITAPISSUMA" },
  { status: "Ativo", nome: "PAULO ROBERTO DOS SANTOS ESPINELI", cpf: "401.440.528-14", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1987-05-04", admissao: "2025-06-09", endereco: "RUA JOÃO DE PAULA, N°111, FREI GALVÃO/CEP 12525-000 - POTIM" },
  { status: "Ativo", nome: "PAULO ROSA DA SILVA", cpf: "080.956.908-64", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1965-07-15", admissao: "2023-12-04", endereco: "RUA DARWIN FELIX, N°11, VILA ANGELINA/CEP 12520-120 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "PAULO VINICIUS SALES TEIXEIRA", cpf: "491.944.238-65", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1999-05-12", admissao: "2018-06-07", endereco: "RUA BAESSO SALES, N°1028, SÃO JOSÉ/CEP 12500-970 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "PEDRO HENRIQUE MARQUES NOGUEIRA", cpf: "115.108.656-83", setor: "OBRA", funcao: "ENGENHEIRO CIVIL", sexo: "M", nascimento: "1997-06-24", admissao: "2025-08-25", endereco: "RUA SÃO BENEDITO, N°10, SANTO AFONSO/CEP 12575-124 - APARECIDA" },
  { status: "Ativo", nome: "RAFAEL ALEXANDRE MONTEIRO FERREIRA", cpf: "244.877.888-46", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1997-09-09", admissao: "2025-03-06", endereco: "RUA EULALIA ARANTES CASSINHA, N°249, NOVA GUARA/CEP 12515-546 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "RAFAELA ALBUQUERQUE DA SILVA", cpf: "116.759.464-93", setor: "ESCRITORIO LOCAL", funcao: "AUXILIAR ADMINISTRATIVO", sexo: "F", nascimento: "1999-05-08", admissao: "2023-11-06", endereco: "RUA BOM JESUS, N°274, TABATINGA/CEP 53610-658 - IGARASSU" },
  { status: "Ativo", nome: "RAY HENRIQUE MOREIRA BERNARDES", cpf: "526.224.498-01", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "2004-09-08", admissao: "2025-05-19", endereco: "RUA JOAO ALVES COELHO, N°405, COELHO NETO/CEP 12500-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "REGINALDO VITORIANO LOURENÇO", cpf: "311.989.258-09", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1984-05-25", admissao: "2020-05-14", endereco: "RUA DOUTOR EGYDIO MOLLICA, N°1, PINGO DE OURO/CEP 12510-420 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "REGIS MORAES FERNANDES DOS SANTOS", cpf: "389.807.238-06", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1986-03-05", admissao: "2025-05-19", endereco: "RUA INTEGRAÇÃO, N°426, VILA SÃO JOSÉ/CEP 12500-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "RICARDO ANTONIO SILVESTRE", cpf: "227.509.178-59", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1980-06-22", admissao: "2025-08-18", endereco: "RUA TOTO BARBOSA, N°208, PONTE ALTA/CEP 12570-000 - APARECIDA" },
  { status: "Ativo", nome: "RODRIGO DA SILVA", cpf: "320.790.238-37", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1984-07-16", admissao: "2018-08-01", endereco: "RUA ARISTEU VIEIRA VILELA, N°179, CENTRO/CEP 12525-000 - POTIM" },
  { status: "Ativo", nome: "RODRIGO NOGUEIRA DA SILVA MEIRELES BRAGA", cpf: "352.502.208-51", setor: "OBRA", funcao: "CARPINTEIRO", sexo: "M", nascimento: "1985-07-16", admissao: "2025-04-22", endereco: "RUA DOS JACARANDAS, N°102, BELVEDER CLUBE DOS 500/CEP 12523-040 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ROGERIO DIAS DE FREITAS", cpf: "284.871.468-99", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1978-05-10", admissao: "2025-10-14", endereco: "TRAVESSA LUCIA MARIA DA CONCEIÇÃO, N°5, SANTA EDWIRGES/CEP 12573-714 - APARECIDA" },
  { status: "Ativo", nome: "SERGIO AUGUSTO DE OLIVEIRA", cpf: "052.093.678-78", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1963-09-07", admissao: "2025-04-01", endereco: "RUA JOÃO ROBERTO GONÇALVES DE GUSMÃO, N°333, SÃO SEBASTIÃO/CEP 12510-246 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "SILVANO MONTEIRO CORREA", cpf: "268.021.188-07", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1976-03-27", admissao: "2025-06-09", endereco: "RUA OLAVO FRANCISCO OLIVEIRA, N°160, SANTA LUZIA/CEP 12507-100 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "SILVIO CLODOMIRO OLIVEIRA DE MOURA", cpf: "289.045.258-10", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1980-12-25", admissao: "2025-04-22", endereco: "RUA DOIS, N°2, MATO SECO/CEP 12500-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "SYDENEY GOMES DE OLIVEIRA", cpf: "148.094.134-46", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "2001-07-23", admissao: "2024-08-06", endereco: "RUA TABATINGA, N°209, TABATINGA/CEP 53605-000 - IGARASSU" },
  { status: "Ativo", nome: "THIAGO MARTINS MENEZES DE JESUS", cpf: "364.823.418-88", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1987-10-13", admissao: "2024-03-18", endereco: "RUA MARIA DO CARMO FRANÇA BARRETO, N°485, PONTE ALTA/CEP 12575-008 - APARECIDA" },
  { status: "Ativo", nome: "THOMAS BARBOSA DE MATOS JESUS", cpf: "432.490.578-94", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1995-05-22", admissao: "2025-08-19", endereco: "RUA DOUTOR FERNANDO JOSÉ ALMEIDA MILEO, N°111, PARQUE SÃO FRANCISCO/CEP 12509-060 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "TIAGO AUGUSTO DE OLIVEIRA", cpf: "345.708.958-24", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1984-01-20", admissao: "2024-10-30", endereco: "RUA TREZE, N°30, TAMANDARE/CEP 12500-000 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "TIAGO MACHADO DA SILVA", cpf: "394.070.858-56", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1989-04-06", admissao: "2025-06-24", endereco: "RUA ANTONIO DE OLIVEIRA PORTES, N°149, VILA OLIVIA/CEP 12525-000 - POTIM" },
  { status: "Ativo", nome: "VAGNER FELIPE OLIVEIRA REZENDE", cpf: "380.706.328-52", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1987-10-14", admissao: "2025-08-19", endereco: "RUA JOÃO ROBERTO GONÇALVES DE GUSMÃO, N°400, SÃO SEBASTIÃO/CEP 12510-246 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "VALDIR DONIZETTI GONÇALVES JÚNIOR", cpf: "350.174.378-51", setor: "OBRA", funcao: "ENCANADOR", sexo: "M", nascimento: "1987-10-14", admissao: "2025-03-24", endereco: "RUA JOAO DOS SANTOS, N°57, CENTRO/CEP 12525-000 - POTIM" },
  { status: "Ativo", nome: "WALMIR JOSE DA SILVA", cpf: "247.684.358-07", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1974-10-07", admissao: "2023-10-26", endereco: "RUA EXPEDICIONARIO LEONEL LUIZ DE SOUZA, N°84, JARDIM DO VALE/CEP 12519-180 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "WANDERSON ANTONIO DA COSTA", cpf: "445.251.348-44", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1990-01-21", admissao: "2023-11-13", endereco: "RUA BENEDITO ROSA DE OLIVEIRA, N°102, VILLAGE SANTANA/CEP 12513-455 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "WELINGTON SILVA BRITO", cpf: "513.720.018-24", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "2002-10-21", admissao: "2025-06-02", endereco: "RUA SEIS, N°595, SANTA MONICA/CEP 12520-246 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "WELLINGTON VALERIANO BRAZ LEMES DA SILVA", cpf: "516.423.168-90", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1999-12-15", admissao: "2023-04-13", endereco: "RUA JOSÉ VITORINO SILVA, N°185, BOM JARDIM I/CEP 12508-185 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "WEMERSON BARBOSA DA HORA", cpf: "095.807.254-03", setor: "OBRA", funcao: "PEDREIRO", sexo: "M", nascimento: "1984-03-26", admissao: "2024-03-11", endereco: "AVENIDA DOUTOR JOSE BARBA, N°8200, ZONA RURAL/CEP 53700-000 - ITAPISSUMA" },
  { status: "Ativo", nome: "WESLEY CASSIO LIBANIO DA SILVA", cpf: "126.586.844-10", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1995-09-22", admissao: "2025-08-04", endereco: "RUA L, N°190, BOTAFOGO/CEP 53700-000 - ITAPISSUMA" },
  { status: "Ativo", nome: "WESLEY LEONARD DE OLIVEIRA", cpf: "464.472.878-05", setor: "OBRA", funcao: "AUXILIAR DE ENGENHARIA", sexo: "M", nascimento: "1998-01-28", admissao: "2025-11-05", endereco: "RUA SANDRA REGINA MONTEIRO DA SILVA SANTOS, N°46, CENTRO/CEP 12525-047 - POTIM" },
  { status: "Ativo", nome: "WILLIAN GUSTAVO FARIA DA SILVA", cpf: "421.209.478-99", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1994-08-03", admissao: "2020-03-12", endereco: "RUA TEREZA MARIA FERRERA, N°230, SÃO FRANCISCO/CEP 12570-000 - APARECIDA" },
  { status: "Recluso", nome: "WILLIANS FELIPE DA SILVA", cpf: "378.677.228-23", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1988-09-16", admissao: "2025-03-06", endereco: "RUA VEREADOR BERALDO RIBEIRO, N°77, NOVA GUARA/CEP 12575-076 - APARECIDA" },
  { status: "Ativo", nome: "WILSON LUIZ RIBEIRO", cpf: "028.039.908-14", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1961-01-28", admissao: "2025-04-01", endereco: "ESTRADA MUNICIPAL JOSÉ JORGE BOUERI, N°18, PEDRINHA/CEP 12508-015 - GUARATINGUETÁ" },
  { status: "Ativo", nome: "ZENAIDO DE SOUZA CHRISTINO FILHO", cpf: "034.084.447-73", setor: "OBRA", funcao: "SERVENTE", sexo: "M", nascimento: "1973-05-08", admissao: "2025-10-14", endereco: "AVENIDA INTEGRAÇÃO, N°296, VILA BRASIL/CEP 12520-240 - GUARATINGUETÁ" },
];

console.log(`\nTotal de funcionários a inserir: ${employees.length}`);

let inserted = 0;
let errors = 0;

for (const emp of employees) {
  try {
    const sql = `INSERT INTO employees (companyId, nomeCompleto, cpf, setor, funcao, sexo, dataNascimento, dataAdmissao, logradouro, celular, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await conn.execute(sql, [
      companyId,
      emp.nome.trim(),
      emp.cpf,
      emp.setor,
      emp.funcao.trim(),
      emp.sexo,
      emp.nascimento || null,
      emp.admissao || null,
      emp.endereco || null,
      emp.celular || null,
      emp.status,
    ]);
    inserted++;
  } catch (err) {
    errors++;
    console.error(`Erro ao inserir ${emp.nome}: ${err.message}`);
  }
}

console.log(`\n✅ Inseridos: ${inserted}`);
console.log(`❌ Erros: ${errors}`);
console.log(`Total: ${employees.length}`);

await conn.end();
