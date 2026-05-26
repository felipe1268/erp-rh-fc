// Rev. 2373 — Inventário Visual de Baias (areia, pedra, lajota — granel).
// Operador olha a baia física e toca em 1 de 5 botões grandes:
// VAZIA / 1/4 / METADE / 3/4 / CHEIA. Foto opcional. Histórico fica registrado.
// Pensado pra operador de 4ª série: poucos cliques, contraste alto, sem digitação.
//
// Rev. 2414 — Reformatado pra MESMA LINGUAGEM do Inventário Semanal:
// sessão DIÁRIA por obra (1 obra obrigatória, não "todas"), tela vazia
// com botão grande "Iniciar Aferição", barra de progresso pendentes/
// conferidas, lista separada (pendentes em destaque, conferidas abaixo)
// e card final "Aferição do dia concluída". Estado de sessão derivado
// das próprias leituras (sem migration): baia tem leitura hoje = conferida.
//
// Rev. 2415 — AGREGADOS AUTOMÁTICOS: o almoxarife não precisa mais
// cadastrar baia. Qualquer item recebido na obra que seja granel
// (areia, brita, pedra, lajota, cimento, argamassa…) APARECE SOZINHO
// nesta tela. A baia é criada por baixo dos panos no 1º clique de
// nível (`baiaAutoEnsureFromItem`). Cadastro manual fica restrito ao
// modo "Gerenciar" pra casos excepcionais.
//
// Rev. 2417 — Filtro AGORA é SÓ pela categoria "Agregados" (decisão
// user: mais explícito, sem heurística por nome). Substituídos os 5
// botões de % (VAZIA/1-4/METADE/3-4/CHEIA) por:
//   1) Foto da baia (recomendada, mas opcional)
//   2) Input numérico "Volume restante (m³/un)"
//   3) Display do consumo do dia = saldoAnterior + entradaHoje − saldoAtual
// O percentual da Rev. 2373 continua sendo persistido (derivado da
// capacidade) só pro bar visual e compat — a verdade é o volume digitado.
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Package, Plus, Loader2, Camera, History, Building2, Pencil, Trash2,
  TrendingUp, TrendingDown, Minus, ImagePlus, CheckCircle2,
  ClipboardList, Play, HardHat, Settings, PackagePlus, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { compressImageIfNeeded } from "@/lib/imageCompress";

// Rev. 2373 (legado, ainda usado pelo histórico p/ leituras antigas só com %).
function corPorPct(pct: number | null | undefined) {
  if (pct == null) return "bg-slate-300";
  if (pct === 0) return "bg-red-600";
  if (pct <= 25) return "bg-orange-500";
  if (pct <= 50) return "bg-amber-500";
  if (pct <= 75) return "bg-lime-600";
  return "bg-emerald-600";
}

function fmtData(s?: string | null) {
  if (!s) return "—";
  try {
    // Rev. 2434 — força fuso America/Sao_Paulo (antes herdava do navegador
    // e em iPad mostrava UTC: leitura às 21:37 de Brasília aparecia como
    // 00:37 do dia seguinte). Se a string vier sem indicador de TZ
    // (formato "2026-05-26 00:37:00" do Postgres), assume UTC explícito.
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
    const iso = hasTz ? s : s.replace(" ", "T") + "Z";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) +
      " " + d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

// Rev. 2414 — sessão DIÁRIA derivada: comparamos `lidaEm` com o dia atual
// no fuso local pra decidir se a baia já foi aferida hoje.
function hojeYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function isLeituraHoje(lidaEm?: string | null): boolean {
  if (!lidaEm) return false;
  try {
    const d = new Date(lidaEm);
    if (isNaN(d.getTime())) return false;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}` === hojeYmdLocal();
  } catch { return false; }
}

const MATERIAIS_SUGERIDOS = ["Areia média", "Areia fina", "Brita 0", "Brita 1", "Brita 2", "Pedrisco", "Lajota cerâmica", "Tijolo", "Bloco de concreto", "Argamassa", "Cimento (granel)"];

export default function InventarioVisualBaias() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;
  const utils = trpc.useUtils();

  const { data: obrasAtivas = [] } = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  // Rev. 2414 — sessão é POR OBRA (igual ao Inventário Semanal). `null` = ainda
  // não escolhida (placeholder). Rev. 2416 — "all" = visão consolidada de TODAS
  // as obras (read-only-ish: cards leem mas sem flow de sessão diária).
  const [obraContexto, setObraContexto] = useState<number | "all" | null>(null);
  const [iniciadoLocal, setIniciadoLocal] = useState(false);
  const [gerenciarMode, setGerenciarMode] = useState(false);
  const modoTodas = obraContexto === "all";

  // Rev. 2415/2416 — endpoint: traz itens agregados (areia/brita/pedra/…)
  // recebidos na(s) obra(s) MAIS baias órfãs. Itens sem baia ainda vêm com
  // `id: null` — a 1ª leitura cria a baia. `obraId: null` = todas as obras
  // que o usuário tem acesso na empresa.
  const { data: baias = [], isLoading } = trpc.warehouse.baiaAgregadosListar.useQuery(
    { companyId, obraId: modoTodas ? null : (obraContexto as number | null) },
    { enabled: !!companyId && obraContexto != null },
  );

  // Rev. 2443 — Query LEVE consolidada (sempre ligada) só pra saber QUAIS
  // obras têm baias/insumos — o dropdown fica enxuto e mostra só obras ATIVAS
  // com pelo menos 1 item alocado. Quando o user escolhe "all" reusa cache.
  const { data: baiasTodasIdx = [] } = trpc.warehouse.baiaAgregadosListar.useQuery(
    { companyId, obraId: null },
    { enabled: !!companyId, staleTime: 60_000 },
  );
  const baiasPorObra = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of (baiasTodasIdx as any[])) {
      const oid = typeof b.obraId === "number" ? b.obraId : null;
      if (oid == null) continue;
      m.set(oid, (m.get(oid) || 0) + 1);
    }
    return m;
  }, [baiasTodasIdx]);
  // Obras ativas COM item alocado (baia/agregado). Se a obra atualmente
  // selecionada já tem leitura mas nenhum item, mantemos ela visível pra não
  // sumir o contexto do usuário.
  const obrasComItem = useMemo(() => {
    const base = (obrasAtivas as any[]).filter(o => baiasPorObra.has(o.id));
    if (typeof obraContexto === "number" && !base.some(o => o.id === obraContexto)) {
      const atual = (obrasAtivas as any[]).find(o => o.id === obraContexto);
      if (atual) return [...base, atual];
    }
    return base;
  }, [obrasAtivas, baiasPorObra, obraContexto]);
  const temAlguma = obrasComItem.length > 0;

  const [modalNova, setModalNova] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form, setForm] = useState({ obraId: 0, nome: "", material: "", unidade: "m³", capacidade: "", observacoes: "" });
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  const [leituraBaia, setLeituraBaia] = useState<any | null>(null);
  // Rev. 2417 — input numérico (string p/ não brigar com vírgula/zero) substitui os 5 níveis.
  const [leituraVolume, setLeituraVolume] = useState<string>("");
  const [leituraObs, setLeituraObs] = useState("");
  const [leituraFoto, setLeituraFoto] = useState<File | null>(null);
  // Rev. 2431 — Preview da foto selecionada (antes mostrava só o nome do
  // arquivo). createObjectURL + revoke no unmount/troca de foto.
  const leituraFotoUrl = useMemo(() => leituraFoto ? URL.createObjectURL(leituraFoto) : null, [leituraFoto]);
  useEffect(() => () => { if (leituraFotoUrl) URL.revokeObjectURL(leituraFotoUrl); }, [leituraFotoUrl]);

  const [historicoBaia, setHistoricoBaia] = useState<any | null>(null);
  const [excluindo, setExcluindo] = useState<any | null>(null);
  // Rev. 2422 — leitura sendo desfeita (confirmação + estorno do almox).
  const [desfazendoLeitura, setDesfazendoLeitura] = useState<any | null>(null);

  const criarMut = trpc.warehouse.baiaCriar.useMutation({
    onSuccess: () => { toast.success("Baia criada!"); utils.warehouse.baiaAgregadosListar.invalidate(); fecharForm(); },
    onError: (e) => toast.error(e.message),
  });
  const editarMut = trpc.warehouse.baiaEditar.useMutation({
    onSuccess: () => { toast.success("Baia atualizada!"); utils.warehouse.baiaAgregadosListar.invalidate(); fecharForm(); },
    onError: (e) => toast.error(e.message),
  });
  const desativarMut = trpc.warehouse.baiaDesativar.useMutation({
    onSuccess: () => { toast.success("Baia removida."); utils.warehouse.baiaAgregadosListar.invalidate(); setExcluindo(null); },
    onError: (e) => toast.error(e.message),
  });
  const leituraMut = trpc.warehouse.baiaLeituraRegistrar.useMutation({
    onSuccess: () => { toast.success("Leitura registrada!"); utils.warehouse.baiaAgregadosListar.invalidate(); fecharLeitura(); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2422 — desfaz aferição e estorna almox.
  const desfazerMut = trpc.warehouse.baiaLeituraDeletar.useMutation({
    onSuccess: (r: any) => {
      if (r?.estornado && r.estornado > 0) {
        toast.success(`Aferição desfeita. ${Number(r.estornado).toLocaleString("pt-BR")} estornado(s) ao almoxarifado.`);
      } else {
        toast.success("Aferição desfeita.");
      }
      utils.warehouse.baiaAgregadosListar.invalidate();
      utils.warehouse.baiaLeiturasListar.invalidate();
      setDesfazendoLeitura(null);
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2415 — cria/encontra baia ligada ao item agregado no 1º clique.
  const autoEnsureMut = trpc.warehouse.baiaAutoEnsureFromItem.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const { data: historicoLeituras = [] } = trpc.warehouse.baiaLeiturasListar.useQuery(
    { companyId, baiaId: historicoBaia?.id ?? 0 },
    { enabled: !!historicoBaia },
  );

  function abrirNova() {
    setEditando(null);
    const obraInicial = typeof obraContexto === "number" ? obraContexto : 0;
    setForm({ obraId: obraInicial, nome: "", material: "", unidade: "m³", capacidade: "", observacoes: "" });
    setFotoFile(null);
    setModalNova(true);
  }
  function abrirEdicao(b: any) {
    setEditando(b);
    setForm({
      obraId: b.obraId, nome: b.nome, material: b.material, unidade: b.unidade,
      capacidade: b.capacidadeEstimada ?? "", observacoes: b.observacoes ?? "",
    });
    setFotoFile(null);
    setModalNova(true);
  }
  function fecharForm() {
    setModalNova(false); setEditando(null); setFotoFile(null);
    setForm({ obraId: 0, nome: "", material: "", unidade: "m³", capacidade: "", observacoes: "" });
  }
  async function salvarForm() {
    if (!form.obraId) return toast.error("Escolha a obra");
    if (!form.nome.trim()) return toast.error("Informe o nome da baia");
    if (!form.material.trim()) return toast.error("Informe o material");
    setUploadingFoto(true);
    try {
      let fotoB64: string | undefined, fotoMime: string | undefined;
      if (fotoFile) {
        const c = await compressImageIfNeeded(fotoFile);
        fotoB64 = c.base64; fotoMime = c.contentType;
      }
      const base = {
        companyId,
        nome: form.nome.trim(),
        material: form.material.trim(),
        unidade: form.unidade.trim() || "m³",
        capacidadeEstimada: form.capacidade ? parseFloat(form.capacidade) : null,
        observacoes: form.observacoes.trim() || undefined,
        fotoBase64: fotoB64, fotoMime,
      };
      if (editando) {
        await editarMut.mutateAsync({ id: editando.id, ...base });
      } else {
        await criarMut.mutateAsync({ obraId: form.obraId, ...base });
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar foto");
    } finally { setUploadingFoto(false); }
  }

  function abrirLeitura(baia: any) {
    setLeituraBaia(baia);
    // Pré-popula com o último volume registrado (almoxarife normalmente
    // só ajusta um pouco a partir do anterior — economiza digitação).
    const ultVol = baia?.ultimaLeitura?.volumeEstimado;
    setLeituraVolume(ultVol != null ? String(ultVol).replace(".", ",") : "");
    setLeituraObs("");
    setLeituraFoto(null);
  }
  function fecharLeitura() {
    setLeituraBaia(null); setLeituraVolume(""); setLeituraObs(""); setLeituraFoto(null);
  }
  async function confirmarLeitura() {
    if (!leituraBaia) return;
    // Aceita vírgula ou ponto. Rejeita vazio/NaN/negativo.
    const volNum = parseFloat(String(leituraVolume).replace(",", "."));
    if (!isFinite(volNum) || volNum < 0) {
      toast.error("Digite um volume válido (ex: 12,5).");
      return;
    }
    // Rev. 2437 — VALIDAÇÃO: volume estimado <= saldo do almoxarifado.
    // Não tem como ter mais material visualmente na baia do que o ERP
    // registra. Cobre os 2 cenários: (a) baixa que zeraria pra negativo,
    // (b) leitura "subindo" sem entrada formal — caso reportado: digitou
    // "restou 80" num item com saldo 10. Espelha a validação do backend.
    const saldoSistema = Number(leituraBaia?.quantidadeAtual ?? 0);
    if (volNum > saldoSistema + 1e-9) {
      const unid = leituraBaia.unidade || "";
      toast.error(
        `Volume de ${fmtNum(volNum)} ${unid} é maior que o saldo do almoxarifado (${fmtNum(saldoSistema)} ${unid}). ` +
        `Registre primeiro a entrada do material ou ajuste a leitura.`,
        { duration: 6000 },
      );
      return;
    }
    try {
      // Rev. 2415 — se item agregado ainda não tem baia (id=null),
      // cria a baia automaticamente antes de registrar a leitura.
      let baiaId: number | null = leituraBaia.id;
      if (baiaId == null) {
        // Rev. 2416 — usa obraId DA LINHA (suporta visão "Todas as obras",
        // onde o contexto global é "all" mas cada card já carrega sua obra).
        const obraDaBaia: number | null = typeof leituraBaia.obraId === "number" ? leituraBaia.obraId : null;
        if (!leituraBaia.itemId || obraDaBaia == null) {
          toast.error("Item sem vínculo. Use o modo Gerenciar pra cadastrar manualmente.");
          return;
        }
        const r = await autoEnsureMut.mutateAsync({
          companyId, obraId: obraDaBaia, itemId: leituraBaia.itemId,
        });
        baiaId = r.baiaId;
      }
      let fotoB64: string | undefined, fotoMime: string | undefined;
      if (leituraFoto) {
        const c = await compressImageIfNeeded(leituraFoto);
        fotoB64 = c.base64; fotoMime = c.contentType;
      }
      // Rev. 2417 — manda volumeEstimado (o backend deriva o percentual
      // pra coluna NOT NULL caso a baia tenha capacidadeEstimada).
      await leituraMut.mutateAsync({
        companyId, baiaId, volumeEstimado: volNum,
        observacoes: leituraObs.trim() || undefined,
        fotoBase64: fotoB64, fotoMime,
      });
    } catch (e: any) { toast.error(e?.message || "Falha"); }
  }

  // Helpers Rev. 2417 — formata número com vírgula e até 3 casas.
  function fmtNum(n: number | null | undefined, dec = 2): string {
    if (n == null || !isFinite(Number(n))) return "—";
    return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: dec });
  }

  // Rev. 2414 — sessão DIÁRIA derivada das próprias leituras.
  const pendentes = useMemo(
    () => baias.filter((b: any) => !isLeituraHoje(b?.ultimaLeitura?.lidaEm)),
    [baias],
  );
  const conferidas = useMemo(
    () => baias.filter((b: any) => isLeituraHoje(b?.ultimaLeitura?.lidaEm)),
    [baias],
  );
  const total = baias.length;
  const totalConferidas = conferidas.length;
  const progresso = total > 0 ? Math.round((totalConferidas / total) * 100) : 0;
  const sessaoIniciada = totalConferidas > 0 || iniciadoLocal;
  const sessaoConcluida = total > 0 && totalConferidas === total;

  const nomeObra = modoTodas
    ? "Todas as obras"
    : typeof obraContexto === "number"
      ? (obrasAtivas.find((o: any) => o.id === obraContexto)?.nome ?? "Obra")
      : "—";
  const dataHojeBr = new Date().toLocaleDateString("pt-BR");

  const renderCardBaia = (b: any, conferida: boolean) => {
    const ult = b.ultimaLeitura;
    const ant = b.leituraAnterior;
    const pctAtual: number | null = ult ? Number(ult.percentual) : null;
    const pctAnt: number | null = ant ? Number(ant.percentual) : null;
    const delta = pctAtual != null && pctAnt != null ? pctAtual - pctAnt : null;
    const semBaia = b.id == null;
    const entradaHoje = Number(b.entradaHoje ?? 0);
    const qtdAtual = Number(b.quantidadeAtual ?? 0);
    // Rev. 2417 — saldo da baia em volume (digitado pelo almoxarife) +
    // consumo do dia já calculado no backend.
    const volAtual: number | null = ult?.volumeEstimado != null ? Number(ult.volumeEstimado) : null;
    const volAnt: number | null = ant?.volumeEstimado != null ? Number(ant.volumeEstimado) : null;
    const consumoHoje: number | null = b.consumoHoje != null ? Number(b.consumoHoje) : null;
    return (
      <div
        key={b.id ?? `item-${b.itemId}`}
        onClick={() => { if (!semBaia) setHistoricoBaia(b); }}
        className={`bg-white rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-lg transition-shadow h-full flex flex-col ${
          semBaia ? "" : "cursor-pointer"
        } ${
          conferida ? "border-emerald-200" : "border-amber-300 ring-2 ring-amber-100"
        }`}
        title={!semBaia ? "Clique pra ver o histórico completo" : undefined}
      >
        {/* Foto — Rev. 2433: `overflow-hidden` + `absolute inset-0` na img
            pra evitar que fotos com proporção estranha vazem sobre os mini-
            cards no Safari iPad (caso reportado pelo user: foto da areia
            cobrindo nome + Chegou hoje / Restante / Consumo). */}
        <div className="relative h-32 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden flex-shrink-0">
          {b.fotoUrl ? (
            <img
              src={b.fotoUrl}
              alt={b.nome}
              className="absolute inset-0 w-full h-full object-cover block"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <Camera className="w-12 h-12" />
            </div>
          )}
          {gerenciarMode && !semBaia && (
            <div className="absolute top-2 right-2 flex gap-1">
              <button onClick={e => { e.stopPropagation(); abrirEdicao(b); }} className="bg-white/90 hover:bg-white p-1.5 rounded-lg shadow" title="Editar">
                <Pencil className="w-3.5 h-3.5 text-slate-700" />
              </button>
              <button onClick={e => { e.stopPropagation(); setExcluindo(b); }} className="bg-white/90 hover:bg-white p-1.5 rounded-lg shadow" title="Remover">
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
              </button>
            </div>
          )}
          {conferida && (
            <div className="absolute top-2 left-2 bg-emerald-500 text-white text-[11px] font-bold px-2 py-1 rounded-md shadow flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Conferida hoje
            </div>
          )}
          {!conferida && entradaHoje > 0 && (
            <div className="absolute top-2 left-2 bg-sky-500 text-white text-[11px] font-bold px-2 py-1 rounded-md shadow flex items-center gap-1" title="Quantidade recebida hoje na obra">
              <PackagePlus className="w-3 h-3" /> +{entradaHoje.toLocaleString("pt-BR")} {b.unidade} hoje
            </div>
          )}
          {!conferida && semBaia && entradaHoje === 0 && (
            <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow flex items-center gap-1" title="Aparece aqui automaticamente porque foi recebido na obra">
              <Sparkles className="w-3 h-3" /> Auto
            </div>
          )}
          {pctAtual != null && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-3 py-1.5 flex items-center gap-2">
              <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
                <div className={`h-full ${corPorPct(pctAtual)} transition-all`} style={{ width: `${pctAtual}%` }} />
              </div>
              <span className="text-white text-xs font-bold">{pctAtual}%</span>
              {delta != null && delta !== 0 && (
                delta > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-300" /> :
                <TrendingDown className="w-3.5 h-3.5 text-red-300" />
              )}
              {delta === 0 && <Minus className="w-3.5 h-3.5 text-slate-300" />}
            </div>
          )}
        </div>
        {/* Header info */}
        <div className="p-3 border-b border-slate-100 flex-shrink-0">
          <p className="font-bold text-base text-slate-900 truncate">{b.nome}</p>
          <div className="flex items-center justify-between gap-2 mt-1 text-xs">
            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
              <Package className="w-3 h-3" /> {b.material}
            </span>
            <span className="text-slate-500">{b.unidade}{b.capacidadeEstimada ? ` · cap. ${b.capacidadeEstimada}` : ""}</span>
          </div>
          {!semBaia && (
            <div className="text-[11px] text-slate-600 mt-1">
              Saldo no sistema: <span className={`font-semibold ${qtdAtual > 0 ? "text-slate-800" : "text-slate-400"}`}>{qtdAtual.toLocaleString("pt-BR")} {b.unidade}</span>
            </div>
          )}
          {ult && (
            <div className="text-[11px] text-slate-500 mt-1">
              Última: <span className="font-semibold text-slate-700">{ult.lidaPorNome || "—"}</span> · {fmtData(ult.lidaEm)}
            </div>
          )}
        </div>
        {/* Rev. 2417 — Painel de volume: chegou hoje / restante / consumo
            Rev. 2446 — `flex-1 flex flex-col` + `mt-auto` no botão pra travar
            o CTA "Registrar baixa" no rodapé de TODOS os cards, mesmo
            quando alguns têm "Saldo no sistema"/"Última leitura" e outros
            não. Garante altura uniforme com `grid-cols-2` do pai. */}
        <div className="p-3 space-y-2 flex-1 flex flex-col">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-md bg-sky-50 border border-sky-100 px-1 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-sky-700 font-bold">Chegou hoje</div>
              <div className="text-sm font-black text-sky-900 leading-tight">
                {entradaHoje > 0 ? `+${fmtNum(entradaHoje)}` : "—"}
              </div>
              <div className="text-[9px] text-sky-600">{b.unidade}</div>
            </div>
            <div
              className="rounded-md bg-emerald-50 border border-emerald-100 px-1 py-1.5"
              title={
                volAtual != null
                  ? "Última aferição visual da baia"
                  : qtdAtual > 0
                    ? "Saldo do sistema — ainda sem aferição visual. Registre uma baixa pra calibrar."
                    : "Sem aferição visual e sem saldo no sistema"
              }
            >
              <div className="text-[9px] uppercase tracking-wide text-emerald-700 font-bold">Restante</div>
              <div className="text-sm font-black text-emerald-900 leading-tight">
                {/* Rev. 2430 — Fallback p/ saldo do sistema quando a baia ainda
                    não teve aferição visual (caso "Item TESTE -areia" reportado
                    pelo user — card mostrava "—" mesmo sem nunca ter sido
                    aferida, sem contexto). */}
                {volAtual != null ? fmtNum(volAtual) : qtdAtual > 0 ? fmtNum(qtdAtual) : "—"}
              </div>
              <div className="text-[9px] text-emerald-600">
                {b.unidade}
                {volAtual == null && qtdAtual > 0 && <span className="ml-0.5 text-slate-400">(sist.)</span>}
              </div>
            </div>
            <div className="rounded-md bg-amber-50 border border-amber-100 px-1 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-amber-700 font-bold">Consumo dia</div>
              <div className="text-sm font-black text-amber-900 leading-tight">{fmtNum(consumoHoje)}</div>
              <div className="text-[9px] text-amber-600">{b.unidade}</div>
            </div>
          </div>
          {volAnt != null && (
            <div className="text-[10px] text-slate-500 text-center">
              Última leitura: <span className="font-semibold text-slate-700">{fmtNum(volAnt)} {b.unidade}</span>
              {ant?.lidaEm && <> · {fmtData(ant.lidaEm)}</>}
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); abrirLeitura(b); }}
            className={`w-full rounded-lg py-2.5 font-bold text-sm shadow-sm hover:shadow active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 mt-auto ${
              conferida
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                : "bg-amber-500 text-white hover:bg-amber-600"
            }`}
          >
            {conferida ? <><History className="w-4 h-4" /> Refazer leitura</> : <><ClipboardList className="w-4 h-4" /> Registrar baixa</>}
          </button>
          {!semBaia && (
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                onClick={e => { e.stopPropagation(); setHistoricoBaia(b); }}
                className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 py-0.5"
              >
                <History className="w-3 h-3" /> Ver histórico
              </button>
              {/* Rev. 2430 — Atalho direto pra desfazer a última aferição
                  (antes só aparecia DENTRO do modal de histórico, era
                  praticamente invisível pra quem não sabia clicar no card). */}
              {ult && (
                <button
                  onClick={e => { e.stopPropagation(); setDesfazendoLeitura(ult); }}
                  className="text-[11px] text-red-600 hover:text-red-800 hover:underline flex items-center gap-1 py-0.5 font-semibold"
                  title="Apaga a última aferição e estorna a baixa no almoxarifado"
                >
                  <Trash2 className="w-3 h-3" /> Desfazer última
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      {/* Seletor de obra (mesmo pattern do Inventário Semanal) */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <HardHat className="h-4 w-4 text-amber-600 shrink-0" />
          <select
            value={obraContexto == null ? "" : String(obraContexto)}
            onChange={e => {
              const v = e.target.value;
              if (v === "") setObraContexto(null);
              else if (v === "all") setObraContexto("all");
              else setObraContexto(Number(v));
              setIniciadoLocal(false);
              setGerenciarMode(false);
            }}
            className="flex-1 h-9 text-sm font-medium border border-gray-200 rounded-lg px-3 bg-white text-gray-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
          >
            <option value="">— escolher obra —</option>
            {/* Rev. 2443 — visão consolidada só aparece se houver ao menos 1 obra com item. */}
            {temAlguma && (
              <option value="all">📍 Todas as obras com baias ({obrasComItem.length})</option>
            )}
            {obrasComItem.map((obra: any) => {
              const n = baiasPorObra.get(obra.id) ?? 0;
              const label = obra.codigo ? `${obra.codigo} – ${obra.nome}` : obra.nome;
              return (
                <option key={obra.id} value={obra.id}>
                  🏗️ {label}{n > 0 ? ` · ${n} ite${n > 1 ? "ns" : "m"}` : ""}
                </option>
              );
            })}
            {!temAlguma && (
              <option value="" disabled>Nenhuma obra ativa com item alocado</option>
            )}
          </select>
        </div>
      </div>

      <div className="space-y-4 max-w-3xl mx-auto px-2 sm:px-4 pt-4 pb-10">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shrink-0">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Inventário Visual de Baias</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {obraContexto == null
                  ? "Escolha a obra pra começar a aferição diária"
                  : sessaoConcluida
                    ? `${nomeObra} · Aferição de ${dataHojeBr} concluída`
                    : sessaoIniciada
                      ? `${nomeObra} · Aferição em andamento · ${dataHojeBr}`
                      : `${nomeObra} · Nenhuma aferição iniciada hoje`}
              </p>
            </div>
          </div>
          {obraContexto != null && !modoTodas && (
            <button
              onClick={() => setGerenciarMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold active:scale-95 transition shrink-0 ${
                gerenciarMode
                  ? "border-slate-400 bg-slate-100 text-slate-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              title="Gerenciar cadastro de baias"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Gerenciar</span>
            </button>
          )}
        </div>

        {/* Sem obra escolhida */}
        {obraContexto == null && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center space-y-2">
            <Building2 className="w-14 h-14 text-gray-300 mx-auto" />
            <p className="text-base font-semibold text-gray-700">Selecione uma obra acima</p>
            <p className="text-sm text-gray-500">
              A aferição visual é feita <span className="font-semibold">por obra</span>, todo dia.<br />
              Ou escolha <span className="font-semibold">📍 Todas as obras</span> pra visão consolidada dos insumos em campo.
            </p>
          </div>
        )}

        {/* Loading */}
        {obraContexto != null && isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
          </div>
        )}

        {/* MODO TODAS AS OBRAS — visão consolidada, sem flow de sessão */}
        {modoTodas && !isLoading && (
          <>
            {total === 0 ? (
              <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center space-y-2">
                <Package className="w-14 h-14 text-gray-300 mx-auto" />
                <p className="text-base font-semibold text-gray-700">Nenhum agregado recebido em nenhuma obra</p>
                <p className="text-sm text-gray-500">
                  Areia, brita, pedra, lajota, cimento e afins aparecem aqui automaticamente conforme chegam às obras.
                </p>
              </div>
            ) : (
              <>
                {/* Resumo geral — agrupa por obraId pra evitar colisão entre obras homônimas (architect Rev. 2416). */}
                {(() => {
                  const grupos = new Map<number, { obraNome: string; lista: any[] }>();
                  for (const b of baias as any[]) {
                    const oid: number = typeof b.obraId === "number" ? b.obraId : -1;
                    const g = grupos.get(oid) ?? { obraNome: b.obraNome ?? "—", lista: [] };
                    g.lista.push(b);
                    grupos.set(oid, g);
                  }
                  const gruposOrdenados = Array.from(grupos.entries())
                    .sort((a, b) => a[1].obraNome.localeCompare(b[1].obraNome, "pt-BR"));
                  return (
                    <>
                      <div className="bg-white rounded-xl border p-4">
                        <div className="flex justify-between text-sm font-medium mb-2">
                          <span className="text-gray-600">Visão consolidada · {grupos.size} obra(s)</span>
                          <span className="text-gray-900">{conferidas.length}/{total} conferidas hoje</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className="h-3 rounded-full transition-all duration-500"
                            style={{ width: `${progresso}%`, background: progresso === 100 ? "#10b981" : "#f59e0b" }}
                          />
                        </div>
                      </div>
                      {gruposOrdenados.map(([oid, g]) => {
                        const pend = g.lista.filter((b: any) => !isLeituraHoje(b?.ultimaLeitura?.lidaEm));
                        const conf = g.lista.filter((b: any) => isLeituraHoje(b?.ultimaLeitura?.lidaEm));
                        return (
                          <div key={oid} className="space-y-2">
                            <div className="flex items-center gap-2 px-1 pt-2">
                              <HardHat className="w-4 h-4 text-amber-600" />
                              <p className="text-sm font-bold text-slate-800">{g.obraNome}</p>
                              <span className="text-xs text-slate-500">· {conf.length}/{g.lista.length} conferidas</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {pend.map((b: any) => renderCardBaia(b, false))}
                              {conf.map((b: any) => renderCardBaia(b, true))}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* Obra sem agregado recebido (e sem baia manual) — só no modo obra única */}
        {!modoTodas && obraContexto != null && !isLoading && total === 0 && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center space-y-3">
            <Package className="w-14 h-14 text-gray-300 mx-auto" />
            <div>
              <p className="text-lg font-semibold text-gray-700">Nenhum agregado recebido nesta obra</p>
              <p className="text-sm text-gray-500 mt-1">
                Areia, brita, pedra, lajota, cimento e afins <span className="font-semibold">aparecem aqui automaticamente</span> quando recebidos pelo almoxarifado.
              </p>
              <p className="text-xs text-gray-400 mt-2">Se precisar de uma baia manual fora dessa lógica, use <span className="font-semibold">Gerenciar</span>.</p>
            </div>
            {gerenciarMode && (
              <Button onClick={abrirNova} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <Plus className="w-4 h-4" /> Cadastrar baia manual
              </Button>
            )}
          </div>
        )}

        {/* Tem baia(s) mas nenhuma leitura hoje → tela "Iniciar Aferição" */}
        {!modoTodas && obraContexto != null && !isLoading && total > 0 && !sessaoIniciada && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center space-y-4">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto" />
            <div>
              <p className="text-lg font-semibold text-gray-700">Nenhuma aferição de hoje</p>
              <p className="text-sm text-gray-500 mt-1">
                Inicie pra conferir as <span className="font-semibold">{total}</span> {total === 1 ? "baia" : "baias"} da obra
              </p>
            </div>
            <button
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-4 rounded-xl text-lg flex items-center gap-2 mx-auto active:scale-95 transition"
              onClick={() => setIniciadoLocal(true)}
            >
              <Play className="w-5 h-5" />
              Iniciar Aferição
            </button>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              Itens agregados aparecem aqui automaticamente conforme entram na obra.
            </p>
          </div>
        )}

        {/* Sessão em andamento ou concluída */}
        {!modoTodas && obraContexto != null && !isLoading && total > 0 && sessaoIniciada && (
          <>
            {/* Barra de progresso */}
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-gray-600">Progresso da aferição</span>
                <span className="text-gray-900">{totalConferidas}/{total} {total === 1 ? "baia" : "baias"}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="h-4 rounded-full transition-all duration-500"
                  style={{
                    width: `${progresso}%`,
                    background: progresso === 100 ? "#10b981" : "#f59e0b",
                  }}
                />
              </div>
              <div className="flex gap-4 text-xs text-center">
                <div className="flex-1 bg-amber-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-amber-700">{pendentes.length}</p>
                  <p className="text-amber-600">Pendentes</p>
                </div>
                <div className="flex-1 bg-emerald-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-700">{totalConferidas}</p>
                  <p className="text-emerald-600">Conferidas</p>
                </div>
                <div className="flex-1 bg-slate-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-slate-700">{total}</p>
                  <p className="text-slate-600">Total</p>
                </div>
              </div>
            </div>

            {/* Sessão concluída */}
            {sessaoConcluida && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <p className="text-lg font-bold text-emerald-800">Aferição do dia concluída!</p>
                <p className="text-sm text-emerald-600 mt-1">
                  {totalConferidas} {totalConferidas === 1 ? "baia conferida" : "baias conferidas"} em {dataHojeBr}
                </p>
              </div>
            )}

            {/* Botão Nova baia (modo gerenciar) */}
            {gerenciarMode && (
              <div className="flex justify-end">
                <Button onClick={abrirNova} className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  <Plus className="w-4 h-4" /> Nova baia
                </Button>
              </div>
            )}

            {/* Lista — pendentes em destaque */}
            {pendentes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber-700 px-1 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  Aguardando aferição ({pendentes.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pendentes.map((b: any) => renderCardBaia(b, false))}
                </div>
              </div>
            )}

            {/* Lista — conferidas hoje */}
            {conferidas.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-emerald-700 px-1 mt-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Conferidas hoje ({conferidas.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {conferidas.map((b: any) => renderCardBaia(b, true))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Nova/Editar Baia */}
      <Dialog open={modalNova} onOpenChange={v => !v && fecharForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editando ? "Editar baia" : "Nova baia"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editando && (
              <div>
                <Label className="text-xs">Obra *</Label>
                <select
                  value={form.obraId}
                  onChange={e => setForm(p => ({ ...p, obraId: Number(e.target.value) }))}
                  className="mt-1 w-full h-10 px-3 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value={0}>— escolher obra —</option>
                  {obrasAtivas.map((o: any) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs">Nome da baia *</Label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Baia areia média - lado esquerdo" />
            </div>
            <div>
              <Label className="text-xs">Material *</Label>
              <Input value={form.material} onChange={e => setForm(p => ({ ...p, material: e.target.value }))} placeholder="Ex: Areia média" list="materiais-sug" />
              <datalist id="materiais-sug">
                {MATERIAIS_SUGERIDOS.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Unidade</Label>
                <Input value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} placeholder="m³" />
              </div>
              <div>
                <Label className="text-xs">Capacidade (opcional)</Label>
                <Input type="number" step="0.1" value={form.capacidade} onChange={e => setForm(p => ({ ...p, capacidade: e.target.value }))} placeholder="Ex: 8" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Foto da baia (opcional)</Label>
              <label className="mt-1 flex items-center justify-center gap-2 h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => setFotoFile(e.target.files?.[0] ?? null)} />
                {fotoFile ? (
                  <span className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {fotoFile.name}</span>
                ) : (
                  <span className="text-sm text-slate-500 flex items-center gap-1"><ImagePlus className="w-4 h-4" /> Tirar / escolher foto</span>
                )}
              </label>
            </div>
            <div>
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharForm}>Cancelar</Button>
            <Button onClick={salvarForm} disabled={uploadingFoto || criarMut.isPending || editarMut.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {(uploadingFoto || criarMut.isPending || editarMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar leitura — Rev. 2417: volume + foto + obs */}
      <Dialog open={!!leituraBaia} onOpenChange={v => !v && fecharLeitura()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar baixa da baia</DialogTitle></DialogHeader>
          {leituraBaia && (
            <div className="space-y-3">
              <div className="rounded-xl p-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <p className="text-xs uppercase tracking-wide opacity-90">{leituraBaia.nome}</p>
                <p className="text-base font-semibold opacity-95">{leituraBaia.material}</p>
                {leituraBaia.ultimaLeitura?.volumeEstimado != null && (
                  <p className="text-xs mt-2 opacity-90">
                    Última leitura: <span className="font-bold">{fmtNum(Number(leituraBaia.ultimaLeitura.volumeEstimado))} {leituraBaia.unidade}</span>
                  </p>
                )}
                {Number(leituraBaia.entradaHoje ?? 0) > 0 && (
                  <p className="text-xs opacity-90">
                    Chegou hoje: <span className="font-bold">+{fmtNum(Number(leituraBaia.entradaHoje))} {leituraBaia.unidade}</span>
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs font-bold">Quanto restou na baia agora? ({leituraBaia.unidade})</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={leituraVolume}
                  onChange={e => setLeituraVolume(e.target.value)}
                  placeholder={`Ex: 12,5 ${leituraBaia.unidade}`}
                  className="mt-1 text-lg font-bold h-12 text-center"
                />
                <p className="text-[11px] text-slate-500 mt-1">Estime visualmente o volume que ainda está na baia.</p>
                {/* Rev. 2437 — Painel ao vivo: mostra volume estimado x saldo
                    + baixa proposta. Bloqueio vermelho quando volume > saldo
                    (cobre tanto subir sem entrada quanto baixar pra negativo). */}
                {(() => {
                  const volN = parseFloat(String(leituraVolume).replace(",", "."));
                  if (!isFinite(volN) || volN < 0) return null;
                  const volAnt = leituraBaia.ultimaLeitura?.volumeEstimado != null
                    ? Number(leituraBaia.ultimaLeitura.volumeEstimado) : null;
                  const saldo = Number(leituraBaia.quantidadeAtual ?? 0);
                  const baixa = volAnt != null ? Math.max(0, volAnt - volN) : 0;
                  const unid = leituraBaia.unidade || "";
                  const excede = volN > saldo + 1e-9;
                  // Não mostra nada se o volume é razoável E não há baixa significativa
                  if (!excede && baixa === 0) return null;
                  return (
                    <div className={`mt-2 rounded-lg border-2 px-3 py-2 text-xs ${
                      excede ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold">Volume informado</span>
                        <span className="font-black">{fmtNum(volN)} {unid}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5 opacity-90">
                        <span>Saldo no sistema</span>
                        <span className="font-semibold">{fmtNum(saldo)} {unid}</span>
                      </div>
                      {baixa > 0 && (
                        <div className="flex items-center justify-between mt-0.5 font-semibold">
                          <span>Baixa proposta</span>
                          <span>−{fmtNum(baixa)} {unid}</span>
                        </div>
                      )}
                      {excede && (
                        <div className="mt-1.5 pt-1.5 border-t border-red-200 font-bold">
                          ⚠️ Impossível: a baia não pode ter mais material do que o sistema registra. Registre a entrada do material antes.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label className="text-xs">Foto da baia (opcional, mas recomendado)</Label>
                {/* Rev. 2431 — Preview visual da foto selecionada (antes só
                    mostrava o nome do arquivo, sem confirmação visual). */}
                {leituraFotoUrl ? (
                  <div className="mt-1 relative rounded-lg overflow-hidden border-2 border-emerald-300 bg-slate-50">
                    <img src={leituraFotoUrl} alt="Pré-visualização da baia" className="w-full h-44 object-cover" />
                    <div className="absolute top-2 right-2 flex gap-1.5">
                      <label className="bg-white/95 hover:bg-white text-slate-700 text-[11px] font-semibold px-2.5 py-1 rounded-md shadow cursor-pointer inline-flex items-center gap-1">
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={e => setLeituraFoto(e.target.files?.[0] ?? null)} />
                        <Camera className="w-3 h-3" /> Trocar
                      </label>
                      <button
                        type="button"
                        onClick={() => setLeituraFoto(null)}
                        className="bg-white/95 hover:bg-white text-red-600 text-[11px] font-semibold px-2.5 py-1 rounded-md shadow inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Remover
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2 bg-emerald-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Foto pronta · {(leituraFoto!.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                ) : (
                  <label className="mt-1 flex items-center justify-center gap-2 h-20 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => setLeituraFoto(e.target.files?.[0] ?? null)} />
                    <span className="text-sm text-slate-500 flex items-center gap-1"><Camera className="w-4 h-4" /> Tirar foto agora</span>
                  </label>
                )}
              </div>
              <div>
                <Label className="text-xs">Observação (opcional)</Label>
                <Textarea rows={2} value={leituraObs} onChange={e => setLeituraObs(e.target.value)} placeholder="Ex: pedreiro pediu pra repor amanhã" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={fecharLeitura}>Cancelar</Button>
            <Button onClick={confirmarLeitura} disabled={leituraMut.isPending || autoEnsureMut.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {(leituraMut.isPending || autoEnsureMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Histórico */}
      <Dialog open={!!historicoBaia} onOpenChange={v => !v && setHistoricoBaia(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" /> Histórico — {historicoBaia?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {historicoLeituras.length === 0 ? (
              <p className="text-sm text-slate-500 italic text-center py-6">Nenhuma leitura ainda.</p>
            ) : historicoLeituras.map((l: any, idx: number) => {
              const vol = l.volumeEstimado != null ? Number(l.volumeEstimado) : null;
              // Rev. 2422 — só a leitura MAIS RECENTE (idx=0) pode ser desfeita.
              const podeDesfazer = idx === 0;
              return (
                <div key={l.id} className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg">
                  <div className={`${corPorPct(Number(l.percentual))} text-white font-bold rounded-lg w-16 h-16 flex flex-col items-center justify-center flex-shrink-0`}>
                    {vol != null ? (
                      <>
                        <span className="text-base leading-none">{fmtNum(vol)}</span>
                        <span className="text-[9px] opacity-90 mt-0.5">{historicoBaia?.unidade ?? ""}</span>
                      </>
                    ) : (
                      <span className="text-lg leading-none">{l.percentual}%</span>
                    )}
                  </div>
                  {l.fotoUrl && (
                    <img src={l.fotoUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{l.lidaPorNome || "—"}</p>
                    <p className="text-xs text-slate-500">{fmtData(l.lidaEm)}</p>
                    {l.observacoes && <p className="text-xs text-slate-700 mt-1 italic">{l.observacoes}</p>}
                    {podeDesfazer && (
                      <button
                        onClick={() => setDesfazendoLeitura(l)}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-800 hover:underline"
                        title="Apaga esta aferição e estorna a baixa do almoxarifado"
                      >
                        <Trash2 className="w-3 h-3" /> Desfazer aferição
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rev. 2422 — Confirm desfazer aferição */}
      <Dialog open={!!desfazendoLeitura} onOpenChange={v => !v && setDesfazendoLeitura(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Desfazer aferição?</DialogTitle></DialogHeader>
          <div className="text-sm text-slate-600 space-y-2">
            <p>A última leitura da baia <span className="font-semibold">{historicoBaia?.nome}</span> será apagada.</p>
            {desfazendoLeitura?.movimentacaoId != null ? (
              <p className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
                ✓ A baixa correspondente será <span className="font-semibold">estornada no almoxarifado</span> (entrada automática de estorno).
              </p>
            ) : (
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                ⚠ Esta leitura não gerou baixa vinculada (anterior à Rev. 2422) — será só apagada, sem mexer no saldo do almox.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesfazendoLeitura(null)}>Cancelar</Button>
            <Button
              onClick={() => desfazendoLeitura && desfazerMut.mutate({ companyId, leituraId: desfazendoLeitura.id })}
              disabled={desfazerMut.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {desfazerMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Desfazer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm exclusão */}
      <Dialog open={!!excluindo} onOpenChange={v => !v && setExcluindo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remover baia?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">A baia <span className="font-semibold">{excluindo?.nome}</span> será desativada. O histórico de leituras fica preservado.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button onClick={() => excluindo && desativarMut.mutate({ id: excluindo.id, companyId })} disabled={desativarMut.isPending} className="bg-red-600 hover:bg-red-700">
              {desativarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
