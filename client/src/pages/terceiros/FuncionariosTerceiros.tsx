import { useState, useMemo, useRef, useEffect } from "react";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { compressImageIfNeeded } from "@/lib/imageCompress";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Users, Plus, Search, Edit, Trash2, Upload, FileText, CheckCircle, XCircle, Clock, ShieldCheck, Building2, HardHat, Camera, BadgeCheck, User as UserIcon, X, Heart, Award, BookOpen, ClipboardCheck, AlertTriangle, Calendar, Phone, Briefcase, Loader2, Eye, LogOut, RefreshCw, History } from "lucide-react";
import { PersonPhoto } from "@/components/PersonPhoto";
import { FuncaoCombobox } from "@/components/FuncaoCombobox";

// Rev. 2680 — Definição ÚNICA das seções/documentos exigidos pra funcionário
// terceiro. Reaproveitada pela aba "Documentos" do editor E pelo Raio-X read-only
// (RaioXTerceiroDialog), pra que as duas telas nunca saiam de sincronia.
type SecaoDocTerceiro = { label: string; urlField: string; validadeField: string | null; obrigatorio: boolean; descricao?: string };
type SecaoTerceiro = { key: string; titulo: string; descricao: string; icone: any; cor: string; bgCor: string; corBorda: string; docs: SecaoDocTerceiro[] };

function getSecoesTerceiro(): SecaoTerceiro[] {
  return [
    {
      key: "saude_ocupacional",
      titulo: "Saúde Ocupacional",
      descricao: "Atestado médico que comprova aptidão pra função",
      icone: Heart,
      cor: "text-rose-700",
      bgCor: "bg-rose-50",
      corBorda: "border-rose-200",
      docs: [
        { label: "ASO (Atestado de Saúde Ocupacional)", urlField: "asoUrl", validadeField: "asoValidade", obrigatorio: true, descricao: "Admissional, periódico ou de mudança de função" },
      ],
    },
    {
      key: "treinamentos_nr",
      titulo: "Treinamentos NR",
      descricao: "Normas Regulamentadoras conforme função e exposição a risco",
      icone: BookOpen,
      cor: "text-amber-700",
      bgCor: "bg-amber-50",
      corBorda: "border-amber-200",
      docs: [
        { label: "Treinamento NR genérico (NR-06 EPI, NR-18 Construção, etc.)", urlField: "treinamentoNrUrl", validadeField: "treinamentoNrValidade", obrigatorio: true },
        { label: "NR-10 — Segurança em Eletricidade", urlField: "nr10DocUrl", validadeField: "nr10Validade", obrigatorio: false, descricao: "Obrigatório pra eletricistas e quem trabalha próximo a redes energizadas" },
        { label: "NR-33 — Espaço Confinado", urlField: "nr33DocUrl", validadeField: "nr33Validade", obrigatorio: false, descricao: "Obrigatório pra tanques, silos, galerias, poços etc." },
        { label: "NR-35 — Trabalho em Altura", urlField: "nr35DocUrl", validadeField: "nr35Validade", obrigatorio: false, descricao: "Obrigatório pra trabalhos acima de 2m do nível inferior" },
      ],
    },
    {
      key: "integracao_seguranca",
      titulo: "Integração de Segurança",
      descricao: "Integração admissional na Construtora E no Cliente final (ambas obrigatórias)",
      icone: ClipboardCheck,
      cor: "text-indigo-700",
      bgCor: "bg-indigo-50",
      corBorda: "border-indigo-200",
      docs: [
        { label: "Integração na Construtora (FC)", urlField: "integracaoDocUrl", validadeField: null, obrigatorio: true, descricao: "Ata/lista de presença da integração admissional realizada pela Construtora contratante" },
        { label: "Integração no Cliente / Obra", urlField: "integracaoClienteDocUrl", validadeField: null, obrigatorio: true, descricao: "Ata/lista da integração realizada pelo Cliente final ou pela própria obra (regras locais, DDS específicos)" },
      ],
    },
    {
      key: "documentos_trabalhistas",
      titulo: "Documentos Trabalhistas",
      descricao: "Comprovantes legais que devem ficar disponíveis pra fiscalização do MTE",
      icone: Briefcase,
      cor: "text-emerald-700",
      bgCor: "bg-emerald-50",
      corBorda: "border-emerald-200",
      docs: [
        { label: "Ficha de EPI", urlField: "fichaEpiUrl", validadeField: null, obrigatorio: true, descricao: "Ficha de Entrega de EPI assinada pelo trabalhador (NR-06) — registra os EPIs recebidos, datas e devoluções" },
        { label: "Ordem de Serviço (OS de SST)", urlField: "ordemServicoUrl", validadeField: null, obrigatorio: true, descricao: "OS exigida pela NR-01 — descreve a função, os riscos do ambiente, as medidas de prevenção e as obrigações do trabalhador" },
        { label: "Registro de Funcionário", urlField: "registroFuncionarioUrl", validadeField: null, obrigatorio: true, descricao: "Ficha/livro de registro de empregado (CLT art. 41) — comprova o vínculo formal junto à empresa terceira" },
      ],
    },
    {
      key: "identificacao_qualificacao",
      titulo: "Identificação e Qualificação",
      descricao: "Foto pra crachá e certificados profissionais complementares",
      icone: Award,
      cor: "text-blue-700",
      bgCor: "bg-blue-50",
      corBorda: "border-blue-200",
      docs: [
        { label: "Foto 3x4", urlField: "fotoUrl", validadeField: null, obrigatorio: true, descricao: "Foto recente pra crachá de identificação" },
        { label: "Certificados profissionais", urlField: "certificadosUrl", validadeField: null, obrigatorio: false, descricao: "Cursos técnicos, qualificações específicas etc." },
      ],
    },
  ];
}

// Rev. 4529 — Histórico de vínculos de um funcionário terceiro (sub-componente do Raio-X).
function VinculosHistoricoSection({ funcId, companyId }: { funcId: number; companyId: number }) {
  const { data: vinculos, isLoading } = (trpc as any).terceiros.funcionarios.listarVinculos.useQuery(
    { funcionarioId: funcId, companyId },
    { enabled: !!funcId && !!companyId }
  );
  if (isLoading) return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2 border-b">
        <History className="h-4 w-4 text-slate-500" />
        <h4 className="font-bold text-sm text-slate-700">Histórico de Vínculos</h4>
      </div>
      <div className="p-4 text-xs text-muted-foreground text-center">Carregando...</div>
    </div>
  );
  const rows: any[] = vinculos ?? [];
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2 border-b">
        <History className="h-4 w-4 text-slate-500" />
        <h4 className="font-bold text-sm text-slate-700">Histórico de Vínculos</h4>
        <span className="ml-auto text-[11px] text-muted-foreground">{rows.length} registro{rows.length !== 1 ? "s" : ""}</span>
      </div>
      {rows.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground text-center">Nenhum vínculo registrado ainda.</div>
      ) : (
        <div className="divide-y bg-white">
          {rows.map((v: any) => {
            const entrada = v.data_entrada ? String(v.data_entrada).slice(0, 10).split("-").reverse().join("/") : "–";
            const saida = v.data_saida ? String(v.data_saida).slice(0, 10).split("-").reverse().join("/") : null;
            const ativo = !saida;
            return (
              <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${ativo ? "bg-emerald-500" : "bg-slate-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{v.obra_nome || "Sem obra"}</span>
                    {ativo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">Ativo</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Entrada: {entrada}{saida ? ` · Saída: ${saida}` : " · Em andamento"}
                    {v.motivo_saida && <span> · {v.motivo_saida}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Rev. 2680 — Raio-X READ-ONLY do funcionário terceiro. Abre num clique no card
// (sem passar pelo "Editar") e mostra TODA a documentação consolidada: painel de
// integração (% conformidade, vencidos, a vencer) + seções com links "Ver
// documento" e validades. Não permite upload/edição (pra isso há o botão Editar).
function RaioXTerceiroDialog({ func, empresaNome, companyId, onClose, onEdit }: { func: any; empresaNome: string; companyId?: number; onClose: () => void; onEdit: () => void }) {
  const secoes = getSecoesTerceiro();
  const allExtras: any[] = Array.isArray(func.documentosExtras) ? func.documentosExtras : [];
  const extrasByCategoria = (k: string) => allExtras.filter((d: any) => d.categoria === k);

  const todosObrigatorios = secoes.flatMap(s => s.docs).filter(d => d.obrigatorio);
  const obrigatoriosPreenchidos = todosObrigatorios.filter(d => !!func[d.urlField]);
  const totalDocsFixos = secoes.flatMap(s => s.docs);
  const fixosPreenchidos = totalDocsFixos.filter(d => !!func[d.urlField]);
  const totalDocsCount = totalDocsFixos.length + allExtras.length;
  const totalPreenchidosCount = fixosPreenchidos.length + allExtras.length;
  const pctIntegracao = todosObrigatorios.length > 0 ? Math.round((obrigatoriosPreenchidos.length / todosObrigatorios.length) * 100) : 100;
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidosFixos = totalDocsFixos.filter(d => d.validadeField && func[d.validadeField] && String(func[d.validadeField]).slice(0, 10) < hoje);
  const vencidosExtras = allExtras.filter((d: any) => d.validade && String(d.validade).slice(0, 10) < hoje);
  const vencidos = [
    ...vencidosFixos.map(d => ({ label: d.label })),
    ...vencidosExtras.map((d: any) => ({ label: d.label })),
  ];
  const proxVencimentoFixos = totalDocsFixos
    .filter(d => d.validadeField && func[d.validadeField])
    .map(d => ({ label: d.label, diasRest: Math.ceil((new Date(func[d.validadeField!]).getTime() - Date.now()) / 86400000) }))
    .filter(d => d.diasRest >= 0 && d.diasRest <= 30);
  const proxVencimentoExtras = allExtras
    .filter((d: any) => d.validade)
    .map((d: any) => ({ label: d.label, diasRest: Math.ceil((new Date(d.validade).getTime() - Date.now()) / 86400000) }))
    .filter((d: any) => d.diasRest >= 0 && d.diasRest <= 30);
  const proxVencimento = [...proxVencimentoFixos, ...proxVencimentoExtras].sort((a, b) => a.diasRest - b.diasRest);

  const statusIntegracao = vencidos.length > 0
    ? { label: "Documento Vencido", cor: "from-red-500 to-rose-600", borda: "border-red-300", icone: XCircle }
    : pctIntegracao === 100
      ? { label: "Integrado", cor: "from-emerald-500 to-green-600", borda: "border-emerald-300", icone: CheckCircle }
      : pctIntegracao >= 50
        ? { label: "Integração Parcial", cor: "from-amber-500 to-orange-500", borda: "border-amber-300", icone: Clock }
        : { label: "Não Integrado", cor: "from-slate-400 to-slate-500", borda: "border-slate-300", icone: AlertTriangle };

  return (
    <FullScreenDialog open onClose={onClose} title="Raio-X do Funcionário" headerColor="bg-blue-600">
      <div className="max-w-4xl lg:max-w-6xl mx-auto p-4 lg:px-6 space-y-5">
        {/* Cabeçalho do funcionário */}
        <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
          <PersonPhoto src={func.fotoUrl} alt={func.nome} size="lg" />
          <div className="min-w-0">
            <h3 className="font-bold text-lg leading-tight">{(func.nome || "").toUpperCase()}</h3>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {func.cpf && <span>CPF: {func.cpf}</span>}
              {func.funcao && <span>{func.funcao}</span>}
              {empresaNome && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{empresaNome}</span>}
              {func.obraNome && <span className="flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />{func.obraNome}</span>}
            </div>
          </div>
          <div className="ml-auto shrink-0">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Editar
            </Button>
          </div>
        </div>

        {/* Painel de Status de Integração */}
        <div className={`rounded-xl border-2 ${statusIntegracao.borda} overflow-hidden shadow-sm`}>
          <div className={`bg-gradient-to-r ${statusIntegracao.cor} px-4 py-3 text-white flex items-center justify-between gap-3 flex-wrap`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center shrink-0">
                <statusIntegracao.icone className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider opacity-90 font-semibold">Status de Integração</div>
                <div className="text-base font-bold truncate">{statusIntegracao.label}</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-extrabold leading-none tabular-nums">{pctIntegracao}%</div>
              <div className="text-[11px] opacity-90">{obrigatoriosPreenchidos.length} de {todosObrigatorios.length} obrigatórios</div>
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
              <div className={`h-full bg-gradient-to-r ${statusIntegracao.cor} transition-all`} style={{ width: `${pctIntegracao}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-slate-50 rounded p-2">
                <div className="text-slate-500 uppercase font-semibold tracking-wider">Total docs</div>
                <div className="text-slate-900 font-bold text-base">{totalPreenchidosCount}/{totalDocsCount}</div>
              </div>
              <div className="bg-emerald-50 rounded p-2">
                <div className="text-emerald-600 uppercase font-semibold tracking-wider">Obrigatórios OK</div>
                <div className="text-emerald-900 font-bold text-base">{obrigatoriosPreenchidos.length}/{todosObrigatorios.length}</div>
              </div>
              <div className={`rounded p-2 ${vencidos.length > 0 ? "bg-red-50" : "bg-slate-50"}`}>
                <div className={`uppercase font-semibold tracking-wider ${vencidos.length > 0 ? "text-red-600" : "text-slate-500"}`}>Vencidos</div>
                <div className={`font-bold text-base ${vencidos.length > 0 ? "text-red-900" : "text-slate-900"}`}>{vencidos.length}</div>
              </div>
              <div className={`rounded p-2 ${proxVencimento.length > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
                <div className={`uppercase font-semibold tracking-wider ${proxVencimento.length > 0 ? "text-amber-600" : "text-slate-500"}`}>Vencem ≤30d</div>
                <div className={`font-bold text-base ${proxVencimento.length > 0 ? "text-amber-900" : "text-slate-900"}`}>{proxVencimento.length}</div>
              </div>
            </div>
            {vencidos.length > 0 && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Atenção:</strong> {vencidos.length === 1 ? "1 documento vencido" : `${vencidos.length} documentos vencidos`} — {vencidos.map(v => v.label).join(", ")}
                </div>
              </div>
            )}
            {proxVencimento.length > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex items-start gap-2">
                <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  Próximos vencimentos: {proxVencimento.slice(0, 3).map(v => `${v.label} (em ${v.diasRest}d)`).join(" · ")}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rev. 4529 — Histórico de Vínculos */}
        {companyId && (
          <VinculosHistoricoSection funcId={func.id} companyId={companyId} />
        )}

        {/* Seções de Documentos (somente leitura) */}
        {secoes.map((secao) => {
          const extrasDaSecao = extrasByCategoria(secao.key);
          const fixosOk = secao.docs.filter(d => !!func[d.urlField]).length;
          return (
            <div key={secao.key} className={`rounded-xl border ${secao.corBorda} overflow-hidden`}>
              <div className={`${secao.bgCor} px-4 py-2.5 flex items-center gap-2 border-b ${secao.corBorda}`}>
                <div className={`h-8 w-8 rounded-lg bg-white ring-1 ${secao.corBorda} flex items-center justify-center shrink-0`}>
                  <secao.icone className={`h-4 w-4 ${secao.cor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className={`font-bold text-sm ${secao.cor}`}>{secao.titulo}</h4>
                  <p className="text-[11px] text-slate-600 truncate">{secao.descricao}</p>
                </div>
                <div className="text-[11px] text-slate-500 shrink-0">
                  {fixosOk + extrasDaSecao.length}/{secao.docs.length + extrasDaSecao.length}
                </div>
              </div>
              <div className="divide-y bg-white">
                {secao.docs.map((doc) => {
                  const url = func[doc.urlField];
                  const validade = doc.validadeField ? func[doc.validadeField] : null;
                  const venceEm = validade ? Math.ceil((new Date(validade).getTime() - Date.now()) / 86400000) : null;
                  const vencido = venceEm !== null && venceEm < 0;
                  const proximoVenc = venceEm !== null && venceEm >= 0 && venceEm <= 30;
                  return (
                    <div key={doc.urlField} className="p-3">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {url ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> : doc.obrigatorio ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" /> : <Clock className="h-4 w-4 text-slate-400 shrink-0" />}
                            <h5 className="font-medium text-sm">{doc.label}</h5>
                            {doc.obrigatorio && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Obrigatório</span>}
                            {vencido && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Vencido</span>}
                            {proximoVenc && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Vence em {venceEm}d</span>}
                          </div>
                          {doc.descricao && <p className="text-[11px] text-muted-foreground mt-0.5 ml-6">{doc.descricao}</p>}
                          <div className="ml-6 mt-1">
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                <FileText className="h-3 w-3" /> Ver documento
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">Nenhum documento</span>
                            )}
                          </div>
                        </div>
                        {doc.validadeField && validade && (
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-muted-foreground">Validade</div>
                            <div className={`text-xs font-medium ${vencido ? "text-red-700" : proximoVenc ? "text-amber-700" : "text-slate-700"}`}>
                              {new Date(validade).toLocaleDateString("pt-BR")}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {extrasDaSecao.map((doc: any) => {
                  const venceEm = doc.validade ? Math.ceil((new Date(doc.validade).getTime() - Date.now()) / 86400000) : null;
                  const vencido = venceEm !== null && venceEm < 0;
                  const proximoVenc = venceEm !== null && venceEm >= 0 && venceEm <= 30;
                  return (
                    <div key={doc.id} className="p-3 bg-slate-50/30">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                            <h5 className="font-medium text-sm">{doc.label}</h5>
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">Avulso</span>
                            {vencido && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Vencido</span>}
                            {proximoVenc && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Vence em {venceEm}d</span>}
                          </div>
                          <div className="ml-6 mt-1">
                            <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                              <FileText className="h-3 w-3" /> Ver documento
                            </a>
                          </div>
                        </div>
                        {doc.validade && (
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-muted-foreground">Validade</div>
                            <div className={`text-xs font-medium ${vencido ? "text-red-700" : proximoVenc ? "text-amber-700" : "text-slate-700"}`}>
                              {new Date(doc.validade).toLocaleDateString("pt-BR")}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {secao.docs.every(d => !func[d.urlField]) && extrasDaSecao.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground text-center">Nenhum documento nesta seção</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </FullScreenDialog>
  );
}

export default function FuncionariosTerceiros() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [search, setSearch] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const [filterAptidao, setFilterAptidao] = useState<string>("all");
  const [filterObra, setFilterObra] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"ativo" | "desligado" | "all">("ativo");
  // Rev. 4529 — Encerrar vínculo
  const [encerrarId, setEncerrarId] = useState<number | null>(null);
  const [encerrarData, setEncerrarData] = useState("");
  const [encerrarMotivo, setEncerrarMotivo] = useState("");
  // Rev. 4529 — Reativar
  const [reativarFunc, setReativarFunc] = useState<any | null>(null);
  const [reativarObraId, setReativarObraId] = useState<number | null>(null);
  const [reativarObraNome, setReativarObraNome] = useState<string | null>(null);
  const [reativarData, setReativarData] = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewFunc, setViewFunc] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"dados" | "documentos" | "dds">("dados");
  // Rev. 2004 — Form de novo DDS
  const [ddsForm, setDdsForm] = useState<any>({ dataDds: new Date().toISOString().slice(0, 10) });
  const [ddsListaPayload, setDdsListaPayload] = useState<{ base64: string; fileName: string; contentType: string } | null>(null);
  const [form, setForm] = useState<any>({});
  // Rev. 2300 — múltipla seleção + bulk update de status (apto/inapto/pendente).
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Rev. 1998 — foto preview no momento do cadastro (antes de existir id no banco)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoPayload, setFotoPayload] = useState<{ base64: string; fileName: string; contentType: string } | null>(null);

  const { data: funcionarios = [], refetch } = trpc.terceiros.funcionarios.list.useQuery(
    { companyId: companyId ?? 0, empresaTerceiraId: filterEmpresa !== "all" ? parseInt(filterEmpresa) : undefined },
    { enabled: !!companyId }
  );
  const { data: empresas = [] } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const { data: obras = [] } = trpc.obras.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  // Rev. 2493 — Catálogo de funções (jobFunctions) pra o FuncaoCombobox.
  // Pedido user (image_1779887618252+, 27/05/2026): a função do terceiro
  // DEVE vir do mesmo cadastro que os colaboradores usam (/funcoes), não
  // pode ser texto livre (evita "ENCARREGADO DE OBRAS" vs "Encarregado de
  // Obras" vs "Encarregado Obras" — quebrava agrupamento em Painel RH,
  // Distribuição por Função, mapeamento de EPI/NR-1, etc).
  const { data: funcoesList = [] } = trpc.jobFunctions.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  // Rev. 2494 — onError adicionado nas 2 mutations: o bug de "clicar
  // Atualizar e nada acontecer" (image_1779887735657) era falha silenciosa
  // da validação Zod no backend. Agora qualquer erro vira toast visível.
  const createMut = trpc.terceiros.funcionarios.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("Funcionário cadastrado!"); },
    onError: (e) => toast.error(`Erro ao cadastrar: ${e.message}`),
  });
  const updateMut = trpc.terceiros.funcionarios.update.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); toast.success("Funcionário atualizado!"); },
    onError: (e) => toast.error(`Erro ao atualizar: ${e.message}`),
  });
  // Rev. 2300 — bulk update silencioso (sem toast/refetch por item — usado pela barra de ações múltipla).
  const bulkUpdateMut = trpc.terceiros.funcionarios.update.useMutation();
  const deleteMut = trpc.terceiros.funcionarios.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Funcionário excluído!"); } });
  const uploadMut = trpc.terceiros.funcionarios.uploadDoc.useMutation({
    onSuccess: (data: any, vars: any) => {
      setForm((f: any) => ({ ...f, [vars.field]: data.url }));
      refetch();
      toast.success("Documento enviado!");
    },
    onError: (e: any) => toast.error("Erro ao enviar documento: " + (e?.message || "Falha no upload")),
  });
  // Rev. 2031 — Documentos avulsos por categoria
  // Rev. 2031 (hotfix) — ref pra evitar vazamento de extras entre funcionários:
  // se o usuário trocar de funcionário antes do callback voltar, NÃO aplicamos
  // o setForm (o refetch já garante a hidratação correta na próxima abertura).
  const editingIdRef = useRef<number | null>(null);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  const addDocExtraMut = trpc.terceiros.funcionarios.addDocExtra.useMutation({
    onSuccess: (res: any, vars: any) => {
      refetch();
      if (editingIdRef.current === vars.funcTerceiroId) {
        setForm((f: any) => ({ ...f, documentosExtras: [...(Array.isArray(f.documentosExtras) ? f.documentosExtras : []), res.doc] }));
      }
      toast.success("Documento adicionado!");
      setExtraModal(null);
      setExtraLabel("");
      setExtraValidade("");
      setExtraFile(null);
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao adicionar documento"),
  });
  const removeDocExtraMut = trpc.terceiros.funcionarios.removeDocExtra.useMutation({
    onSuccess: (_r: any, vars: any) => {
      refetch();
      if (editingIdRef.current === vars.funcTerceiroId) {
        setForm((f: any) => ({ ...f, documentosExtras: (Array.isArray(f.documentosExtras) ? f.documentosExtras : []).filter((d: any) => d.id !== vars.docId) }));
      }
      toast.success("Documento removido");
    },
  });
  const updateDocExtraValidadeMut = trpc.terceiros.funcionarios.updateDocExtraValidade.useMutation({
    onSuccess: () => { refetch(); },
  });
  // Rev. 4529 — mutations de vínculo
  const encerrarMut = (trpc as any).terceiros.funcionarios.encerrarVinculo.useMutation({
    onSuccess: () => { refetch(); setEncerrarId(null); setEncerrarData(""); setEncerrarMotivo(""); toast.success("Vínculo encerrado. Histórico preservado."); },
    onError: (e: any) => toast.error("Erro ao encerrar: " + e.message),
  });
  const reativarMut = (trpc as any).terceiros.funcionarios.reativar.useMutation({
    onSuccess: () => { refetch(); setReativarFunc(null); toast.success("Funcionário reativado!"); },
    onError: (e: any) => toast.error("Erro ao reativar: " + e.message),
  });

  const [extraModal, setExtraModal] = useState<{ categoria: string; categoriaLabel: string } | null>(null);
  const [extraLabel, setExtraLabel] = useState("");
  const [extraValidade, setExtraValidade] = useState("");
  const [extraFile, setExtraFile] = useState<{ base64: string; fileName: string; contentType: string } | null>(null);

  const handlePickExtraFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    // Rev. 2167 — mesmo tratamento de imagem grande do handleUpload.
    input.accept = ".pdf,.jpg,.jpeg,.png,.heic,.heif,image/*,application/pdf";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        toast.error("Arquivo muito grande (máx 25MB).");
        return;
      }
      try {
        const compressed = await compressImageIfNeeded(file);
        setExtraFile({ base64: compressed.base64, fileName: compressed.fileName, contentType: compressed.contentType });
      } catch (err: any) {
        toast.error(err?.message || "Não foi possível processar o arquivo.");
      }
    };
    input.click();
  };

  const handleSalvarExtra = () => {
    if (!editingId || !extraModal) return;
    if (!extraLabel.trim()) { toast.error("Dê um nome ao documento"); return; }
    if (!extraFile) { toast.error("Selecione o arquivo"); return; }
    addDocExtraMut.mutate({
      funcTerceiroId: editingId,
      categoria: extraModal.categoria,
      label: extraLabel.trim(),
      validade: extraValidade || null,
      fileName: extraFile.fileName,
      fileBase64: extraFile.base64,
      contentType: extraFile.contentType,
    });
  };

  const filtered = useMemo(() => {
    let list = funcionarios;
    if (filterStatus !== "all") list = list.filter((f: any) => (f.status || "ativo") === filterStatus);
    if (filterAptidao !== "all") list = list.filter((f: any) => f.statusAptidao === filterAptidao);
    if (filterObra !== "all") list = list.filter((f: any) => String(f.obraId ?? "") === filterObra || f.obraNome === filterObra);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((f: any) =>
        f.nome?.toLowerCase().includes(s) ||
        f.cpf?.includes(s) ||
        f.funcao?.toLowerCase().includes(s)
      );
    }
    // Rev. 2495 — Padronização: lista SEMPRE em ordem alfabética por nome
    // (pt-BR, acento-insensitive, case-insensitive). Cria cópia antes do
    // sort pra não mutar o array da query.
    return [...list].sort((a: any, b: any) =>
      (a.nome || "").trim().localeCompare((b.nome || "").trim(), "pt-BR", { sensitivity: "base" })
    );
  }, [funcionarios, search, filterAptidao, filterObra, filterStatus]);

  // Rev. 2300 — múltipla seleção + bulk update.
  const filteredIds = filtered.map((f: any) => f.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id: number) => selectedIds.has(id));
  function toggleSelect(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (allFilteredSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredIds));
  }
  async function bulkSetStatus(novoStatus: "apto" | "inapto" | "pendente") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const labelMap = { apto: "Apto", inapto: "Inapto", pendente: "Pendente" };
    if (!confirm(`Alterar ${ids.length} funcionário(s) para "${labelMap[novoStatus]}"?`)) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        ids.map(id => bulkUpdateMut.mutateAsync({ id, statusAptidao: novoStatus } as any))
      );
      const ok = results.filter(r => r.status === "fulfilled").length;
      const fail = results.length - ok;
      if (fail === 0) toast.success(`${ok} funcionário(s) atualizado(s) para "${labelMap[novoStatus]}".`);
      else toast.warning(`${ok} atualizado(s), ${fail} falharam.`);
      setSelectedIds(new Set());
      refetch();
    } finally {
      setBulkBusy(false);
    }
  }

  const openNew = () => {
    setForm({ companyId: companyId ?? 0 });
    setEditingId(null);
    setActiveTab("dados");
    setFotoPreview(null);
    setFotoPayload(null);
    setShowForm(true);
  };

  const openEdit = (func: any) => {
    setForm({ ...func });
    setEditingId(func.id);
    setActiveTab("dados");
    setFotoPreview(func.fotoUrl || null);
    setFotoPayload(null);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.nome || !form.empresaTerceiraId) { toast.error("Nome e Empresa são obrigatórios"); return; }
    if (editingId) {
      updateMut.mutate({ id: editingId, ...form });
    } else {
      createMut.mutate({
        ...form,
        ...(fotoPayload ? {
          fotoBase64: fotoPayload.base64,
          fotoFileName: fotoPayload.fileName,
          fotoContentType: fotoPayload.contentType,
        } : {}),
      });
    }
  };

  // Rev. 1998 — captura foto do funcionário (antes do cadastro)
  const handlePickFotoNovo = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast.error("Foto muito grande (máx 5MB)"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setFotoPreview(dataUrl);
        setFotoPayload({
          base64: dataUrl.split(",")[1] || "",
          fileName: file.name,
          contentType: file.type || "image/jpeg",
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // Rev. 1998 — troca foto no modo edição (faz upload imediato via uploadDoc)
  const handlePickFotoEdit = () => {
    if (!editingId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast.error("Foto muito grande (máx 5MB)"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setFotoPreview(dataUrl);
        const base64 = dataUrl.split(",")[1] || "";
        uploadMut.mutate(
          { funcTerceiroId: editingId, field: "fotoUrl", fileName: file.name, fileBase64: base64, contentType: file.type || "image/jpeg" },
          {
            // Preserva onSuccess global (refetch + toast) e ainda atualiza estado local
            onSuccess: (r: any) => {
              setForm((f: any) => ({ ...f, fotoUrl: r?.url || f.fotoUrl }));
              refetch();
              toast.success("Foto atualizada!");
            },
          }
        );
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleUpload = (field: string, funcId: number) => {
    const input = document.createElement("input");
    input.type = "file";
    // Rev. 2167 — aceita HEIC/HEIF do iPad também; compressImageIfNeeded
    // re-encoda pra JPEG client-side antes de subir.
    input.accept = ".pdf,.jpg,.jpeg,.png,.heic,.heif,image/*,application/pdf";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Hard cap subiu pra 25MB (foto crua de iPad cabe; PDF grande continua bloqueado).
      if (file.size > 25 * 1024 * 1024) {
        toast.error("Arquivo muito grande (máx 25MB).");
        return;
      }
      try {
        const compressed = await compressImageIfNeeded(file);
        uploadMut.mutate({
          funcTerceiroId: funcId,
          field,
          fileName: compressed.fileName,
          fileBase64: compressed.base64,
          contentType: compressed.contentType,
        });
      } catch (err: any) {
        toast.error(err?.message || "Não foi possível processar o arquivo.");
      }
    };
    input.click();
  };

  const aptidaoBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      apto: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle, label: "Apto" },
      inapto: { bg: "bg-red-100", text: "text-red-700", icon: XCircle, label: "Inapto" },
      pendente: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock, label: "Pendente" },
    };
    const s = map[status] || map.pendente;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        <s.icon className="h-3 w-3" />{s.label}
      </span>
    );
  };

  const getEmpresaNome = (empresaId: number) => {
    const emp = empresas.find((e: any) => e.id === empresaId);
    return emp ? (emp as any).nomeFantasia || (emp as any).razaoSocial : "—";
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Funcionários Terceiros</h1>
              <p className="text-sm text-muted-foreground">{funcionarios.length} funcionário(s)</p>
            </div>
          </div>
          <DraggableCommandBar barId="funcionarios-terceiros" items={[
            { id: "novo", node: <Button onClick={openNew} className="bg-orange-500 hover:bg-orange-600"><Plus className="h-4 w-4 mr-1" /> Novo Funcionário</Button> },
          ]} />
        </div>

        {/* Rev. 4529 — Status toggle: Ativos / Desligados / Todos */}
        <div className="flex gap-1 rounded-lg border border-gray-200 p-1 bg-gray-50 self-start">
          {([
            { v: "ativo",     label: "Ativos",     color: "bg-emerald-600 text-white", cnt: funcionarios.filter((f: any) => (f.status || "ativo") === "ativo").length },
            { v: "desligado", label: "Desligados",  color: "bg-red-600 text-white",     cnt: funcionarios.filter((f: any) => f.status === "desligado").length },
            { v: "all",       label: "Todos",       color: "bg-slate-700 text-white",   cnt: funcionarios.length },
          ] as { v: "ativo" | "desligado" | "all"; label: string; color: string; cnt: number }[]).map(({ v, label, color, cnt }) => (
            <button key={v} type="button"
              onClick={() => setFilterStatus(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${filterStatus === v ? color : "text-gray-500 hover:text-gray-700"}`}>
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filterStatus === v ? "bg-white/20" : "bg-gray-200 text-gray-600"}`}>{cnt}</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou função..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Empresas</SelectItem>
              {empresas.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeFantasia || e.razaoSocial}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterObra} onValueChange={setFilterObra}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Obras</SelectItem>
              {(obras as any[]).map((o: any) => (
                <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAptidao} onValueChange={setFilterAptidao}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Aptidão" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="apto">Aptos</SelectItem>
              <SelectItem value="inapto">Inaptos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-emerald-600">{funcionarios.filter((f: any) => f.statusAptidao === "apto").length}</span>
            <p className="text-xs text-emerald-700">Aptos</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-red-600">{funcionarios.filter((f: any) => f.statusAptidao === "inapto").length}</span>
            <p className="text-xs text-red-700">Inaptos</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-amber-600">{funcionarios.filter((f: any) => f.statusAptidao === "pendente").length}</span>
            <p className="text-xs text-amber-700">Pendentes</p>
          </div>
        </div>

        {/* Rev. 2300 — Barra de ações múltipla (aparece quando há seleção) */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 sticky top-2 z-10">
            <span className="text-sm font-semibold text-blue-800">{selectedIds.size} selecionado(s)</span>
            <span className="text-xs text-blue-600">— alterar status para:</span>
            <Button size="sm" variant="outline" className="gap-1.5 bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50" disabled={bulkBusy} onClick={() => bulkSetStatus("apto")}>
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />} Apto
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 bg-white border-red-300 text-red-700 hover:bg-red-50" disabled={bulkBusy} onClick={() => bulkSetStatus("inapto")}>
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Inapto
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 bg-white border-amber-300 text-amber-700 hover:bg-amber-50" disabled={bulkBusy} onClick={() => bulkSetStatus("pendente")}>
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />} Pendente
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-blue-700" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpar seleção
            </Button>
          </div>
        )}

        {/* Rev. 2300 — Cabeçalho "selecionar todos os filtrados" */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-1.5">
            <Checkbox
              checked={allFilteredSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Selecionar todos os funcionários filtrados"
            />
            <span className="text-xs text-muted-foreground">
              {allFilteredSelected ? `Todos os ${filtered.length} selecionados` : `Selecionar todos (${filtered.length})`}
            </span>
          </div>
        )}

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum funcionário terceiro encontrado</p>
            </div>
          ) : (
            filtered.map((func: any) => (
              <div key={func.id} className={`bg-card rounded-xl border p-4 hover:shadow-sm transition-shadow ${selectedIds.has(func.id) ? "ring-2 ring-blue-400 border-blue-300" : ""}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Rev. 1998 — Avatar + número interno pra identificação visual rápida */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Rev. 2300 — checkbox de seleção múltipla */}
                    <Checkbox
                      checked={selectedIds.has(func.id)}
                      onCheckedChange={() => toggleSelect(func.id)}
                      aria-label={`Selecionar ${func.nome}`}
                    />
                    {/* Rev. 2297 — foto clicável (lightbox global) */}
                    <PersonPhoto
                      src={func.fotoUrl}
                      alt={func.nome}
                      size="lg"
                      caption={[func.cpf && `CPF: ${func.cpf}`, func.funcao, func.obraNome].filter(Boolean).join(" · ") || undefined}
                    />
                    {/* Rev. 2680 — bloco de identificação clicável: abre o Raio-X
                        read-only (toda a documentação) sem passar pelo "Editar". */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer group"
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewFunc(func)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewFunc(func); } }}
                      title="Ver Raio-X completo (documentação)"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Rev. 2495 — Padronização: nome SEMPRE renderizado em
                            MAIÚSCULAS (cobre registros legados gravados antes
                            da normalização do backend). */}
                        <h3 className="font-semibold text-foreground group-hover:text-blue-700 group-hover:underline">{(func.nome || "").toUpperCase()}</h3>
                        {func.numeroInterno && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200" title="Número interno do funcionário">
                            <BadgeCheck className="h-3 w-3" />{func.numeroInterno}
                          </span>
                        )}
                        {aptidaoBadge(func.statusAptidao)}
                        {(func.status || "ativo") === "desligado" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                            <LogOut className="h-2.5 w-2.5" /> Desligado
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {func.cpf && <span>CPF: {func.cpf}</span>}
                        {func.funcao && <span>| {func.funcao}</span>}
                        <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{getEmpresaNome(func.empresaTerceiraId)}</span>
                        {func.obraNome && <span className="flex items-center gap-0.5"><HardHat className="h-3 w-3" />{func.obraNome}</span>}
                      </div>
                      {(func.status || "ativo") === "desligado" && func.data_saida && (
                        <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-red-600">
                          <span>Saída: {func.data_saida?.slice?.(0,10)?.split?.("-")?.reverse?.()?.join?.("/") || func.data_saida}</span>
                          {func.motivo_saida && <span>· {func.motivo_saida}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    <Button size="sm" variant="outline" className="text-blue-700 border-blue-300 hover:bg-blue-50" onClick={() => setViewFunc(func)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Raio-X
                    </Button>
                    {(func.status || "ativo") === "ativo" ? (<>
                      <Button size="sm" variant="outline" onClick={() => openEdit(func)}>
                        <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50"
                        onClick={() => { setEncerrarId(func.id); setEncerrarData(new Date().toISOString().slice(0, 10)); setEncerrarMotivo(""); }}>
                        <LogOut className="h-3.5 w-3.5 mr-1" /> Encerrar
                      </Button>
                    </>) : (
                      <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                        onClick={() => { setReativarFunc(func); setReativarObraId(func.obraId ?? null); setReativarObraNome(func.obraNome ?? null); setReativarData(new Date().toISOString().slice(0, 10)); }}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reativar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => {
                      if (confirm("Excluir este funcionário?")) deleteMut.mutate({ id: func.id });
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Rev. 4529 — Dialog Encerrar Vínculo */}
      {encerrarId !== null && (
        <Dialog open onOpenChange={() => setEncerrarId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700"><LogOut className="h-4 w-4" /> Encerrar Vínculo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">O funcionário será marcado como <strong>Desligado</strong> e removido do quadro ativo. O histórico de documentos e vínculos ficará preservado.</p>
              <div>
                <Label>Data de saída <span className="text-red-500">*</span></Label>
                <Input type="date" value={encerrarData} onChange={e => setEncerrarData(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Motivo <span className="text-red-500">*</span></Label>
                <Select value={encerrarMotivo} onValueChange={setEncerrarMotivo}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Contrato encerrado">Contrato encerrado</SelectItem>
                    <SelectItem value="Obra concluída">Obra concluída</SelectItem>
                    <SelectItem value="Demissão">Demissão</SelectItem>
                    <SelectItem value="Transferência">Transferência para outra obra</SelectItem>
                    <SelectItem value="Desistência">Desistência do trabalhador</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEncerrarId(null)}>Cancelar</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!encerrarData || !encerrarMotivo || encerrarMut.isPending}
                onClick={() => { if (!companyId) return; encerrarMut.mutate({ id: encerrarId!, companyId, dataSaida: encerrarData, motivoSaida: encerrarMotivo }); }}>
                {encerrarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <LogOut className="h-4 w-4 mr-1" />} Encerrar Vínculo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Rev. 4529 — Dialog Reativar */}
      {reativarFunc && (
        <Dialog open onOpenChange={() => setReativarFunc(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700"><RefreshCw className="h-4 w-4" /> Reativar Funcionário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground"><strong>{reativarFunc.nome}</strong> voltará ao quadro ativo. Um novo registro de vínculo será criado no histórico.</p>
              <div>
                <Label>Data de entrada <span className="text-red-500">*</span></Label>
                <Input type="date" value={reativarData} onChange={e => setReativarData(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Obra (opcional)</Label>
                <Select value={reativarObraId ? String(reativarObraId) : "none"}
                  onValueChange={v => { if (v === "none") { setReativarObraId(null); setReativarObraNome(null); return; } const o = (obras as any[]).find((x: any) => String(x.id) === v); setReativarObraId(o?.id ?? null); setReativarObraNome(o?.nome ?? null); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem obra vinculada —</SelectItem>
                    {(obras as any[]).map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReativarFunc(null)}>Cancelar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!reativarData || reativarMut.isPending}
                onClick={() => { if (!companyId) return; reativarMut.mutate({ id: reativarFunc.id, companyId, obraId: reativarObraId, obraNome: reativarObraNome, dataEntrada: reativarData }); }}>
                {reativarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />} Reativar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Form Dialog */}
      {showForm && (
        <FullScreenDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          title={editingId ? "Editar Funcionário Terceiro" : "Novo Funcionário Terceiro"}
          headerColor="bg-orange-500"
        >
          <div className="max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto p-4 lg:px-6 space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b pb-2">
              {(["dados", "documentos", "dds"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? "bg-orange-500 text-white" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {tab === "dados" ? "Dados Pessoais" : tab === "documentos" ? "Documentos" : "DDS"}
                </button>
              ))}
            </div>

            {activeTab === "dados" && (
              <div className="space-y-4">
                {/* Rev. 1998 — Hero com Foto + Número Interno */}
                <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 p-4 flex items-center gap-4">
                  <div className="relative group">
                    <div className="h-24 w-24 rounded-full overflow-hidden bg-white ring-4 ring-white shadow-md flex items-center justify-center">
                      {fotoPreview ? (
                        <img src={fotoPreview} alt="Foto" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="h-8 w-8 text-blue-300" />
                      )}
                    </div>
                    {fotoPreview && (
                      <button
                        type="button"
                        title="Remover foto"
                        onClick={() => { setFotoPreview(null); setFotoPayload(null); if (editingId) { setForm((f: any) => ({ ...f, fotoUrl: null })); updateMut.mutate({ id: editingId, fotoUrl: null } as any); } }}
                        className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-500 text-white shadow-md flex items-center justify-center hover:bg-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-blue-900">Foto do funcionário</h3>
                      {editingId && form.numeroInterno && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                          <BadgeCheck className="h-3 w-3" />{form.numeroInterno}
                        </span>
                      )}
                      {!editingId && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          Nº interno será gerado ao salvar
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-blue-700/80 mt-1">JPG/PNG até 5MB. Facilita a identificação rápida no app e nos crachás.</p>
                    <Button type="button" size="sm" variant="outline" className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-100" onClick={editingId ? handlePickFotoEdit : handlePickFotoNovo}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> {fotoPreview ? "Trocar foto" : "Selecionar foto"}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <div>
                    <Label>Empresa Terceira *</Label>
                    <Select value={form.empresaTerceiraId ? String(form.empresaTerceiraId) : ""} onValueChange={(v) => setForm({ ...form, empresaTerceiraId: parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                      <SelectContent>
                        {empresas.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeFantasia || e.razaoSocial}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Rev. 2495 — Padronização: nome digita-se em qualquer
                      caso mas é gravado/exibido SEMPRE em MAIÚSCULAS. */}
                  <div><Label>Nome Completo *</Label><Input value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value.toUpperCase() })} style={{ textTransform: "uppercase" }} /></div>
                  <div><Label>CPF</Label><Input value={form.cpf || ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
                  <div><Label>RG</Label><Input value={form.rg || ""} onChange={(e) => setForm({ ...form, rg: e.target.value })} /></div>
                  <div><Label>Data de Nascimento</Label><Input type="date" value={form.dataNascimento ? String(form.dataNascimento).slice(0, 10) : ""} onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })} /></div>
                  {/* Rev. 2493 — Função vinculada ao catálogo `jobFunctions`
                      (mesma usada em Colaboradores) ao invés de texto livre. */}
                  <div>
                    <Label>Função</Label>
                    <FuncaoCombobox
                      value={form.funcao || ""}
                      onChange={(v) => setForm({ ...form, funcao: v })}
                      options={(funcoesList ?? []).filter((f: any) => f.isActive !== false)}
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-3 xl:col-span-4">
                    <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50/70 to-teal-50/40 p-3 sm:p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 ring-1 ring-emerald-200">
                          <Phone className="h-3.5 w-3.5 text-emerald-700" />
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-emerald-900">Contato & Endereço Residencial</div>
                          <div className="text-[11px] text-emerald-700/80">Importante p/ logística (transporte/vale-transporte), comunicação rápida e relatórios de origem dos terceiros.</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                        <div className="lg:col-span-2"><Label>Telefone <span className="text-red-500">*</span></Label><Input placeholder="(11) 99999-9999" value={form.telefone || ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                        <div className="lg:col-span-2"><Label>E-mail</Label><Input type="email" placeholder="nome@exemplo.com" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                        <div><Label>CEP</Label><Input placeholder="00000-000" value={form.cep || ""} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></div>
                        <div className="lg:col-span-3"><Label>Logradouro (Rua/Av.)</Label><Input placeholder="Rua, Avenida, Estrada..." value={form.logradouro || ""} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} /></div>
                        <div><Label>Número</Label><Input placeholder="123" value={form.numeroEndereco || ""} onChange={(e) => setForm({ ...form, numeroEndereco: e.target.value })} /></div>
                        <div className="lg:col-span-2"><Label>Complemento</Label><Input placeholder="Casa, Apto, Bloco..." value={form.complemento || ""} onChange={(e) => setForm({ ...form, complemento: e.target.value })} /></div>
                        <div className="lg:col-span-2"><Label>Bairro</Label><Input value={form.bairro || ""} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></div>
                        <div className="lg:col-span-2"><Label>Cidade</Label><Input value={form.cidade || ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
                        <div><Label>UF</Label><Input maxLength={2} placeholder="SP" value={form.uf || ""} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label>Obra Alocada</Label>
                    <Select value={form.obraId ? String(form.obraId) : "none"} onValueChange={(v) => {
                      if (v === "none") { setForm({ ...form, obraId: null, obraNome: null }); return; }
                      const obra = obras.find((o: any) => o.id === parseInt(v));
                      setForm({ ...form, obraId: parseInt(v), obraNome: obra ? (obra as any).nome : "" });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem alocação</SelectItem>
                        {obras.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {editingId && (
                    <>
                      <div>
                        <Label>Status</Label>
                        <Select value={form.status || form.statusFuncTerceiro || "ativo"} onValueChange={(v) => setForm({ ...form, status: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="inativo">Inativo</SelectItem>
                            <SelectItem value="afastado">Afastado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Aptidão</Label>
                        <Select value={form.statusAptidao || "pendente"} onValueChange={(v) => setForm({ ...form, statusAptidao: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="apto">Apto</SelectItem>
                            <SelectItem value="inapto">Inapto</SelectItem>
                            <SelectItem value="pendente">Pendente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === "documentos" && editingId && (() => {
              // Rev. 2002 — Lista completa de documentos exigidos pra funcionário terceiro
              // + Painel de Integração que calcula % de conformidade em tempo real
              // Rev. 2680 — fonte ÚNICA via getSecoesTerceiro() (compartilhada com o Raio-X read-only).
              const secoes = getSecoesTerceiro();

              // Rev. 2031 — Documentos avulsos por categoria (jsonb)
              const allExtras: any[] = Array.isArray(form.documentosExtras) ? form.documentosExtras : [];
              const extrasByCategoria = (k: string) => allExtras.filter((d: any) => d.categoria === k);

              // Cálculo do status de integração
              const todosObrigatorios = secoes.flatMap(s => s.docs).filter(d => d.obrigatorio);
              const obrigatoriosPreenchidos = todosObrigatorios.filter(d => !!form[d.urlField]);
              const totalDocsFixos = secoes.flatMap(s => s.docs);
              const fixosPreenchidos = totalDocsFixos.filter(d => !!form[d.urlField]);
              const totalDocsCount = totalDocsFixos.length + allExtras.length;
              const totalPreenchidosCount = fixosPreenchidos.length + allExtras.length; // extras só existem se foram upados
              const pctIntegracao = todosObrigatorios.length > 0 ? Math.round((obrigatoriosPreenchidos.length / todosObrigatorios.length) * 100) : 100;
              const hoje = new Date().toISOString().slice(0, 10);
              const vencidosFixos = totalDocsFixos.filter(d => d.validadeField && form[d.validadeField] && form[d.validadeField].slice(0, 10) < hoje);
              const vencidosExtras = allExtras.filter((d: any) => d.validade && d.validade.slice(0, 10) < hoje);
              const vencidos = [
                ...vencidosFixos.map(d => ({ label: d.label })),
                ...vencidosExtras.map((d: any) => ({ label: d.label })),
              ];
              const proxVencimentoFixos = totalDocsFixos
                .filter(d => d.validadeField && form[d.validadeField])
                .map(d => ({ label: d.label, diasRest: Math.ceil((new Date(form[d.validadeField!]).getTime() - Date.now()) / 86400000) }))
                .filter(d => d.diasRest >= 0 && d.diasRest <= 30);
              const proxVencimentoExtras = allExtras
                .filter((d: any) => d.validade)
                .map((d: any) => ({ label: d.label, diasRest: Math.ceil((new Date(d.validade).getTime() - Date.now()) / 86400000) }))
                .filter((d: any) => d.diasRest >= 0 && d.diasRest <= 30);
              const proxVencimento = [...proxVencimentoFixos, ...proxVencimentoExtras].sort((a, b) => a.diasRest - b.diasRest);

              const statusIntegracao = vencidos.length > 0
                ? { label: "Documento Vencido", cor: "from-red-500 to-rose-600", textCor: "text-red-700", bgCor: "bg-red-50", borda: "border-red-300", icone: XCircle }
                : pctIntegracao === 100
                  ? { label: "Integrado", cor: "from-emerald-500 to-green-600", textCor: "text-emerald-700", bgCor: "bg-emerald-50", borda: "border-emerald-300", icone: CheckCircle }
                  : pctIntegracao >= 50
                    ? { label: "Integração Parcial", cor: "from-amber-500 to-orange-500", textCor: "text-amber-700", bgCor: "bg-amber-50", borda: "border-amber-300", icone: Clock }
                    : { label: "Não Integrado", cor: "from-slate-400 to-slate-500", textCor: "text-slate-700", bgCor: "bg-slate-50", borda: "border-slate-300", icone: AlertTriangle };

              return (
                <div className="space-y-5">
                  {/* Painel de Status de Integração */}
                  <div className={`rounded-xl border-2 ${statusIntegracao.borda} overflow-hidden shadow-sm`}>
                    <div className={`bg-gradient-to-r ${statusIntegracao.cor} px-4 py-3 text-white flex items-center justify-between gap-3 flex-wrap`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center shrink-0">
                          <statusIntegracao.icone className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-wider opacity-90 font-semibold">Status de Integração</div>
                          <div className="text-base font-bold truncate">{statusIntegracao.label}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-extrabold leading-none tabular-nums">{pctIntegracao}%</div>
                        <div className="text-[11px] opacity-90">{obrigatoriosPreenchidos.length} de {todosObrigatorios.length} obrigatórios</div>
                      </div>
                    </div>
                    {/* Barra de progresso */}
                    <div className="bg-white px-4 py-3">
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                        <div className={`h-full bg-gradient-to-r ${statusIntegracao.cor} transition-all`} style={{ width: `${pctIntegracao}%` }} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="bg-slate-50 rounded p-2">
                          <div className="text-slate-500 uppercase font-semibold tracking-wider">Total docs</div>
                          <div className="text-slate-900 font-bold text-base">{totalPreenchidosCount}/{totalDocsCount}</div>
                        </div>
                        <div className="bg-emerald-50 rounded p-2">
                          <div className="text-emerald-600 uppercase font-semibold tracking-wider">Obrigatórios OK</div>
                          <div className="text-emerald-900 font-bold text-base">{obrigatoriosPreenchidos.length}/{todosObrigatorios.length}</div>
                        </div>
                        <div className={`rounded p-2 ${vencidos.length > 0 ? "bg-red-50" : "bg-slate-50"}`}>
                          <div className={`uppercase font-semibold tracking-wider ${vencidos.length > 0 ? "text-red-600" : "text-slate-500"}`}>Vencidos</div>
                          <div className={`font-bold text-base ${vencidos.length > 0 ? "text-red-900" : "text-slate-900"}`}>{vencidos.length}</div>
                        </div>
                        <div className={`rounded p-2 ${proxVencimento.length > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
                          <div className={`uppercase font-semibold tracking-wider ${proxVencimento.length > 0 ? "text-amber-600" : "text-slate-500"}`}>Vencem ≤30d</div>
                          <div className={`font-bold text-base ${proxVencimento.length > 0 ? "text-amber-900" : "text-slate-900"}`}>{proxVencimento.length}</div>
                        </div>
                      </div>
                      {/* Alertas */}
                      {vencidos.length > 0 && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-800 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <strong>Atenção:</strong> {vencidos.length === 1 ? "1 documento vencido" : `${vencidos.length} documentos vencidos`} — {vencidos.map(v => v.label).join(", ")}
                          </div>
                        </div>
                      )}
                      {proxVencimento.length > 0 && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex items-start gap-2">
                          <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            Próximos vencimentos: {proxVencimento.slice(0, 3).map(v => `${v.label} (em ${v.diasRest}d)`).join(" · ")}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seções de Documentos */}
                  {secoes.map((secao) => {
                    const extrasDaSecao = extrasByCategoria(secao.key);
                    const fixosOk = secao.docs.filter(d => !!form[d.urlField]).length;
                    return (
                    <div key={secao.titulo} className={`rounded-xl border ${secao.corBorda} overflow-hidden`}>
                      <div className={`${secao.bgCor} px-4 py-2.5 flex items-center gap-2 border-b ${secao.corBorda}`}>
                        <div className={`h-8 w-8 rounded-lg bg-white ring-1 ${secao.corBorda} flex items-center justify-center shrink-0`}>
                          <secao.icone className={`h-4 w-4 ${secao.cor}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className={`font-bold text-sm ${secao.cor}`}>{secao.titulo}</h4>
                          <p className="text-[11px] text-slate-600 truncate">{secao.descricao}</p>
                        </div>
                        <div className="text-[11px] text-slate-500 shrink-0">
                          {fixosOk + extrasDaSecao.length}/{secao.docs.length + extrasDaSecao.length}
                        </div>
                      </div>
                      <div className="divide-y bg-white">
                        {secao.docs.map((doc) => {
                          const url = form[doc.urlField];
                          const validade = doc.validadeField ? form[doc.validadeField] : null;
                          const venceEm = validade ? Math.ceil((new Date(validade).getTime() - Date.now()) / 86400000) : null;
                          const vencido = venceEm !== null && venceEm < 0;
                          const proximoVenc = venceEm !== null && venceEm >= 0 && venceEm <= 30;

                          return (
                            <div key={doc.urlField} className="p-3 hover:bg-slate-50/60">
                              <div className="flex items-start justify-between flex-wrap gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {url ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> : doc.obrigatorio ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" /> : <Clock className="h-4 w-4 text-slate-400 shrink-0" />}
                                    <h5 className="font-medium text-sm">{doc.label}</h5>
                                    {doc.obrigatorio && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Obrigatório</span>}
                                    {vencido && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Vencido</span>}
                                    {proximoVenc && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Vence em {venceEm}d</span>}
                                  </div>
                                  {doc.descricao && <p className="text-[11px] text-muted-foreground mt-0.5 ml-6">{doc.descricao}</p>}
                                  <div className="ml-6 mt-1">
                                    {url ? (
                                      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                        <FileText className="h-3 w-3" /> Ver documento
                                      </a>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">Nenhum documento</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {doc.validadeField && (
                                    <div className="flex flex-col">
                                      <Label className="text-[10px] text-muted-foreground mb-0.5">Validade</Label>
                                      <Input
                                        type="date"
                                        className={`w-36 text-xs h-8 ${vencido ? "border-red-300 bg-red-50" : proximoVenc ? "border-amber-300 bg-amber-50" : ""}`}
                                        value={validade ? String(validade).slice(0, 10) : ""}
                                        onChange={(e) => {
                                          setForm({ ...form, [doc.validadeField!]: e.target.value });
                                          if (editingId) bulkUpdateMut.mutate({ id: editingId, [doc.validadeField!]: e.target.value });
                                        }}
                                      />
                                    </div>
                                  )}
                                  <Button size="sm" variant="outline" className="h-8" onClick={() => handleUpload(doc.urlField, editingId!)}>
                                    <Upload className="h-3.5 w-3.5 mr-1" /> {url ? "Trocar" : "Upload"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Rev. 2031 — Documentos avulsos da categoria */}
                        {extrasDaSecao.map((doc: any) => {
                          const venceEm = doc.validade ? Math.ceil((new Date(doc.validade).getTime() - Date.now()) / 86400000) : null;
                          const vencido = venceEm !== null && venceEm < 0;
                          const proximoVenc = venceEm !== null && venceEm >= 0 && venceEm <= 30;
                          return (
                            <div key={doc.id} className="p-3 hover:bg-slate-50/60 bg-slate-50/30">
                              <div className="flex items-start justify-between flex-wrap gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                                    <h5 className="font-medium text-sm">{doc.label}</h5>
                                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">Avulso</span>
                                    {vencido && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Vencido</span>}
                                    {proximoVenc && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Vence em {venceEm}d</span>}
                                  </div>
                                  <div className="ml-6 mt-1">
                                    <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                      <FileText className="h-3 w-3" /> Ver documento
                                    </a>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="flex flex-col">
                                    <Label className="text-[10px] text-muted-foreground mb-0.5">Validade</Label>
                                    <Input
                                      type="date"
                                      className={`w-36 text-xs h-8 ${vencido ? "border-red-300 bg-red-50" : proximoVenc ? "border-amber-300 bg-amber-50" : ""}`}
                                      value={doc.validade ? String(doc.validade).slice(0, 10) : ""}
                                      onChange={(e) => {
                                        const novaValidade = e.target.value || null;
                                        setForm((f: any) => ({
                                          ...f,
                                          documentosExtras: (Array.isArray(f.documentosExtras) ? f.documentosExtras : []).map((x: any) => x.id === doc.id ? { ...x, validade: novaValidade } : x),
                                        }));
                                        if (editingId) updateDocExtraValidadeMut.mutate({ funcTerceiroId: editingId, docId: doc.id, validade: novaValidade });
                                      }}
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => {
                                      if (!editingId) return;
                                      if (!confirm(`Remover "${doc.label}"?`)) return;
                                      removeDocExtraMut.mutate({ funcTerceiroId: editingId, docId: doc.id });
                                    }}
                                    title="Remover documento"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Botão Adicionar documento avulso na categoria */}
                        <div className="p-2 bg-slate-50/40">
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`w-full h-9 border border-dashed ${secao.corBorda} ${secao.cor} hover:bg-slate-100`}
                            onClick={() => {
                              setExtraLabel("");
                              setExtraValidade("");
                              setExtraFile(null);
                              setExtraModal({ categoria: secao.key, categoriaLabel: secao.titulo });
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar documento
                          </Button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              );
            })()}
            {activeTab === "documentos" && !editingId && (
              <p className="text-sm text-muted-foreground text-center py-8">Salve o funcionário primeiro para gerenciar documentos.</p>
            )}

            {activeTab === "dds" && !editingId && (
              <p className="text-sm text-muted-foreground text-center py-8">Salve o funcionário primeiro para registrar participações em DDS.</p>
            )}

            {activeTab === "dds" && editingId && (
              <DdsTabContent
                companyId={companyId!}
                funcTerceiroId={editingId}
                obras={obras}
                form={ddsForm}
                setForm={setDdsForm}
                listaPayload={ddsListaPayload}
                setListaPayload={setDdsListaPayload}
              />
            )}

            {/* Save Button */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      )}

      {/* Rev. 2680 — Raio-X read-only (abre num clique no card/nome ou no botão "Raio-X") */}
      {viewFunc && (
        <RaioXTerceiroDialog
          func={viewFunc}
          empresaNome={getEmpresaNome(viewFunc.empresaTerceiraId)}
          companyId={companyId}
          onClose={() => setViewFunc(null)}
          onEdit={() => { const f = viewFunc; setViewFunc(null); openEdit(f); }}
        />
      )}

      {/* Rev. 2031 — Modal "Adicionar documento" avulso */}
      <Dialog open={!!extraModal} onOpenChange={(o) => { if (!o) setExtraModal(null); }}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 text-white">
            <DialogTitle className="text-white flex items-center gap-2">
              <Plus className="h-5 w-5" /> Adicionar documento
            </DialogTitle>
            <DialogDescription className="text-slate-200 text-xs">
              {extraModal ? `Categoria: ${extraModal.categoriaLabel}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5 space-y-4">
            <div>
              <Label className="text-xs">Nome do documento *</Label>
              <Input
                value={extraLabel}
                onChange={(e) => setExtraLabel(e.target.value)}
                placeholder="Ex: Carteira de Vacinação, ASO 2024..."
                className="h-10 mt-1"
                autoFocus
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-xs">Validade (opcional)</Label>
              <Input
                type="date"
                value={extraValidade}
                onChange={(e) => setExtraValidade(e.target.value)}
                className="h-10 mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Deixe vazio se o documento não vence</p>
            </div>
            <div>
              <Label className="text-xs">Arquivo *</Label>
              <div className="mt-1 flex items-center gap-2">
                <Button type="button" variant="outline" onClick={handlePickExtraFile} className="h-10">
                  <Upload className="h-4 w-4 mr-2" /> {extraFile ? "Trocar arquivo" : "Selecionar arquivo"}
                </Button>
                {extraFile && (
                  <span className="text-xs text-emerald-700 flex items-center gap-1 min-w-0">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">{extraFile.fileName}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">PDF, JPG ou PNG (máx 10MB)</p>
            </div>
          </div>
          <DialogFooter className="bg-slate-50 px-5 py-3 border-t">
            <Button variant="outline" onClick={() => setExtraModal(null)} disabled={addDocExtraMut.isPending}>Cancelar</Button>
            <Button
              onClick={handleSalvarExtra}
              disabled={addDocExtraMut.isPending || !extraLabel.trim() || !extraFile}
              className="bg-slate-800 hover:bg-slate-900 text-white"
            >
              {addDocExtraMut.isPending ? "Enviando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// Rev. 2004 — Aba DDS isolada (própria query/mutations pra não interferir com restante)
function DdsTabContent({ companyId, funcTerceiroId, obras, form, setForm, listaPayload, setListaPayload }: any) {
  const utils = trpc.useUtils();
  const { data: ddsList = [], refetch } = trpc.terceiros.dds.list.useQuery(
    { companyId, funcTerceiroId },
    { enabled: !!companyId && !!funcTerceiroId }
  );
  const createMut = trpc.terceiros.dds.create.useMutation({
    onSuccess: () => {
      refetch();
      setForm({ dataDds: new Date().toISOString().slice(0, 10) });
      setListaPayload(null);
      toast.success("DDS registrado!");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao registrar DDS"),
  });
  const deleteMut = trpc.terceiros.dds.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Registro removido"); },
  });

  const handlePickLista = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1] || "";
        setListaPayload({ base64, fileName: file.name, contentType: file.type || "application/pdf" });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleSubmit = () => {
    if (!form.dataDds || !form.tema?.trim()) {
      toast.error("Data e Tema são obrigatórios");
      return;
    }
    createMut.mutate({
      companyId,
      funcTerceiroId,
      dataDds: form.dataDds,
      tema: form.tema,
      instrutor: form.instrutor || undefined,
      obraId: form.obraId ? Number(form.obraId) : undefined,
      obraNome: form.obraId ? (obras.find((o: any) => o.id === Number(form.obraId))?.nome) : undefined,
      observacoes: form.observacoes || undefined,
      ...(listaPayload ? {
        listaPresencaBase64: listaPayload.base64,
        listaPresencaFileName: listaPayload.fileName,
        listaPresencaContentType: listaPayload.contentType,
      } : {}),
    });
  };

  // KPIs
  const hoje = new Date();
  const trintaDiasAtras = new Date(hoje.getTime() - 30 * 86400000);
  const sessentaDiasAtras = new Date(hoje.getTime() - 60 * 86400000);
  const ultimos30 = ddsList.filter((d: any) => new Date(d.dataDds) >= trintaDiasAtras).length;
  const ultimos60 = ddsList.filter((d: any) => new Date(d.dataDds) >= sessentaDiasAtras).length;
  const ultimoDds = ddsList[0];
  const diasDesdeUltimo = ultimoDds ? Math.ceil((hoje.getTime() - new Date(ultimoDds.dataDds).getTime()) / 86400000) : null;
  const statusFreq = diasDesdeUltimo === null
    ? { label: "Sem registros", cor: "from-slate-400 to-slate-500", bgCor: "bg-slate-50", borda: "border-slate-300", icone: AlertTriangle }
    : diasDesdeUltimo <= 7
      ? { label: "Em dia", cor: "from-emerald-500 to-green-600", bgCor: "bg-emerald-50", borda: "border-emerald-300", icone: CheckCircle }
      : diasDesdeUltimo <= 30
        ? { label: "Atenção", cor: "from-amber-500 to-orange-500", bgCor: "bg-amber-50", borda: "border-amber-300", icone: Clock }
        : { label: "Atrasado", cor: "from-red-500 to-rose-600", bgCor: "bg-red-50", borda: "border-red-300", icone: AlertTriangle };

  return (
    <div className="space-y-5">
      {/* Painel de status de frequência */}
      <div className={`rounded-xl border-2 ${statusFreq.borda} overflow-hidden shadow-sm`}>
        <div className={`bg-gradient-to-r ${statusFreq.cor} px-4 py-3 text-white flex items-center justify-between gap-3 flex-wrap`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center shrink-0">
              <statusFreq.icone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider opacity-90 font-semibold">Frequência em DDS</div>
              <div className="text-base font-bold truncate">{statusFreq.label}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-extrabold leading-none tabular-nums">{ddsList.length}</div>
            <div className="text-[11px] opacity-90">{ddsList.length === 1 ? "participação total" : "participações totais"}</div>
          </div>
        </div>
        <div className="bg-white px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="bg-emerald-50 rounded p-2">
            <div className="text-emerald-600 uppercase font-semibold tracking-wider">Últimos 30 dias</div>
            <div className="text-emerald-900 font-bold text-base">{ultimos30}</div>
          </div>
          <div className="bg-blue-50 rounded p-2">
            <div className="text-blue-600 uppercase font-semibold tracking-wider">Últimos 60 dias</div>
            <div className="text-blue-900 font-bold text-base">{ultimos60}</div>
          </div>
          <div className="bg-indigo-50 rounded p-2">
            <div className="text-indigo-600 uppercase font-semibold tracking-wider">Último DDS</div>
            <div className="text-indigo-900 font-bold text-base">{ultimoDds ? new Date(ultimoDds.dataDds).toLocaleDateString("pt-BR") : "—"}</div>
          </div>
          <div className={`rounded p-2 ${diasDesdeUltimo !== null && diasDesdeUltimo > 30 ? "bg-red-50" : "bg-slate-50"}`}>
            <div className={`uppercase font-semibold tracking-wider ${diasDesdeUltimo !== null && diasDesdeUltimo > 30 ? "text-red-600" : "text-slate-500"}`}>Há quantos dias</div>
            <div className={`font-bold text-base ${diasDesdeUltimo !== null && diasDesdeUltimo > 30 ? "text-red-900" : "text-slate-900"}`}>{diasDesdeUltimo !== null ? `${diasDesdeUltimo}d` : "—"}</div>
          </div>
        </div>
      </div>

      {/* Rev. 2025 — Aba DDS do Terceiro virou READ-ONLY (pedido direto do usuário).
          Formulário "Registrar Participação em DDS" foi removido. Esta tela agora é
          só o histórico de participações que vieram via sessão coletiva (SST › DDS ›
          Nova Sessão, com o terceiro marcado na lista). Pra registrar nova
          participação, vá em SST › DDS e crie a sessão lá. */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-4 py-3 flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-white ring-1 ring-indigo-200 flex items-center justify-center shrink-0">
          <BookOpen className="h-4 w-4 text-indigo-700" />
        </div>
        <div className="text-xs text-slate-700">
          <p className="font-semibold text-indigo-800">Aba somente leitura</p>
          <p>
            Registros aparecem automaticamente sempre que este terceiro for marcado em uma
            sessão de DDS criada em <strong>SST › DDS › Nova Sessão</strong>. Não há cadastro manual aqui.
          </p>
        </div>
      </div>

      {/* Histórico de DDS */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-white ring-1 ring-slate-200 flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-slate-700" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm text-slate-700">Histórico de Participações</h4>
            <p className="text-[11px] text-slate-600">{ddsList.length} {ddsList.length === 1 ? "registro" : "registros"} — ordem cronológica (mais recente primeiro)</p>
          </div>
        </div>
        <div className="divide-y bg-white">
          {ddsList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum DDS registrado ainda. Quando este terceiro participar de uma sessão criada em SST › DDS, aparece aqui automaticamente.
            </p>
          ) : (
            ddsList.map((d: any) => (
              <div key={d.id} className="p-3 hover:bg-slate-50/60 flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 ring-1 ring-indigo-200 flex flex-col items-center justify-center shrink-0">
                  <div className="text-[9px] text-indigo-600 uppercase font-semibold leading-none">{new Date(d.dataDds).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</div>
                  <div className="text-sm font-bold text-indigo-900 leading-tight">{new Date(d.dataDds).getUTCDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h5 className="font-semibold text-sm">{d.tema}</h5>
                    {d.listaPresencaUrl && (
                      <a href={d.listaPresencaUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5">
                        <FileText className="h-3 w-3" /> Lista
                      </a>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap mt-0.5">
                    <span>{new Date(d.dataDds).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                    {d.instrutor && <span>· Instrutor: <strong className="text-slate-700">{d.instrutor}</strong></span>}
                    {d.obraNome && <span>· Obra: <strong className="text-slate-700">{d.obraNome}</strong></span>}
                  </div>
                  {d.observacoes && <p className="text-[11px] text-slate-500 mt-1 italic">{d.observacoes}</p>}
                </div>
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 h-7 px-2 shrink-0" onClick={() => { if (confirm("Remover este registro de DDS?")) deleteMut.mutate({ id: d.id }); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
