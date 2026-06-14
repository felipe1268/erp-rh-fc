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
  ok: boolean;
  erro?: string;
}

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
function coletar(
  entities: any[],
  blocks: Record<string, any>,
  xf: Xf,
  out: Poly[],
  depth: number,
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
          if (e.center && e.radius != null) out.push({ pts: arcPts(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2).map((p) => apply(xf, p)), closed: false });
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
          coletar(blk.entities, blocks, childXf, out, depth + 1);
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
  const polys: Poly[] = [];
  coletar(dxf.entities || [], blocks, IDENT, polys, 0);

  if (!polys.length) return fail("Nenhum desenho reconhecido no DXF (somente texto/cotas?).");

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pl of polys) for (const p of pl.pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return fail("Coordenadas do DXF inválidas.");
  let w = maxX - minX;
  let h = maxY - minY;
  if (!(w > 0)) w = 1;
  if (!(h > 0)) h = 1;

  // emite SVG com Y invertido (DXF cresce p/ cima; SVG cresce p/ baixo).
  const fy = (y: number) => minY + maxY - y;
  const parts: string[] = [];
  for (const pl of polys) {
    if (pl.pts.length < 2) continue;
    let d = "";
    for (let i = 0; i < pl.pts.length; i++) {
      const p = pl.pts[i];
      d += `${i === 0 ? "M" : "L"}${p.x.toFixed(3)} ${fy(p.y).toFixed(3)} `;
    }
    if (pl.closed) d += "Z";
    parts.push(`<path d="${d.trim()}" />`);
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" ` +
    `preserveAspectRatio="none" width="100%" height="100%">` +
    `<g fill="none" stroke="#111827" stroke-width="1" vector-effect="non-scaling-stroke" ` +
    `stroke-linecap="round" stroke-linejoin="round">${parts.join("")}</g></svg>`;

  return { svg, w, h, metrosPorUnidade: metrosPorUnidadeDe(dxf.header?.$INSUNITS), ok: true };
}
