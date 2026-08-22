// Runner de integração para o recebimento no Almoxarifado.
//
// O Vitest deste projeto não consegue carregar o schema Drizzle diretamente
// pelo transformador SSR. Por isso o teste pai inicia este arquivo com `tsx`,
// que também é o loader do servidor. O PostgreSQL é temporário, opera somente
// em socket Unix e é removido no fim: nenhum dado do Neon é acessado.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function localizarPostgresBin(): string {
  const configurado = process.env.POSTGRES_BIN;
  if (configurado && fs.existsSync(path.join(configurado, "postgres"))) return configurado;
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
  const noPath = pathEntries.find(entry => entry && fs.existsSync(path.join(entry, "postgres")));
  if (noPath) return noPath;
  const nixStore = "/nix/store";
  if (fs.existsSync(nixStore)) {
    const pacote = fs.readdirSync(nixStore)
      .filter(nome => /-postgresql-16(?:\.|$)/.test(nome))
      .sort()
      .at(-1);
    if (pacote && fs.existsSync(path.join(nixStore, pacote, "bin", "postgres"))) {
      return path.join(nixStore, pacote, "bin");
    }
  }
  throw new Error("PostgreSQL 16 não encontrado. Configure POSTGRES_BIN com o diretório de initdb/pg_ctl/postgres.");
}

const postgresBinDir = localizarPostgresBin();
const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "recebimento-almox-pg-"));
const dataDir = path.join(baseDir, "data");
const sockDir = path.join(baseDir, "sock");
const logPath = path.join(baseDir, "postgres.log");
fs.mkdirSync(sockDir);

execFileSync(path.join(postgresBinDir, "initdb"), [
  "-D", dataDir, "-A", "trust", "-U", "postgres", "--encoding=UTF8", "--locale=C",
], { stdio: "ignore" });

const start = spawnSync(path.join(postgresBinDir, "pg_ctl"), [
  "-D", dataDir,
  "-l", logPath,
  "-o", `-F -c listen_addresses='' -k ${sockDir} -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
  "-w", "start",
], { encoding: "utf8" });
if (start.status !== 0) {
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  throw new Error(`Falha ao iniciar PostgreSQL descartável:\n${start.stderr}\n${log}`);
}

function pararPostgres() {
  spawnSync(path.join(postgresBinDir, "pg_ctl"), [
    "-D", dataDir, "-m", "immediate", "-w", "stop",
  ], { stdio: "ignore" });
  fs.rmSync(baseDir, { recursive: true, force: true });
}

// getDb() de produção só aceita a URL do Neon. A URL do socket não tem host
// local, então permite exercitar o router e suas transações sem exceção de teste.
process.env.NEON_DATABASE_URL = `postgresql://postgres@/postgres?host=${encodeURIComponent(sockDir)}`;
process.env.DATABASE_URL = "";

const COMPANY_ID = 910_191;
const OTHER_COMPANY_ID = 910_192;
const OBRA_ID = 191;
const OTHER_OBRA_ID = 192;
const USER = {
  id: 191,
  role: "admin_master",
  name: "Teste concorrente de recebimento",
  email: "recebimento-concorrente@example.invalid",
};

type Resultado = { name: string; ok: boolean; detail?: string };
const resultados: Resultado[] = [];
function verificar(name: string, ok: boolean, detail?: string) {
  resultados.push({ name, ok, detail });
  if (!ok) console.error(`FALHOU: ${name}${detail ? ` — ${detail}` : ""}`);
}

function linhas(resultado: any): any[] {
  return resultado?.rows ?? resultado ?? [];
}

async function main() {
  const { getTableColumns, getTableName } = await import("drizzle-orm");
  const schema = await import("../drizzle/schema");
  const { getDb, resetDbPool } = await import("./db");
  const { warehouseRouter } = await import("./routers/warehouse");
  const { Pool } = await import("pg");

  const db = await getDb();
  if (!db) throw new Error("getDb() não conectou ao PostgreSQL descartável.");

  const ddlTabela = (table: any): string => {
    const nome = getTableName(table);
    const colunas = Object.values(getTableColumns(table) as Record<string, any>).map((coluna: any) => {
      const pk = coluna.name === "id" ? " PRIMARY KEY" : "";
      return `"${coluna.name}" ${coluna.getSQLType()}${pk}`;
    });
    return `CREATE TABLE IF NOT EXISTS "${nome}" (${colunas.join(", ")})`;
  };
  for (const table of [
    schema.companies,
    schema.obras,
    schema.comprasOrdens,
    schema.comprasOrdensItens,
    schema.almoxarifadoItens,
    schema.almoxarifadoMovimentacoes,
    schema.almoxarifadoTransferencias,
    schema.almoxarifadoRecebimentos,
    schema.almoxarifadoRecebimentoItens,
  ]) {
    await (db as any).execute(ddlTabela(table));
  }

  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, max: 6 });
  const caller = () => warehouseRouter.createCaller({ user: USER as any, req: {} as any, res: {} as any });

  const limpar = async () => {
    await pool.query(`
      TRUNCATE TABLE almoxarifado_recebimento_itens, almoxarifado_recebimentos,
        almoxarifado_movimentacoes, almoxarifado_transferencias, almoxarifado_itens,
        compras_ordens_itens, compras_ordens, obras, companies
      RESTART IDENTITY
    `);
    await (db as any).insert(schema.companies).values([
      { id: COMPANY_ID, cnpj: "91019100000100", razaoSocial: "Empresa de teste A" },
      { id: OTHER_COMPANY_ID, cnpj: "91019200000100", razaoSocial: "Empresa de teste B" },
    ]);
    await (db as any).insert(schema.obras).values([
      { id: OBRA_ID, companyId: COMPANY_ID, nome: "Obra de recebimento" },
      { id: OTHER_OBRA_ID, companyId: OTHER_COMPANY_ID, nome: "Obra de outra empresa" },
    ]);
  };

  const criarOc = async (items: Array<{ nome: string; quantidade: number }>) => {
    const [oc] = await (db as any).insert(schema.comprasOrdens).values({
      companyId: COMPANY_ID,
      obraId: OBRA_ID,
      numeroOc: `OC-${Math.random().toString(36).slice(2, 9)}`,
      status: "aprovada",
      // Zero evita materializar financeiro neste teste: o foco é somente o
      // contrato atômico entre OC e estoque.
      total: "0",
    }).returning({ id: schema.comprasOrdens.id });

    const linhasOc: Array<{ id: number; nome: string; quantidade: number }> = [];
    for (const item of items) {
      const [linha] = await (db as any).insert(schema.comprasOrdensItens).values({
        ordemId: oc.id,
        descricao: item.nome,
        quantidade: String(item.quantidade),
        quantidadeEntregue: "0",
        unidade: "un",
      }).returning({ id: schema.comprasOrdensItens.id });
      linhasOc.push({ id: linha.id, ...item });
    }
    return { id: oc.id as number, linhas: linhasOc };
  };

  const criarItemEstoque = async (nome: string) => {
    const [item] = await (db as any).insert(schema.almoxarifadoItens).values({
      companyId: COMPANY_ID,
      obraId: OBRA_ID,
      nome,
      unidade: "un",
      categoria: "Material",
      quantidadeAtual: "0",
      quantidadeMinima: "0",
      ativo: true,
    }).returning({ id: schema.almoxarifadoItens.id });
    return item.id as number;
  };

  const receber = (params: {
    ocId?: number;
    ocItemId?: number;
    itemId: number;
    nome: string;
    quantidade: number;
    obraId?: number;
  }) => caller().registerSmartEntry({
    companyId: COMPANY_ID,
    obraId: params.obraId ?? OBRA_ID,
    ordemCompraId: params.ocId,
    numeroOc: params.ocId ? `OC-${params.ocId}` : undefined,
    metodoEntrada: "ordem_compra",
    itens: [{
      itemId: params.itemId,
      itemNome: params.nome,
      unidade: "un",
      categoria: "Material",
      quantidadeNf: params.quantidade,
      quantidadeRecebida: params.quantidade,
      ocItemId: params.ocItemId,
      quantidadeOc: params.quantidade,
      modoAlocacao: "existente",
      recebido: true,
    }],
  });

  // Mesmo item, duas entradas parciais simultâneas. Sem lock na linha da OC,
  // ambas leriam saldo 0 e uma delas se perderia; sem incremento SQL atômico,
  // o estoque também poderia terminar em 5 em vez de 10.
  await limpar();
  {
    const oc = await criarOc([{ nome: "Cimento concorrente", quantidade: 10 }]);
    const itemId = await criarItemEstoque("Cimento concorrente");
    const [a, b] = await Promise.allSettled([
      receber({ ocId: oc.id, ocItemId: oc.linhas[0].id, itemId, nome: "Cimento concorrente", quantidade: 5 }),
      receber({ ocId: oc.id, ocItemId: oc.linhas[0].id, itemId, nome: "Cimento concorrente", quantidade: 5 }),
    ]);
    verificar("mesmo item: os dois recebimentos concluem", a.status === "fulfilled" && b.status === "fulfilled",
      `${a.status}/${b.status}`);
    const [linha] = linhas(await pool.query(
      "SELECT quantidade_entregue::text AS entregue FROM compras_ordens_itens WHERE id = $1", [oc.linhas[0].id],
    ));
    const [estoque] = linhas(await pool.query(
      "SELECT quantidade_atual::text AS quantidade FROM almoxarifado_itens WHERE id = $1", [itemId],
    ));
    const [ordem] = linhas(await pool.query("SELECT status FROM compras_ordens WHERE id = $1", [oc.id]));
    const recebimentos = await pool.query("SELECT count(*)::int AS total FROM almoxarifado_recebimentos WHERE ordem_compra_id = $1", [oc.id]);
    verificar("mesmo item: quantidade entregue soma 10", Number(linha?.entregue) === 10, JSON.stringify(linha));
    verificar("mesmo item: estoque soma 10", Number(estoque?.quantidade) === 10, JSON.stringify(estoque));
    verificar("mesmo item: OC termina entregue", ordem?.status === "entregue", JSON.stringify(ordem));
    verificar("mesmo item: registra os dois recebimentos", Number(recebimentos.rows[0]?.total) === 2, JSON.stringify(recebimentos.rows));
  }

  // Itens diferentes ainda precisam serializar a OC inteira: o primeiro deixa
  // "parcial" e o segundo é obrigado a recalcular para "entregue".
  await limpar();
  {
    const oc = await criarOc([
      { nome: "Areia concorrente", quantidade: 10 },
      { nome: "Brita concorrente", quantidade: 10 },
    ]);
    const areiaId = await criarItemEstoque("Areia concorrente");
    const britaId = await criarItemEstoque("Brita concorrente");
    const [a, b] = await Promise.allSettled([
      receber({ ocId: oc.id, ocItemId: oc.linhas[0].id, itemId: areiaId, nome: "Areia concorrente", quantidade: 10 }),
      receber({ ocId: oc.id, ocItemId: oc.linhas[1].id, itemId: britaId, nome: "Brita concorrente", quantidade: 10 }),
    ]);
    verificar("itens diferentes: os dois recebimentos concluem", a.status === "fulfilled" && b.status === "fulfilled",
      `${a.status}/${b.status}`);
    const linhasOc = await pool.query(
      "SELECT quantidade_entregue::text AS entregue FROM compras_ordens_itens WHERE ordem_id = $1 ORDER BY id", [oc.id],
    );
    const estoques = await pool.query(
      "SELECT quantidade_atual::text AS quantidade FROM almoxarifado_itens WHERE id IN ($1, $2) ORDER BY id", [areiaId, britaId],
    );
    const [ordem] = linhas(await pool.query("SELECT status FROM compras_ordens WHERE id = $1", [oc.id]));
    const recebimentos = await pool.query("SELECT count(*)::int AS total FROM almoxarifado_recebimentos WHERE ordem_compra_id = $1", [oc.id]);
    verificar("itens diferentes: ambas as linhas foram entregues",
      linhasOc.rows.every(linha => Number(linha.entregue) === 10), JSON.stringify(linhasOc.rows));
    verificar("itens diferentes: ambos os saldos somam 10",
      estoques.rows.every(item => Number(item.quantidade) === 10), JSON.stringify(estoques.rows));
    verificar("itens diferentes: OC termina entregue", ordem?.status === "entregue", JSON.stringify(ordem));
    verificar("itens diferentes: registra os dois recebimentos", Number(recebimentos.rows[0]?.total) === 2, JSON.stringify(recebimentos.rows));
  }

  // A transferência vence a disputa pelo item de destino. Ela retém o lock da
  // linha enquanto a mutação real de recebimento aguarda; quando o lock é
  // liberado, o destino já não pertence à obra da OC e o recebimento deve
  // abortar sem criar recibo, movimentação, saldo ou entrega parcial.
  await limpar();
  {
    const oc = await criarOc([{ nome: "Tubo transferido", quantidade: 5 }]);
    const itemId = await criarItemEstoque("Tubo transferido");
    const transfer = await pool.connect();
    try {
      await transfer.query("BEGIN");
      await transfer.query("SELECT id FROM almoxarifado_itens WHERE id = $1 FOR UPDATE", [itemId]);
      const recebimento = receber({
        ocId: oc.id, ocItemId: oc.linhas[0].id, itemId, nome: "Tubo transferido", quantidade: 5,
      });
      await new Promise(resolve => setTimeout(resolve, 30));
      await transfer.query("UPDATE almoxarifado_itens SET obra_id = $2 WHERE id = $1", [itemId, OTHER_OBRA_ID]);
      await transfer.query(`
        INSERT INTO almoxarifado_transferencias
          (company_id, item_id_origem, item_id_destino, item_nome, unidade, quantidade, origem_tipo, origem_obra_id, destino_tipo, destino_obra_id)
        VALUES ($1, $2, $2, 'Tubo transferido', 'un', 0, 'obra', $3, 'obra', $4)
      `, [COMPANY_ID, itemId, OBRA_ID, OTHER_OBRA_ID]);
      await transfer.query("COMMIT");

      const resultado = await Promise.allSettled([recebimento]);
      verificar("transferência concorrente: recebimento é rejeitado", resultado[0].status === "rejected",
        resultado[0].status === "rejected" ? String(resultado[0].reason) : undefined);
    } finally {
      await transfer.query("ROLLBACK").catch(() => {});
      transfer.release();
    }

    const [linha] = linhas(await pool.query(
      "SELECT quantidade_entregue::text AS entregue FROM compras_ordens_itens WHERE id = $1", [oc.linhas[0].id],
    ));
    const [ordem] = linhas(await pool.query("SELECT status FROM compras_ordens WHERE id = $1", [oc.id]));
    const [estoque] = linhas(await pool.query(
      "SELECT quantidade_atual::text AS quantidade, obra_id FROM almoxarifado_itens WHERE id = $1", [itemId],
    ));
    const recibos = await pool.query("SELECT count(*)::int AS total FROM almoxarifado_recebimentos WHERE ordem_compra_id = $1", [oc.id]);
    const movimentos = await pool.query("SELECT count(*)::int AS total FROM almoxarifado_movimentacoes WHERE item_id = $1", [itemId]);
    verificar("transferência concorrente: entrega da OC foi revertida", Number(linha?.entregue) === 0, JSON.stringify(linha));
    verificar("transferência concorrente: status da OC permanece aprovada", ordem?.status === "aprovada", JSON.stringify(ordem));
    verificar("transferência concorrente: saldo não recebeu quantidade", Number(estoque?.quantidade) === 0, JSON.stringify(estoque));
    verificar("transferência concorrente: só a transferência moveu o destino", Number(estoque?.obra_id) === OTHER_OBRA_ID, JSON.stringify(estoque));
    verificar("transferência concorrente: não grava recebimento nem movimento",
      Number(recibos.rows[0]?.total) === 0 && Number(movimentos.rows[0]?.total) === 0,
      JSON.stringify({ recibos: recibos.rows, movimentos: movimentos.rows }));
  }

  // Não basta validar o id da OC: uma chamada direta tentando escolher obra de
  // outra empresa precisa falhar antes de gravar qualquer efeito local.
  await limpar();
  {
    const itemId = await criarItemEstoque("Material de empresa A");
    const resultado = await Promise.allSettled([
      receber({ itemId, nome: "Material de empresa A", quantidade: 3, obraId: OTHER_OBRA_ID }),
    ]);
    verificar("obra de outra empresa: recebimento é rejeitado", resultado[0].status === "rejected",
      resultado[0].status === "rejected" ? String(resultado[0].reason) : undefined);
    const [estoque] = linhas(await pool.query(
      "SELECT quantidade_atual::text AS quantidade, obra_id FROM almoxarifado_itens WHERE id = $1", [itemId],
    ));
    const recibos = await pool.query("SELECT count(*)::int AS total FROM almoxarifado_recebimentos WHERE company_id = $1", [COMPANY_ID]);
    verificar("obra de outra empresa: estoque da empresa A não muda",
      Number(estoque?.quantidade) === 0 && Number(estoque?.obra_id) === OBRA_ID, JSON.stringify(estoque));
    verificar("obra de outra empresa: nenhum recebimento é gravado", Number(recibos.rows[0]?.total) === 0, JSON.stringify(recibos.rows));
  }

  await pool.end();
  resetDbPool();
  const falhas = resultados.filter(resultado => !resultado.ok);
  console.log(JSON.stringify({ total: resultados.length, falhas: falhas.length, resultados }));
  return falhas.length === 0 ? 0 : 1;
}

main()
  .then(code => {
    pararPostgres();
    process.exit(code);
  })
  .catch(error => {
    console.error("ERRO no runner:", error);
    pararPostgres();
    process.exit(1);
  });