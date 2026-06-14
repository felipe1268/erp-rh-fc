/**
 * Geometria do Levantamento de Campo (Medição em PDF) — Rev. 2893.
 *
 * Funções puras compartilhadas (client e, se preciso, server) para converter os
 * contornos desenhados sobre o PDF em quantidades do mundo real (m, m², m³, un).
 *
 * Convenção de coordenadas: os pontos chegam aqui já convertidos para uma
 * unidade LINEAR uniforme (tipicamente "pontos de PDF" = page width/height no
 * scale 1). A calibração fornece `metrosPorUnidade` = metros reais por unidade
 * linear (derivado de uma medida conhecida marcada na planta). Como as plantas
 * de engenharia têm escala uniforme em X e Y, o mesmo fator vale para os dois
 * eixos, então área = áreaNaUnidade × fator² e comprimento = compNaUnidade ×
 * fator.
 */

export type GeoPonto = { x: number; y: number };

// Rev. 3097 — "parede" é uma POLILINHA (comprimento) × altura informada → área em m²
// (pintura, gesso liso, alvenaria). Reaproveita a coluna `tipo` (varchar) e o
// campo `espessura` (= altura). Consolida em m² como qualquer área.
export type TipoContorno = "area" | "volume" | "perimetro" | "contagem" | "parede";

export const UNIDADE_POR_TIPO: Record<TipoContorno, string> = {
  area: "m²",
  volume: "m³",
  perimetro: "m",
  contagem: "un",
  parede: "m²",
};

export const LABEL_TIPO: Record<TipoContorno, string> = {
  area: "Área",
  volume: "Volume",
  perimetro: "Perímetro / Linear",
  contagem: "Contagem",
  parede: "Parede (L×A)",
};

export function distancia(a: GeoPonto, b: GeoPonto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Área absoluta do polígono (fórmula do shoelace), em unidade². */
export function areaShoelace(pts: GeoPonto[]): number {
  if (!pts || pts.length < 3) return 0;
  let soma = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    soma += a.x * b.y - b.x * a.y;
  }
  return Math.abs(soma) / 2;
}

/** Comprimento da polilinha. fechado=true soma o segmento de volta ao início. */
export function comprimentoLinha(pts: GeoPonto[], fechado = false): number {
  if (!pts || pts.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += distancia(pts[i], pts[i + 1]);
  if (fechado && pts.length > 2) total += distancia(pts[pts.length - 1], pts[0]);
  return total;
}

export type ResultadoContorno = {
  area: number;        // m² (0 quando não se aplica)
  perimetro: number;   // m — perímetro do polígono OU comprimento linear
  volume: number;      // m³ (0 quando não se aplica)
  contagem: number;    // un (nº de marcadores)
  quantidade: number;  // valor PRINCIPAL que alimenta a planilha
  unidade: string;     // m² | m³ | m | un
};

/**
 * Calcula as grandezas de um contorno a partir dos pontos (em unidade linear),
 * do fator de calibração (metros por unidade) e, para volume, da espessura/altura
 * em metros. Para contagem, `contagemPontos` é o nº de marcadores.
 */
export function calcularContorno(
  tipo: TipoContorno,
  ptsUnidade: GeoPonto[],
  metrosPorUnidade: number,
  espessuraM = 0,
  contagemPontos = 0,
): ResultadoContorno {
  const mpu = Number.isFinite(metrosPorUnidade) && metrosPorUnidade > 0 ? metrosPorUnidade : 0;
  const base: ResultadoContorno = {
    area: 0, perimetro: 0, volume: 0, contagem: 0, quantidade: 0,
    unidade: UNIDADE_POR_TIPO[tipo],
  };

  if (tipo === "contagem") {
    const n = contagemPontos || (ptsUnidade?.length ?? 0);
    return { ...base, contagem: n, quantidade: n };
  }

  if (tipo === "perimetro") {
    const comp = comprimentoLinha(ptsUnidade, false) * mpu;
    return { ...base, perimetro: comp, quantidade: comp };
  }

  if (tipo === "parede") {
    // Polilinha (comprimento da parede) × altura informada (espessuraM) = área m².
    const comp = comprimentoLinha(ptsUnidade, false) * mpu;
    const areaM2 = comp * (espessuraM > 0 ? espessuraM : 0);
    return { ...base, perimetro: comp, area: areaM2, quantidade: areaM2 };
  }

  // area | volume → precisa de polígono fechado
  const areaM2 = areaShoelace(ptsUnidade) * mpu * mpu;
  const perimetroM = comprimentoLinha(ptsUnidade, true) * mpu;
  if (tipo === "area") {
    return { ...base, area: areaM2, perimetro: perimetroM, quantidade: areaM2 };
  }
  // volume
  const vol = areaM2 * (espessuraM > 0 ? espessuraM : 0);
  return { ...base, area: areaM2, perimetro: perimetroM, volume: vol, quantidade: vol };
}

/** Fator metros/unidade a partir de uma medida conhecida (calibração). */
export function fatorCalibracao(distanciaUnidade: number, medidaRealMetros: number): number {
  if (!(distanciaUnidade > 0) || !(medidaRealMetros > 0)) return 0;
  return medidaRealMetros / distanciaUnidade;
}

/**
 * Rev. 3097 — Simplificação de polilinha (Ramer–Douglas–Peucker) p/ o DESENHO LIVRE:
 * o traço da caneta/dedo gera centenas de pontos; isso reduz para os vértices
 * relevantes sem distorcer a forma. `epsilon` em unidade NORMALIZADA [0..1].
 */
export function simplificarPontos(pts: GeoPonto[], epsilon = 0.004): GeoPonto[] {
  if (!pts || pts.length <= 2) return pts ?? [];
  const distPontoSegmento = (p: GeoPonto, a: GeoPonto, b: GeoPonto): number => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return distancia(p, a);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return distancia(p, { x: a.x + t * dx, y: a.y + t * dy });
  };
  const rdp = (lista: GeoPonto[]): GeoPonto[] => {
    if (lista.length < 3) return lista;
    let idxMax = 0, distMax = 0;
    for (let i = 1; i < lista.length - 1; i++) {
      const d = distPontoSegmento(lista[i], lista[0], lista[lista.length - 1]);
      if (d > distMax) { distMax = d; idxMax = i; }
    }
    if (distMax > epsilon) {
      const esq = rdp(lista.slice(0, idxMax + 1));
      const dir = rdp(lista.slice(idxMax));
      return [...esq.slice(0, -1), ...dir];
    }
    return [lista[0], lista[lista.length - 1]];
  };
  return rdp(pts);
}
