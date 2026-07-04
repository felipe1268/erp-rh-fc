import fs from "node:fs";
import path from "node:path";

/**
 * Auto-registro de revisões a partir dos blocos JSDoc do `shared/changelog.ts`.
 *
 * MOTIVAÇÃO (regra de ouro): o array estruturado `CHANGELOG` congelou na Rev. 1878
 * — da 1879 em diante as revisões só viraram comentário JSDoc + bump de versão, e
 * NUNCA chegavam à tabela `system_revisions` (tela "Controle de Revisões").
 * Este parser lê o PRÓPRIO arquivo-fonte e extrai toda revisão `Rev. NNNN — ...`
 * para que o `syncRevisions` registre tudo que falta, agora e nas próximas revisões.
 */

export type ParsedRevisionTipo =
  | "feature"
  | "bugfix"
  | "melhoria"
  | "seguranca"
  | "performance";

export type ParsedRevision = {
  version: number;
  titulo: string;
  descricao: string;
  tipo: ParsedRevisionTipo;
  modulos: string;
  dataPublicacao?: string;
};

/** Resolve o caminho do arquivo-fonte em dev e (best-effort) em produção. */
function resolveChangelogPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "shared/changelog.ts"),
    path.resolve(process.cwd(), "../shared/changelog.ts"),
    path.resolve(process.cwd(), "src/shared/changelog.ts"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Classifica o tipo da revisão a partir do título (primário) + corpo (sinais fortes). */
function classify(titulo: string, descricao: string): ParsedRevisionTipo {
  const t = titulo.toLowerCase();
  const full = (titulo + " " + descricao.slice(0, 600)).toLowerCase();

  // Segurança e performance: sinais fortes valem mesmo vindos do corpo.
  if (/\b(idor|vazamento|cross-tenant|multi-tenant|xss|csrf|seguran\w*|permiss\w*\s+(indevid|vazand))\b/.test(full))
    return "seguranca";
  if (/\b(performance|otimiz\w*|lentid\w*|lento|gargalo|n\+1|índice|memory leak)\b/.test(full))
    return "performance";

  // Bug e melhoria: decididos pelo título para evitar falso-positivo do corpo.
  if (/\b(bug|corre[çc][aã]o|corrig\w*|fix\b|falha|quebr\w*|defeito|regress\w*|erro\b)\b/.test(t))
    return "bugfix";
  if (/\b(melhor\w*|redesign|reformul\w*|ajust\w*|refin\w*|padroniz\w*|usabilidade|moderniz\w*|polish|ux\b)\b/.test(t))
    return "melhoria";

  return "feature";
}

/** Deriva o "módulo" do título: segmento antes do primeiro travessão (—). */
function deriveModulos(titulo: string): string {
  const idx = titulo.indexOf(" — ");
  let mod = idx > 0 ? titulo.slice(0, idx) : titulo;
  mod = mod.replace(/\s+/g, " ").trim();
  if (mod.length > 120) mod = mod.slice(0, 117).trimEnd() + "…";
  return mod;
}

/** Best-effort: primeira data dd/mm/yyyy no corpo vira a data de publicação. */
function extractData(descricao: string): string | undefined {
  const m = descricao.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return undefined;
  // Valida dia-no-mês real (ex.: 29/02 em ano não-bissexto, 31/04 etc.) — uma data
  // impossível derrubava o INSERT inteiro com "date/time field value out of range".
  const diasNoMes = new Date(y, mo, 0).getDate();
  if (d > diasNoMes) return undefined;
  return `${yyyy}-${mm}-${dd} 12:00:00`;
}

const STRIP_PREFIX = /^\s*\*\s?/;

/** Lê e parseia todos os blocos `Rev. NNNN — ...` do changelog. */
export function parseChangelogJsdoc(): ParsedRevision[] {
  const file = resolveChangelogPath();
  if (!file) {
    console.warn("[Changelog] Arquivo-fonte não encontrado — auto-registro JSDoc desativado.");
    return [];
  }

  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    console.warn("[Changelog] Falha ao ler arquivo-fonte:", e);
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const out = new Map<number, ParsedRevision>();
  const headerRe = /^\s*\*\s*Rev\.\s*(\d+)\s*—\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headerRe);
    if (!m) continue;

    const version = Number(m[1]);
    if (!Number.isFinite(version)) continue;

    // Falso-positivo: linha de PROSA dentro de um corpo que por acaso começa com
    // `Rev. NNNN — ...` (ex.: "Rev. 2479 — o screenshot ..."). Headers reais começam
    // com maiúscula, **negrito**, dígito ou símbolo; prosa de continuação começa com
    // letra minúscula. Pular evita que a entrada real seja sobrescrita (primeiro vence).
    if (/^\s*[a-zàáâãéêíóôõúüç]/.test(m[2])) continue;

    // ---- Título (pode ser **negrito** quebrado em várias linhas) ----
    let header = m[2];
    let j = i + 1;
    const boldOpen = header.includes("**");
    const boldClosed = (header.match(/\*\*/g) || []).length >= 2;
    if (boldOpen && !boldClosed) {
      while (j < lines.length && j <= i + 6) {
        const cont = lines[j].replace(STRIP_PREFIX, "");
        header += " " + cont;
        j++;
        if ((header.match(/\*\*/g) || []).length >= 2) break;
      }
    }
    let titulo = header.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    if (titulo.length > 255) titulo = titulo.slice(0, 252).trimEnd() + "…";

    // ---- Corpo: da linha seguinte ao título até o PRÓXIMO header `Rev. NNNN —`
    // ou o fim do bloco (*/). Revisões compartilham um mesmo bloco JSDoc, então
    // parar no próximo header evita que o corpo "engula" as revisões seguintes. ----
    const bodyLines: string[] = [];
    let k = j;
    while (k < lines.length && !lines[k].includes("*/") && !headerRe.test(lines[k])) {
      bodyLines.push(lines[k].replace(STRIP_PREFIX, ""));
      k++;
    }
    const descricao = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

    // A entrada mais ALTA no arquivo (mais recente) vence em caso de duplicidade.
    if (out.has(version)) continue;

    out.set(version, {
      version,
      titulo: titulo || `Rev. ${version}`,
      descricao: descricao || titulo || `Rev. ${version}`,
      tipo: classify(titulo, descricao),
      modulos: deriveModulos(titulo),
      dataPublicacao: extractData(descricao),
    });
  }

  return Array.from(out.values());
}
