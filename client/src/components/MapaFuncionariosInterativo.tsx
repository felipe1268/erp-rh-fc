import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowLeft, Loader2, Users, AlertCircle } from "lucide-react";
import BrazilMap from "@/components/BrazilMap";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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
  GO: { center: [-15.93, -49.69], zoom: 7 },
  MA: { center: [-5.00, -45.50], zoom: 6 },
  MG: { center: [-18.51, -44.55], zoom: 6 },
  MS: { center: [-20.51, -54.62], zoom: 6 },
  MT: { center: [-12.64, -55.42], zoom: 6 },
  PA: { center: [-3.42, -52.23], zoom: 5 },
  PB: { center: [-7.24, -36.82], zoom: 8 },
  PE: { center: [-8.38, -37.86], zoom: 7 },
  PI: { center: [-7.72, -42.73], zoom: 7 },
  PR: { center: [-24.89, -51.55], zoom: 7 },
  RJ: { center: [-22.25, -43.00], zoom: 8 },
  RN: { center: [-5.81, -36.59], zoom: 8 },
  RO: { center: [-10.83, -63.34], zoom: 6 },
  RR: { center: [2.03, -61.33], zoom: 6 },
  RS: { center: [-30.18, -53.42], zoom: 6 },
  SC: { center: [-27.45, -50.95], zoom: 7 },
  SE: { center: [-10.57, -37.45], zoom: 8 },
  SP: { center: [-22.25, -48.56], zoom: 7 },
  TO: { center: [-10.18, -48.33], zoom: 6 },
};

const CITY_COORDS: Record<string, [number, number]> = {
  "São Paulo": [-23.5505, -46.6333],
  "Campinas": [-22.9056, -47.0608],
  "Guarulhos": [-23.4543, -46.5333],
  "São Bernardo do Campo": [-23.6939, -46.5650],
  "Santo André": [-23.6639, -46.5383],
  "Osasco": [-23.5329, -46.7917],
  "São José dos Campos": [-23.1794, -45.8864],
  "Sorocaba": [-23.5015, -47.4526],
  "Ribeirão Preto": [-21.1699, -47.8107],
  "Santos": [-23.9608, -46.3336],
  "Mauá": [-23.6678, -46.4608],
  "Diadema": [-23.6861, -46.6228],
  "Jundiaí": [-23.1864, -46.8983],
  "Piracicaba": [-22.7253, -47.6492],
  "Bauru": [-22.3246, -49.0667],
  "São José do Rio Preto": [-20.8167, -49.3833],
  "Mogi das Cruzes": [-23.5228, -46.1869],
  "Carapicuíba": [-23.5242, -46.8358],
  "Itaquaquecetuba": [-23.4869, -46.3497],
  "Suzano": [-23.5428, -46.3106],
  "Sumaré": [-22.8228, -47.2669],
  "Barueri": [-23.5044, -46.8758],
  "Taboão da Serra": [-23.6081, -46.7575],
  "Cajamar": [-23.3583, -46.8781],
  "Santana de Parnaíba": [-23.4436, -46.9178],
  "Rio de Janeiro": [-22.9068, -43.1729],
  "Belo Horizonte": [-19.9167, -43.9345],
  "Curitiba": [-25.4297, -49.2711],
  "Porto Alegre": [-30.0277, -51.2287],
  "Recife": [-8.0578, -34.8829],
  "Fortaleza": [-3.7172, -38.5434],
  "Salvador": [-12.9714, -38.5014],
  "Manaus": [-3.1190, -60.0217],
  "Belém": [-1.4558, -48.5044],
  "Goiânia": [-16.6868, -49.2648],
  "Florianópolis": [-27.5969, -48.5495],
  "Natal": [-5.7945, -35.2111],
  "Maceió": [-9.6658, -35.7350],
  "São Luís": [-2.5297, -44.3028],
  "João Pessoa": [-7.1195, -34.8450],
  "Teresina": [-5.0892, -42.8019],
  "Campo Grande": [-20.4697, -54.6201],
  "Cuiabá": [-15.5989, -56.0949],
  "Macapá": [0.0349, -51.0694],
  "Porto Velho": [-8.7612, -63.9004],
  "Boa Vista": [2.8235, -60.6758],
  "Palmas": [-10.2491, -48.3243],
  "Rio Branco": [-9.9754, -67.8249],
  "Aracaju": [-10.9472, -37.0731],
  "Vitória": [-20.3155, -40.3128],
  "Macaé": [-22.3705, -41.7869],
  "Caruaru": [-8.2763, -35.9753],
  "Petrolina": [-9.3982, -40.5019],
  "Juazeiro do Norte": [-7.2130, -39.3150],
  "Sobral": [-3.6864, -40.3500],
  "Feira de Santana": [-12.2661, -38.9661],
  "Vitória da Conquista": [-14.8661, -40.8394],
  "Caucaia": [-3.7358, -38.6533],
  "Maracanaú": [-3.8758, -38.6258],
  "Uberlândia": [-18.9186, -48.2772],
  "Contagem": [-19.9322, -44.0536],
  "Juiz de Fora": [-21.7642, -43.3503],
  "Montes Claros": [-16.7361, -43.8614],
  "Uberaba": [-19.7486, -47.9386],
  "Betim": [-19.9678, -44.1983],
  "Aparecida de Goiânia": [-16.8239, -49.2447],
  "Anápolis": [-16.3281, -48.9536],
  "Rio Verde": [-17.7981, -50.9278],
  "Londrina": [-23.3045, -51.1696],
  "Maringá": [-23.4273, -51.9375],
  "Ponta Grossa": [-25.0945, -50.1619],
  "Foz do Iguaçu": [-25.5478, -54.5882],
  "Cascavel": [-24.9578, -53.4553],
  "Caxias do Sul": [-29.1678, -51.1794],
  "Pelotas": [-31.7654, -52.3376],
  "Canoas": [-29.9186, -51.1836],
  "Santa Maria": [-29.6864, -53.8008],
  "Joinville": [-26.3044, -48.8455],
  "Blumenau": [-26.9194, -49.0661],
  "São José": [-27.5956, -48.6367],
  "Criciúma": [-28.6778, -49.3697],
  "Chapecó": [-27.1003, -52.6153],
  "Camaçari": [-12.6981, -38.3244],
  "Barreiras": [-12.1522, -44.9906],
  "Ilhéus": [-14.7889, -39.0489],
  "Jaboatão dos Guararapes": [-8.1128, -35.0025],
  "Olinda": [-8.0089, -34.8553],
  "Paulista": [-7.9406, -34.8711],
  "Caruaru": [-8.2763, -35.9753],
  "Santo André do Norte": [-3.6636, -39.9483],
  "Mossoró": [-5.1878, -37.3442],
  "Parnamirim": [-5.9147, -35.2642],
  "Campina Grande": [-7.2306, -35.8817],
  "Patos": [-7.0178, -37.2806],
  "Garanhuns": [-8.8897, -36.4933],
  "Cabo de Santo Agostinho": [-8.2828, -35.0328],
  "Niterói": [-22.8833, -43.1036],
  "Duque de Caxias": [-22.7856, -43.3117],
  "Nova Iguaçu": [-22.7592, -43.4511],
  "Belford Roxo": [-22.7639, -43.3994],
  "São Gonçalo": [-22.8269, -43.0550],
  "Campos dos Goytacazes": [-21.7553, -41.3247],
  "Volta Redonda": [-22.5231, -44.0997],
  "Petrópolis": [-22.5050, -43.1786],
  "Angra dos Reis": [-23.0067, -44.3181],
  "Serra": [-20.1286, -40.3072],
  "Cariacica": [-20.2639, -40.4178],
  "Vila Velha": [-20.3297, -40.2920],
  "São Caetano do Sul": [-23.6175, -46.5503],
  "São Mateus": [-18.7149, -39.8569],
  "Linhares": [-19.3950, -40.0650],
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

type GeocodedEmployee = Employee & { lat: number; lng: number };

type Level = 1 | 2 | 3;

const geocacheKey = (addr: string) => `geo:${addr}`;

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const key = geocacheKey(address);
  const cached = sessionStorage.getItem(key);
  if (cached) {
    const [lat, lng] = JSON.parse(cached);
    return [lat, lng];
  }
  try {
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

async function geocodeCidade(cidade: string, estado: string): Promise<[number, number] | null> {
  const normalizado = Object.keys(CITY_COORDS).find(
    c => c.toLowerCase().trim() === cidade.toLowerCase().trim()
  );
  if (normalizado) return CITY_COORDS[normalizado];
  const addr = `${cidade}, ${STATE_NAMES[estado] || estado}, Brasil`;
  return geocodeAddress(addr);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function MapFlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom, { duration: 1.2 }); }, [center, zoom]);
  return null;
}

function createEmployeeIcon(nome: string, status: string | null) {
  const isAtivo = (status || "").toLowerCase() === "ativo";
  const letra = nome ? nome.charAt(0).toUpperCase() : "?";
  const bg = isAtivo ? "#2563eb" : "#64748b";
  const html = `
    <div style="
      width:34px;height:34px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);background:${bg};
      border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    ">
      <span style="transform:rotate(45deg);color:white;font-size:13px;font-weight:700;line-height:1;">
        ${letra}
      </span>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [34, 40], iconAnchor: [17, 40], popupAnchor: [0, -40] });
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

  const { data: employees = [], isLoading: loadingEmps } = trpc.dashboards.funcionariosParaMapa.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0, staleTime: 5 * 60 * 1000 }
  );

  const [level, setLevel] = useState<Level>(1);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const [cityCoords, setCityCoords] = useState<Map<string, [number, number]>>(new Map());
  const [loadingCities, setLoadingCities] = useState(false);
  const [cityLoadProgress, setCityLoadProgress] = useState({ done: 0, total: 0 });

  const [geocodedEmployees, setGeocodedEmployees] = useState<GeocodedEmployee[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState({ done: 0, total: 0 });
  const geocodingAbort = useRef(false);

  const employeesInState = useMemo(
    () => (selectedState ? employees.filter(e => normalizeEstado(e.estado) === selectedState) : []),
    [employees, selectedState]
  );

  const citiesInState = useMemo<Map<string, Employee[]>>(() => {
    const m = new Map<string, Employee[]>();
    for (const e of employeesInState) {
      const c = (e.cidade || "").trim();
      if (!c) continue;
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(e);
    }
    return m;
  }, [employeesInState]);

  const employeesInCity = useMemo(
    () => (selectedCity ? (citiesInState.get(selectedCity) || []) : []),
    [citiesInState, selectedCity]
  );

  const loadCityCoords = useCallback(async (state: string) => {
    const uniqueCities = [...new Set(
      employees.filter(e => normalizeEstado(e.estado) === state && e.cidade).map(e => e.cidade!.trim())
    )];
    const missingCities = uniqueCities.filter(c => !cityCoords.has(c));
    if (missingCities.length === 0) return;

    setLoadingCities(true);
    setCityLoadProgress({ done: 0, total: missingCities.length });
    const newCoords = new Map(cityCoords);
    for (let i = 0; i < missingCities.length; i++) {
      const city = missingCities[i];
      const coords = await geocodeCidade(city, state);
      if (coords) newCoords.set(city, coords);
      setCityLoadProgress({ done: i + 1, total: missingCities.length });
      if (i < missingCities.length - 1) await sleep(800);
    }
    setCityCoords(newCoords);
    setLoadingCities(false);
  }, [employees, cityCoords]);

  const handleStateClick = useCallback(async (state: string) => {
    if (state.length !== 2) return;
    const count = stateDist.find(s => s.state === state)?.count || 0;
    if (count === 0) return;
    setSelectedState(state);
    setLevel(2);
    await loadCityCoords(state);
  }, [stateDist, loadCityCoords]);

  const handleCityClick = useCallback(async (city: string) => {
    setSelectedCity(city);
    setLevel(3);
    geocodingAbort.current = false;

    const emps = citiesInState.get(city) || [];
    const toGeocode = emps.filter(e => e.logradouro || e.cep);
    setGeocoding(true);
    setGeocodingProgress({ done: 0, total: toGeocode.length });
    setGeocodedEmployees([]);

    const results: GeocodedEmployee[] = [];
    for (let i = 0; i < toGeocode.length; i++) {
      if (geocodingAbort.current) break;
      const e = toGeocode[i];
      let addr = "";
      if (e.logradouro) {
        addr = [e.logradouro, e.numero, e.bairro, e.cidade, e.estado, "Brasil"]
          .filter(Boolean).join(", ");
      } else if (e.cep) {
        addr = `CEP ${e.cep}, ${e.cidade}, ${e.estado}, Brasil`;
      }
      const coords = addr ? await geocodeAddress(addr) : null;
      if (coords) results.push({ ...e, lat: coords[0], lng: coords[1] });
      setGeocodedEmployees([...results]);
      setGeocodingProgress({ done: i + 1, total: toGeocode.length });
      if (i < toGeocode.length - 1) await sleep(1050);
    }
    setGeocoding(false);
  }, [citiesInState]);

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

  const stateView = selectedState ? STATE_VIEW[selectedState] : null;
  const cityView = useMemo(() => {
    if (!selectedCity || !cityCoords.has(selectedCity)) return null;
    const [lat, lng] = cityCoords.get(selectedCity)!;
    return { center: [lat, lng] as [number, number], zoom: 13 };
  }, [selectedCity, cityCoords]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            {level === 1 && "Distribuição de Funcionários por Estado"}
            {level === 2 && selectedState && (
              <>
                {STATE_NAMES[selectedState] || selectedState}
                <Badge variant="secondary" className="text-xs">
                  {employeesInState.length} funcionário{employeesInState.length !== 1 ? "s" : ""}
                </Badge>
              </>
            )}
            {level === 3 && selectedCity && (
              <>
                {selectedCity}
                <Badge variant="secondary" className="text-xs">
                  {employeesInCity.length} funcionário{employeesInCity.length !== 1 ? "s" : ""}
                </Badge>
              </>
            )}
          </CardTitle>
          {level > 1 && (
            <Button variant="ghost" size="sm" onClick={goBack} className="h-7 text-xs gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              {level === 2 ? "Voltar ao Brasil" : `Voltar a ${STATE_NAMES[selectedState!] || selectedState}`}
            </Button>
          )}
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
          <span
            className={level === 1 ? "text-blue-600 font-medium" : "cursor-pointer hover:text-blue-500"}
            onClick={() => level > 1 && setLevel(1) && setSelectedState(null)}
          >
            Brasil
          </span>
          {level >= 2 && selectedState && (
            <>
              <span>›</span>
              <span
                className={level === 2 ? "text-blue-600 font-medium" : "cursor-pointer hover:text-blue-500"}
                onClick={() => level > 2 && goBack()}
              >
                {STATE_NAMES[selectedState]}
              </span>
            </>
          )}
          {level === 3 && selectedCity && (
            <>
              <span>›</span>
              <span className="text-blue-600 font-medium">{selectedCity}</span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-3">
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
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {[...citiesInState.entries()].sort((a, b) => b[1].length - a[1].length).map(([city, emps]) => (
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
          </div>
        )}

        {/* Level 3: City Leaflet Map — individual employee pins */}
        {level === 3 && (
          <div>
            {/* Progress bar */}
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

            {/* No address found yet */}
            {!geocoding && geocodedEmployees.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Nenhum endereço foi geocodificado. Verifique se os funcionários possuem logradouro ou CEP cadastrado.
              </div>
            )}

            <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: 440 }}>
              <MapContainer
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
                    icon={createEmployeeIcon(emp.nome, emp.status)}
                  >
                    <Popup>
                      <div className="min-w-[160px]">
                        <p className="font-bold text-slate-800 text-sm">{emp.nome}</p>
                        {emp.funcao && <p className="text-xs text-slate-500 mt-0.5">{emp.funcao}</p>}
                        {emp.status && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] mt-1"
                            style={{ backgroundColor: emp.status === "Ativo" ? "#dcfce7" : "#f1f5f9", color: emp.status === "Ativo" ? "#166534" : "#475569" }}
                          >
                            {emp.status}
                          </Badge>
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

            {/* Employees not geocoded */}
            {!geocoding && employeesInCity.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                <Users className="h-3.5 w-3.5" />
                {geocodedEmployees.length} de {employeesInCity.length} funcionários localizados no mapa
                {employeesInCity.length - geocodedEmployees.length > 0 && (
                  <span className="text-amber-500">
                    ({employeesInCity.length - geocodedEmployees.length} sem endereço completo)
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
