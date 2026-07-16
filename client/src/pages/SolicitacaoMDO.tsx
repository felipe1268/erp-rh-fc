import React, { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";
import { renderTemplate } from "@shared/documentTemplates";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Users, Plus, Search, ChevronRight, ArrowLeft,
  Clock, AlertTriangle, CheckCircle, XCircle, Send, Eye,
  HardHat, Building2, Calendar, TrendingUp, DollarSign,
  ArrowRight, RefreshCw, ClipboardList, Award, Briefcase,
  Shield, Package, UserCheck, Trash2, X, Upload, FileText, Phone, User, Pencil, MoreVertical, SquarePen,
  Scale, ThumbsUp, ThumbsDown, BarChart3, Wallet, Printer, RotateCcw, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  rascunho: { label: "Rascunho", color: "text-gray-600", bg: "bg-gray-100", icon: ClipboardList },
  enviada: { label: "Enviada", color: "text-blue-700", bg: "bg-blue-100", icon: Send },
  // Status legado mantido apenas para exibir registros antigos — não é mais gerado pelo fluxo atual.
  aprovada_coord: { label: "Aprovada Coord. (legado)", color: "text-indigo-700", bg: "bg-indigo-100", icon: CheckCircle },
  aprovada_rh: { label: "Aprovada RH", color: "text-purple-700", bg: "bg-purple-100", icon: CheckCircle },
  aprovada_diretoria: { label: "Aprovada Diretoria", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle },
  em_recrutamento: { label: "Em Recrutamento", color: "text-amber-700", bg: "bg-amber-100", icon: Users },
  concluida: { label: "Concluída", color: "text-green-700", bg: "bg-green-100", icon: UserCheck },
  rejeitada: { label: "Rejeitada", color: "text-red-700", bg: "bg-red-100", icon: XCircle },
  cancelada: { label: "Cancelada", color: "text-gray-500", bg: "bg-gray-50", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || { label: status, color: "text-gray-600", bg: "bg-gray-100", icon: Clock };
  const Icon = c.icon;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.color}`}><Icon className="h-3 w-3" />{c.label}</span>;
}

function PrioridadeBadge({ prioridade }: { prioridade: string }) {
  const map: Record<string, string> = { urgente: "🔴 Urgente", normal: "🔵 Normal", planejada: "🟢 Planejada" };
  return <span className="text-[10px] font-medium">{map[prioridade] || prioridade}</span>;
}

function fmtMoney(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type ViewMode = "list" | "form" | "detail";
type FormItem = { id: string; funcao: string; quantidade: number; duracaoMeses: number; regimeContratacao: "experiencia" | "indeterminado" };

function removeAccentsMDO(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function ChecklistOnboarding({ checklist, companyId, companyIds, userName, checklistMut }: {
  checklist: any[];
  companyId: number;
  companyIds?: number[];
  userName: string;
  checklistMut: any;
}) {
  const [localState, setLocalState] = React.useState<Record<number, boolean>>({});
  const [cartaEmpId, setCartaEmpId] = React.useState<number | null>(null);
  const [cartaBusca, setCartaBusca] = React.useState("");
  const [cartaOpen, setCartaOpen] = React.useState(false);

  const empList = trpc.employees.list.useQuery(
    { companyId, companyIds, status: "Ativo" },
    { enabled: cartaOpen }
  );

  const cartaQ = trpc.smo.gerarCartaBanco.useQuery(
    { companyId, companyIds, employeeId: cartaEmpId! },
    { enabled: !!cartaEmpId }
  );

  // Rev. 2747 — Carta MDO consome o template Vigente (carta_mdo) quando existir.
  const cartaTplQ = trpc.systemDocumentTemplates.getVigente.useQuery({ tipo: "carta_mdo" });

  const empsFiltrados = React.useMemo(() => {
    const list = empList.data || [];
    if (!cartaBusca.trim()) return list.slice(0, 20);
    const q = removeAccentsMDO(cartaBusca.trim().toLowerCase());
    return list.filter((e: any) =>
      removeAccentsMDO(String(e.nomeCompleto || "").toLowerCase()).includes(q)
      || String(e.matricula || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [empList.data, cartaBusca]);

  React.useEffect(() => {
    const m: Record<number, boolean> = {};
    for (const c of checklist) m[c.id] = !!c.concluido;
    setLocalState(m);
  }, [checklist]);

  const toggle = (id: number, checked: boolean) => {
    setLocalState(prev => ({ ...prev, [id]: checked }));
    checklistMut.mutate({ id, companyId, companyIds, concluido: checked, concluidoPor: userName });
  };

  function escHtml(s: string) {
    const el = document.createElement("span");
    el.textContent = s;
    return el.innerHTML;
  }

  function imprimirCarta() {
    const d = cartaQ.data;
    if (!d) return;
    const headerNome = (d as any).nomeFantasia || d.nomeEmpresa;
    const enderecoLinha = [(d as any).endereco, (d as any).cidade, (d as any).estado].filter(Boolean).join(" - ");
    const e = {
      nomeEmpresa: escHtml(d.nomeEmpresa),
      headerNome: escHtml(headerNome),
      cnpj: escHtml(d.cnpj),
      enderecoEmpresa: escHtml(d.enderecoEmpresa || "___________________________"),
      enderecoLinha: escHtml(enderecoLinha),
      logoUrl: escHtml((d as any).logoUrl || ""),
      telefoneEmpresa: d.telefoneEmpresa ? escHtml(d.telefoneEmpresa) : "",
      emailEmpresa: d.emailEmpresa ? escHtml(d.emailEmpresa) : "",
      nomeColaborador: escHtml(d.nomeColaborador),
      cpf: escHtml(d.cpf),
      rg: escHtml(d.rg || "_______________"),
      cargo: escHtml(d.cargo),
      dataAdmissao: escHtml(d.dataAdmissao),
      responsavelNome: escHtml(d.responsavelNome),
      cidadeData: escHtml(d.cidadeData),
    };

    // Rev. 2747 — quando existe um template Vigente (carta_mdo), o documento é
    // montado a partir dele (renderTemplate → buildFcDocument). Sem Vigente, cai
    // no HTML hard-coded abaixo (fallback EXATO). Valores de `dados` já vêm
    // escapados via escHtml (e.*) porque o corpoHtml é injetado RAW.
    const cartaVigenteHtml = cartaTplQ.data?.vigente ? cartaTplQ.data.conteudoHtml : null;
    if (cartaVigenteHtml) {
      const dados: Record<string, string> = {
        empNome: e.nomeColaborador, empCpf: e.cpf, empRg: e.rg, empFuncao: e.cargo,
        empAdmissao: e.dataAdmissao, empMatricula: "", empSalario: "",
        empresaRazaoSocial: e.nomeEmpresa, empresaCnpj: e.cnpj, empresaEndereco: e.enderecoEmpresa,
        docNumero: "—", docData: e.cidadeData, docLocal: e.cidadeData,
        obraNome: "", obraEndereco: "", clienteNome: "",
      };
      const htmlVig = buildFcDocument({
        empresa: {
          razaoSocial: d.nomeEmpresa, nomeFantasia: headerNome, cnpj: d.cnpj,
          endereco: (d as any).endereco, cidade: (d as any).cidade, estado: (d as any).estado,
          logoUrl: (d as any).logoUrl || "",
        },
        titulo: "CARTA DE ENCAMINHAMENTO",
        numero: "—",
        dataEmissao: e.cidadeData,
        assunto: { label: "ASSUNTO:", valor: "Abertura de Conta Salário" },
        corpoHtml: renderTemplate(cartaVigenteHtml, dados),
        assinaturas: {
          partes: [
            { nome: d.responsavelNome, subtitulo: "Responsável pelo encaminhamento" },
            { nome: d.nomeEmpresa, subtitulo: d.cnpj ? `CNPJ: ${d.cnpj}` : undefined },
          ],
          localData: `Local e data: ${d.cidadeData}`,
        },
        geradoPor: userName || d.responsavelNome,
        pageTitle: `Carta de Encaminhamento — ${d.nomeColaborador}`,
      });
      const wv = window.open("", "_blank");
      if (!wv) { toast.error("Bloqueador de popup ativo."); return; }
      wv.document.write(htmlVig);
      wv.document.write(`<script>setTimeout(function(){window.print()},500)<\/script>`);
      wv.document.close();
      return;
    }

    const w = window.open("", "_blank");
    if (!w) { toast.error("Bloqueador de popup ativo."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Carta de Encaminhamento — ${e.nomeColaborador}</title>
      <style>
        body{font-family:'Helvetica Neue',Arial,sans-serif;padding:32px 48px;color:#111;line-height:1.7;font-size:13px;background:#fff}
        .doc{max-width:780px;margin:0 auto}
        .header{margin-bottom:24px}
        .header-top{display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:16px}
        .header-top img{height:64px;margin-bottom:8px;object-fit:contain}
        .header-top .nome{font-size:18px;font-weight:bold;color:#1B2A4A;letter-spacing:0.5px;text-align:center;margin:0}
        .header-top .cnpj{font-size:10px;color:#6b7280;margin:2px 0 0}
        .header-top .end{font-size:10px;color:#9ca3af;margin:1px 0 0}
        .title-bar{background:#1B2A4A;color:#fff;padding:10px 16px;text-align:center;border-radius:2px}
        .title-bar span{font-size:14px;font-weight:bold;letter-spacing:2px}
        .meta{display:flex;justify-content:space-between;margin-top:12px;font-size:11px;color:#4b5563;padding:0 4px}
        .meta .num{color:#1B2A4A;font-weight:600}
        .body{margin-top:24px}
        .field{margin-bottom:6px}
        .label{font-weight:bold}
        .separator{border-top:1px solid #ccc;margin:24px 0}
        .signature{margin-top:48px;text-align:center}
        .signature-line{border-top:1px solid #333;width:300px;margin:0 auto 5px}
        @media print {body{padding:24px 36px}}
      </style></head><body>
      <div class="doc">
        <div class="header">
          <div class="header-top">
            ${e.logoUrl ? `<img src="${e.logoUrl}" alt="${e.headerNome}" onerror="this.style.display='none'" />` : ""}
            <h2 class="nome">${e.headerNome}</h2>
            ${e.cnpj ? `<p class="cnpj">CNPJ: ${e.cnpj}</p>` : ""}
            ${e.enderecoLinha ? `<p class="end">${e.enderecoLinha}</p>` : ""}
          </div>
          <div class="title-bar"><span>CARTA DE ENCAMINHAMENTO</span></div>
          <div class="meta">
            <div><span class="num">Abertura de Conta Salário</span></div>
            <div>Data de Emissão: ${e.cidadeData}</div>
          </div>
        </div>

        <div class="body">
          <p>À Instituição Financeira: _______________________________</p>
          <p>Prezados,</p>
          <p>A empresa <strong>${e.nomeEmpresa}</strong>, inscrita no CNPJ sob o nº <strong>${e.cnpj}</strong>, com sede à <strong>${e.enderecoEmpresa}</strong>, vem por meio desta encaminhar o(a) colaborador(a) abaixo identificado(a) para fins de abertura de conta salário, conforme previsto na legislação vigente.</p>
          <div class="separator"></div>
          <p><strong>Dados do(a) Colaborador(a):</strong></p>
          <div class="field"><span class="label">Nome completo:</span> ${e.nomeColaborador}</div>
          <div class="field"><span class="label">CPF:</span> ${e.cpf}</div>
          <div class="field"><span class="label">RG:</span> ${e.rg}</div>
          <div class="field"><span class="label">Cargo:</span> ${e.cargo}</div>
          <div class="field"><span class="label">Data de admissão:</span> ${e.dataAdmissao}</div>
          <div class="separator"></div>
          <p>Informamos que o(a) referido(a) colaborador(a) mantém vínculo empregatício ativo com esta empresa, sendo necessária a abertura da conta salário para recebimento de sua remuneração mensal.</p>
          <p>Solicitamos, portanto, a gentileza de proceder com a abertura da conta salário, nos termos aplicáveis.</p>
          <p>Sem mais para o momento, colocamo-nos à disposição para quaisquer esclarecimentos adicionais.</p>
          <p style="margin-top:10px">Atenciosamente,</p>
          <div class="signature">
            <div class="signature-line"></div>
            <div><strong>${e.responsavelNome}</strong></div>
            <div style="font-size:11px;color:#555">Responsável pelo encaminhamento</div>
            <div style="margin-top:6px"><strong>${e.nomeEmpresa}</strong></div>
            ${e.telefoneEmpresa ? `<div style="font-size:11px;color:#555">Telefone: ${e.telefoneEmpresa}</div>` : ""}
            ${e.emailEmpresa ? `<div style="font-size:11px;color:#555">E-mail: ${e.emailEmpresa}</div>` : ""}
          </div>
          <p style="margin-top:40px">Local e data: ${e.cidadeData}</p>
        </div>
      </div>
      <script>setTimeout(()=>window.print(),500)<\/script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div className="bg-white rounded-xl border p-5">
      <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><Package className="h-4 w-4" /> Checklist de Onboarding</h4>
      <div className="space-y-2">
        {checklist.map((c: any) => {
          const checked = localState[c.id] ?? !!c.concluido;
          const isContaSalario = c.item === "Abertura de Conta Salário";
          return (
            <div key={c.id}>
              <div className={`flex items-center gap-3 p-2 rounded-lg transition-all cursor-pointer ${checked ? "bg-green-50" : "hover:bg-slate-50"}`} onClick={() => toggle(c.id, !checked)}>
                <Checkbox checked={checked} onCheckedChange={(v) => toggle(c.id, !!v)} />
                <span className={`text-sm flex-1 ${checked ? "line-through text-muted-foreground" : ""}`}>{c.item}</span>
                {checked && <span className="text-[10px] text-green-600">{c.concluidoPor || userName}</span>}
                {isContaSalario && (
                  <Button variant="outline" size="sm" className="text-blue-700 border-blue-300 hover:bg-blue-50 text-xs h-7 px-2"
                    onClick={(e) => { e.stopPropagation(); setCartaOpen(!cartaOpen); }}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Gerar Carta
                  </Button>
                )}
              </div>
              {isContaSalario && cartaOpen && (
                <div className="ml-8 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar funcionário por nome ou matrícula..."
                      className="h-8 text-sm flex-1 bg-white"
                      value={cartaBusca}
                      onChange={(e) => setCartaBusca(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {empList.isLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
                  {empsFiltrados.length > 0 && (
                    <div className="max-h-40 overflow-y-auto border rounded bg-white">
                      {empsFiltrados.map((emp: any) => (
                        <div
                          key={emp.id}
                          className={`flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 ${cartaEmpId === emp.id ? "bg-blue-100 font-semibold" : ""}`}
                          onClick={(e) => { e.stopPropagation(); setCartaEmpId(emp.id); }}
                        >
                          <span>{emp.nomeCompleto}</span>
                          <span className="text-xs text-muted-foreground">{emp.cargo || emp.funcao || ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {cartaEmpId && cartaQ.data && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-green-700 flex-1">Carta pronta para: <strong>{cartaQ.data.nomeColaborador}</strong></span>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); imprimirCarta(); }}>
                        <Printer className="h-3.5 w-3.5" /> Imprimir
                      </Button>
                    </div>
                  )}
                  {cartaEmpId && cartaQ.isLoading && <p className="text-xs text-muted-foreground">Gerando carta...</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SolicitacaoMDO() {
  const { user } = useAuth();
  const { companyId, companyIds } = useCompany();
  const { isAdminMaster, hasGroup, groupCanAccessRoute, groupCanEdit } = usePermissions();
  const userRole = user?.role || "";
  const isAdmin = userRole === "admin" || userRole === "admin_master";
  // Etapa "Coordenação" foi removida do fluxo de aprovação em Rev. 1276.
  // Mantido `canAprovarCoord` apenas para compatibilidade visual com dados legados (status="aprovada_coord").
  const canAprovarRH = isAdmin || groupCanEdit("/painel/rh");
  const canAprovarDiretoria = userRole === "admin_master";
  const [, navigate] = useLocation();

  const canAccess = isAdminMaster || !hasGroup || groupCanAccessRoute("/solicitacao-mdo");

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterObra, setFilterObra] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const [formObraId, setFormObraId] = useState(0);
  const [formItens, setFormItens] = useState<FormItem[]>([{ id: "1", funcao: "", quantidade: 1, duracaoMeses: 1, regimeContratacao: "experiencia" }]);
  const [formDataInicio, setFormDataInicio] = useState("");
  const [formPrioridade, setFormPrioridade] = useState("normal");
  const [formMotivo, setFormMotivo] = useState("");
  const [formAtividades, setFormAtividades] = useState("");
  const [lucroTercPerc, setLucroTercPerc] = useState(20);

  const [funcaoDropdownIdx, setFuncaoDropdownIdx] = useState<string | null>(null);
  const [funcaoBusca, setFuncaoBusca] = useState("");
  const funcaoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (funcaoRef.current && !funcaoRef.current.contains(e.target as Node)) {
        setFuncaoDropdownIdx(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Rev. 1271 — Marca as solicitações de MO como "vistas" pelo usuário
  // assim que a página é aberta (faz sumir a bolinha vermelha do menu).
  const utilsMdo = trpc.useUtils();
  const markSeenMdoMut = trpc.notifications.markRequestsSeen.useMutation({
    onSuccess: () => { utilsMdo.notifications.pendingRequestCounts.invalidate(); },
  });
  useEffect(() => {
    markSeenMdoMut.mutate({ key: "mdo_solicitacao" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = trpc.smo.list.useQuery(
    { companyId, companyIds, status: filterStatus !== "all" ? filterStatus : undefined, obraId: filterObra !== "all" ? parseInt(filterObra) : undefined },
    { enabled: canAccess && companyId > 0, retry: 3, retryDelay: 1000 }
  );
  const obrasQ = trpc.smo.obrasAtivas.useQuery({ companyId, companyIds }, { enabled: canAccess && companyId > 0 });
  const funcoesQ = trpc.smo.funcoesDisponiveis.useQuery({ companyId, companyIds }, { enabled: canAccess && companyId > 0 });
  const dashQ = trpc.smo.dashboard.useQuery({ companyId, companyIds }, { enabled: canAccess && companyId > 0 });

  const selectedDetail = trpc.smo.getById.useQuery({ id: selectedId || 0, companyId, companyIds }, { enabled: viewMode === "detail" && !!selectedId && companyId > 0 });

  const detailEfetivo = trpc.smo.efetivoAtualObra.useQuery(
    { companyId, companyIds, obraId: selectedDetail.data?.obraId || 0 },
    { enabled: viewMode === "detail" && !!selectedDetail.data?.obraId }
  );
  const detailCusto = trpc.smo.custoAtualObra.useQuery(
    { companyId, companyIds, obraId: selectedDetail.data?.obraId || 0 },
    { enabled: viewMode === "detail" && !!selectedDetail.data?.obraId }
  );

  const validItensForAnalise = formItens.filter(i => i.funcao.trim() && i.quantidade > 0 && i.duracaoMeses > 0);
  const analiseItensKey = validItensForAnalise.map(i => `${i.funcao}|${i.quantidade}|${i.duracaoMeses}|${i.regimeContratacao}`).join(",");

  const analiseInput = useMemo(() => {
    const mapped = validItensForAnalise.map(i => ({ funcao: i.funcao, quantidade: i.quantidade, duracaoMeses: i.duracaoMeses, regimeContratacao: i.regimeContratacao }));
    return { obraId: formObraId, itens: mapped };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formObraId, analiseItensKey]);

  const integracaoObraQ = trpc.smo.verificarIntegracaoObra.useQuery(
    { companyId, companyIds, obraId: formObraId },
    { enabled: viewMode === "form" && formObraId > 0 && companyId > 0, staleTime: 30000 }
  );
  const integracaoObra = integracaoObraQ.data;

  const analiseEnabled = viewMode === "form" && analiseInput.obraId > 0 && analiseInput.itens.length > 0 && companyId > 0;
  const analiseRawQ = trpc.smo.analiseComparativa.useQuery(
    { companyId, companyIds, obraId: analiseInput.obraId, itens: analiseInput.itens, lucroTerceirizacaoPerc: 20 },
    { enabled: analiseEnabled, keepPreviousData: true, staleTime: 60000, refetchOnWindowFocus: false }
  );

  const analiseQ = useMemo(() => {
    if (!analiseRawQ.data) return analiseRawQ;
    const raw = analiseRawQ.data;
    const lucroFrac = lucroTercPerc / 100;

    let totalTercMensal = 0;
    let totalTercPeriodo = 0;
    const itens = raw.itens.map((item: any) => {
      const base = item.terceirizacao.baseCustoMensal;
      const tercMensalUnit = base * (1 + lucroFrac);
      const tercMensalTotal = tercMensalUnit * item.quantidade;
      const tercMobilizacao = raw.parametros.mobilizacaoPorProfissional * item.quantidade;
      const tercPeriodo = (tercMensalTotal * item.duracaoMeses) + tercMobilizacao;

      const diferencaMensal = tercMensalTotal - item.clt.custoMensalTotal;
      const custoAdmDemissaoClt = item.comparativo.custoAdmDemissaoClt;
      const economiaCltPeriodo = tercPeriodo - item.clt.custoPeriodo;
      const recomendacao = economiaCltPeriodo > 0 ? "contratar" : (item.duracaoMeses <= 6 ? "terceirizar" : "contratar");

      totalTercMensal += tercMensalTotal;
      totalTercPeriodo += tercPeriodo;

      return {
        ...item,
        terceirizacao: { ...item.terceirizacao, lucroPerc: lucroTercPerc, lucroValor: base * lucroFrac, custoMensalUnit: tercMensalUnit, custoMensalTotal: tercMensalTotal, mobilizacao: tercMobilizacao, custoPeriodo: tercPeriodo },
        comparativo: { ...item.comparativo, diferencaMensal, tercMaisCaro: diferencaMensal > 0, economiaCltPeriodo, recomendacao, mesesParaCompensarAdmissao: custoAdmDemissaoClt > 0 && diferencaMensal > 0 ? Math.ceil(custoAdmDemissaoClt / diferencaMensal) : 0 },
      };
    });

    const diferencaPeriodo = totalTercPeriodo - raw.resumo.clt.periodo;
    return {
      ...analiseRawQ,
      data: {
        ...raw,
        itens,
        resumo: { ...raw.resumo, terceirizacao: { mensal: totalTercMensal, periodo: totalTercPeriodo }, diferencaMensal: totalTercMensal - raw.resumo.clt.mensal, diferencaPeriodo, recomendacaoGeral: diferencaPeriodo > 0 ? "contratar" : "avaliar_terceirizacao" },
        parametros: { ...raw.parametros, lucroTercPerc },
      },
    };
  }, [analiseRawQ, lucroTercPerc]);

  const createMut = trpc.smo.create.useMutation({
    onSuccess: (data) => { toast.success(`${data.count} solicitação(ões) criada(s)!`); list.refetch(); dashQ.refetch(); setViewMode("list"); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarMut = trpc.smo.aprovar.useMutation({
    onSuccess: () => { toast.success("Aprovado!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
  });
  const rejeitarMut = trpc.smo.rejeitar.useMutation({
    onSuccess: () => { toast.success("Rejeitado."); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); setShowRejectDialog(false); setRejectMotivo(""); },
  });
  const recrutarMut = trpc.smo.iniciarRecrutamento.useMutation({
    onSuccess: () => { toast.success("Recrutamento iniciado!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
  });
  const concluirMut = trpc.smo.concluir.useMutation({
    onSuccess: () => { toast.success("Solicitação concluída!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
  });
  const reverterMut = trpc.smo.reverterAprovacao.useMutation({
    onSuccess: (data) => { toast.success(`Aprovação da etapa "${data.etapa}" revertida!`); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); setShowRevertSmoDialog(false); setRevertSmoMotivo(""); setRevertSmoEtapa(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const [showRevertSmoDialog, setShowRevertSmoDialog] = useState(false);
  const [revertSmoMotivo, setRevertSmoMotivo] = useState("");
  const [revertSmoEtapa, setRevertSmoEtapa] = useState<"rh" | "diretoria" | null>(null);

  const updateMut = trpc.smo.update.useMutation({
    onSuccess: () => { toast.success("Atualizado!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); if (viewMode === "form") { setSelectedId(null); setViewMode("list"); } },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = trpc.smo.delete.useMutation({
    onSuccess: () => { toast.success("Excluída."); list.refetch(); dashQ.refetch(); setViewMode("list"); },
  });
  const checklistMut = trpc.smo.updateChecklist.useMutation({
    onSuccess: () => selectedDetail.refetch(),
  });
  const qtdAndamentoMut = trpc.smo.atualizarQtdEmAndamento.useMutation({
    onSuccess: () => { toast.success("Andamento atualizado!"); selectedDetail.refetch(); list.refetch(); },
  });
  const uploadCurriculoMut = trpc.smo.uploadCurriculo.useMutation({
    onSuccess: () => { toast.success("Currículo enviado!"); selectedDetail.refetch(); },
  });
  const removerCurriculoMut = trpc.smo.removerCurriculo.useMutation({
    onSuccess: () => { toast.success("Currículo removido."); selectedDetail.refetch(); },
  });

  function resetForm() {
    setFormObraId(0);
    setFormItens([{ id: "1", funcao: "", quantidade: 1, duracaoMeses: 1, regimeContratacao: "experiencia" }]);
    setFormDataInicio("");
    setFormPrioridade("normal");
    setFormMotivo("");
    setFormAtividades("");
    setFuncaoDropdownIdx(null);
    setFuncaoBusca("");
  }

  function addItem() {
    setFormItens(prev => [...prev, { id: String(Date.now()), funcao: "", quantidade: 1, duracaoMeses: 1, regimeContratacao: "experiencia" }]);
  }

  function removeItem(id: string) {
    if (formItens.length <= 1) return;
    setFormItens(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: string, field: keyof FormItem, value: any) {
    setFormItens(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function handleSubmit(status: "rascunho" | "enviada") {
    const validItens = formItens.filter(i => i.funcao.trim());
    if (!formObraId || validItens.length === 0 || !formDataInicio) {
      toast.error("Preencha a obra, pelo menos uma função e a data de início.");
      return;
    }
    if (selectedId && viewMode === "form") {
      const item = validItens[0];
      updateMut.mutate({
        id: selectedId,
        companyId,
        companyIds,
        funcaoSolicitada: item.funcao,
        quantidade: item.quantidade,
        duracaoMeses: item.duracaoMeses,
        regimeContratacao: item.regimeContratacao,
        dataInicioNecessidade: formDataInicio,
        prioridade: formPrioridade as any,
        observacao: formMotivo || undefined,
        qualificacoes: formAtividades || undefined,
        status,
      });
    } else {
      createMut.mutate({
        companyId,
        obraId: formObraId,
        solicitanteId: user?.id || 0,
        solicitanteNome: user?.name || "Usuário",
        itens: validItens.map(i => ({ funcao: i.funcao, quantidade: i.quantidade, duracaoMeses: i.duracaoMeses, regimeContratacao: i.regimeContratacao })),
        dataInicioNecessidade: formDataInicio,
        prioridade: formPrioridade as any,
        observacao: formMotivo || undefined,
        atividadesDescricao: formAtividades || undefined,
        status,
      });
    }
  }

  const filtered = useMemo(() => {
    if (!list.data) return [];
    const q = searchTerm.toLowerCase();
    return list.data.filter((s: any) =>
      !q ||
      s.funcaoSolicitada?.toLowerCase().includes(q) ||
      s.obraNome?.toLowerCase().includes(q) ||
      s.solicitanteNome?.toLowerCase().includes(q) ||
      String(s.id).includes(q)
    );
  }, [list.data, searchTerm]);

  const d = selectedDetail.data;

  function getProximaEtapa(status: string): string | null {
    // Fluxo Rev. 1276: Enviada → RH → Diretoria. (aprovada_coord é status legado;
    // se aparecer em registro antigo, manda direto para RH.)
    const flow: Record<string, string> = { enviada: "rh", aprovada_coord: "rh", aprovada_rh: "diretoria" };
    return flow[status] || null;
  }

  const obrasList = obrasQ.data || [];
  const funcoesList = funcoesQ.data || [];
  const selectedObra = obrasList.find((o: any) => o.id === formObraId);

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center text-center px-4">
          <Shield className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold text-muted-foreground">Acesso Restrito</h2>
          <p className="text-sm text-muted-foreground/70 mt-1">Você não tem permissão para acessar a Solicitação de Mão de Obra.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a] text-white px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => viewMode === "list" ? navigate("/painel/rh") : setViewMode("list")} className="text-white/70 hover:text-white hover:bg-white/10 h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Solicitação de Mão de Obra</h1>
              <p className="text-white/60 text-xs">
                {viewMode === "list" && "Gestão de contratações e realocações"}
                {viewMode === "form" && (selectedId ? `Editando SMO-${String(selectedId).padStart(4, "0")}` : "Nova solicitação")}
                {viewMode === "detail" && d && `SMO-${String(d.id).padStart(4, "0")} — ${d.funcaoSolicitada}`}
              </p>
            </div>
          </div>
          {viewMode === "list" && (
            <Button onClick={() => { resetForm(); setSelectedId(null); setViewMode("form"); }} className="bg-[#D4A843] hover:bg-[#c49935] text-[#1B2A4A] font-semibold gap-2">
              <Plus className="h-4 w-4" /> Nova Solicitação
            </Button>
          )}
        </div>
      </div>

      {/* ===== LIST VIEW ===== */}
      {viewMode === "list" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {dashQ.data && (
            <div className="px-6 py-3 shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <DashCard icon={ClipboardList} label="Total" value={dashQ.data.total} color="text-slate-700" bg="bg-white" />
                <DashCard icon={Send} label="Pendentes" value={(dashQ.data.byStatus.enviada || 0) + (dashQ.data.byStatus.aprovada_rh || 0) + (dashQ.data.byStatus.aprovada_coord || 0)} color="text-blue-700" bg="bg-blue-50" />
                <DashCard icon={Users} label="Em Recrutamento" value={dashQ.data.byStatus.em_recrutamento || 0} color="text-amber-700" bg="bg-amber-50" />
                <DashCard icon={UserCheck} label="Concluídas" value={dashQ.data.byStatus.concluida || 0} color="text-green-700" bg="bg-green-50" />
                <DashCard icon={DollarSign} label="Impacto Total" value={fmtMoney(dashQ.data.totalCusto)} color="text-purple-700" bg="bg-purple-50" isText />
              </div>
            </div>
          )}

          <div className="px-6 pb-3 flex flex-wrap items-center gap-3 shrink-0">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por função, obra ou solicitante..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterObra} onValueChange={setFilterObra}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as obras</SelectItem>
                {obrasList.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.codigo ? `${o.codigo} - ` : ""}{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {list.isLoading && !list.data ? (
              <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : list.isError ? (
              <div className="text-center py-12">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-muted-foreground text-sm">Erro ao carregar solicitações</p>
                <Button variant="outline" size="sm" onClick={() => list.refetch()} className="mt-3 gap-2">
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <HardHat className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Nenhuma solicitação encontrada</p>
                <Button variant="outline" onClick={() => { resetForm(); setViewMode("form"); }} className="mt-3 gap-2">
                  <Plus className="h-4 w-4" /> Criar primeira solicitação
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {filtered.map((s: any) => (
                  <div
                    key={s.id}
                    onClick={() => { setSelectedId(s.id); setViewMode("detail"); }}
                    className="bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-[#1B2A4A]">SMO-{String(s.id).padStart(4, "0")}</span>
                          <StatusBadge status={s.status} />
                          <PrioridadeBadge prioridade={s.prioridade} />
                          {s.prazoMinimoAlerta && <Badge variant="destructive" className="text-[10px] h-5">Prazo curto!</Badge>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><HardHat className="h-3.5 w-3.5" /> {s.funcaoSolicitada}</span>
                          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {s.quantidade} vaga(s)</span>
                          <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {s.obraNome || "—"}</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {s.dataInicioNecessidade ? new Date(s.dataInicioNecessidade).toLocaleDateString("pt-BR") : "—"}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {s.duracaoMeses}m</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Custo Estimado</div>
                        <div className="font-bold text-[#1B2A4A]">{fmtMoney(s.custoTotalEstimado || 0)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
                      <span>Por {s.solicitanteNome} em {s.criadoEm ? new Date(s.criadoEm).toLocaleDateString("pt-BR") : "-"}</span>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isAdmin && (
                          <button
                            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                            title="Excluir solicitação"
                            onClick={(e) => { e.stopPropagation(); if (confirm(`Excluir a solicitação SMO-${String(s.id).padStart(4, "0")}?`)) deleteMut.mutate({ id: s.id, companyId, companyIds }); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <span className="text-[#D4A843] font-medium flex items-center gap-1">Ver detalhes <ArrowRight className="h-3 w-3" /></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== FORM VIEW ===== */}
      {viewMode === "form" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-5">

            {/* Obra + Info */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold text-[#1B2A4A] flex items-center gap-2 mb-4"><Building2 className="h-5 w-5" /> Obra</h3>
              <Select value={formObraId ? String(formObraId) : ""} onValueChange={v => setFormObraId(parseInt(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione a obra..." />
                </SelectTrigger>
                <SelectContent>
                  {obrasList.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.codigo ? `${o.codigo} — ` : ""}{o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedObra && (
                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#1B2A4A]" />
                    <span className="font-semibold text-[#1B2A4A]">{selectedObra.nome}</span>
                  </div>
                  {selectedObra.responsavel && (
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      <span>Responsável: <strong>{selectedObra.responsavel}</strong></span>
                    </div>
                  )}
                  {selectedObra.codigo && (
                    <div className="text-xs">Código: {selectedObra.codigo}</div>
                  )}
                </div>
              )}

              {/* Alerta de integração obrigatória */}
              {integracaoObra?.exigeIntegracao && (
                <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-800">Integração de Pessoal Obrigatória</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        O cliente <strong>{integracaoObra.clienteNome}</strong> exige integração antes da mobilização.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {integracaoObra.plataforma && (
                      <div className="bg-white/70 rounded-lg px-3 py-2 border border-amber-200">
                        <span className="text-amber-600 font-semibold block">Plataforma</span>
                        <span className="text-slate-700">{integracaoObra.plataforma}</span>
                      </div>
                    )}
                    {integracaoObra.duracao && (
                      <div className="bg-white/70 rounded-lg px-3 py-2 border border-amber-200">
                        <span className="text-amber-600 font-semibold block">Duração</span>
                        <span className="text-slate-700">{integracaoObra.duracao}</span>
                      </div>
                    )}
                    {integracaoObra.validadeMeses && (
                      <div className="bg-white/70 rounded-lg px-3 py-2 border border-amber-200">
                        <span className="text-amber-600 font-semibold block">Validade</span>
                        <span className="text-slate-700">{integracaoObra.validadeMeses} {integracaoObra.validadeMeses === 1 ? "mês" : "meses"}</span>
                      </div>
                    )}
                    {integracaoObra.diasSemana && (
                      <div className="bg-white/70 rounded-lg px-3 py-2 border border-amber-200">
                        <span className="text-amber-600 font-semibold block">Dias disponíveis</span>
                        <span className="text-slate-700">{integracaoObra.diasSemana}</span>
                      </div>
                    )}
                    {integracaoObra.email && (
                      <div className="col-span-2 bg-white/70 rounded-lg px-3 py-2 border border-amber-200">
                        <span className="text-amber-600 font-semibold block">Contato / Agendamento</span>
                        <span className="text-slate-700">{integracaoObra.email}</span>
                      </div>
                    )}
                  </div>

                  {integracaoObra.procedimento && (
                    <div className="bg-white/70 rounded-lg px-3 py-2 border border-amber-200 text-xs">
                      <span className="text-amber-600 font-semibold block mb-1">Procedimento</span>
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{integracaoObra.procedimento}</p>
                    </div>
                  )}

                  {integracaoObra.totalAlerta > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-red-700 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {integracaoObra.totalAlerta} colaborador(es) com integração pendente/vencida nesta obra:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {integracaoObra.alertas.map((a: any) => (
                          <div key={a.empId} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                            <span className="text-xs font-medium text-red-800">{a.empNome}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.status === "VENCIDA" ? "bg-red-200 text-red-700" : a.status === "A_VENCER" ? "bg-orange-200 text-orange-700" : "bg-slate-200 text-slate-600"}`}>
                              {a.status === "SEM_REGISTRO" ? "Sem registro" : a.status === "VENCIDA" ? `Vencida em ${a.vencimento}` : `Vence em ${a.vencimento}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Itens — tabela dinâmica */}
            <div className="bg-white rounded-xl border p-6" ref={funcaoRef}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#1B2A4A] flex items-center gap-2"><Users className="h-5 w-5" /> Funções Solicitadas</h3>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Adicionar função
                </Button>
              </div>

              <div className="space-y-3">
                {/* Header */}
                <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  <div className="col-span-6">Função / Cargo</div>
                  <div className="col-span-2 text-center">Qtd</div>
                  <div className="col-span-3 text-center">Duração (meses)</div>
                  <div className="col-span-1"></div>
                </div>

                {formItens.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-12 gap-3 items-center">
                    {/* Função com autocomplete */}
                    <div className="col-span-6 relative">
                      {item.funcao ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1B2A4A]/30 bg-[#1B2A4A]/5 text-sm font-medium text-[#1B2A4A]">
                          <HardHat className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{item.funcao}</span>
                          <button type="button" onClick={() => updateItem(item.id, "funcao", "")} className="text-red-400 hover:text-red-600 shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input
                            placeholder="Buscar função..."
                            value={funcaoDropdownIdx === item.id ? funcaoBusca : ""}
                            onChange={e => { setFuncaoBusca(e.target.value); setFuncaoDropdownIdx(item.id); }}
                            onFocus={() => { setFuncaoDropdownIdx(item.id); setFuncaoBusca(""); }}
                            className="pl-9 text-sm"
                          />
                          {funcaoDropdownIdx === item.id && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {funcoesList
                                .filter((f: string) => !funcaoBusca || f.toLowerCase().includes(funcaoBusca.toLowerCase()))
                                .slice(0, 20)
                                .map((f: string) => (
                                  <button
                                    key={f}
                                    type="button"
                                    onClick={() => { updateItem(item.id, "funcao", f); setFuncaoDropdownIdx(null); setFuncaoBusca(""); }}
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <HardHat className="h-3 w-3 text-slate-400" />
                                    {f}
                                  </button>
                                ))}
                              {funcoesList.filter((f: string) => !funcaoBusca || f.toLowerCase().includes(funcaoBusca.toLowerCase())).length === 0 && funcaoBusca && (
                                <button
                                  type="button"
                                  onClick={() => { updateItem(item.id, "funcao", funcaoBusca); setFuncaoDropdownIdx(null); setFuncaoBusca(""); }}
                                  className="w-full text-left px-3 py-2 text-sm text-[#D4A843] font-medium hover:bg-amber-50 flex items-center gap-2"
                                >
                                  <Plus className="h-3 w-3" />
                                  Usar: "{funcaoBusca}"
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quantidade */}
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={e => updateItem(item.id, "quantidade", parseInt(e.target.value) || 1)}
                        className="text-center text-sm"
                      />
                    </div>

                    {/* Duração */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={item.duracaoMeses}
                          onChange={e => updateItem(item.id, "duracaoMeses", parseInt(e.target.value) || 1)}
                          className="text-center text-sm"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">mês(es)</span>
                      </div>
                    </div>

                    {/* Remover */}
                    <div className="col-span-1 flex justify-center">
                      {formItens.length > 1 && (
                        <button type="button" onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Regime de Contratação (Rev. 1357) */}
                    <div className="col-span-12 -mt-1">
                      <div className="flex flex-wrap items-center gap-3 px-2 py-2 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Regime CLT:</span>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                          <input
                            type="radio"
                            name={`regime-${item.id}`}
                            checked={item.regimeContratacao === "experiencia"}
                            onChange={() => updateItem(item.id, "regimeContratacao", "experiencia")}
                            className="accent-blue-600"
                          />
                          <span><strong>Experiência 45+45</strong> <span className="text-muted-foreground">— sem aviso/multa nos 3 primeiros meses</span></span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                          <input
                            type="radio"
                            name={`regime-${item.id}`}
                            checked={item.regimeContratacao === "indeterminado"}
                            onChange={() => updateItem(item.id, "regimeContratacao", "indeterminado")}
                            className="accent-blue-600"
                          />
                          <span><strong>Indeterminado</strong> <span className="text-muted-foreground">— encargos plenos desde o 1º mês</span></span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Resumo */}
                {formItens.filter(i => i.funcao).length > 0 && (
                  <div className="mt-2 pt-3 border-t flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-semibold text-[#1B2A4A]">
                      {formItens.filter(i => i.funcao).length} função(ões), {formItens.filter(i => i.funcao).reduce((s, i) => s + i.quantidade, 0)} profissional(is)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Detalhes */}
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h3 className="font-bold text-[#1B2A4A] flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Detalhes</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold">Data de Início *</Label>
                  <Input type="date" value={formDataInicio} onChange={e => setFormDataInicio(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Prioridade</Label>
                  <Select value={formPrioridade} onValueChange={setFormPrioridade}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgente">🔴 Urgente (10 dias úteis)</SelectItem>
                      <SelectItem value="normal">🔵 Normal (15 dias úteis)</SelectItem>
                      <SelectItem value="planejada">🟢 Planejada (30 dias úteis)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">Atividades que serão executadas</Label>
                <Textarea value={formAtividades} onChange={e => setFormAtividades(e.target.value)} placeholder="Descreva quais atividades a equipe irá executar na obra..." rows={2} className="mt-1" />
              </div>

              <div>
                <Label className="text-sm font-semibold">Motivo / Justificativa</Label>
                <Textarea value={formMotivo} onChange={e => setFormMotivo(e.target.value)} placeholder="Por que precisa dessa mão de obra? (ex: aumento de produção, substituição, nova etapa...)" rows={2} className="mt-1" />
              </div>

              {formPrioridade !== "urgente" && formDataInicio && (() => {
                const diff = (new Date(formDataInicio).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                return diff < 10;
              })() && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Início em menos de 10 dias úteis. Prazo muito curto para divulgação, entrevista e exames. Considere marcar como <strong>Urgente</strong>.</span>
                </div>
              )}
            </div>

            {/* Análise Financeira Comparativa */}
            {analiseQ.data && (
              <div className="bg-white rounded-xl border border-indigo-200 p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Scale className="h-5 w-5 text-indigo-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#1B2A4A]">Análise Financeira Detalhada — CLT vs Terceirização</h3>
                    <p className="text-xs text-muted-foreground">Encargos: {analiseQ.data.parametros.encargosPerc.toFixed(1)}% | Lucro Terc.: {analiseQ.data.parametros.lucroTercPerc}% | Benefícios: {analiseQ.data.parametros.beneficiosOrigem || "—"}</p>
                  </div>
                </div>

                {/* Detalhamento por função */}
                {analiseQ.data.itens.map((item: any, idx: number) => {
                  const det = item.clt.detalhamento;
                  const adm = item.clt.custosAdmissao;
                  const dem = item.clt.custosDemissao;
                  return (
                    <div key={idx} className="border rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 flex items-center justify-between border-b">
                        <div className="flex items-center gap-3">
                          <HardHat className="h-4 w-4 text-[#1B2A4A]" />
                          <span className="font-bold text-sm text-[#1B2A4A]">{item.funcao}</span>
                          <span className="text-xs text-muted-foreground">({item.quantidade} profissional(is) × {item.duracaoMeses} meses)</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.comparativo.recomendacao === "terceirizar" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                          {item.comparativo.recomendacao === "terceirizar" ? "⇒ Terceirizar" : "⇒ Contratar CLT"}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x">
                        {/* CLT */}
                        <div className="p-4 space-y-3">
                          <div className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1.5">
                            <Briefcase className="h-3.5 w-3.5" /> Contratação CLT
                          </div>
                          <div className="text-[10px] text-muted-foreground italic">Base salarial: {fmtMoney(item.salarioBase)} ({item.baseSalarial}{item.qtdReferencia > 0 ? `, ${item.qtdReferencia} ref.` : ""})</div>

                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Custos Mensais (por profissional)</div>
                            <CostLine label="Salário Bruto" value={det?.salarioBruto || item.salarioBase} />
                            <CostLine label="INSS Patronal (20%)" value={det?.inss} sub />
                            <CostLine label="FGTS (8%)" value={det?.fgts} sub />
                            <CostLine label="RAT/SAT (3%)" value={det?.rat} sub />
                            <CostLine label="Sistema S (5,8%)" value={det?.sistemaS} sub />
                            <CostLine label="Prov. Férias + 1/3" value={det?.provisaoFerias} sub />
                            <CostLine label="Prov. 13º Salário" value={det?.provisao13} sub />
                            <CostLine label="Prov. Multa FGTS" value={det?.provisaoMultaFGTS} sub />
                            <div className="border-t pt-1 flex justify-between font-semibold text-blue-800">
                              <span>Total Encargos ({item.clt.encargosPerc.toFixed(1)}%)</span>
                              <span className="font-mono">{fmtMoney(det?.totalEncargos || item.clt.encargosValor)}</span>
                            </div>
                            <div className="mt-2 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Benefícios Mensais</div>
                            {det?.cafeMensal > 0 && <CostLine label="Café da Manhã" value={det.cafeMensal} />}
                            {det?.lancheMensal > 0 && <CostLine label="Lanche" value={det.lancheMensal} />}
                            {det?.cafeMensal > 0 || det?.lancheMensal > 0
                              ? <CostLine label={`VR (Café + Lanche)`} value={det?.valeRefeicao} sub />
                              : <CostLine label={`Vale Refeição (22 dias)`} value={det?.valeRefeicao} />
                            }
                            <CostLine label="Vale Alimentação (VA)" value={det?.valeAlimentacao} />
                            <CostLine label="Vale Transporte (6%)" value={det?.valeTransporte} />
                            <CostLine label="Seguro de Vida Grupo" value={det?.seguroVidaGrupo} />
                            {det?.planoSaude > 0 && <CostLine label="Plano de Saúde" value={det?.planoSaude} />}
                            <div className="border-t pt-1 flex justify-between font-semibold text-blue-800">
                              <span>Total Benefícios</span>
                              <span className="font-mono">{fmtMoney((det?.valeRefeicao || 0) + (det?.valeAlimentacao || 0) + (det?.valeTransporte || 0) + (det?.seguroVidaGrupo || 0) + (det?.planoSaude || 0))}</span>
                            </div>

                            <div className="border-t border-blue-200 pt-1.5 mt-2">
                              <div className="flex justify-between font-bold text-blue-900 text-sm">
                                <span>Custo Mensal/profissional</span>
                                <span className="font-mono">{fmtMoney(item.clt.custoMensalUnit)}</span>
                              </div>
                              {item.quantidade > 1 && (
                                <div className="flex justify-between font-bold text-blue-800 text-xs mt-0.5">
                                  <span>× {item.quantidade} = Custo Mensal Total</span>
                                  <span className="font-mono">{fmtMoney(item.clt.custoMensalTotal)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Custos de Admissão (únicos)</div>
                            <CostLine label="Exame Admissional" value={adm?.exameAdmissional} />
                            <CostLine label="EPIs" value={adm?.epiEstimado} />
                            <CostLine label="Uniformes" value={adm?.uniformeEstimado} />
                            <CostLine label="Treinamento / Integração" value={adm?.treinamentoIntegracao} />
                            <div className="flex justify-between font-semibold text-blue-700 border-t pt-1">
                              <span>Total Admissão ({item.quantidade}x)</span>
                              <span className="font-mono">{fmtMoney(adm?.totalGeral)}</span>
                            </div>
                          </div>

                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Custos de Demissão</div>
                            <CostLine label="Exame Demissional" value={dem?.exameDemissional} />
                            <div className="flex justify-between font-semibold text-blue-700 border-t pt-1">
                              <span>Total Demissão ({item.quantidade}x)</span>
                              <span className="font-mono">{fmtMoney(dem?.totalGeral)}</span>
                            </div>
                          </div>

                          <div className="bg-blue-100 rounded-lg p-3 flex justify-between items-center">
                            <div>
                              <div className="text-[10px] font-bold text-blue-800 uppercase">Custo CLT Total</div>
                              <div className="text-[10px] text-blue-600">{item.duracaoMeses}m × {fmtMoney(item.clt.custoMensalTotal)} + admissão + demissão</div>
                            </div>
                            <div className="text-lg font-bold text-blue-900 font-mono">{fmtMoney(item.clt.custoPeriodo)}</div>
                          </div>
                        </div>

                        {/* Terceirização */}
                        <div className="p-4 space-y-3">
                          <div className="text-xs font-bold text-purple-800 uppercase tracking-wide flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" /> Terceirização
                          </div>
                          <div className="text-[10px] text-muted-foreground italic">Lucro de {item.terceirizacao.lucroPerc}% sobre o custo CLT completo</div>

                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Composição do custo (por profissional)</div>
                            <CostLine label="Custo CLT base (sal.+enc.+benef.)" value={item.terceirizacao.baseCustoMensal} />
                            <CostLine label={`Lucro da terceirizada (${item.terceirizacao.lucroPerc}%)`} value={item.terceirizacao.lucroValor} sub />
                            <div className="border-t pt-1 flex justify-between font-bold text-purple-800">
                              <span>Custo Mensal/profissional</span>
                              <span className="font-mono">{fmtMoney(item.terceirizacao.custoMensalUnit)}</span>
                            </div>
                            {item.quantidade > 1 && (
                              <div className="flex justify-between font-semibold text-purple-700 text-xs mt-0.5">
                                <span>× {item.quantidade} = Custo Mensal Total</span>
                                <span className="font-mono">{fmtMoney(item.terceirizacao.custoMensalTotal)}</span>
                              </div>
                            )}

                            <div className="mt-3 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Custos Únicos</div>
                            <CostLine label="Mobilização / Desmobilização" value={item.terceirizacao.mobilizacao} />

                            <div className="mt-3 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">O que a terceirizada arca</div>
                            <div className="text-[10px] text-muted-foreground space-y-0.5 ml-2">
                              <div>✓ Salário + encargos (mesmos que CLT)</div>
                              <div>✓ Benefícios (VR, VA, VT)</div>
                              <div>✓ EPIs e uniformes</div>
                              <div>✓ Exames médicos</div>
                              <div>✓ Férias, 13º e provisões</div>
                              <div>✓ Gestão e administração</div>
                              <div className="font-semibold text-purple-700">+ Lucro da empresa ({item.terceirizacao.lucroPerc}%)</div>
                            </div>
                          </div>

                          <div className="bg-purple-100 rounded-lg p-3 flex justify-between items-center">
                            <div>
                              <div className="text-[10px] font-bold text-purple-800 uppercase">Custo Terc. Total</div>
                              <div className="text-[10px] text-purple-600">{item.duracaoMeses}m × {fmtMoney(item.terceirizacao.custoMensalTotal)} + mobilização</div>
                            </div>
                            <div className="text-lg font-bold text-purple-900 font-mono">{fmtMoney(item.terceirizacao.custoPeriodo)}</div>
                          </div>

                          {/* Análise Comparativa */}
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                            <div className="font-semibold text-[10px] text-amber-800 uppercase tracking-wide">Análise Comparativa</div>
                            <div className="flex justify-between text-xs">
                              <span>Diferença mensal (terc. - CLT)</span>
                              <span className="font-mono font-semibold text-red-700">+{fmtMoney(item.comparativo.diferencaMensal)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span>Custos admissão+demissão CLT</span>
                              <span className="font-mono font-semibold text-blue-700">{fmtMoney(item.comparativo.custoAdmDemissaoClt)}</span>
                            </div>
                            {item.comparativo.mesesParaCompensarAdmissao > 0 && (
                              <div className="text-[10px] text-amber-700 bg-amber-100 rounded p-1.5">
                                CLT compensa a partir de <strong>{item.comparativo.mesesParaCompensarAdmissao} meses</strong> (quando a economia mensal supera os custos de admissão/demissão)
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Resumo Consolidado */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-4 w-4 text-amber-700" />
                      <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Impacto na Folha</span>
                    </div>
                    <div className="text-xl font-bold text-amber-900">{fmtMoney(analiseQ.data.resumo.impactoFolhaProximoMes)}</div>
                    <p className="text-[10px] text-amber-700 mt-1">Acréscimo mensal na folha (salários + encargos + benefícios)</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="h-4 w-4 text-blue-700" />
                      <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">CLT Total Período</span>
                    </div>
                    <div className="text-xl font-bold text-blue-900">{fmtMoney(analiseQ.data.resumo.clt.periodo)}</div>
                    <p className="text-[10px] text-blue-700 mt-1">Mensal + admissão + demissão</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-purple-700" />
                      <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">Terceirização Total</span>
                    </div>
                    <div className="text-xl font-bold text-purple-900">{fmtMoney(analiseQ.data.resumo.terceirizacao.periodo)}</div>
                    <p className="text-[10px] text-purple-700 mt-1">Mensal + mobilização</p>
                  </div>
                </div>

                {/* Slider de Lucro Terceirização */}
                <div className="bg-slate-50 border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#1B2A4A] uppercase tracking-wide">Margem de lucro da terceirizada</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min="5" max="50" step="1" value={lucroTercPerc}
                        onChange={e => setLucroTercPerc(parseInt(e.target.value))}
                        className="w-32 h-1.5 accent-purple-600"
                      />
                      <input
                        type="number" min="5" max="50" value={lucroTercPerc}
                        onChange={e => setLucroTercPerc(Math.max(5, Math.min(50, parseInt(e.target.value) || 20)))}
                        className="w-14 text-center text-sm font-bold border rounded px-1 py-0.5"
                      />
                      <span className="text-xs font-semibold text-muted-foreground">%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Ajuste conforme as cotações recebidas. A terceirizada tem os mesmos custos CLT + esse percentual de lucro.</p>
                </div>

                {/* Recomendação */}
                <div className={`rounded-xl p-4 flex items-start gap-3 ${analiseQ.data.resumo.recomendacaoGeral === "contratar" ? "bg-blue-100 border border-blue-300" : "bg-amber-100 border border-amber-300"}`}>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${analiseQ.data.resumo.recomendacaoGeral === "contratar" ? "bg-blue-200" : "bg-amber-200"}`}>
                    <BarChart3 className={`h-5 w-5 ${analiseQ.data.resumo.recomendacaoGeral === "contratar" ? "text-blue-800" : "text-amber-800"}`} />
                  </div>
                  <div>
                    <div className={`font-bold text-sm ${analiseQ.data.resumo.recomendacaoGeral === "contratar" ? "text-blue-900" : "text-amber-900"}`}>
                      Recomendação: {analiseQ.data.resumo.recomendacaoGeral === "contratar" ? "Contratar via CLT" : "Avaliar Terceirização"}
                    </div>
                    <p className={`text-xs mt-1 ${analiseQ.data.resumo.recomendacaoGeral === "contratar" ? "text-blue-700" : "text-amber-700"}`}>
                      {analiseQ.data.resumo.recomendacaoGeral === "contratar"
                        ? `CLT é mais econômico neste período. A terceirização custaria ${fmtMoney(analiseQ.data.resumo.diferencaPeriodo)} a mais no total. Porém, considere a flexibilidade: sem vínculo, sem risco trabalhista, sem custos de demissão.`
                        : `Para contratos curtos, a terceirização pode compensar mesmo sendo mais cara por mês — você evita custos de admissão (${fmtMoney(analiseQ.data.parametros.custoAdmissaoPorProfissional)}/profissional), demissão e risco trabalhista.`
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
            {analiseQ.isLoading && validItensForAnalise.length > 0 && formObraId > 0 && (
              <div className="bg-white rounded-xl border p-6 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                Calculando análise financeira detalhada...
              </div>
            )}

            {/* Botões */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => { setSelectedId(null); setViewMode("list"); }} className="text-muted-foreground">
                Cancelar
              </Button>
              <div className="flex gap-3">
                {!selectedId && (
                  <Button variant="outline" onClick={() => handleSubmit("rascunho")} disabled={createMut.isPending || updateMut.isPending}>
                    Salvar Rascunho
                  </Button>
                )}
                <Button onClick={() => handleSubmit("enviada")} disabled={createMut.isPending || updateMut.isPending} className={selectedId ? "bg-amber-600 hover:bg-amber-700 gap-2 px-6" : "bg-[#1B2A4A] hover:bg-[#243660] gap-2 px-6"}>
                  {selectedId ? <SquarePen className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  {selectedId ? "Salvar Alterações" : "Enviar para Aprovação"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DETAIL VIEW ===== */}
      {viewMode === "detail" && d && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <StatusBadge status={d.status} />
                    <PrioridadeBadge prioridade={d.prioridade} />
                    {d.prazoMinimoAlerta && <Badge variant="destructive" className="text-[10px]">Prazo curto!</Badge>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <InfoField icon={Building2} label="Obra" value={d.obraNome || "-"} />
                    <InfoField icon={HardHat} label="Função" value={d.funcaoSolicitada} />
                    <InfoField icon={Users} label="Quantidade" value={`${d.quantidade} vaga(s)`} />
                    <InfoField icon={Calendar} label="Início" value={d.dataInicioNecessidade ? new Date(d.dataInicioNecessidade).toLocaleDateString("pt-BR") : "—"} />
                    <InfoField icon={Clock} label="Duração" value={`${d.duracaoMeses} mês(es)`} />
                    <InfoField icon={Briefcase} label="Solicitante" value={d.solicitanteNome} />
                  </div>

                  {d.qualificacoes && (
                    <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Atividades</span>
                      {d.qualificacoes}
                    </div>
                  )}

                  {d.observacao && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Motivo / Justificativa</span>
                      {d.observacao}
                    </div>
                  )}

                  {d.motivoRejeicao && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                      <span className="font-semibold block mb-1">Motivo da Rejeição</span>
                      {d.motivoRejeicao}
                      <div className="text-xs mt-1 text-red-600">Por {d.rejeitadoPor} em {d.rejeitadoEm ? new Date(d.rejeitadoEm).toLocaleDateString("pt-BR") : "-"}</div>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div className="bg-white rounded-xl border p-5">
                  <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3">Fluxo de Aprovação</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ApprovalStep label="Enviada" done={d.status !== "rascunho"} date={d.criadoEm} by={d.solicitanteNome} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-1">
                      <ApprovalStep label="RH" done={!!d.aprovadoPorRh} date={d.aprovadoPorRhEm} by={d.aprovadoPorRh} />
                      {!!d.aprovadoPorRh && canAprovarDiretoria && d.status !== "rejeitada" && d.status !== "concluida" && d.status !== "em_recrutamento" && (
                        <button
                          onClick={() => { setRevertSmoEtapa("rh"); setRevertSmoMotivo(""); setShowRevertSmoDialog(true); }}
                          className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded p-0.5 transition-colors"
                          title="Reverter aprovação do RH"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-1">
                      <ApprovalStep label="Diretoria" done={!!d.aprovadoPorDiretoria} date={d.aprovadoPorDiretoriaEm} by={d.aprovadoPorDiretoria} />
                      {!!d.aprovadoPorDiretoria && canAprovarDiretoria && d.status !== "rejeitada" && d.status !== "concluida" && d.status !== "em_recrutamento" && (
                        <button
                          onClick={() => { setRevertSmoEtapa("diretoria"); setRevertSmoMotivo(""); setShowRevertSmoDialog(true); }}
                          className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded p-0.5 transition-colors"
                          title="Reverter aprovação da Diretoria"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Andamento das Contratações */}
                {["aprovada_diretoria", "em_recrutamento", "concluida"].includes(d.status) && canAprovarRH && (
                  <div className="bg-white rounded-xl border p-5">
                    <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Andamento das Contratações</h4>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-muted-foreground">Solicitadas</div>
                        <div className="text-xl font-bold text-blue-700">{d.quantidade}</div>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-muted-foreground">Em Andamento</div>
                        <div className="text-xl font-bold text-amber-700">{d.qtdEmAndamento || 0}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-muted-foreground">Pendentes</div>
                        <div className="text-xl font-bold text-slate-600">{d.quantidade - (d.qtdEmAndamento || 0)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Label className="text-xs whitespace-nowrap">Em andamento:</Label>
                      <Input
                        type="number"
                        min={0}
                        max={d.quantidade}
                        className="w-20 h-8 text-sm"
                        defaultValue={d.qtdEmAndamento || 0}
                        onBlur={(e) => {
                          const val = Math.max(0, Math.min(d.quantidade, parseInt(e.target.value) || 0));
                          if (val !== (d.qtdEmAndamento || 0)) {
                            qtdAndamentoMut.mutate({ id: d.id, companyId, companyIds, qtdEmAndamento: val });
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                      <span className="text-xs text-muted-foreground">de {d.quantidade} vaga(s)</span>
                    </div>
                  </div>
                )}

                {/* Onboarding */}
                {d.checklist && d.checklist.length > 0 && ["aprovada_diretoria", "em_recrutamento", "concluida"].includes(d.status) && (
                  <ChecklistOnboarding
                    checklist={d.checklist}
                    companyId={companyId}
                    companyIds={companyIds}
                    userName={user?.name || "RH"}
                    checklistMut={checklistMut}
                  />
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-3">
                  {/* Fluxo Rev. 1276: Enviada → RH → Diretoria. Etapa Coordenação removida. */}
                  {(d.status === "enviada" || d.status === "aprovada_coord") && canAprovarRH && (
                    <Button onClick={() => aprovarMut.mutate({ id: d.id, companyId, companyIds, etapa: "rh", aprovadorNome: user?.name || "Aprovador" })} disabled={aprovarMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                      <CheckCircle className="h-4 w-4" /> Aprovar (RH)
                    </Button>
                  )}
                  {d.status === "aprovada_rh" && canAprovarDiretoria && (
                    <Button onClick={() => aprovarMut.mutate({ id: d.id, companyId, companyIds, etapa: "diretoria", aprovadorNome: user?.name || "Aprovador" })} disabled={aprovarMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                      <CheckCircle className="h-4 w-4" /> Aprovar (Diretoria)
                    </Button>
                  )}
                  {["enviada", "aprovada_coord", "aprovada_rh"].includes(d.status) && (canAprovarRH || canAprovarDiretoria) && (
                    <Button variant="destructive" onClick={() => { setRejectingId(d.id); setShowRejectDialog(true); }} className="gap-2">
                      <XCircle className="h-4 w-4" /> Rejeitar
                    </Button>
                  )}
                  {d.status === "aprovada_diretoria" && canAprovarRH && (
                    <Button onClick={() => recrutarMut.mutate({ id: d.id, companyId, companyIds })} disabled={recrutarMut.isPending} className="bg-amber-600 hover:bg-amber-700 gap-2">
                      <Users className="h-4 w-4" /> Iniciar Recrutamento
                    </Button>
                  )}
                  {d.status === "em_recrutamento" && (
                    <Button onClick={() => concluirMut.mutate({ id: d.id, companyId, companyIds })} disabled={concluirMut.isPending} className="bg-green-600 hover:bg-green-700 gap-2">
                      <UserCheck className="h-4 w-4" /> Concluir
                    </Button>
                  )}
                  {d.status === "rascunho" && (
                    <Button variant="outline" onClick={() => {
                      updateMut.mutate({ id: d.id, companyId, companyIds, status: "enviada" });
                    }} disabled={updateMut.isPending} className="gap-2">
                      <Send className="h-4 w-4" /> Enviar para Aprovação
                    </Button>
                  )}
                  {(d as any).canEdit && (
                    <Button variant="outline" className="text-amber-600 border-amber-300 gap-2" onClick={() => {
                      setFormObraId(d.obraId);
                      setFormItens(
                        d.funcaoSolicitada
                          ? [{ id: "1", funcao: d.funcaoSolicitada, quantidade: d.quantidade || 1, duracaoMeses: d.duracaoMeses || 1, regimeContratacao: ((d as any).regimeContratacao || "experiencia") as "experiencia" | "indeterminado" }]
                          : [{ id: "1", funcao: "", quantidade: 1, duracaoMeses: 1, regimeContratacao: "experiencia" }]
                      );
                      setFormDataInicio(d.dataInicioNecessidade ? d.dataInicioNecessidade.split("T")[0] : "");
                      setFormPrioridade(d.prioridade || "normal");
                      setFormMotivo(d.observacao || "");
                      setFormAtividades(d.qualificacoes || "");
                      setSelectedId(d.id);
                      setViewMode("form");
                    }}>
                      <SquarePen className="h-4 w-4" /> Editar
                    </Button>
                  )}
                  {(d as any).canEdit && (
                    <Button variant="ghost" className="text-red-600 gap-2" onClick={() => { if (confirm(`Excluir a solicitação SMO-${String(d.id).padStart(4, "0")}?`)) deleteMut.mutate({ id: d.id, companyId, companyIds }); }}>
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  )}
                </div>
              </div>

              {/* Right sidebar */}
              <div className="space-y-4">
                {d.detalheCustos && (() => {
                  try {
                    const c = JSON.parse(d.detalheCustos);
                    return (
                      <>
                        <div className="bg-white rounded-xl border p-4">
                          <h4 className="font-semibold text-xs text-[#1B2A4A] mb-3 flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Impacto Financeiro</h4>
                          {c.regimeContratacao && (
                            <div className={`mb-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${c.regimeContratacao === "experiencia" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                              {c.regimeContratacao === "experiencia" ? "Experiência 45+45" : "Indeterminado"}
                            </div>
                          )}
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between"><span className="text-muted-foreground">Salário Base</span><span className="font-mono">{fmtMoney(c.salarioBase)}</span></div>
                            {c.alertaSalarioAnomalo && (
                              <div className="flex items-start gap-1.5 p-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-[11px] mt-1">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>Salário anômalo detectado no cadastro{c.salarioRefOriginal ? ` (R$ ${Number(c.salarioRefOriginal).toLocaleString("pt-BR", { minimumFractionDigits: 0 })})` : ""}. Custo recalculado usando o piso da convenção. Verifique o cadastro do funcionário.</span>
                              </div>
                            )}
                            {c.regimeContratacao === "experiencia" && c.mesesExperiencia > 0 && c.encargosBasicoPerc != null ? (
                              <>
                                <div className="flex justify-between text-amber-700">
                                  <span className="text-[11px]">Mês 1–{c.mesesExperiencia} (sem aviso/multa) — {(c.encargosBasicoPerc).toFixed(1)}%</span>
                                  <span className="font-mono">{fmtMoney(c.custoMensalUnitExperiencia)}</span>
                                </div>
                                {c.mesesEfetivo > 0 && (
                                  <div className="flex justify-between text-blue-700">
                                    <span className="text-[11px]">Mês {c.mesesExperiencia + 1}+ (efetivado) — {(c.encargosRescisaoPerc != null ? (c.encargosBasicoPerc + c.encargosRescisaoPerc) : (c.encargosPerc || 79.3)).toFixed(1)}%</span>
                                    <span className="font-mono">{fmtMoney(c.custoMensalUnitEfetivo)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-muted-foreground border-t border-dashed pt-1">
                                  <span>Encargos médio ({(c.encargosMediaPerc ?? c.encargosPerc ?? 79.3).toFixed(1)}%)</span>
                                  <span className="font-mono">{fmtMoney(c.encargosValor)}</span>
                                </div>
                              </>
                            ) : (
                              <div className="flex justify-between"><span className="text-muted-foreground">Encargos ({(c.encargosMediaPerc ?? c.encargosPerc ?? 79.3).toFixed(1)}%)</span><span className="font-mono">{fmtMoney(c.encargosValor)}</span></div>
                            )}
                            <div className="flex justify-between"><span className="text-muted-foreground">Benefícios</span><span className="font-mono">{fmtMoney(c.beneficios || 0)}</span></div>
                            <div className="border-t pt-1.5 flex justify-between font-semibold"><span>Mensal CLT médio ({d.quantidade}x)</span><span className="text-blue-700">{fmtMoney(c.custoMensalTotal)}</span></div>
                            <div className="bg-blue-50 text-blue-900 rounded-lg p-2 flex justify-between font-bold">
                              <span>CLT Total ({d.duracaoMeses}m)</span><span>{fmtMoney(c.custoTotal)}</span>
                            </div>
                            {c.regimeContratacao === "experiencia" && c.mesesEfetivo > 0 && c.custoMensalUnitExperiencia && c.custoMensalUnitEfetivo && (
                              <p className="text-[10px] text-muted-foreground italic mt-1">
                                Cálculo: {c.mesesExperiencia}m × {fmtMoney(c.custoMensalUnitExperiencia * d.quantidade)} + {c.mesesEfetivo}m × {fmtMoney(c.custoMensalUnitEfetivo * d.quantidade)} + custos únicos
                              </p>
                            )}
                          </div>
                        </div>

                        {c.tercMensalTotal && (
                          <div className={`rounded-xl border p-4 ${c.recomendacao === "terceirizar" ? "bg-purple-50 border-purple-200" : "bg-blue-50 border-blue-200"}`}>
                            <h4 className="font-semibold text-xs mb-2 flex items-center gap-2">
                              <Scale className="h-3.5 w-3.5" /> CLT vs Terceirização
                            </h4>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between"><span>Terc. mensal</span><span className="font-mono text-purple-700">{fmtMoney(c.tercMensalTotal)}</span></div>
                              <div className="flex justify-between"><span>Terc. total ({d.duracaoMeses}m)</span><span className="font-mono text-purple-700 font-semibold">{fmtMoney(c.tercTotal)}</span></div>
                              <div className="border-t pt-1.5">
                                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg font-bold text-xs ${c.recomendacao === "terceirizar" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                                  {c.recomendacao === "terceirizar" ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                                  {c.recomendacao === "terceirizar" ? "Recomendado: Terceirizar" : "Recomendado: Contratar CLT"}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {c.recomendacao === "terceirizar"
                                    ? `Economia de ${fmtMoney(c.custoTotal - c.tercTotal)} no período.`
                                    : `Economia de ${fmtMoney(c.tercTotal - c.custoTotal)} no período.`
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  } catch { return null; }
                })()}

                {detailEfetivo.data && detailEfetivo.data.length > 0 && (
                  <div className="bg-white rounded-xl border p-4">
                    <h4 className="font-semibold text-xs text-[#1B2A4A] mb-2 flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Efetivo Atual</h4>
                    <div className="space-y-1">
                      {detailEfetivo.data.map((e: any) => (
                        <div key={e.funcao} className={`flex justify-between text-xs px-2 py-0.5 rounded ${e.funcao === d.funcaoSolicitada ? "bg-amber-50 font-semibold" : ""}`}>
                          <span>{e.funcao}</span><span className="font-mono">{e.quantidade}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailCusto.data && (() => {
                  let custoNovasVagas = 0;
                  try {
                    const cc = JSON.parse(d.detalheCustos || "{}");
                    custoNovasVagas = cc.custoMensalTotal || 0;
                  } catch {}
                  const folhaAtual = detailCusto.data.folhaBrutaMensal;
                  const folhaPrevista = folhaAtual + custoNovasVagas;
                  const novosFuncionarios = d.quantidade || 0;
                  return (
                    <div className="bg-white rounded-xl border p-4">
                      <h4 className="font-semibold text-xs text-[#1B2A4A] mb-2 flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5" /> Custo da Obra</h4>
                      <div className="text-xs space-y-1.5">
                        <div className="flex justify-between"><span className="text-muted-foreground">Funcionários atuais</span><span className="font-semibold">{detailCusto.data.totalFuncionarios}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Folha mensal atual</span><span className="font-semibold">{fmtMoney(folhaAtual)}</span></div>
                        {custoNovasVagas > 0 && (
                          <>
                            <div className="border-t pt-1.5" />
                            <div className="flex justify-between text-amber-700"><span>+ {novosFuncionarios} vaga(s) solicitada(s)</span><span className="font-mono">+{fmtMoney(custoNovasVagas)}</span></div>
                            <div className="bg-amber-50 text-amber-900 rounded-lg p-2 flex justify-between font-bold">
                              <span>Folha prevista</span><span>{fmtMoney(folhaPrevista)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {(d.candidatoIndicadoNome || d.candidatoIndicadoTelefone || d.curriculoArquivoNome) && (
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <h4 className="font-semibold text-xs text-blue-800 mb-2 flex items-center gap-2"><UserCheck className="h-3.5 w-3.5" /> Candidato</h4>
                    <div className="space-y-1.5 text-xs">
                      {d.candidatoIndicadoNome && <div className="flex items-center gap-2"><User className="h-3 w-3 text-blue-600" /><span>{d.candidatoIndicadoNome}</span></div>}
                      {d.candidatoIndicadoTelefone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-blue-600" /><span>{d.candidatoIndicadoTelefone}</span></div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Rejeitar Solicitação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Motivo da Rejeição *</Label>
            <Textarea value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} placeholder="Descreva o motivo..." rows={3} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancelar</Button>
              <Button variant="destructive" disabled={!rejectMotivo.trim() || rejeitarMut.isPending}
                onClick={() => { if (rejectingId) rejeitarMut.mutate({ id: rejectingId, companyId, companyIds, rejeitadoPor: user?.name || "Aprovador", motivoRejeicao: rejectMotivo }); }}>
                Confirmar Rejeição
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revert Approval Dialog */}
      <Dialog open={showRevertSmoDialog} onOpenChange={(v) => { if (!v) { setShowRevertSmoDialog(false); setRevertSmoMotivo(""); setRevertSmoEtapa(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              Reverter Aprovação — {revertSmoEtapa === "rh" ? "RH" : "Diretoria"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {revertSmoEtapa === "rh"
                ? "A aprovação do RH (e da Diretoria, se houver) será desfeita. A solicitação voltará ao status \"Enviada\"."
                : "A aprovação da Diretoria será desfeita. A solicitação voltará ao status \"Aprovada RH\"."
              }
            </p>
            <Label>Motivo da Reversão *</Label>
            <Textarea
              value={revertSmoMotivo}
              onChange={e => setRevertSmoMotivo(e.target.value)}
              placeholder="Informe o motivo da reversão (mínimo 5 caracteres)..."
              rows={3}
              className="border-orange-300 focus:border-orange-500"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowRevertSmoDialog(false); setRevertSmoMotivo(""); setRevertSmoEtapa(null); }}>Cancelar</Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                disabled={revertSmoMotivo.trim().length < 5 || reverterMut.isPending}
                onClick={() => { if (selectedId && revertSmoEtapa) reverterMut.mutate({ id: selectedId, companyId, companyIds, etapa: revertSmoEtapa, motivo: revertSmoMotivo.trim() }); }}
              >
                {reverterMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Confirmar Reversão
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashCard({ icon: Icon, label, value, color, bg, isText }: { icon: any; label: string; value: any; color: string; bg: string; isText?: boolean }) {
  return (
    <div className={`${bg} rounded-xl border p-3 shadow-sm`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color} mt-1 ${isText ? "text-sm" : ""}`}>{value}</div>
    </div>
  );
}

function InfoField({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

function CostLine({ label, value, sub }: { label: string; value: number | undefined | null; sub?: boolean }) {
  if (value === undefined || value === null) return null;
  return (
    <div className={`flex justify-between ${sub ? "ml-3 text-muted-foreground" : ""}`}>
      <span>{sub ? "├ " : ""}{label}</span>
      <span className="font-mono">{fmtMoney(value)}</span>
    </div>
  );
}

function ApprovalStep({ label, done, date, by }: { label: string; done: boolean; date?: string | null; by?: string | null }) {
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs ${done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-muted-foreground"}`}>
      {done ? <CheckCircle className="h-4 w-4 text-emerald-600 mb-1" /> : <Clock className="h-4 w-4 mb-1" />}
      <span className="font-semibold">{label}</span>
      {done && by && <span className="text-[10px]">{by}</span>}
      {done && date && <span className="text-[10px]">{new Date(date).toLocaleDateString("pt-BR")}</span>}
    </div>
  );
}
