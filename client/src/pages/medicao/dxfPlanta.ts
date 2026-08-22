// Rev. — Levantamento de Campo: suporte a plantas em DXF.
// Converte o texto de um arquivo DXF num SVG renderizável + bounding box (em
// unidades do DXF) + fator metros/unidade derivado do $INSUNITS do cabeçalho.
// Como o DXF tem coordenadas REAIS, a escala é automática (sem calibração manual).
//
// O motor de contorno/área da tela opera em coordenadas normalizadas [0..1] sobre
// o container; basta o SVG ocupar exatamente a mesma caixa (viewBox = bbox,
// preserveAspectRatio="none") e o pageDims = { w, h } da bbox para que normToPt
// (× pageDims) devolva distâncias em unidades do DXF e a área saia em m².
import DxfParser from "dxf-parser";

export interface DxfPlanta {
  svg: string;
  /** largura da bounding box, em unidades do DXF */
  w: number;
  /** altura da bounding box, em unidades do DXF */
  h: number;
  /** metros por unidade do DXF (do $INSUNITS); null = unidade desconhecida → calibrar manual */
  metrosPorUnidade: number | null;
  /** Rev. 4789 — true quando a unidade do cabeçalho era implausível e a escala foi deduzida do tamanho do desenho */
  escalaHeuristica?: boolean;
  /** Rev. 4789 — versão do algoritmo (sidecar do servidor é regenerado quando muda) */
  algoVersion?: number;
  ok: boolean;
  erro?: string;
  /** Rev. — sugestões de portas/janelas detectadas no DXF (arcos de giro de porta
   *  e blocos com nome PORTA/JANELA). posX/posY normalizados 0..1 no mesmo box do SVG. */
  vaosSugeridos?: VaoSugerido[];
}

export interface VaoSugerido {
  tipo: "porta" | "janela";
  posX: number;
  posY: number;
  /** largura provável do vão em METROS (raio do arco da porta), quando deduzível */
  larguraM?: number;
  fonte: "arco" | "bloco";
}

/** bump sempre que a lógica de parse/escala mudar — invalida sidecars cacheados no servidor. */
export const DXF_ALGO_VERSION = 5;

type Pt = { x: number; y: number };
type Poly = { pts: Pt[]; closed: boolean };

// $INSUNITS (códigos AutoCAD) → metros por unidade.
const UNIT_TO_M: Record<number, number> = {
  1: 0.0254,   // polegadas
  2: 0.3048,   // pés
  4: 0.001,    // milímetros
  5: 0.01,     // centímetros
  6: 1,        // metros
  10: 0.9144,  // jardas
  14: 0.1,     // decímetros
};

function metrosPorUnidadeDe(insunits: any): number | null {
  const n = Number(insunits);
  if (!Number.isFinite(n)) return null;
  return UNIT_TO_M[n] ?? null;
}

// Tesselação de arco/círculo/elipse em uma polilinha de pontos.
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, segs = 48): Pt[] {
  let sweep = a1 - a0;
  while (sweep < 0) sweep += Math.PI * 2;
  if (sweep === 0) sweep = Math.PI * 2;
  const n = Math.max(4, Math.ceil((sweep / (Math.PI * 2)) * segs));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

function ellipsePts(c: Pt, major: Pt, ratio: number, a0: number, a1: number, segs = 64): Pt[] {
  const rMajor = Math.hypot(major.x, major.y);
  const rMinor = rMajor * (ratio || 1);
  const rot = Math.atan2(major.y, major.x);
  let sweep = (a1 ?? Math.PI * 2) - (a0 ?? 0);
  while (sweep < 0) sweep += Math.PI * 2;
  if (sweep === 0) sweep = Math.PI * 2;
  const n = Math.max(8, Math.ceil((sweep / (Math.PI * 2)) * segs));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (a0 ?? 0) + (sweep * i) / n;
    const ex = rMajor * Math.cos(t);
    const ey = rMinor * Math.sin(t);
    out.push({
      x: c.x + ex * Math.cos(rot) - ey * Math.sin(rot),
      y: c.y + ex * Math.sin(rot) + ey * Math.cos(rot),
    });
  }
  return out;
}

interface Xf { tx: number; ty: number; sx: number; sy: number; cos: number; sin: number; }
const IDENT: Xf = { tx: 0, ty: 0, sx: 1, sy: 1, cos: 1, sin: 0 };

function apply(xf: Xf, p: Pt): Pt {
  const x = p.x * xf.sx;
  const y = p.y * xf.sy;
  return {
    x: x * xf.cos - y * xf.sin + xf.tx,
    y: x * xf.sin + y * xf.cos + xf.ty,
  };
}

// Coleta polilinhas (em coords mundo) de uma lista de entidades, expandindo
// INSERTs (referências de bloco) recursivamente.
// Marcas candidatas a porta/janela coletadas durante a varredura (coords mundo).
type Marca = { tipo: "porta" | "janela"; x: number; y: number; rUnid?: number; fonte: "arco" | "bloco" };

function coletar(
  entities: any[],
  blocks: Record<string, any>,
  xf: Xf,
  out: Poly[],
  depth: number,
  marcas?: Marca[],
) {
  if (!Array.isArray(entities) || depth > 6) return;
  for (const e of entities) {
    if (!e || !e.type) continue;
    try {
      switch (e.type) {
        case "LINE": {
          const v = e.vertices || [];
          if (v.length >= 2) out.push({ pts: [apply(xf, v[0]), apply(xf, v[1])], closed: false });
          break;
        }
        case "LWPOLYLINE":
        case "POLYLINE": {
          const v = (e.vertices || []).map((p: Pt) => apply(xf, p));
          if (v.length >= 2) out.push({ pts: v, closed: !!(e.shape || e.closed) });
          break;
        }
        case "CIRCLE": {
          if (e.center && e.radius) out.push({ pts: arcPts(e.center.x, e.center.y, e.radius, 0, Math.PI * 2).map((p) => apply(xf, p)), closed: true });
          break;
        }
        case "ARC": {
          if (e.center && e.radius != null) {
            out.push({ pts: arcPts(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2).map((p) => apply(xf, p)), closed: false });
            // Candidato a PORTA: arco de giro ~90° (folha da porta). O centro do
            // arco é a dobradiça; o raio é a largura da folha.
            if (marcas) {
              let sweep = (e.endAngle ?? 0) - (e.startAngle ?? 0);
              while (sweep < 0) sweep += Math.PI * 2;
              const deg = (sweep * 180) / Math.PI;
              if (deg >= 60 && deg <= 120) {
                const c = apply(xf, e.center);
                marcas.push({ tipo: "porta", x: c.x, y: c.y, rUnid: e.radius * Math.abs(xf.sx || 1), fonte: "arco" });
              }
            }
          }
          break;
        }
        case "ELLIPSE": {
          if (e.center && e.majorAxisEndPoint) out.push({ pts: ellipsePts(e.center, e.majorAxisEndPoint, e.axisRatio ?? 1, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2).map((p) => apply(xf, p)), closed: false });
          break;
        }
        case "SPLINE": {
          const cps = (e.fitPoints && e.fitPoints.length ? e.fitPoints : e.controlPoints) || [];
          if (cps.length >= 2) out.push({ pts: cps.map((p: Pt) => apply(xf, p)), closed: false });
          break;
        }
        case "SOLID":
        case "3DFACE": {
          const v = (e.points || e.vertices || []).map((p: Pt) => apply(xf, p));
          if (v.length >= 3) out.push({ pts: v, closed: true });
          break;
        }
        case "INSERT": {
          // Candidato por NOME do bloco (PORTA*/DOOR*/JANELA*/WINDOW*).
          if (marcas && e.name && e.position) {
            const nm = String(e.name).toUpperCase();
            const pos = apply(xf, e.position);
            if (/PORTA|DOOR/.test(nm)) marcas.push({ tipo: "porta", x: pos.x, y: pos.y, fonte: "bloco" });
            else if (/JANELA|WINDOW/.test(nm)) marcas.push({ tipo: "janela", x: pos.x, y: pos.y, fonte: "bloco" });
          }
          const blk = blocks[e.name];
          if (!blk || !Array.isArray(blk.entities)) break;
          const rot = ((e.rotation ?? 0) * Math.PI) / 180;
          const sx = e.xScale ?? 1;
          const sy = e.yScale ?? 1;
          const pos = e.position || { x: 0, y: 0 };
          const base = blk.position || { x: 0, y: 0 };
          // transform local do bloco (sem base) → compõe com o xf do pai.
          const local: Xf = { tx: pos.x, ty: pos.y, sx, sy, cos: Math.cos(rot), sin: Math.sin(rot) };
          // aplica deslocamento do basePoint do bloco às entidades filhas via xf
          const childXf: Xf = {
            tx: apply({ ...local }, { x: -base.x * 1, y: -base.y * 1 }).x,
            ty: apply({ ...local }, { x: -base.x * 1, y: -base.y * 1 }).y,
            sx: local.sx * xf.sx,
            sy: local.sy * xf.sy,
            cos: Math.cos(rot) * xf.cos - Math.sin(rot) * xf.sin,
            sin: Math.sin(rot) * xf.cos + Math.cos(rot) * xf.sin,
          };
          // compõe translação no espaço do pai
          const tParent = apply(xf, { x: local.tx, y: local.ty });
          childXf.tx = tParent.x - (base.x * childXf.sx * childXf.cos - base.y * childXf.sy * childXf.sin);
          childXf.ty = tParent.y - (base.x * childXf.sx * childXf.sin + base.y * childXf.sy * childXf.cos);
          coletar(blk.entities, blocks, childXf, out, depth + 1, marcas);
          break;
        }
        default:
          break;
      }
    } catch { /* ignora entidade problemática */ }
  }
}

export function parseDxfPlanta(text: string): DxfPlanta {
  const fail = (erro: string): DxfPlanta => ({ svg: "", w: 1, h: 1, metrosPorUnidade: null, ok: false, erro });
  let dxf: any;
  try {
    dxf = new DxfParser().parseSync(text);
  } catch (e: any) {
    return fail("Não foi possível ler o arquivo DXF.");
  }
  if (!dxf) return fail("DXF vazio ou inválido.");

  const blocks: Record<string, any> = dxf.blocks || {};
  let polys: Poly[] = [];
  const marcas: Marca[] = [];
  coletar(dxf.entities || [], blocks, IDENT, polys, 0, marcas);

  if (!polys.length) return fail("Nenhum desenho reconhecido no DXF (somente texto/cotas?).");

  const bboxDe = (pls: Poly[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pl of pls) for (const p of pl.pts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  };

  // Rev. 4789 — arquivos CAD costumam ter mais de um "desenho" no espaço
  // (planta + carimbo/legenda/cópias deslocadas). Agrupa os traços em
  // AGLOMERADOS espaciais e escolhe o da planta:
  //   1º critério: o que casa com os extents do cabeçalho ($EXTMIN/$EXTMAX);
  //   2º critério: o com mais geometria.
  let bb = bboxDe(polys);
  {
    const rawDim = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) || 1;
    // grid-hash: célula = 1/40 da dimensão bruta; células vizinhas (8-conexas)
    // com traços formam o mesmo aglomerado.
    const cell = rawDim / 40;
    const cellKey = (cx: number, cy: number) => `${cx}|${cy}`;
    const cellOf = new Map<string, number[]>(); // key -> índices de polys
    const centers = polys.map((pl, i) => {
      const b = bboxDe([pl]);
      const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      const k = cellKey(Math.floor(c.x / cell), Math.floor(c.y / cell));
      if (!cellOf.has(k)) cellOf.set(k, []);
      cellOf.get(k)!.push(i);
      return c;
    });
    // BFS sobre células ocupadas
    const clusterOf = new Array(polys.length).fill(-1);
    let nClusters = 0;
    const seen = new Set<string>();
    for (const startKey of cellOf.keys()) {
      if (seen.has(startKey)) continue;
      const fila = [startKey];
      seen.add(startKey);
      const cid = nClusters++;
      while (fila.length) {
        const k = fila.pop()!;
        for (const i of cellOf.get(k) || []) clusterOf[i] = cid;
        const [cx, cy] = k.split("|").map(Number);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const nk = cellKey(cx + dx, cy + dy);
          if (!seen.has(nk) && cellOf.has(nk)) { seen.add(nk); fila.push(nk); }
        }
      }
    }
    if (nClusters > 1) {
      // pontuação por aglomerado: nº de pontos (peso de geometria)
      const pontos = new Array(nClusters).fill(0);
      for (let i = 0; i < polys.length; i++) pontos[clusterOf[i]] += polys[i].pts.length;
      // extents do cabeçalho, quando válidos, apontam o desenho "oficial"
      const exMin = dxf.header?.$EXTMIN, exMax = dxf.header?.$EXTMAX;
      const extOk = exMin && exMax && [exMin.x, exMin.y, exMax.x, exMax.y].every((v: any) => Number.isFinite(v))
        && exMax.x - exMin.x > 0 && exMax.y - exMin.y > 0
        && (exMax.x - exMin.x) < rawDim * 0.9; // extents ≈ bbox bruta não decide nada
      let escolhido = pontos.indexOf(Math.max(...pontos));
      if (extOk) {
        // aglomerado cujo centro médio cai dentro dos extents (com margem 30%)
        const mX = (exMax.x - exMin.x) * 0.3, mY = (exMax.y - exMin.y) * 0.3;
        const dentroExt = new Array(nClusters).fill(0);
        for (let i = 0; i < polys.length; i++) {
          const c = centers[i];
          if (c.x >= exMin.x - mX && c.x <= exMax.x + mX && c.y >= exMin.y - mY && c.y <= exMax.y + mY) dentroExt[clusterOf[i]] += polys[i].pts.length;
        }
        const melhorExt = dentroExt.indexOf(Math.max(...dentroExt));
        if (dentroExt[melhorExt] > 0) escolhido = melhorExt;
      }
      const doCluster = polys.filter((_, i) => clusterOf[i] === escolhido);
      if (doCluster.length >= 3) {
        polys = doCluster;
        bb = bboxDe(polys);
      }
    }
  }
  if (!Number.isFinite(bb.minX) || !Number.isFinite(bb.minY)) return fail("Coordenadas do DXF inválidas.");
  const minX = bb.minX, minY = bb.minY, maxX = bb.maxX, maxY = bb.maxY;
  let w = maxX - minX;
  let h = maxY - minY;
  if (!(w > 0)) w = 1;
  if (!(h > 0)) h = 1;

  // emite SVG com Y invertido (DXF cresce p/ cima; SVG cresce p/ baixo).
  const fy = (y: number) => minY + maxY - y;
  const parts: string[] = [];
  for (const pl of polys) {
    // Rev. 4789 — pontos não-finitos geravam "LNaN NaN" e quebravam o path.
    const pts = pl.pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length < 2) continue;
    let d = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      d += `${i === 0 ? "M" : "L"}${p.x.toFixed(3)} ${fy(p.y).toFixed(3)} `;
    }
    if (pl.closed) d += "Z";
    parts.push(`<path d="${d.trim()}" />`);
  }

  // Rev. 4789 — `vector-effect` NÃO é herdado do <g>: com bbox pequena (19
  // unidades = metros), stroke-width=1 virava traço de 1 METRO (borrões
  // pretos). Espessura proporcional à caixa (~1/1500 da maior dimensão).
  const sw = (Math.max(w, h) / 1500).toPrecision(3);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" ` +
    `preserveAspectRatio="none" width="100%" height="100%">` +
    `<g fill="none" stroke="#111827" stroke-width="${sw}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${parts.join("")}</g></svg>`;

  // Rev. 4789 — plausibilidade da unidade: cabeçalhos de DXF frequentemente
  // mentem ($INSUNITS=mm com desenho em metros). Um pavimento plausível tem
  // maior dimensão entre 3m e 1000m; se a unidade declarada cair fora disso,
  // deduz a unidade métrica que encaixa (se for UMA só). Ambíguo → calibrar.
  const maxDim = Math.max(w, h);
  const plaus = (m: number) => maxDim * m >= 3 && maxDim * m <= 1000;
  const insM = metrosPorUnidadeDe(dxf.header?.$INSUNITS);
  let metrosPorUnidade: number | null = insM;
  let escalaHeuristica = false;
  if (insM == null || !plaus(insM)) {
    const imperial = Number(dxf.header?.$MEASUREMENT ?? 1) === 0;
    const cands = imperial ? [0.0254, 0.3048, 1] : [1, 0.01, 0.001];
    const ok = cands.filter(plaus);
    if (ok.length === 1) {
      metrosPorUnidade = ok[0];
      escalaHeuristica = true;
    } else {
      metrosPorUnidade = null; // ambíguo → usuário calibra com 1 medida conhecida
    }
  }

  // Rev. — sugestões de portas/janelas: filtra marcas dentro do box escolhido,
  // valida a largura da porta em metros (0,50–1,50 m quando a escala é conhecida)
  // e deduplica marcas muito próximas (≤ ~0,30 m).
  const vaosSugeridos: VaoSugerido[] = [];
  // Rev. — heurística de JANELA: na planta baixa, janela é desenhada como 3+
  // linhas PARALELAS e próximas (dentro da espessura da parede), todas com o
  // mesmo comprimento ≈ largura do vão. Agrupa segmentos assim e sugere o vão.
  if ((metrosPorUnidade ?? 0) > 0) {
    const mpu = metrosPorUnidade!;
    type Seg = { mx: number; my: number; ang: number; len: number; usado?: boolean };
    const segs: Seg[] = [];
    for (const pl of polys) {
      if (pl.pts.length < 2 || pl.pts.length > 3) continue; // só traços simples (LINE / poly curtinha)
      for (let i = 0; i + 1 < pl.pts.length; i++) {
        const a = pl.pts[i], b = pl.pts[i + 1];
        if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y) * mpu;
        if (len < 0.4 || len > 3.0) continue; // largura plausível de janela
        let ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (ang < 0) ang += Math.PI; // direção sem sentido (mod 180°)
        segs.push({ mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ang, len });
      }
      if (segs.length > 4000) break; // sanidade em plantas gigantes
    }
    const angDiff = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, Math.PI - d); };
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.usado) continue;
      const grupo = [s];
      for (let j = i + 1; j < segs.length; j++) {
        const t = segs[j];
        if (t.usado) continue;
        if (angDiff(s.ang, t.ang) > 0.09) continue;                 // ~5°
        if (Math.abs(t.len - s.len) > s.len * 0.2) continue;        // mesmo comprimento ±20%
        const dx = (t.mx - s.mx) * mpu, dy = (t.my - s.my) * mpu;
        // decompõe a distância entre centros em ao-longo (‖) e perpendicular (⊥)
        const ux = Math.cos(s.ang), uy = Math.sin(s.ang);
        const along = Math.abs(dx * ux + dy * uy);
        const perp = Math.abs(-dx * uy + dy * ux);
        if (perp > 0.30 || along > s.len * 0.35) continue;          // dentro da parede, alinhadas
        grupo.push(t);
      }
      if (grupo.length >= 3) {
        for (const g of grupo) g.usado = true;
        const cx = grupo.reduce((acc, g) => acc + g.mx, 0) / grupo.length;
        const cy = grupo.reduce((acc, g) => acc + g.my, 0) / grupo.length;
        const larg = grupo.map(g => g.len).sort((a, b) => a - b)[Math.floor(grupo.length / 2)];
        // não sugerir janela em cima de porta (arco já detectado a ≤0,8 m)
        const pertoDePorta = marcas.some(mk => mk.tipo === "porta" && Math.hypot((mk.x - cx) * mpu, (mk.y - cy) * mpu) <= 0.8);
        if (!pertoDePorta) marcas.push({ tipo: "janela", x: cx, y: cy, rUnid: larg / mpu, fonte: "bloco" });
      }
    }
  }
  {
    const mpu = metrosPorUnidade ?? 0;
    const tolUnid = mpu > 0 ? 0.30 / mpu : Math.max(w, h) / 200;
    for (const mk of marcas) {
      if (!Number.isFinite(mk.x) || !Number.isFinite(mk.y)) continue;
      if (mk.x < minX - w * 0.01 || mk.x > maxX + w * 0.01 || mk.y < minY - h * 0.01 || mk.y > maxY + h * 0.01) continue;
      let larguraM: number | undefined;
      if (mk.rUnid != null && mpu > 0) {
        larguraM = mk.rUnid * mpu;
        if (mk.fonte === "arco" && (larguraM < 0.5 || larguraM > 1.5)) continue; // não é folha de porta plausível
        if (mk.tipo === "janela" && (larguraM < 0.4 || larguraM > 3.0)) continue;
        larguraM = +(Math.round(larguraM * 20) / 20).toFixed(2); // arredonda p/ 5 cm
      }
      const posX = (mk.x - minX) / w;
      const posY = (maxY - mk.y) / h; // Y invertido, igual ao SVG
      if (vaosSugeridos.some(s => Math.hypot((s.posX - posX) * w, (s.posY - posY) * h) <= tolUnid)) continue;
      vaosSugeridos.push({ tipo: mk.tipo, posX: +posX.toFixed(6), posY: +posY.toFixed(6), larguraM, fonte: mk.fonte });
      if (vaosSugeridos.length >= 400) break;
    }
  }

  return { svg, w, h, metrosPorUnidade, escalaHeuristica, algoVersion: DXF_ALGO_VERSION, vaosSugeridos, ok: true };
}
