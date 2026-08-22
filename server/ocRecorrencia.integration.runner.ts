// Runner do teste de integração de concorrência da OC recorrente.
//
// Executado pelo Vitest (server/ocRecorrencia.integration.test.ts) como
// processo filho via tsx — o transformador SSR do Vitest 2.1.9 deste projeto
// não consegue carregar drizzle/schema.ts diretamente (Vite 7), e o tsx é o
// mesmo loader do servidor de produção, então nada precisa ser mockado.
//
// Sobe um PostgreSQL 16 DESCARTÁVEL em diretório temporário, escutando SÓ em
// socket Unix (nenhuma porta TCP), aponta NEON_DATABASE_URL para ele ANTES de
// importar o código de produção e roda as mutações reais do router de Compras
// em paralelo. Nenhum dado real do Neon é lido ou escrito.
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
const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-recorrencia-pg-"));
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

// A URL via socket Unix não contém "localhost"/"127.0.0.1"/"@helium", então o
// guard do getDb() de produção aceita — e TODO o fluxo usa o banco descartável.
process.env.NEON_DATABASE_URL = `postgresql://postgres@/postgres?host=${encodeURIComponent(sockDir)}`;
process.env.DATABASE_URL = "";

const COMPANY_ID = 910_168;
const USER = { id: 168, role: "admin_master", name: "Teste concorrente", email: "concorrencia@example.invalid" };

type Resultado = { name: string; ok: boolean; detail?: string };
const resultados: Resultado[] = [];
function verificar(name: string, ok: boolean, detail?: string) {
  resultados.push({ name, ok, detail });
  if (!ok) console.error(`FALHOU: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const { getTableColumns, getTableName } = await import("drizzle-orm");
  const schema = await import("../drizzle/schema");
  const { getDb, resetDbPool } = await import("./db");
  const { comprasRouter } = await import("./routers/compras");

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
    schema.comprasOrdens, schema.comprasOrdensItens, schema.financialAccounts,
    schema.financialEntries, schema.financialEntryBaixas, schema.obras,
    schema.comprasReservasSaldo, schema.comprasReservasLog,
  ]) {
    await (db as any).execute(ddlTabela(table));
  }
  // IMPORTANTE: nenhum índice artificial é adicionado — o banco de teste usa
  // exatamente o schema Drizzle de produção, então uma corrida que
  // materializasse a mesma competência 2x apareceria como LINHA DUPLICADA nas
  // consultas de verificação abaixo (e falharia as assertivas), em vez de ser
  // mascarada por um constraint que não existe em produção.

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, max: 4 });

  const limpar = async () => {
    await pool.query(`
      TRUNCATE TABLE financial_entry_baixas, financial_entries, financial_accounts,
        compras_ordens_itens, compras_ordens, obras, compras_reservas_saldo, compras_reservas_log
      RESTART IDENTITY
    `);
    await pool.query(`INSERT INTO obras (id, nome, company_id) VALUES (1, 'Obra teste concorrente', $1)
                      ON CONFLICT (id) DO NOTHING`, [COMPANY_ID]).catch(async () => {
      await pool.query(`INSERT INTO obras (id, nome) VALUES (1, 'Obra teste concorrente')`);
    });
  };

  const inserirOc = async (params: { status?: string; total?: string } = {}) => {
    const r = await pool.query<{ id: number }>(`
      INSERT INTO compras_ordens (
        company_id, numero_oc, obra_id, status, aprovacao_status,
        subtotal, total, condicao_pagamento, lancamento_recorrente,
        recorrencia_data_inicio, recorrencia_data_fim, modalidade_fd,
        tipo, created_at, updated_at
      ) VALUES ($1, 'OC-TESTE-168', 1, $2, 'aguardando', $3, $3, '30 dias', true,
                '2026-01-31', '2026-03-31', 'normal', 'servico', now(), now())
      RETURNING id
    `, [COMPANY_ID, params.status ?? "pendente", params.total ?? "100.00"]);
    return r.rows[0].id;
  };

  const caller = () => comprasRouter.createCaller({ user: USER as any, req: {} as any, res: {} as any });

  // Distingue rejeição LEGÍTIMA (guard de estado terminal do próprio router)
  // de rollback acidental por erro de banco (ex.: violação de unicidade),
  // que indicaria defeito real de concorrência e NUNCA pode passar.
  const rejeicaoLegitima = (motivo: unknown): boolean => {
    const texto = String((motivo as any)?.message ?? motivo ?? "");
    if (/duplicate key|unique|23505|deadlock|serialize/i.test(texto)) return false;
    return /cancelada|recusada|entregue|não pode|não permite/i.test(texto);
  };
  const exigirDesfechoEsperado = (nome: string, r: PromiseSettledResult<unknown>) => {
    verificar(nome, r.status === "fulfilled" || rejeicaoLegitima((r as any).reason),
      r.status === "rejected" ? String((r as any).reason) : undefined);
  };

  // ── Cenário 1: aprovação × cancelamento simultâneos ──────────────────────
  // Repetido algumas vezes para dar chance real às duas ordens de chegada.
  for (let rodada = 1; rodada <= 4; rodada++) {
    await limpar();
    const ocId = await inserirOc();
    const [aprovacao, cancelamento] = await Promise.allSettled([
      caller().atualizarStatusOrdem({ id: ocId, status: "aprovada" }),
      caller().atualizarStatusOrdem({ id: ocId, status: "cancelada" }),
    ]);

    verificar(`r${rodada}: cancelamento sempre conclui`, cancelamento.status === "fulfilled",
      cancelamento.status === "rejected" ? String((cancelamento as any).reason) : undefined);
    exigirDesfechoEsperado(`r${rodada}: aprovação conclui ou é rejeitada legitimamente`, aprovacao);

    const oc = await pool.query(`SELECT status FROM compras_ordens WHERE id = $1`, [ocId]);
    verificar(`r${rodada}: estado terminal vence (OC cancelada)`, oc.rows[0].status === "cancelada",
      `status=${oc.rows[0].status}`);

    const abertos = await pool.query(`
      SELECT id, status FROM financial_entries
       WHERE company_id = $1 AND origem_modulo = 'compras' AND origem_id = $2
         AND status <> 'cancelado'
    `, [COMPANY_ID, ocId]);
    verificar(`r${rodada}: nenhuma projeção aberta indevida`, abertos.rowCount === 0,
      JSON.stringify(abertos.rows));
  }

  // ── Cenário 2: entrega × cancelamento simultâneos ────────────────────────
  await limpar();
  {
    const ocId = await inserirOc({ status: "aprovada" });
    await caller().atualizarStatusOrdem({ id: ocId, status: "aprovada" }); // materializa previsto
    const [entrega, cancelamento] = await Promise.allSettled([
      caller().atualizarStatusOrdem({ id: ocId, status: "entregue_parcial" }),
      caller().atualizarStatusOrdem({ id: ocId, status: "cancelada" }),
    ]);
    verificar("entrega×cancelamento: cancelamento sempre conclui", cancelamento.status === "fulfilled",
      cancelamento.status === "rejected" ? String((cancelamento as any).reason) : undefined);
    exigirDesfechoEsperado("entrega×cancelamento: entrega conclui ou é rejeitada legitimamente", entrega);

    const oc = await pool.query(`SELECT status FROM compras_ordens WHERE id = $1`, [ocId]);
    verificar("entrega×cancelamento: OC termina cancelada", oc.rows[0].status === "cancelada",
      `status=${oc.rows[0].status}`);
    const abertos = await pool.query(`
      SELECT id, status FROM financial_entries
       WHERE company_id = $1 AND origem_modulo = 'compras' AND origem_id = $2
         AND status <> 'cancelado'
    `, [COMPANY_ID, ocId]);
    verificar("entrega×cancelamento: sem projeção aberta", abertos.rowCount === 0, JSON.stringify(abertos.rows));
  }

  // ── Cenário 3: edição × cancelamento ─────────────────────────────────────
  // A edição de OC recorrente (confirmarRascunhoOrdem) nunca pode recriar ou
  // alterar títulos depois do cancelamento. Cobertura em três formas: as duas
  // ordens seriais determinísticas (barreira = commit de cada mutação) e a
  // corrida real em paralelo.
  const inputEdicao = (ocId: number) => ({
    id: ocId,
    companyId: COMPANY_ID,
    obraId: 1,
    condicaoPagamento: "30 dias",
    lancamentoRecorrente: true,
    recorrenciaDataInicio: "2026-01-31",
    recorrenciaDataFim: "2026-03-31",
    itens: [{ descricao: "Serviço mensal editado", unidade: "mês", quantidade: 1, precoUnitario: 250 }],
  });
  const conferirCanceladaSemAbertos = async (rotulo: string, ocId: number) => {
    const oc = await pool.query(`SELECT status FROM compras_ordens WHERE id = $1`, [ocId]);
    verificar(`${rotulo}: estado terminal vence (OC cancelada)`, oc.rows[0].status === "cancelada",
      `status=${oc.rows[0].status}`);
    const abertos = await pool.query(`
      SELECT id, status FROM financial_entries
       WHERE company_id = $1 AND origem_modulo = 'compras' AND origem_id = $2
         AND status <> 'cancelado'
    `, [COMPANY_ID, ocId]);
    verificar(`${rotulo}: nenhuma projeção aberta indevida`, abertos.rowCount === 0, JSON.stringify(abertos.rows));
  };

  // (a) determinístico: cancelamento COMMITADO antes da edição → edição DEVE
  // ser rejeitada pelo guard de estado terminal e nada pode ser recriado.
  {
    await limpar();
    const ocId = await inserirOc({ status: "aprovada" });
    await caller().atualizarStatusOrdem({ id: ocId, status: "aprovada" }); // materializa previsto
    await caller().atualizarStatusOrdem({ id: ocId, status: "cancelada" });
    const edicao = await caller().confirmarRascunhoOrdem(inputEdicao(ocId)).then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    verificar("edição pós-cancelamento: edição é rejeitada pelo guard terminal",
      edicao.status === "rejected" && rejeicaoLegitima((edicao as any).reason),
      edicao.status === "fulfilled" ? "edição aceitou OC cancelada" : String((edicao as any).reason));
    await conferirCanceladaSemAbertos("edição pós-cancelamento", ocId);
  }

  // (b) determinístico: edição commitada antes → cancelamento posterior deve
  // encerrar TODAS as competências recriadas pela edição.
  {
    await limpar();
    const ocId = await inserirOc({ status: "aprovada" });
    await caller().atualizarStatusOrdem({ id: ocId, status: "aprovada" });
    await caller().confirmarRascunhoOrdem(inputEdicao(ocId));
    await caller().atualizarStatusOrdem({ id: ocId, status: "cancelada" });
    await conferirCanceladaSemAbertos("cancelamento pós-edição", ocId);
  }

  // (c) corrida real em paralelo, repetida para variar a intercalação.
  for (let rodada = 1; rodada <= 4; rodada++) {
    await limpar();
    const ocId = await inserirOc({ status: "aprovada" });
    await caller().atualizarStatusOrdem({ id: ocId, status: "aprovada" });
    const [edicao, cancelamento] = await Promise.allSettled([
      caller().confirmarRascunhoOrdem(inputEdicao(ocId)),
      caller().atualizarStatusOrdem({ id: ocId, status: "cancelada" }),
    ]);
    verificar(`edição×cancelamento r${rodada}: cancelamento sempre conclui`, cancelamento.status === "fulfilled",
      cancelamento.status === "rejected" ? String((cancelamento as any).reason) : undefined);
    exigirDesfechoEsperado(`edição×cancelamento r${rodada}: edição conclui ou é rejeitada legitimamente`, edicao);
    await conferirCanceladaSemAbertos(`edição×cancelamento r${rodada}`, ocId);
  }

  // ── Cenário 4: edição × aprovação simultâneas ────────────────────────────
  for (let rodada = 1; rodada <= 4; rodada++) {
    await limpar();
    const ocId = await inserirOc({ status: "aprovada", total: "100.00" });
    await caller().atualizarStatusOrdem({ id: ocId, status: "aprovada" }); // materializa em 100

    const [edicao, aprovacao] = await Promise.allSettled([
      caller().confirmarRascunhoOrdem({
        id: ocId,
        companyId: COMPANY_ID,
        obraId: 1,
        condicaoPagamento: "30 dias",
        lancamentoRecorrente: true,
        recorrenciaDataInicio: "2026-01-31",
        recorrenciaDataFim: "2026-03-31",
        itens: [{ descricao: "Serviço mensal editado", unidade: "mês", quantidade: 1, precoUnitario: 250 }],
      }),
      caller().atualizarStatusOrdem({ id: ocId, status: "aprovada" }),
    ]);
    verificar(`edição r${rodada}: edição sempre conclui`, edicao.status === "fulfilled",
      edicao.status === "rejected" ? String((edicao as any).reason) : undefined);
    exigirDesfechoEsperado(`edição r${rodada}: aprovação conclui ou é rejeitada legitimamente`, aprovacao);

    const oc = await pool.query(`SELECT status, total::text AS total FROM compras_ordens WHERE id = $1`, [ocId]);
    const titulos = await pool.query(`
      SELECT valor_previsto::text AS valor, data_vencimento::text AS data
        FROM financial_entries
       WHERE company_id = $1 AND origem_modulo = 'compras' AND origem_id = $2
         AND status <> 'cancelado'
       ORDER BY data_vencimento
    `, [COMPANY_ID, ocId]);

    verificar(`edição r${rodada}: total da OC reflete a edição`, Number(oc.rows[0].total) === 250,
      `total=${oc.rows[0].total}`);

    if (oc.rows[0].status === "pendente") {
      // Edição venceu por último: projeções abertas foram descartadas e serão
      // recriadas na próxima aprovação — nenhum título aberto pode sobrar.
      verificar(`edição r${rodada}: OC pendente sem títulos abertos`, titulos.rowCount === 0,
        JSON.stringify(titulos.rows));
    } else {
      // Aprovação venceu por último: os títulos DEVEM espelhar exatamente o
      // total editado, uma competência por mês, sem valor antigo remanescente.
      verificar(`edição r${rodada}: competências completas`,
        titulos.rows.map((t: any) => t.data).join(",") === "2026-01-31,2026-02-28,2026-03-31",
        JSON.stringify(titulos.rows));
      verificar(`edição r${rodada}: título nunca diverge do total da OC`,
        titulos.rows.every((t: any) => Number(t.valor) === Number(oc.rows[0].total)),
        JSON.stringify(titulos.rows));
    }

    // Ramo "aprovação por último" garantido deterministicamente: qualquer que
    // tenha sido a ordem da corrida, uma aprovação subsequente deve
    // materializar os títulos EXATAMENTE no total editado, sem sobra antiga.
    await caller().atualizarStatusOrdem({ id: ocId, status: "aprovada" });
    const titulosFinais = await pool.query(`
      SELECT valor_previsto::text AS valor, data_vencimento::text AS data
        FROM financial_entries
       WHERE company_id = $1 AND origem_modulo = 'compras' AND origem_id = $2
         AND status <> 'cancelado'
       ORDER BY data_vencimento
    `, [COMPANY_ID, ocId]);
    verificar(`edição r${rodada}: pós-aprovação, competências completas`,
      titulosFinais.rows.map((t: any) => t.data).join(",") === "2026-01-31,2026-02-28,2026-03-31",
      JSON.stringify(titulosFinais.rows));
    verificar(`edição r${rodada}: pós-aprovação, títulos = total editado (250)`,
      titulosFinais.rows.every((t: any) => Number(t.valor) === 250),
      JSON.stringify(titulosFinais.rows));
  }

  await pool.end();
  resetDbPool();

  const falhas = resultados.filter(r => !r.ok);
  console.log(JSON.stringify({ total: resultados.length, falhas: falhas.length, resultados }));
  return falhas.length === 0 ? 0 : 1;
}

main()
  .then(code => { pararPostgres(); process.exit(code); })
  .catch(error => {
    console.error("ERRO no runner:", error);
    pararPostgres();
    process.exit(1);
  });
