import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowLeft, Loader2, Users, AlertCircle, ChevronDown, ChevronUp, Globe, Map as MapIcon } from "lucide-react";
import BrazilMap from "@/components/BrazilMap";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Status definitions ────────────────────────────────────────────────────────
const ALL_STATUS_OPTIONS = [
  { value: "Ativo",             label: "Ativo",           bg: "#dcfce7", fg: "#166534" },
  { value: "Ferias",            label: "Férias",          bg: "#dbeafe", fg: "#1e40af" },
  { value: "Afastado",          label: "Afastado",        bg: "#ede9fe", fg: "#7c3aed" },
  { value: "Licenca",           label: "Licença",         bg: "#cffafe", fg: "#0c5460" },
  { value: "Aviso",             label: "Aviso Prévio",    bg: "#fee2e2", fg: "#b91c1c" },
  { value: "AvisoDispensado",   label: "Disp. Aviso",     bg: "#fed7aa", fg: "#9a3412" },
  { value: "Recluso",           label: "Recluso",         bg: "#f3f4f6", fg: "#374151" },
  { value: "Desligado",         label: "Desligado",       bg: "#fef2f2", fg: "#991b1b" },
  { value: "Lista_Negra",       label: "Lista Negra",     bg: "#1e293b", fg: "#f8fafc" },
] as const;

const DEFAULT_STATUS_VISIVEIS = ALL_STATUS_OPTIONS
  .map(s => s.value)
  .filter(v => v !== "Desligado" && v !== "Lista_Negra");

function statusStyle(status: string | null) {
  const s = ALL_STATUS_OPTIONS.find(o => o.value === (status || "Ativo"));
  return s ? { backgroundColor: s.bg, color: s.fg } : { backgroundColor: "#f1f5f9", color: "#475569" };
}

function statusLabel(status: string | null) {
  const s = ALL_STATUS_OPTIONS.find(o => o.value === (status || ""));
  return s ? s.label : (status || "—");
}

// ── State / city data ─────────────────────────────────────────────────────────
const STATE_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul",
  MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
  PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  "ACRE": "AC", "ALAGOAS": "AL", "AMAPÁ": "AP", "AMAZONAS": "AM",
  "BAHIA": "BA", "CEARÁ": "CE", "DISTRITO FEDERAL": "DF",
  "ESPÍRITO SANTO": "ES", "ESPIRITO SANTO": "ES", "GOIÁS": "GO", "GOIAS": "GO",
  "MARANHÃO": "MA", "MARANHAO": "MA", "MATO GROSSO DO SUL": "MS",
  "MATO GROSSO": "MT", "MINAS GERAIS": "MG", "PARÁ": "PA", "PARA": "PA",
  "PARAÍBA": "PB", "PARAIBA": "PB", "PARANÁ": "PR", "PARANA": "PR",
  "PERNAMBUCO": "PE", "PIAUÍ": "PI", "PIAUI": "PI",
  "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS",
  "RONDÔNIA": "RO", "RONDONIA": "RO", "RORAIMA": "RR",
  "SANTA CATARINA": "SC", "SÃO PAULO": "SP", "SAO PAULO": "SP",
  "SERGIPE": "SE", "TOCANTINS": "TO",
};

function normalizeEstado(estado: string | null | undefined): string {
  if (!estado) return "";
  const trimmed = estado.trim();
  const upper = trimmed.toUpperCase();
  if (upper.length === 2) return upper;
  return STATE_NAME_TO_CODE[upper] || upper;
}

const STATE_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  AC: { center: [-9.02, -70.81], zoom: 7 },
  AL: { center: [-9.57, -36.78], zoom: 8 },
  AM: { center: [-4.27, -65.10], zoom: 5 },
  AP: { center: [1.41, -51.77], zoom: 7 },
  BA: { center: [-12.97, -41.75], zoom: 6 },
  CE: { center: [-5.20, -39.53], zoom: 7 },
  DF: { center: [-15.78, -47.93], zoom: 10 },
  ES: { center: [-19.19, -40.34], zoom: 8 },
  GO: { center: [-15.83, -49.84], zoom: 7 },
  MA: { center: [-4.97, -45.30], zoom: 6 },
  MG: { center: [-18.51, -44.56], zoom: 6 },
  MS: { center: [-20.51, -54.54], zoom: 6 },
  MT: { center: [-12.64, -55.42], zoom: 6 },
  PA: { center: [-3.79, -52.48], zoom: 6 },
  PB: { center: [-7.12, -36.72], zoom: 8 },
  PE: { center: [-8.38, -37.86], zoom: 7 },
  PI: { center: [-7.72, -42.73], zoom: 7 },
  PR: { center: [-25.25, -52.02], zoom: 7 },
  RJ: { center: [-22.25, -42.95], zoom: 8 },
  RN: { center: [-5.81, -36.59], zoom: 8 },
  RO: { center: [-10.83, -63.34], zoom: 6 },
  RR: { center: [2.06, -61.38], zoom: 6 },
  RS: { center: [-30.03, -53.36], zoom: 6 },
  SC: { center: [-27.33, -50.22], zoom: 7 },
  SE: { center: [-10.57, -37.45], zoom: 8 },
  SP: { center: [-22.25, -48.80], zoom: 7 },
  TO: { center: [-10.18, -48.33], zoom: 7 },
};

const CITY_COORDS: Record<string, [number, number]> = {
  "São Paulo": [-23.5505, -46.6333],
  "Rio de Janeiro": [-22.9068, -43.1729],
  "Salvador": [-12.9714, -38.5014],
  "Fortaleza": [-3.7172, -38.5434],
  "Belo Horizonte": [-19.9167, -43.9345],
  "Manaus": [-3.1190, -60.0217],
  "Curitiba": [-25.4284, -49.2733],
  "Recife": [-8.0576, -34.8829],
  "Goiânia": [-16.6869, -49.2648],
  "Porto Alegre": [-30.0346, -51.2177],
  "Belém": [-1.4558, -48.4902],
  "Guarulhos": [-23.4543, -46.5338],
  "Campinas": [-22.9099, -47.0626],
  "São Luís": [-2.5391, -44.2829],
  "São Gonçalo": [-22.8269, -43.0539],
  "Maceió": [-9.6658, -35.7350],
  "Duque de Caxias": [-22.7856, -43.3117],
  "Natal": [-5.7945, -35.2110],
  "Teresina": [-5.0892, -42.8019],
  "Campo Grande": [-20.4697, -54.6201],
  "Nova Iguaçu": [-22.7594, -43.4514],
  "São Bernardo do Campo": [-23.6939, -46.5650],
  "Osasco": [-23.5322, -46.7919],
  "Santo André": [-23.6639, -46.5383],
  "João Pessoa": [-7.1195, -34.8450],
  "Jaboatão dos Guararapes": [-8.1128, -35.0025],
  "Contagem": [-19.9322, -44.0536],
  "São José dos Campos": [-23.1794, -45.8869],
  "Uberlândia": [-18.9186, -48.2772],
  "Sorocaba": [-23.5015, -47.4526],
  "Ribeirao Preto": [-21.1767, -47.8208],
  "Ribeirão Preto": [-21.1767, -47.8208],
  "Cuiabá": [-15.5989, -56.0949],
  "Aracaju": [-10.9472, -37.0731],
  "Feira de Santana": [-12.2661, -38.9661],
  "Joinville": [-26.3044, -48.8455],
  "Juiz de Fora": [-21.7642, -43.3503],
  "Londrina": [-23.3045, -51.1696],
  "Aparecida de Goiânia": [-16.8239, -49.2447],
  "Ananindeua": [-1.3656, -48.3722],
  "Niterói": [-22.8833, -43.1036],
  "Porto Velho": [-8.7612, -63.9004],
  "São João de Meriti": [-22.8021, -43.3747],
  "Caxias do Sul": [-29.1678, -51.1794],
  "Mogi das Cruzes": [-23.5222, -46.1875],
  "Santos": [-23.9535, -46.3336],
  "Mauá": [-23.6678, -46.4614],
  "Betim": [-19.9678, -44.1983],
  "São José do Rio Preto": [-20.8197, -49.3794],
  "Carapicuíba": [-23.5228, -46.8358],
  "Olinda": [-8.0089, -34.8553],
  "Diadema": [-23.6861, -46.6228],
  "Campina Grande": [-7.2306, -35.8817],
  "Jundiaí": [-23.1864, -46.8964],
  "Belford Roxo": [-22.7636, -43.3997],
  "Maringá": [-23.4273, -51.9375],
  "Macapá": [0.0349, -51.0694],
  "Florianópolis": [-27.5954, -48.5480],
  "Piracicaba": [-22.7338, -47.6476],
  "Bauru": [-22.3154, -49.0608],
  "Vitória": [-20.3155, -40.3128],
  "São Vicente": [-23.9608, -46.3883],
  "Serra": [-20.1283, -40.3078],
  "Camaçari": [-12.6981, -38.3244],
  "Montes Claros": [-16.7361, -43.8614],
  "Cariacica": [-20.2638, -40.4197],
  "Vila Velha": [-20.3297, -40.2919],
  "Anápolis": [-16.3281, -48.9536],
  "Pelotas": [-31.7654, -52.3376],
  "Canoas": [-29.9186, -51.1836],
  "São Leopoldo": [-29.7608, -51.1481],
  "Suzano": [-23.5420, -46.3102],
  "Boa Vista": [2.8235, -60.6758],
  "Itaquaquecetuba": [-23.4867, -46.3480],
  "Barreiras": [-12.1522, -44.9906],
  "Blumenau": [-26.9194, -49.0661],
  "Rio Branco": [-9.9754, -67.8249],
  "Macaé": [-22.3705, -41.7869],
  "Caruaru": [-8.2763, -35.9753],
  "Petrolina": [-9.3982, -40.5019],
  "Juazeiro do Norte": [-7.2130, -39.3150],
  "Sobral": [-3.6864, -40.3500],
  "Vitória da Conquista": [-14.8661, -40.8394],
  "Caucaia": [-3.7358, -38.6533],
  "Maracanaú": [-3.8758, -38.6258],
  "Uberaba": [-19.7486, -47.9386],
  "Ponta Grossa": [-25.0945, -50.1619],
  "Foz do Iguaçu": [-25.5478, -54.5882],
  "Cascavel": [-24.9578, -53.4553],
  "Santa Maria": [-29.6864, -53.8008],
  "São José": [-27.5956, -48.6367],
  "Criciúma": [-28.6778, -49.3697],
  "Chapecó": [-27.1003, -52.6153],
  "Ilhéus": [-14.7889, -39.0489],
  "Paulista": [-7.9406, -34.8711],
  "Santo André do Norte": [-3.6636, -39.9483],
  "Mossoró": [-5.1878, -37.3442],
  "Parnamirim": [-5.9147, -35.2642],
  "Patos": [-7.0178, -37.2806],
  "Imperatriz": [-5.5261, -47.4908],
  "Rio Verde": [-17.7981, -50.9278],
  "Rondonópolis": [-16.4703, -54.6386],
  "Várzea Grande": [-15.6467, -56.1322],
  "Governador Valadares": [-18.8511, -41.9494],
  "Ipatinga": [-19.4686, -42.5378],
  "Divinópolis": [-20.1386, -44.8820],
  "Sete Lagoas": [-19.4658, -44.2458],
  "Teófilo Otoni": [-17.8578, -41.5050],
  "Itabuna": [-14.7855, -39.2786],
  "Barretos": [-20.5578, -48.5678],
  "São Caetano do Sul": [-23.6175, -46.5503],
  "São Mateus": [-18.7149, -39.8569],
  "Linhares": [-19.3950, -40.0650],
  "Guaratinguetá": [-22.8164, -45.1906],
  "Taubaté": [-23.0265, -45.5558],
  "Jacareí": [-23.2981, -45.9658],
  "Limeira": [-22.5640, -47.4008],
  "Franca": [-20.5386, -47.4008],
  "Araraquara": [-21.7938, -48.1758],
  "São Carlos": [-22.0154, -47.8908],
  "Botucatu": [-22.8850, -48.4450],
  "Araçatuba": [-21.2089, -50.4394],
  "Presidente Prudente": [-22.1256, -51.3889],
  "Marília": [-22.2139, -49.9456],
  "Registro": [-24.4872, -47.8444],
  "Itapeva": [-23.9819, -48.8767],
  "Taboão da Serra": [-23.6061, -46.7558],
  "Embu das Artes": [-23.6494, -46.8508],
  "Francisco Morato": [-23.2828, -46.7397],
  "Franco da Rocha": [-23.3289, -46.7267],
  "Cotia": [-23.6028, -46.9197],
  "Itapecerica da Serra": [-23.7181, -46.8519],
  "Santana de Parnaíba": [-23.4425, -46.9183],
  "Pirapora do Bom Jesus": [-23.3975, -47.0022],
  "Potim": [-22.8377, -45.2565],
  "Aparecida": [-22.8481, -45.2328],
  "Cachoeira Paulista": [-22.6764, -45.0081],
  "Lorena": [-22.7328, -45.1239],
  "Pindamonhangaba": [-22.9228, -45.4614],
  "Tremembé": [-22.9597, -45.5497],
  "Caçapava": [-23.0886, -45.7008],
  "Cruzeiro": [-22.5789, -44.9628],
  "Volta Redonda": [-22.5231, -44.1044],
  "Barra Mansa": [-22.5447, -44.1708],
  "Resende": [-22.4686, -44.4508],
  "Itatiaia": [-22.4931, -44.5650],
  "Angra dos Reis": [-22.9661, -44.3181],
  "Paraty": [-23.2181, -44.7158],
  "Três Rios": [-22.1169, -43.2089],
  "Valença": [-22.2447, -43.6997],
  "Vassouras": [-22.4058, -43.6614],
  "Piquete": [-22.6111, -45.1758],
};

type Employee = {
  id: number;
  nome: string;
  funcao: string | null;
  status: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
};

type GeocodedEmployee = Employee & { lat: number; lng: number; isApprox?: boolean };

type Level = 1 | 2 | 3;

const geocacheKey = (addr: string) => `geo2:${addr}`;

// Global rate-limiter: ensures ≥1100ms between real Nominatim API calls
let _lastGeoCall = 0;
async function waitForGeoRate() {
  const gap = Date.now() - _lastGeoCall;
  if (gap < 1100) await sleep(1100 - gap);
  _lastGeoCall = Date.now();
}

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const key = geocacheKey(address);
  const cached = sessionStorage.getItem(key);
  if (cached) {
    const [lat, lng] = JSON.parse(cached);
    return [lat, lng];
  }
  try {
    await waitForGeoRate();
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`;
    const res = await fetch(url, { headers: { "User-Agent": "ERP-GestaoIntegrada/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    sessionStorage.setItem(key, JSON.stringify([lat, lng]));
    return [lat, lng];
  } catch {
    return null;
  }
}

// Structured Nominatim query (more reliable than free-text for Brazilian addresses)
async function geocodeStructured(params: {
  street?: string;
  city?: string;
  state?: string;
  postalcode?: string;
}): Promise<[number, number] | null> {
  const cacheKey = geocacheKey("struct:" + JSON.stringify(params));
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    const [lat, lng] = JSON.parse(cached);
    return [lat, lng];
  }
  try {
    await waitForGeoRate();
    const q = new URLSearchParams({ format: "json", limit: "1", countrycodes: "br" });
    if (params.street) q.set("street", params.street);
    if (params.city) q.set("city", params.city);
    if (params.state) q.set("state", params.state);
    if (params.postalcode) q.set("postalcode", params.postalcode);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
      headers: { "User-Agent": "ERP-GestaoIntegrada/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    sessionStorage.setItem(cacheKey, JSON.stringify([lat, lng]));
    return [lat, lng];
  } catch {
    return null;
  }
}

// Multi-strategy geocoder: tries structured queries first, then free-text fallbacks
// Rate limiting is handled globally by waitForGeoRate() inside each geocode function
async function geocodeEmployeeAddress(e: {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
}): Promise<[number, number] | null> {
  const stateCode = normalizeEstado(e.estado);
  const stateFullName = STATE_NAMES[stateCode] || e.estado || "";
  const city = e.cidade?.trim() || "";

  if (e.logradouro) {
    // Strategy 1: structured — street+number, city, state full name (most precise)
    const streetWithNum = [e.logradouro.trim(), e.numero?.trim()].filter(Boolean).join(" ");
    const r1 = await geocodeStructured({ street: streetWithNum, city: city || undefined, state: stateFullName || undefined });
    if (r1) return r1;

    // Strategy 2: structured — street without number (handles inexact numbering in OSM)
    if (e.numero) {
      const r2 = await geocodeStructured({ street: e.logradouro.trim(), city: city || undefined, state: stateFullName || undefined });
      if (r2) return r2;
    }

    // Strategy 3: free-text without bairro, state full name (bairro often confuses Nominatim)
    const freeText = [e.logradouro.trim(), e.numero?.trim(), city, stateFullName, "Brasil"].filter(Boolean).join(", ");
    const r3 = await geocodeAddress(freeText);
    if (r3) return r3;
  }

  if (e.cep) {
    const cepClean = e.cep.replace(/\D/g, "");
    // Strategy 4: structured — postalcode alone
    const r4 = await geocodeStructured({ postalcode: cepClean });
    if (r4) return r4;

    // Strategy 5: free-text — CEP + state
    const r5 = await geocodeAddress(cepClean + ", " + stateFullName + ", Brasil");
    if (r5) return r5;
  }

  return null;
}

async function geocodeCidade(cidade: string, estado: string): Promise<[number, number] | null> {
  const normalizado = Object.keys(CITY_COORDS).find(
    c => c.toLowerCase().trim() === cidade.toLowerCase().trim()
  );
  if (normalizado) return CITY_COORDS[normalizado];
  const addr = `${cidade}, ${STATE_NAMES[estado] || estado}, Brasil`;
  return geocodeAddress(addr);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function jitter(): number { return (Math.random() - 0.5) * 0.004; }

function MapFlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom, { duration: 1.2 }); }, [center, zoom]);
  return null;
}

function createEmployeeIcon(nome: string, status: string | null, isApprox?: boolean) {
  const s = ALL_STATUS_OPTIONS.find(o => o.value === (status || "Ativo"));
  const bg = s?.bg ?? "#cbd5e1";
  const fg = s?.fg ?? "#334155";
  const letra = nome ? nome.charAt(0).toUpperCase() : "?";
  const opacity = isApprox ? "0.65" : "1";
  const html = `
    <div style="
      width:34px;height:34px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);background:${bg};
      border:2.5px solid ${isApprox ? "#94a3b8" : "white"};
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      opacity:${opacity};
    ">
      <span style="transform:rotate(45deg);color:${fg};font-size:13px;font-weight:700;line-height:1;">
        ${letra}
      </span>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [34, 40], iconAnchor: [17, 40], popupAnchor: [0, -40] });
}

// ── Mapa Geral: city cluster marker — click drills into individual employee pins ─
function LivreCityCluster({ city, coords, emps, onCityClick }: {
  city: string;
  coords: [number, number];
  emps: Employee[];
  onCityClick: (city: string) => void;
}) {
  const radius = Math.max(13, Math.min(42, 13 + emps.length * 1.8));
  return (
    <CircleMarker
      center={coords}
      radius={radius}
      pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.88, weight: 2.5 }}
      eventHandlers={{ click: () => onCityClick(city) }}
    >
      <Tooltip direction="top" offset={[0, -radius]} permanent={false}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{city}</span>
        <span style={{ fontSize: 10, color: "#3b82f6", marginLeft: 4 }}>({emps.length})</span>
      </Tooltip>
    </CircleMarker>
  );
}

function CityClusterMarker({ lat, lng, count, cityName, onClick }: {
  lat: number; lng: number; count: number; cityName: string; onClick: () => void;
}) {
  const radius = Math.max(14, Math.min(36, 14 + count * 1.2));
  return (
    <CircleMarker
      center={[lat, lng]}
      radius={radius}
      pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.85, weight: 2.5 }}
      eventHandlers={{ click: onClick }}
    >
      <Popup>
        <div className="text-center">
          <p className="font-bold text-slate-800">{cityName}</p>
          <p className="text-blue-600 font-semibold text-lg">{count}</p>
          <p className="text-xs text-slate-500">funcionário{count > 1 ? "s" : ""}</p>
          <button
            onClick={onClick}
            className="mt-1 text-xs text-blue-600 underline hover:text-blue-800"
          >
            Ver pins no mapa →
          </button>
        </div>
      </Popup>
    </CircleMarker>
  );
}

interface MapaFuncionariosInterativoProps {
  stateDist: { state: string; count: number }[];
}

export default function MapaFuncionariosInterativo({ stateDist }: MapaFuncionariosInterativoProps) {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;

  const [statusFiltros, setStatusFiltros] = useState<string[]>(DEFAULT_STATUS_VISIVEIS);

  const { data: employees = [], isLoading: loadingEmps } = trpc.dashboards.funcionariosParaMapa.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}), statusFiltros },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0, staleTime: 5 * 60 * 1000 }
  );

  // ── View mode: "geral" = all cities at once, "estado" = drill-down ──
  const [viewMode, setViewMode] = useState<"geral" | "estado">("geral");

  // ── Estado drill-down state ──
  const [level, setLevel] = useState<Level>(1);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  // ── Shared city coords cache ──
  const [cityCoords, setCityCoords] = useState<Map<string, [number, number]>>(new Map());
  const cityCordsRef = useRef<Map<string, [number, number]>>(new Map());
  useEffect(() => { cityCordsRef.current = cityCoords; }, [cityCoords]);
  const geocodingCitiesRef = useRef<Set<string>>(new Set());

  // ── Loading states ──
  const [loadingCities, setLoadingCities] = useState(false);
  const [cityLoadProgress, setCityLoadProgress] = useState({ done: 0, total: 0 });

  const [geocodedEmployees, setGeocodedEmployees] = useState<GeocodedEmployee[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState({ done: 0, total: 0 });
  const geocodingAbort = useRef(false);

  // ── Mapa Geral city drill-down ──
  const [geralSelectedCity, setGeralSelectedCity] = useState<string | null>(null);

  // ── Sem endereço panel ──
  const [semEnderecoOpen, setSemEnderecoOpen] = useState(false);

  // ── Refs for stable callbacks ──
  const handleCityClickRef = useRef<(city: string) => void>(() => {});
  const statusFiltrosKeyRef = useRef<string>("");

  const employeesInState = useMemo(
    () => (selectedState ? employees.filter(e => normalizeEstado(e.estado) === selectedState) : []),
    [employees, selectedState]
  );

  const SEM_CIDADE_KEY = "__sem_cidade__";

  const citiesInState = useMemo<Map<string, Employee[]>>(() => {
    const m = new Map<string, Employee[]>();
    for (const e of employeesInState) {
      const c = (e.cidade || "").trim();
      const key = c || SEM_CIDADE_KEY;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  }, [employeesInState]);

  const employeesInCity = useMemo(
    () => (selectedCity ? (citiesInState.get(selectedCity) || []) : []),
    [citiesInState, selectedCity]
  );

  // ── All city groups for Mapa Geral ──
  const cityGroups = useMemo(() => {
    const m = new Map<string, Employee[]>();
    for (const e of employees) {
      if (!e.cidade) continue;
      const city = e.cidade.trim();
      if (!m.has(city)) m.set(city, []);
      m.get(city)!.push(e);
    }
    return m;
  }, [employees]);

  // ── Sem endereço válido: employees that cannot be located at all ──
  const semEnderecoValido = useMemo(() => {
    return employees.filter(e => !e.cidade && !e.logradouro && !e.cep);
  }, [employees]);

  // ── Load coords for all cities (Mapa Geral) ──
  const loadAllCityCoords = useCallback(async () => {
    const pairs: [string, string][] = [];
    const seen = new Set<string>();
    for (const e of employees) {
      if (!e.cidade) continue;
      const city = e.cidade.trim();
      if (seen.has(city)) continue;
      seen.add(city);
      pairs.push([city, normalizeEstado(e.estado)]);
    }
    const toGeocode = pairs.filter(
      ([city]) => !cityCordsRef.current.has(city) && !geocodingCitiesRef.current.has(city)
    );
    if (toGeocode.length === 0) return;
    toGeocode.forEach(([city]) => geocodingCitiesRef.current.add(city));
    setLoadingCities(true);
    setCityLoadProgress({ done: 0, total: toGeocode.length });
    for (let i = 0; i < toGeocode.length; i++) {
      const [city, state] = toGeocode[i];
      const coords = await geocodeCidade(city, state);
      if (coords) {
        setCityCoords(prev => { const next = new Map(prev); next.set(city, coords); return next; });
      }
      setCityLoadProgress({ done: i + 1, total: toGeocode.length });
      if (i < toGeocode.length - 1) await sleep(800);
    }
    setLoadingCities(false);
  }, [employees]);

  // Trigger all-city geocoding when in "geral" mode
  useEffect(() => {
    if (viewMode === "geral" && employees.length > 0) {
      loadAllCityCoords();
    }
  }, [viewMode, employees.length, loadAllCityCoords]);

  // ── Estado mode: load city coords for a single state ──
  const loadCityCoords = useCallback(async (state: string) => {
    const uniqueCities = [...new Set(
      employees.filter(e => normalizeEstado(e.estado) === state && e.cidade).map(e => e.cidade!.trim())
    )];
    const missingCities = uniqueCities.filter(c => !cityCordsRef.current.has(c) && !geocodingCitiesRef.current.has(c));
    if (missingCities.length === 0) return;

    missingCities.forEach(c => geocodingCitiesRef.current.add(c));
    setLoadingCities(true);
    setCityLoadProgress({ done: 0, total: missingCities.length });
    for (let i = 0; i < missingCities.length; i++) {
      const city = missingCities[i];
      const coords = await geocodeCidade(city, state);
      if (coords) {
        setCityCoords(prev => { const next = new Map(prev); next.set(city, coords); return next; });
      }
      setCityLoadProgress({ done: i + 1, total: missingCities.length });
      if (i < missingCities.length - 1) await sleep(800);
    }
    setLoadingCities(false);
  }, [employees]);

  const handleStateClick = useCallback(async (state: string) => {
    if (state.length !== 2) return;
    const hasEmps = employees.some(e => normalizeEstado(e.estado) === state);
    if (!hasEmps) return;
    setSelectedState(state);
    setLevel(2);
    await loadCityCoords(state);
  }, [employees, loadCityCoords]);

  const handleCityClick = useCallback(async (city: string) => {
    setSelectedCity(city);
    setLevel(3);
    geocodingAbort.current = false;

    const emps = citiesInState.get(city) || [];

    const withAddress = emps.filter(e => e.logradouro || e.cep);
    const withCityOnly = emps.filter(e => !e.logradouro && !e.cep);

    setGeocoding(true);
    setGeocodingProgress({ done: 0, total: withAddress.length + (withCityOnly.length > 0 ? 1 : 0) });
    setGeocodedEmployees([]);

    const results: GeocodedEmployee[] = [];

    const resolveCityCenter = async (cityName: string | null, estado: string): Promise<[number, number] | null> => {
      const normalState = normalizeEstado(estado);
      if (cityName) {
        const normalizado = Object.keys(CITY_COORDS).find(
          c => c.toLowerCase().trim() === cityName.toLowerCase().trim()
        );
        if (normalizado) return CITY_COORDS[normalizado];
        const via = await geocodeCidade(cityName, normalState);
        if (via) return via;
      }
      const sv = STATE_VIEW[normalState];
      return sv ? sv.center : null;
    };

    const cityName = city === SEM_CIDADE_KEY ? null : city;
    const anyEmp = emps[0];
    const estadoRef = anyEmp?.estado ?? "";

    let cityCenter: [number, number] | null = null;
    if (cityName && cityCordsRef.current.has(cityName)) {
      cityCenter = cityCordsRef.current.get(cityName)!;
    } else {
      cityCenter = await resolveCityCenter(cityName, estadoRef);
    }

    for (let i = 0; i < withAddress.length; i++) {
      if (geocodingAbort.current) break;
      const e = withAddress[i];
      const coords = await geocodeEmployeeAddress(e);
      if (coords) {
        results.push({ ...e, lat: coords[0], lng: coords[1], isApprox: false });
      } else if (cityCenter) {
        results.push({ ...e, lat: cityCenter[0] + jitter(), lng: cityCenter[1] + jitter(), isApprox: true });
      }
      setGeocodedEmployees([...results]);
      setGeocodingProgress({ done: i + 1, total: withAddress.length + (withCityOnly.length > 0 ? 1 : 0) });
    }

    if (!geocodingAbort.current && withCityOnly.length > 0) {
      if (cityCenter) {
        for (const e of withCityOnly) {
          if (geocodingAbort.current) break;
          results.push({
            ...e,
            lat: cityCenter[0] + jitter(),
            lng: cityCenter[1] + jitter(),
            isApprox: true,
          });
        }
        setGeocodedEmployees([...results]);
      }
      setGeocodingProgress(prev => ({ ...prev, done: prev.total }));
    }

    setGeocoding(false);
  }, [citiesInState]);

  useEffect(() => { handleCityClickRef.current = handleCityClick; }, [handleCityClick]);

  const statusFiltrosKey = statusFiltros.join(",");
  useEffect(() => {
    if (statusFiltrosKeyRef.current === "") {
      statusFiltrosKeyRef.current = statusFiltrosKey;
      return;
    }
    if (statusFiltrosKeyRef.current === statusFiltrosKey) return;
    statusFiltrosKeyRef.current = statusFiltrosKey;

    if (level === 3 && selectedCity) {
      geocodingAbort.current = true;
      setGeocoding(false);
      setGeocodedEmployees([]);
      const t = setTimeout(() => handleCityClickRef.current(selectedCity), 900);
      return () => clearTimeout(t);
    }
  }, [statusFiltrosKey]);

  const goBack = () => {
    if (level === 3) {
      geocodingAbort.current = true;
      setGeocoding(false);
      setGeocodedEmployees([]);
      setSelectedCity(null);
      setLevel(2);
    } else if (level === 2) {
      setSelectedState(null);
      setLevel(1);
    }
  };

  const SEM_CIDADE_LABEL = "Endereço sem cidade";

  const stateView = selectedState ? STATE_VIEW[selectedState] : null;
  const cityView = useMemo(() => {
    if (!selectedCity) return null;
    if (selectedCity === SEM_CIDADE_KEY) {
      return stateView ? { center: stateView.center, zoom: 9 } : null;
    }
    if (cityCoords.has(selectedCity)) {
      const [lat, lng] = cityCoords.get(selectedCity)!;
      return { center: [lat, lng] as [number, number], zoom: 13 };
    }
    const normalizado = Object.keys(CITY_COORDS).find(
      c => c.toLowerCase().trim() === selectedCity.toLowerCase().trim()
    );
    if (normalizado) {
      const [lat, lng] = CITY_COORDS[normalizado];
      return { center: [lat, lng] as [number, number], zoom: 13 };
    }
    return stateView ? { center: stateView.center, zoom: 10 } : null;
  }, [selectedCity, cityCoords, stateView]);

  const geralCityView = useMemo(() => {
    if (!geralSelectedCity) return null;
    if (cityCoords.has(geralSelectedCity)) {
      const [lat, lng] = cityCoords.get(geralSelectedCity)!;
      return { center: [lat, lng] as [number, number], zoom: 13 };
    }
    const normalizado = Object.keys(CITY_COORDS).find(
      c => c.toLowerCase().trim() === geralSelectedCity.toLowerCase().trim()
    );
    if (normalizado) {
      const [lat, lng] = CITY_COORDS[normalizado];
      return { center: [lat, lng] as [number, number], zoom: 13 };
    }
    return null;
  }, [geralSelectedCity, cityCoords]);

  const geralCityEmps = useMemo(
    () => geralSelectedCity ? (cityGroups.get(geralSelectedCity) || []) : [],
    [cityGroups, geralSelectedCity]
  );

  const handleGeralCityClick = useCallback(async (city: string) => {
    geocodingAbort.current = true;
    await sleep(50);
    geocodingAbort.current = false;
    setGeralSelectedCity(city);
    setGeocoding(true);
    setGeocodedEmployees([]);

    const emps = cityGroups.get(city) || [];
    const withAddress = emps.filter(e => e.logradouro || e.cep);
    const withCityOnly = emps.filter(e => !e.logradouro && !e.cep);
    setGeocodingProgress({ done: 0, total: withAddress.length + (withCityOnly.length > 0 ? 1 : 0) });

    let cityCenter: [number, number] | null = null;
    if (cityCordsRef.current.has(city)) {
      cityCenter = cityCordsRef.current.get(city)!;
    } else {
      const normalizado = Object.keys(CITY_COORDS).find(
        c => c.toLowerCase().trim() === city.toLowerCase().trim()
      );
      if (normalizado) {
        cityCenter = CITY_COORDS[normalizado];
      } else {
        const anyEmp = emps[0];
        if (anyEmp) cityCenter = await geocodeCidade(city, normalizeEstado(anyEmp.estado ?? ""));
      }
    }

    const results: GeocodedEmployee[] = [];

    for (let i = 0; i < withAddress.length; i++) {
      if (geocodingAbort.current) break;
      const e = withAddress[i];
      const coords = await geocodeEmployeeAddress(e);
      if (coords) {
        results.push({ ...e, lat: coords[0], lng: coords[1], isApprox: false });
      } else if (cityCenter) {
        results.push({ ...e, lat: cityCenter[0] + jitter(), lng: cityCenter[1] + jitter(), isApprox: true });
      }
      setGeocodedEmployees([...results]);
      setGeocodingProgress({ done: i + 1, total: withAddress.length + (withCityOnly.length > 0 ? 1 : 0) });
    }

    if (!geocodingAbort.current && withCityOnly.length > 0 && cityCenter) {
      for (const e of withCityOnly) {
        if (geocodingAbort.current) break;
        results.push({ ...e, lat: cityCenter[0] + jitter(), lng: cityCenter[1] + jitter(), isApprox: true });
      }
      setGeocodedEmployees([...results]);
      setGeocodingProgress(prev => ({ ...prev, done: prev.total }));
    }

    setGeocoding(false);
  }, [cityGroups]);

  function toggleStatus(value: string) {
    setStatusFiltros(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  }

  const approxCount = geocodedEmployees.filter(e => e.isApprox).length;
  const exactCount = geocodedEmployees.filter(e => !e.isApprox).length;

  // City list sorted by count (for the bottom nav strip in Mapa Geral)
  const sortedCities = useMemo(() =>
    [...cityGroups.entries()].sort((a, b) => b[1].length - a[1].length),
    [cityGroups]
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            {viewMode === "geral"
              ? geralSelectedCity
                ? <>{geralSelectedCity} <Badge variant="secondary" className="text-xs">{geralCityEmps.length} func.</Badge></>
                : "Mapa Geral — Todos os Funcionários"
              : level === 1
                ? "Distribuição por Estado"
                : level === 2 && selectedState
                  ? <>{STATE_NAMES[selectedState] || selectedState} <Badge variant="secondary" className="text-xs">{employeesInState.length} func.</Badge></>
                  : level === 3 && selectedCity
                    ? <>{selectedCity === SEM_CIDADE_KEY ? SEM_CIDADE_LABEL : selectedCity} <Badge variant="secondary" className="text-xs">{employeesInCity.length} func.</Badge></>
                    : "Mapa"
            }
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {viewMode === "geral" && geralSelectedCity && (
              <Button variant="ghost" size="sm" onClick={() => {
                geocodingAbort.current = true;
                setGeralSelectedCity(null);
                setGeocodedEmployees([]);
                setGeocoding(false);
              }} className="h-7 text-xs gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar ao mapa geral
              </Button>
            )}
            {viewMode === "estado" && level > 1 && (
              <Button variant="ghost" size="sm" onClick={goBack} className="h-7 text-xs gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                {level === 2 ? "Voltar ao Brasil" : `Voltar a ${STATE_NAMES[selectedState!] || selectedState}`}
              </Button>
            )}
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setViewMode("geral")}
                className={`flex items-center gap-1 text-[10px] px-2.5 py-1.5 font-medium transition-colors ${viewMode === "geral" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                title="Ver todos os funcionários no mapa"
              >
                <Globe className="h-3 w-3" />
                Mapa Geral
              </button>
              <button
                onClick={() => setViewMode("estado")}
                className={`flex items-center gap-1 text-[10px] px-2.5 py-1.5 font-medium transition-colors border-l border-slate-200 ${viewMode === "estado" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                title="Navegar por estado e cidade"
              >
                <MapIcon className="h-3 w-3" />
                Por Estado
              </button>
            </div>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-1 mt-2">
          {ALL_STATUS_OPTIONS.map(opt => {
            const active = statusFiltros.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggleStatus(opt.value)}
                className="text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all"
                style={active
                  ? { backgroundColor: opt.bg, color: opt.fg, borderColor: opt.fg + "55" }
                  : { backgroundColor: "transparent", color: "#94a3b8", borderColor: "#e2e8f0" }
                }
                title={active ? `Ocultar ${opt.label}` : `Mostrar ${opt.label}`}
              >
                {opt.label}
              </button>
            );
          })}
          <button
            onClick={() => setStatusFiltros(ALL_STATUS_OPTIONS.map(s => s.value))}
            className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
          >
            Todos
          </button>
        </div>

        {/* Breadcrumb (estado mode only) */}
        {viewMode === "estado" && (
          <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
            <span
              className={level === 1 ? "text-blue-600 font-medium" : "cursor-pointer hover:text-blue-500"}
              onClick={() => { if (level > 1) { setLevel(1); setSelectedState(null); }}}
            >Brasil</span>
            {level >= 2 && selectedState && (
              <>
                <span>›</span>
                <span
                  className={level === 2 ? "text-blue-600 font-medium" : "cursor-pointer hover:text-blue-500"}
                  onClick={() => { if (level > 2) goBack(); }}
                >{STATE_NAMES[selectedState]}</span>
              </>
            )}
            {level === 3 && selectedCity && (
              <>
                <span>›</span>
                <span className="text-blue-600 font-medium">
                  {selectedCity === SEM_CIDADE_KEY ? SEM_CIDADE_LABEL : selectedCity}
                </span>
              </>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-3">

        {/* ── MAPA GERAL: todos os funcionários no mapa ── */}
        {viewMode === "geral" && (
          <div>
            {/* Loading indicator (only in overview) */}
            {!geralSelectedCity && (loadingCities || loadingEmps) && (
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                {loadingCities
                  ? `Localizando cidades... ${cityLoadProgress.done}/${cityLoadProgress.total}`
                  : "Carregando funcionários..."}
              </div>
            )}

            {/* ── Overview: city clusters ── */}
            {!geralSelectedCity && (
              <>
                {/* Summary */}
                <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
                  <span>
                    <strong className="text-slate-700">{employees.length}</strong> funcionário{employees.length !== 1 ? "s" : ""}
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-slate-700">{cityGroups.size}</strong> cidade{cityGroups.size !== 1 ? "s" : ""}
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-slate-700">{cityCoords.size}</strong> cidades no mapa
                  </span>
                  {semEnderecoValido.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-600">
                        <strong>{semEnderecoValido.length}</strong> sem endereço
                      </span>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mb-2">Clique em um círculo para ver os pins individuais de cada funcionário.</p>

                {/* Leaflet map — all cities */}
                <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: 480 }}>
                  <MapContainer
                    center={[-18.5, -48.5]}
                    zoom={6}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {[...cityGroups.entries()].map(([city, emps]) => {
                      const coords = cityCoords.get(city);
                      if (!coords) return null;
                      return (
                        <LivreCityCluster
                          key={city}
                          city={city}
                          coords={coords}
                          emps={emps}
                          onCityClick={handleGeralCityClick}
                        />
                      );
                    })}
                  </MapContainer>
                </div>

                {/* City navigation chips below map */}
                {sortedCities.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1.5">Ver pins individuais por cidade</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sortedCities.map(([city, emps]) => {
                        const coords = cityCoords.get(city);
                        return (
                          <button
                            key={city}
                            disabled={!coords}
                            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors ${coords ? "border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-700" : "border-slate-100 bg-slate-50 text-slate-300 cursor-wait"}`}
                            title={coords ? `Ver ${emps.length} funcionário(s) de ${city}` : "Localizando..."}
                            onClick={() => { if (coords) handleGeralCityClick(city); }}
                          >
                            {!coords && <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-300" />}
                            <span>{city}</span>
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{emps.length}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Geral city drill-down: individual employee pins ── */}
            {geralSelectedCity && (
              <div>
                {geocoding && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      Geocodificando endereços... {geocodingProgress.done}/{geocodingProgress.total}
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                        style={{ width: `${geocodingProgress.total > 0 ? (geocodingProgress.done / geocodingProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {!geocoding && geocodedEmployees.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Nenhum endereço foi geocodificado. Verifique se os funcionários possuem logradouro, CEP ou cidade cadastrada.
                  </div>
                )}

                <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: 440 }}>
                  <MapContainer
                    key={geralSelectedCity}
                    center={geralCityView?.center || [-18.5, -48.5]}
                    zoom={geralCityView?.zoom || 12}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {geralCityView && <MapFlyTo center={geralCityView.center} zoom={geralCityView.zoom} />}
                    {geocodedEmployees.map(emp => (
                      <Marker
                        key={emp.id}
                        position={[emp.lat, emp.lng]}
                        icon={createEmployeeIcon(emp.nome, emp.status, emp.isApprox)}
                      >
                        <Popup>
                          <div className="min-w-[160px]">
                            <p className="font-bold text-slate-800 text-sm">{emp.nome}</p>
                            {emp.funcao && <p className="text-xs text-slate-500 mt-0.5">{emp.funcao}</p>}
                            {emp.status && (
                              <Badge variant="secondary" className="text-[10px] mt-1" style={statusStyle(emp.status)}>
                                {statusLabel(emp.status)}
                              </Badge>
                            )}
                            {emp.isApprox && (
                              <p className="text-[10px] text-amber-600 mt-1 italic">
                                Posição aproximada (centro da cidade)
                              </p>
                            )}
                            <div className="mt-1.5 text-[11px] text-slate-500 space-y-0.5">
                              {emp.logradouro && (
                                <p>{emp.logradouro}{emp.numero ? `, ${emp.numero}` : ""}</p>
                              )}
                              {emp.bairro && <p>{emp.bairro}</p>}
                              {emp.cidade && <p className="font-medium">{emp.cidade} - {emp.estado}</p>}
                              {emp.cep && <p>CEP: {emp.cep}</p>}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>

                {!geocoding && geralCityEmps.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span>{geocodedEmployees.length} de {geralCityEmps.length} funcionário{geralCityEmps.length !== 1 ? "s" : ""} no mapa</span>
                    {geocodedEmployees.filter(e => !e.isApprox).length > 0 && (
                      <span className="text-green-600">({geocodedEmployees.filter(e => !e.isApprox).length} endereço exato)</span>
                    )}
                    {geocodedEmployees.filter(e => e.isApprox).length > 0 && (
                      <span className="text-amber-500">({geocodedEmployees.filter(e => e.isApprox).length} posição aproximada)</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── MODO POR ESTADO: drill-down existente ── */}
        {viewMode === "estado" && (
          <>
            {/* Level 1: Brazil SVG Map */}
            {level === 1 && (
              <BrazilMap
                title=""
                data={stateDist}
                colorScheme="blue"
                onStateClick={handleStateClick}
                hideCard
              />
            )}

            {/* Level 2: State Leaflet Map — cities as clusters */}
            {level === 2 && stateView && (
              <div>
                {(loadingCities || loadingEmps) && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    {loadingCities
                      ? `Localizando cidades... ${cityLoadProgress.done}/${cityLoadProgress.total}`
                      : "Carregando funcionários..."}
                  </div>
                )}
                <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: 420 }}>
                  <MapContainer
                    center={stateView.center}
                    zoom={stateView.zoom}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {[...citiesInState.entries()].map(([city, emps]) => {
                      if (city === SEM_CIDADE_KEY) return null;
                      const coords = cityCoords.get(city);
                      if (!coords) return null;
                      return (
                        <CityClusterMarker
                          key={city}
                          lat={coords[0]}
                          lng={coords[1]}
                          count={emps.length}
                          cityName={city}
                          onClick={() => handleCityClick(city)}
                        />
                      );
                    })}
                  </MapContainer>
                </div>
                {/* City legend */}
                {(() => {
                  const semCidade = citiesInState.get(SEM_CIDADE_KEY);
                  const regularCities = [...citiesInState.entries()]
                    .filter(([c]) => c !== SEM_CIDADE_KEY)
                    .sort((a, b) => b[1].length - a[1].length);
                  return (
                    <>
                      {regularCities.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {regularCities.map(([city, emps]) => (
                            <button
                              key={city}
                              onClick={() => handleCityClick(city)}
                              className="flex items-center justify-between gap-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                            >
                              <span className="truncate font-medium text-slate-700">{city}</span>
                              <Badge variant="secondary" className="text-[10px] shrink-0">{emps.length}</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                      {semCidade && semCidade.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => handleCityClick(SEM_CIDADE_KEY)}
                            className="w-full flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 transition-colors text-left"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="h-3 w-3 text-amber-500 shrink-0" />
                              <span className="font-medium text-amber-800">Endereço sem cidade cadastrada</span>
                              <span className="text-[10px] text-amber-600">— geocodificar por logradouro/CEP</span>
                            </div>
                            <Badge className="text-[10px] shrink-0 bg-amber-200 text-amber-800 hover:bg-amber-200">{semCidade.length}</Badge>
                          </button>
                        </div>
                      )}
                      {regularCities.length === 0 && (!semCidade || semCidade.length === 0) && !loadingEmps && !loadingCities && (
                        <div className="mt-3 text-xs text-slate-400 text-center py-4">
                          Nenhum funcionário com endereço cadastrado neste estado.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Level 3: City Leaflet Map — individual employee pins */}
            {level === 3 && (
              <div>
                {geocoding && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      Geocodificando endereços... {geocodingProgress.done}/{geocodingProgress.total}
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                        style={{ width: `${geocodingProgress.total > 0 ? (geocodingProgress.done / geocodingProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {!geocoding && geocodedEmployees.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Nenhum endereço foi geocodificado. Verifique se os funcionários possuem logradouro, CEP ou cidade cadastrada.
                  </div>
                )}

                <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: 440 }}>
                  <MapContainer
                    key={selectedCity ?? "city"}
                    center={cityView?.center || stateView?.center || [-15.78, -47.93]}
                    zoom={cityView?.zoom || 12}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {cityView && <MapFlyTo center={cityView.center} zoom={cityView.zoom} />}
                    {geocodedEmployees.map(emp => (
                      <Marker
                        key={emp.id}
                        position={[emp.lat, emp.lng]}
                        icon={createEmployeeIcon(emp.nome, emp.status, emp.isApprox)}
                      >
                        <Popup>
                          <div className="min-w-[160px]">
                            <p className="font-bold text-slate-800 text-sm">{emp.nome}</p>
                            {emp.funcao && <p className="text-xs text-slate-500 mt-0.5">{emp.funcao}</p>}
                            {emp.status && (
                              <Badge variant="secondary" className="text-[10px] mt-1" style={statusStyle(emp.status)}>
                                {statusLabel(emp.status)}
                              </Badge>
                            )}
                            {emp.isApprox && (
                              <p className="text-[10px] text-amber-600 mt-1 italic">
                                Posição aproximada (centro da cidade)
                              </p>
                            )}
                            <div className="mt-1.5 text-[11px] text-slate-500 space-y-0.5">
                              {emp.logradouro && (
                                <p>{emp.logradouro}{emp.numero ? `, ${emp.numero}` : ""}</p>
                              )}
                              {emp.bairro && <p>{emp.bairro}</p>}
                              {emp.cidade && <p className="font-medium">{emp.cidade} - {emp.estado}</p>}
                              {emp.cep && <p>CEP: {emp.cep}</p>}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>

                {!geocoding && employeesInCity.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span>{geocodedEmployees.length} de {employeesInCity.length} funcionário{employeesInCity.length !== 1 ? "s" : ""} no mapa</span>
                    {exactCount > 0 && <span className="text-green-600">({exactCount} endereço exato)</span>}
                    {approxCount > 0 && <span className="text-amber-500">({approxCount} posição aproximada)</span>}
                    {employeesInCity.length - geocodedEmployees.length > 0 && (
                      <span className="text-red-400">({employeesInCity.length - geocodedEmployees.length} sem dados de localização)</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── PAINEL: Funcionários sem endereço válido ── */}
        <div className={`mt-4 border rounded-xl overflow-hidden transition-all ${semEnderecoValido.length > 0 ? "border-amber-200" : "border-slate-200"}`}>
          <button
            onClick={() => setSemEnderecoOpen(o => !o)}
            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors ${semEnderecoValido.length > 0 ? "bg-amber-50 hover:bg-amber-100 text-amber-800" : "bg-slate-50 hover:bg-slate-100 text-slate-600"}`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className={`h-4 w-4 ${semEnderecoValido.length > 0 ? "text-amber-500" : "text-slate-400"}`} />
              <span>Funcionários sem endereço válido para o mapa</span>
              <Badge className={`text-[10px] ${semEnderecoValido.length > 0 ? "bg-amber-200 text-amber-800 hover:bg-amber-200" : "bg-slate-200 text-slate-600 hover:bg-slate-200"}`}>
                {semEnderecoValido.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {semEnderecoValido.length > 0 && (
                <span className="text-[10px] text-amber-600 font-normal">Corrija para aparecer no mapa</span>
              )}
              {semEnderecoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>

          {semEnderecoOpen && (
            <div className="p-3">
              {semEnderecoValido.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400">
                  ✓ Todos os funcionários têm pelo menos um dado de localização (cidade, logradouro ou CEP).
                </div>
              ) : (
                <>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    Os funcionários abaixo não possuem <strong>cidade</strong>, <strong>logradouro</strong> nem <strong>CEP</strong> cadastrados — impossível localizá-los no mapa.
                    O RH deve acessar o cadastro de cada funcionário e preencher o endereço.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-500 font-semibold border-b border-slate-200">
                          <th className="text-left px-3 py-2">Nome</th>
                          <th className="text-left px-3 py-2">Função</th>
                          <th className="text-left px-3 py-2">Status</th>
                          <th className="text-left px-3 py-2">Estado</th>
                          <th className="text-left px-3 py-2">O que falta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {semEnderecoValido.map((emp, i) => {
                          const faltando: string[] = [];
                          if (!emp.cidade) faltando.push("Cidade");
                          if (!emp.logradouro) faltando.push("Logradouro");
                          if (!emp.cep) faltando.push("CEP");
                          return (
                            <tr key={emp.id} className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                              <td className="px-3 py-2 font-medium text-slate-700">{emp.nome}</td>
                              <td className="px-3 py-2 text-slate-500">{emp.funcao || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2">
                                {emp.status ? (
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold" style={statusStyle(emp.status)}>
                                    {statusLabel(emp.status)}
                                  </span>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-500">{emp.estado || <span className="text-red-400 font-medium">Sem estado!</span>}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {faltando.map(f => (
                                    <span key={f} className="bg-red-100 text-red-600 text-[9px] px-1.5 py-0.5 rounded-full font-medium">{f}</span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 text-right">
                    {semEnderecoValido.length} funcionário{semEnderecoValido.length !== 1 ? "s" : ""} listado{semEnderecoValido.length !== 1 ? "s" : ""}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
