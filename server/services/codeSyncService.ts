/**
 * Serviço de Sincronização de Código com o GitHub.
 *
 * Objetivos:
 *  - Saber qual commit o ERP em execução foi gerado (build-info.json em produção,
 *    ou `git rev-parse` no ambiente de desenvolvimento).
 *  - Saber o último commit no GitHub (branch main) via integração.
 *  - Comparar e sinalizar alerta quando o código local/ativo NÃO está no GitHub.
 *  - Redundância: enviar uma cópia (.zip) do código-fonte para uma branch dedicada
 *    no GitHub, sob demanda (além do push automático que o Replit já faz).
 *
 * Integração: GitHub connector (Replit) — ver server/services/githubClient.ts.
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { githubFetch, GITHUB_REPO, GitHubNotConnectedError } from "./githubClient";

const SNAPSHOT_BRANCH = "erp-code-snapshots";
const SNAPSHOT_FILE = "erp-source-latest.zip";

export interface CommitInfo {
  sha: string;
  shortSha: string;
  date: string | null;
  message: string;
  author?: string;
}

export type SyncStatus =
  | "em_dia"
  | "github_atrasado"
  | "deploy_pendente"
  | "divergente"
  | "erro"
  | "desconhecido";

function safeGit(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** Commit do ERP em execução: build-info.json (prod) → git (dev) → null. */
export function getRunningCommit(): (CommitInfo & { source: "build" | "git" }) | null {
  const candidates: string[] = [path.join(process.cwd(), "dist", "build-info.json")];
  try {
    const dir = (import.meta as any)?.dirname;
    if (dir) candidates.push(path.join(dir, "build-info.json"));
  } catch {
    /* noop */
  }
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, "utf8"));
        if (j && j.commit) {
          return {
            sha: j.commit,
            shortSha: j.shortCommit || String(j.commit).slice(0, 7),
            date: j.commitDate || null,
            message: j.commitMsg || "",
            source: "build",
          };
        }
      }
    } catch {
      /* tenta o próximo */
    }
  }
  const sha = safeGit("git rev-parse HEAD");
  if (sha) {
    return {
      sha,
      shortSha: sha.slice(0, 7),
      date: safeGit("git log -1 --format=%cI") || null,
      message: safeGit("git log -1 --format=%s"),
      source: "git",
    };
  }
  return null;
}

/** Último commit de uma branch no GitHub. */
export async function getGitHubLatest(branch = "main"): Promise<CommitInfo> {
  const res = await githubFetch(`/repos/${GITHUB_REPO}/commits/${branch}`);
  if (!res.ok) {
    throw new Error(`GitHub respondeu ${res.status} ao consultar a branch ${branch}.`);
  }
  const j: any = await res.json();
  return {
    sha: j.sha,
    shortSha: String(j.sha || "").slice(0, 7),
    date: j.commit?.author?.date || j.commit?.committer?.date || null,
    message: String(j.commit?.message || "").split("\n")[0],
    author: j.commit?.author?.name || j.author?.login,
  };
}

/** Último commit (data) da branch de snapshots de código, se existir. */
async function getLastSnapshot(): Promise<{ date: string | null; shortSha: string } | null> {
  try {
    const res = await githubFetch(`/repos/${GITHUB_REPO}/commits/${SNAPSHOT_BRANCH}`);
    if (!res.ok) return null;
    const j: any = await res.json();
    return {
      date: j.commit?.author?.date || j.commit?.committer?.date || null,
      shortSha: String(j.sha || "").slice(0, 7),
    };
  } catch {
    return null;
  }
}

export interface CodeSyncStatus {
  repo: string;
  branch: string;
  running: (CommitInfo & { source: string }) | null;
  github: CommitInfo | null;
  status: SyncStatus;
  alerta: boolean;
  conectado: boolean;
  erro: string | null;
  diasDesdeGithub: number | null;
  ultimoSnapshot: { date: string | null; shortSha: string } | null;
}

export async function getCodeSyncStatus(): Promise<CodeSyncStatus> {
  const running = getRunningCommit();
  let github: CommitInfo | null = null;
  let erro: string | null = null;
  let conectado = true;

  try {
    github = await getGitHubLatest("main");
  } catch (e: any) {
    if (e instanceof GitHubNotConnectedError) conectado = false;
    erro = e?.message || "Falha ao consultar o GitHub.";
  }

  const ultimoSnapshot = conectado ? await getLastSnapshot() : null;

  let diasDesdeGithub: number | null = null;
  if (github?.date) {
    diasDesdeGithub = Math.floor((Date.now() - new Date(github.date).getTime()) / 86_400_000);
  }

  let status: SyncStatus = "desconhecido";
  let alerta = false;

  if (erro || !github) {
    status = "erro";
    alerta = true;
  } else if (running) {
    if (running.sha === github.sha) {
      status = "em_dia";
    } else if (running.date && github.date && new Date(running.date) > new Date(github.date)) {
      status = "github_atrasado";
      alerta = true;
    } else {
      status = "deploy_pendente";
    }
  } else {
    status = "desconhecido";
  }

  return {
    repo: GITHUB_REPO,
    branch: "main",
    running,
    github,
    status,
    alerta,
    conectado,
    erro,
    diasDesdeGithub,
    ultimoSnapshot,
  };
}

// ============================================================
// REDUNDÂNCIA — envio de cópia do código-fonte ao GitHub
// ============================================================

function sourcePresente(): boolean {
  return (
    existsSync(path.join(process.cwd(), "client")) &&
    existsSync(path.join(process.cwd(), "server")) &&
    existsSync(path.join(process.cwd(), "package.json"))
  );
}

/**
 * ALLOWLIST estrita: SOMENTE diretórios e arquivos de CÓDIGO entram no snapshot.
 * Nunca usar blocklist aqui — a raiz do workspace contém uploads, dumps com PII
 * (ex.: pdf_employees.json), .env e outros artefatos sensíveis que JAMAIS podem
 * ser publicados no GitHub. Tudo que não estiver nesta lista fica de fora.
 */
const SNAPSHOT_ALLOW_DIRS = ["client", "server", "shared", "drizzle", "scripts", "patches"];
const SNAPSHOT_ALLOW_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "drizzle.config.ts",
  "tailwind.config.ts",
  "postcss.config.js",
  "postcss.config.cjs",
  "components.json",
  "replit.nix",
  "nixpacks.toml",
];
/** Mesmo dentro dos dirs permitidos, estes padrões nunca entram (defesa em profundidade). */
const SNAPSHOT_FORBIDDEN = [
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/*.log",
  "**/node_modules/**",
  "**/uploads/**",
  "**/.git/**",
];
const SNAPSHOT_MAX_BYTES = 80 * 1024 * 1024; // 80MB — sanity guard contra inclusão acidental

async function buildSourceZip(): Promise<Buffer> {
  const archiver = (await import("archiver")).default;
  const { PassThrough } = await import("stream");
  const archive = archiver("zip", { zlib: { level: 9 } });
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  pass.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<void>((resolve, reject) => {
    pass.on("end", () => resolve());
    pass.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(pass);
  const root = process.cwd();
  for (const dir of SNAPSHOT_ALLOW_DIRS) {
    if (existsSync(path.join(root, dir))) {
      archive.glob(`${dir}/**/*`, { cwd: root, dot: true, ignore: SNAPSHOT_FORBIDDEN });
    }
  }
  for (const file of SNAPSHOT_ALLOW_FILES) {
    if (existsSync(path.join(root, file))) {
      archive.file(path.join(root, file), { name: file });
    }
  }
  await archive.finalize();
  await done;
  const buf = Buffer.concat(chunks);
  if (buf.length > SNAPSHOT_MAX_BYTES) {
    throw new Error(
      `O pacote de código ficou maior que o esperado (${(buf.length / 1048576).toFixed(1)}MB). ` +
        "Envio cancelado por segurança — verifique se nenhum diretório de dados foi incluído."
    );
  }
  return buf;
}

async function ghJson(pathUrl: string, init?: RequestInit): Promise<any> {
  const res = await githubFetch(pathUrl, init);
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GitHub ${init?.method || "GET"} ${pathUrl} → ${res.status}: ${body?.message || ""}`);
  }
  return body;
}

export interface SnapshotResult {
  success: boolean;
  branch: string;
  shortSha: string;
  tamanhoBytes: number;
  url: string;
}

// Rev. 4620 — progresso do envio (0–100%) para a UI acompanhar ao vivo.
// Estado em memória (um envio por vez; o botão da UI já impede concorrência).
// Rev. 4625 — o envio roda em BACKGROUND (Safari/iPad aborta fetch longo);
// o resultado/erro final viaja pelo próprio progresso, consumido pelo polling.
// runId correlaciona cada envio: o client só reage ao progresso do SEU run
// (evita toastar resultado/erro de um envio anterior).
let _snapshotProgress: { ativo: boolean; pct: number; etapa: string; runId?: string; erro?: string | null; resultado?: SnapshotResult | null } = { ativo: false, pct: 0, etapa: "" };
export function getSnapshotProgress() {
  return _snapshotProgress;
}
function setProgresso(pct: number, etapa: string) {
  _snapshotProgress = { ativo: true, pct: Math.min(100, Math.max(0, Math.round(pct))), etapa, runId: _snapshotProgress.runId };
}

/**
 * Compacta o código-fonte e o envia (como .zip) para a branch dedicada no GitHub,
 * usando a Git Data API (blob → tree → commit → ref). Não usa o `.git` local.
 */
export async function pushCodeSnapshotToGitHub(iniciadoPor: string, jaTravado = false): Promise<SnapshotResult> {
  // Trava de envio ÚNICO (single-flight): se já há um envio em andamento
  // (inclusive iniciado por outro admin), rejeita em vez de disputar a branch.
  if (!jaTravado) {
    if (_snapshotProgress.ativo) {
      throw new Error("Já existe um envio de cópia do código em andamento. Aguarde a conclusão.");
    }
    setProgresso(1, "Iniciando…");
  }
  try {
  if (!sourcePresente()) {
    throw new Error(
      "O código-fonte completo não está disponível neste ambiente (provavelmente o app publicado, que roda apenas o build). Envie a cópia a partir do ambiente de desenvolvimento."
    );
  }

  setProgresso(2, "Compactando o código-fonte…");
  const zip = await buildSourceZip();

  // 1) blobs com o conteúdo do zip em PARTES de 4MB — o proxy da integração
  //    rejeita corpos maiores que ~5MB (HTTP 413), então um zip de 20MB+
  //    precisa ser fatiado. Reconstituir: cat erp-source-latest.zip.part* > erp-source-latest.zip
  const PART_BYTES = 4 * 1024 * 1024;
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  const totalPartes = Math.ceil(zip.length / PART_BYTES);
  for (let i = 0; i < totalPartes; i++) {
    // 10% após compactar → 85% ao terminar as partes (proporcional ao enviado)
    setProgresso(10 + (i / totalPartes) * 75, `Enviando parte ${i + 1} de ${totalPartes}…`);
    const parte = zip.subarray(i * PART_BYTES, (i + 1) * PART_BYTES);
    const blob = await ghJson(`/repos/${GITHUB_REPO}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: parte.toString("base64"), encoding: "base64" }),
    });
    treeEntries.push({
      path: `${SNAPSHOT_FILE}.part${String(i + 1).padStart(3, "0")}`,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  // manifest com instruções de reconstituição
  setProgresso(86, "Enviando manifesto…");
  const { createHash } = await import("crypto");
  const manifesto = [
    `# Cópia de segurança do código-fonte do ERP`,
    ``,
    `Arquivo: ${SNAPSHOT_FILE} (dividido em ${totalPartes} partes de até 4MB)`,
    `Tamanho total: ${zip.length} bytes`,
    `SHA-256 do zip completo: ${createHash("sha256").update(zip).digest("hex")}`,
    ``,
    `Para reconstituir:`,
    "```",
    `cat ${SNAPSHOT_FILE}.part* > ${SNAPSHOT_FILE}`,
    `unzip ${SNAPSHOT_FILE}`,
    "```",
    ``,
  ].join("\n");
  const manifestBlob = await ghJson(`/repos/${GITHUB_REPO}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: Buffer.from(manifesto).toString("base64"), encoding: "base64" }),
  });
  treeEntries.push({ path: "README.md", mode: "100644", type: "blob", sha: manifestBlob.sha });

  // 2) árvore contendo as partes do zip + manifesto
  setProgresso(90, "Gravando no GitHub…");
  const tree = await ghJson(`/repos/${GITHUB_REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree: treeEntries }),
  });

  // 3) parent = head atual da branch de snapshots (se existir)
  let parents: string[] = [];
  try {
    const ref = await githubFetch(`/repos/${GITHUB_REPO}/git/ref/heads/${SNAPSHOT_BRANCH}`);
    if (ref.ok) {
      const j: any = await ref.json();
      if (j?.object?.sha) parents = [j.object.sha];
    }
  } catch {
    /* branch ainda não existe */
  }

  const ts = new Date().toISOString();
  const commit = await ghJson(`/repos/${GITHUB_REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `Cópia do código-fonte do ERP (${ts}) — enviado por ${iniciadoPor}`,
      tree: tree.sha,
      parents,
    }),
  });

  // 4) cria ou atualiza a ref da branch
  if (parents.length === 0) {
    await ghJson(`/repos/${GITHUB_REPO}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${SNAPSHOT_BRANCH}`, sha: commit.sha }),
    });
  } else {
    await ghJson(`/repos/${GITHUB_REPO}/git/refs/heads/${SNAPSHOT_BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  }

  const resultado: SnapshotResult = {
    success: true,
    branch: SNAPSHOT_BRANCH,
    shortSha: String(commit.sha || "").slice(0, 7),
    tamanhoBytes: zip.length,
    url: `https://github.com/${GITHUB_REPO}/tree/${SNAPSHOT_BRANCH}`,
  };
  _snapshotProgress = { ativo: false, pct: 100, etapa: "Concluído", runId: _snapshotProgress.runId, resultado };
  return resultado;
  } catch (e: any) {
    _snapshotProgress = { ativo: false, pct: 0, etapa: "", runId: _snapshotProgress.runId, erro: e?.message || "Erro desconhecido no envio" };
    throw e;
  }
}

/**
 * Rev. 4625 — dispara o envio em background e retorna IMEDIATAMENTE.
 * O iPad/Safari aborta fetchs longos ("Fetch is aborted"); a UI acompanha
 * pelo polling de getSnapshotProgress(), que carrega o resultado/erro final.
 */
export function startCodeSnapshotAsync(iniciadoPor: string): { iniciado: boolean; runId: string } {
  if (_snapshotProgress.ativo) {
    throw new Error("Já existe um envio de cópia do código em andamento. Aguarde a conclusão.");
  }
  // marca síncrono ANTES do async (single-flight sem corrida); runId novo
  // zera resultado/erro do run anterior atomicamente
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  _snapshotProgress = { ativo: true, pct: 1, etapa: "Iniciando…", runId };
  pushCodeSnapshotToGitHub(iniciadoPor, /* jaTravado */ true).catch((e) => {
    console.error("[CodeSync] Envio em background falhou:", e?.message || e);
  });
  return { iniciado: true, runId };
}
