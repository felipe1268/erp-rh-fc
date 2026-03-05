import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { formatCPF, fmtNum } from "@/lib/formatters";
import {
  Shield, Plus, Search, Calendar, Users, Trash2, Pencil, Eye, X,
  AlertTriangle, CheckCircle2, Clock, CalendarDays, UserCheck,
  FileText, RefreshCw, Vote,
} from "lucide-react";
import { useState, useMemo } from "react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const STATUS_ELEICAO: Record<string, { label: string; color: string; bg: string }> = {
  Planejamento: { label: "Planejamento", color: "text-gray-700", bg: "bg-gray-100" },
  Inscricoes: { label: "Inscrições", color: "text-blue-700", bg: "bg-blue-100" },
  Campanha: { label: "Campanha", color: "text-purple-700", bg: "bg-purple-100" },
  Votacao: { label: "Votação", color: "text-amber-700", bg: "bg-amber-100" },
  Apuracao: { label: "Apuração", color: "text-orange-700", bg: "bg-orange-100" },
  Concluida: { label: "Concluída", color: "text-green-700", bg: "bg-green-100" },
};

const CARGO_CIPA: Record<string, string> = {
  Presidente: "Presidente",
  Vice_Presidente: "Vice-Presidente",
  Secretario: "Secretário",
  Membro_Titular: "Membro Titular",
  Membro_Suplente: "Membro Suplente",
};

export default function CipaCompleta() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [tab, setTab] = useState("visao");
  const [selectedEleicaoId, setSelectedEleicaoId] = useState<number | null>(null);
  const [showEleicaoDialog, setShowEleicaoDialog] = useState(false);
  const [showMembroDialog, setShowMembroDialog] = useState(false);
  const [showReuniaoDialog, setShowReuniaoDialog] = useState(false);
  const [eleicaoForm, setEleicaoForm] = useState<any>({});
  const [membroForm, setMembroForm] = useState<any>({});
  const [reuniaoForm, setReuniaoForm] = useState<any>({});
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);

  // Queries
  const { data: necessidade } = trpc.cipa.verificarNecessidade.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: eleicoes = [], refetch: refetchEleicoes } = trpc.cipa.eleicoes.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: membros = [], refetch: refetchMembros } = trpc.cipa.membros.list.useQuery(
    { electionId: selectedEleicaoId || 0 },
    { enabled: !!selectedEleicaoId }
  );
  const { data: reunioes = [], refetch: refetchReunioes } = trpc.cipa.reunioes.list.useQuery(
    { companyId, electionId: selectedEleicaoId || undefined },
    { enabled: !!companyId }
  );
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });
  const activeEmployees = useMemo(() => (empList as any[]).filter((e: any) => e.status === "Ativo" && !e.deletedAt), [empList]);

  // Mutations
  const createEleicao = trpc.cipa.eleicoes.create.useMutation({
    onSuccess: () => { refetchEleicoes(); toast.success("Mandato/Eleição criado!"); setShowEleicaoDialog(false); setEleicaoForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateEleicao = trpc.cipa.eleicoes.update.useMutation({
    onSuccess: () => { refetchEleicoes(); toast.success("Mandato atualizado!"); },
  });
  const deleteEleicao = trpc.cipa.eleicoes.delete.useMutation({
    onSuccess: () => { refetchEleicoes(); toast.success("Mandato excluído!"); },
  });
  const createMembro = trpc.cipa.membros.create.useMutation({
    onSuccess: () => { refetchMembros(); toast.success("Membro adicionado!"); setShowMembroDialog(false); setMembroForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMembro = trpc.cipa.membros.delete.useMutation({
    onSuccess: () => { refetchMembros(); toast.success("Membro removido!"); },
  });
  const createReuniao = trpc.cipa.reunioes.create.useMutation({
    onSuccess: () => { refetchReunioes(); toast.success("Reunião agendada!"); setShowReuniaoDialog(false); setReuniaoForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteReuniao = trpc.cipa.reunioes.delete.useMutation({
    onSuccess: () => { refetchReunioes(); toast.success("Reunião excluída!"); },
  });
  const gerarCalendario = trpc.cipa.reunioes.gerarCalendario.useMutation({
    onSuccess: (data: any) => { refetchReunioes(); toast.success(`${data.reunioesCriadas} reuniões geradas!`); },
    onError: (e: any) => toast.error(e.message),
  });

  // Employee search for membro form
  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === membroForm.employeeId);
  const filteredEmps = activeEmployees.filter((e: any) => {
    if (!empSearch) return true;
    const s = empSearch.toLowerCase();
    return (e.nomeCompleto || "").toLowerCase().includes(s) || (e.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, ""));
  });

  const selectedEleicao = (eleicoes as any[]).find((e: any) => e.id === selectedEleicaoId);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              CIPA — Comissão Interna de Prevenção de Acidentes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão conforme NR-5 — Mandatos, Membros, Reuniões e Estabilidade
            </p>
          </div>
        </div>

        {/* Alerta de Necessidade */}
        {necessidade && (
          <div className={`rounded-lg p-4 border-2 ${necessidade.alertaCipa ? "bg-red-50 border-red-300" : necessidade.necessaria ? "bg-green-50 border-green-300" : "bg-blue-50 border-blue-200"}`}>
            <div className="flex items-start gap-3">
              {necessidade.alertaCipa ? (
                <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <Shield className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-semibold ${necessidade.alertaCipa ? "text-red-800" : "text-green-800"}`}>
                  {necessidade.alertaCipa
                    ? "ATENÇÃO: Empresa precisa constituir CIPA!"
                    : necessidade.necessaria
                      ? "CIPA constituída e em conformidade"
                      : `Empresa com ${necessidade.numFuncionarios} funcionários — CIPA não obrigatória (< 20 funcionários)`
                  }
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Funcionários Ativos:</span>
                    <span className="font-bold ml-1">{fmtNum(necessidade.numFuncionarios)}</span>
                  </div>
                  {necessidade.necessaria && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Efetivos Necessários:</span>
                        <span className="font-bold ml-1">{necessidade.efetivos}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Suplentes Necessários:</span>
                        <span className="font-bold ml-1">{necessidade.suplentes}</span>
                      </div>
                    </>
                  )}
                  {necessidade.designado && (
                    <div>
                      <Badge variant="secondary">Designado de CIPA obrigatório</Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="visao"><Shield className="h-4 w-4 mr-1" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="mandatos"><Vote className="h-4 w-4 mr-1" /> Mandatos/Eleições</TabsTrigger>
            <TabsTrigger value="membros"><Users className="h-4 w-4 mr-1" /> Membros</TabsTrigger>
            <TabsTrigger value="reunioes"><CalendarDays className="h-4 w-4 mr-1" /> Reuniões</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="visao">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Vote className="h-4 w-4 text-blue-600" /> Mandatos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{fmtNum((eleicoes as any[]).length)}</p>
                  <p className="text-xs text-muted-foreground">Total de mandatos registrados</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-green-600" /> Membros Ativos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{(membros as any[]).filter((m: any) => m.statusMembro === "Ativo").length}</p>
                  <p className="text-xs text-muted-foreground">No mandato selecionado</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><CalendarDays className="h-4 w-4 text-amber-600" /> Reuniões</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{fmtNum((reunioes as any[]).length)}</p>
                  <p className="text-xs text-muted-foreground">Total de reuniões</p>
                </CardContent>
              </Card>
            </div>

            {/* Cronograma Eleitoral */}
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cronograma Eleitoral (NR-5)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-2">
                  <p><strong>60 dias antes do fim do mandato:</strong> Publicar edital de convocação</p>
                  <p><strong>45 dias antes:</strong> Período de inscrições dos candidatos</p>
                  <p><strong>30 dias antes:</strong> Campanha eleitoral</p>
                  <p><strong>Dia da eleição:</strong> Votação secreta, em horário de trabalho</p>
                  <p><strong>Após eleição:</strong> Apuração, posse e registro na SRTE</p>
                  <p className="text-xs text-blue-600 mt-2">
                    <strong>Estabilidade:</strong> Representantes dos empregados têm estabilidade desde o registro da candidatura até 1 ano após o fim do mandato (Art. 10, II, a, ADCT/CF).
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mandatos/Eleições */}
          <TabsContent value="mandatos">
            <div className="flex justify-end mb-4">
              <Button onClick={() => { setEleicaoForm({}); setShowEleicaoDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Novo Mandato
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Mandato</th>
                        <th className="p-3 text-left font-medium">Status Eleição</th>
                        <th className="p-3 text-left font-medium">Edital</th>
                        <th className="p-3 text-left font-medium">Inscrições</th>
                        <th className="p-3 text-left font-medium">Eleição</th>
                        <th className="p-3 text-left font-medium">Posse</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(eleicoes as any[]).length === 0 ? (
                        <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Nenhum mandato registrado</td></tr>
                      ) : (eleicoes as any[]).map((e: any) => {
                        const st = STATUS_ELEICAO[e.statusEleicao] || STATUS_ELEICAO.Planejamento;
                        const isActive = selectedEleicaoId === e.id;
                        return (
                          <tr key={e.id} className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer ${isActive ? "bg-blue-50" : ""}`} onClick={() => setSelectedEleicaoId(e.id)}>
                            <td className="p-3">
                              <div className="font-medium">{formatDate(e.mandatoInicio)} — {formatDate(e.mandatoFim)}</div>
                            </td>
                            <td className="p-3">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="p-3 text-xs">{formatDate(e.dataEdital)}</td>
                            <td className="p-3 text-xs">{formatDate(e.dataInscricaoInicio)} - {formatDate(e.dataInscricaoFim)}</td>
                            <td className="p-3 text-xs">{formatDate(e.dataEleicao)}</td>
                            <td className="p-3 text-xs">{formatDate(e.dataPosse)}</td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={(ev) => { ev.stopPropagation(); if (confirm("Excluir mandato?")) deleteEleicao.mutate({ id: e.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Membros */}
          <TabsContent value="membros">
            {!selectedEleicaoId ? (
              <div className="py-12 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Selecione um mandato na aba "Mandatos/Eleições" para ver os membros</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-muted-foreground">
                    Mandato: <strong>{selectedEleicao ? `${formatDate(selectedEleicao.mandatoInicio)} — ${formatDate(selectedEleicao.mandatoFim)}` : ""}</strong>
                  </div>
                  <Button onClick={() => { setMembroForm({}); setShowMembroDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar Membro
                  </Button>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="p-3 text-left font-medium">Colaborador</th>
                            <th className="p-3 text-left font-medium">CPF</th>
                            <th className="p-3 text-left font-medium">Cargo Empresa</th>
                            <th className="p-3 text-left font-medium">Cargo CIPA</th>
                            <th className="p-3 text-left font-medium">Representação</th>
                            <th className="p-3 text-left font-medium">Estabilidade</th>
                            <th className="p-3 text-center font-medium">Status</th>
                            <th className="p-3 text-center font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(membros as any[]).length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">Nenhum membro cadastrado</td></tr>
                          ) : (membros as any[]).map((m: any) => (
                            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="p-3 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(m.employeeId)}>
                                {m.employeeName}
                              </td>
                              <td className="p-3">{formatCPF(m.employeeCpf)}</td>
                              <td className="p-3 text-xs">{m.employeeCargo}</td>
                              <td className="p-3">
                                <Badge variant="outline">{CARGO_CIPA[m.cargoCipa] || m.cargoCipa}</Badge>
                              </td>
                              <td className="p-3">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.representacao === "Empregados" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                                  {m.representacao}
                                </span>
                              </td>
                              <td className="p-3 text-xs">
                                {m.inicioEstabilidade ? (
                                  <div>
                                    <span className="text-green-600 font-medium">{formatDate(m.inicioEstabilidade)}</span>
                                    <span className="mx-1">a</span>
                                    <span className="text-green-600 font-medium">{formatDate(m.fimEstabilidade)}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">Sem estabilidade</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant={m.statusMembro === "Ativo" ? "default" : "secondary"}>{m.statusMembro}</Badge>
                              </td>
                              <td className="p-3">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Remover" onClick={() => { if (confirm("Remover membro?")) deleteMembro.mutate({ id: m.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Reuniões */}
          <TabsContent value="reunioes">
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                {selectedEleicaoId && (
                  <Button variant="outline" size="sm" onClick={() => gerarCalendario.mutate({ mandateId: selectedEleicaoId, companyId })} disabled={gerarCalendario.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${gerarCalendario.isPending ? "animate-spin" : ""}`} /> Gerar Calendário Anual
                  </Button>
                )}
              </div>
              <Button onClick={() => { setReuniaoForm({}); setShowReuniaoDialog(true); }} disabled={!selectedEleicaoId}>
                <Plus className="h-4 w-4 mr-2" /> Nova Reunião
              </Button>
            </div>

            {!selectedEleicaoId ? (
              <div className="py-12 text-center text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Selecione um mandato na aba "Mandatos/Eleições" para ver as reuniões</p>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-3 text-left font-medium">Data</th>
                          <th className="p-3 text-left font-medium">Tipo</th>
                          <th className="p-3 text-left font-medium">Horário</th>
                          <th className="p-3 text-left font-medium">Local</th>
                          <th className="p-3 text-left font-medium">Pauta</th>
                          <th className="p-3 text-center font-medium">Status</th>
                          <th className="p-3 text-center font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(reunioes as any[]).length === 0 ? (
                          <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Nenhuma reunião agendada</td></tr>
                        ) : (reunioes as any[]).map((r: any) => (
                          <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3 font-medium">{formatDate(r.dataReuniao)}</td>
                            <td className="p-3">
                              <Badge variant={r.tipo === "extraordinaria" ? "destructive" : "outline"}>
                                {r.tipo === "extraordinaria" ? "Extraordinária" : "Ordinária"}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs">{r.horaInicio || "-"} - {r.horaFim || "-"}</td>
                            <td className="p-3 text-xs">{r.local || "-"}</td>
                            <td className="p-3 text-xs max-w-[200px] truncate" title={r.pauta}>{r.pauta || "-"}</td>
                            <td className="p-3 text-center">
                              <Badge variant={r.status === "realizada" ? "default" : r.status === "cancelada" ? "destructive" : "secondary"}>
                                {r.status === "realizada" ? "Realizada" : r.status === "cancelada" ? "Cancelada" : "Agendada"}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir reunião?")) deleteReuniao.mutate({ id: r.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Dialog: Novo Mandato */}
        <FullScreenDialog open={showEleicaoDialog} onClose={() => { setShowEleicaoDialog(false); setEleicaoForm({}); }} title="Novo Mandato / Eleição CIPA" icon={<Vote className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Início do Mandato *</label>
                <Input type="date" value={eleicaoForm.mandatoInicio || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, mandatoInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Fim do Mandato *</label>
                <Input type="date" value={eleicaoForm.mandatoFim || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, mandatoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Status da Eleição</label>
                <Select value={eleicaoForm.statusEleicao || "Planejamento"} onValueChange={v => setEleicaoForm({ ...eleicaoForm, statusEleicao: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planejamento">Planejamento</SelectItem>
                    <SelectItem value="Inscricoes">Inscrições</SelectItem>
                    <SelectItem value="Campanha">Campanha</SelectItem>
                    <SelectItem value="Votacao">Votação</SelectItem>
                    <SelectItem value="Apuracao">Apuração</SelectItem>
                    <SelectItem value="Concluida">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Data do Edital</label>
                <Input type="date" value={eleicaoForm.dataEdital || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataEdital: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Inscrições Início</label>
                <Input type="date" value={eleicaoForm.dataInscricaoInicio || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataInscricaoInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Inscrições Fim</label>
                <Input type="date" value={eleicaoForm.dataInscricaoFim || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataInscricaoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data da Eleição</label>
                <Input type="date" value={eleicaoForm.dataEleicao || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataEleicao: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data da Posse</label>
                <Input type="date" value={eleicaoForm.dataPosse || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, dataPosse: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={eleicaoForm.observacoes || ""} onChange={e => setEleicaoForm({ ...eleicaoForm, observacoes: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowEleicaoDialog(false); setEleicaoForm({}); }}>Cancelar</Button>
              <Button onClick={() => {
                if (!eleicaoForm.mandatoInicio || !eleicaoForm.mandatoFim) { toast.error("Informe início e fim do mandato"); return; }
                createEleicao.mutate({ companyId, ...eleicaoForm });
              }} disabled={createEleicao.isPending}>
                {createEleicao.isPending ? "Salvando..." : "Criar Mandato"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* Dialog: Novo Membro */}
        <FullScreenDialog open={showMembroDialog} onClose={() => { setShowMembroDialog(false); setMembroForm({}); }} title="Adicionar Membro CIPA" icon={<UserCheck className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Colaborador *</label>
                <div className="relative" style={{ zIndex: 60 }}>
                  <div className="flex items-center border rounded-md px-3 py-2 bg-background cursor-pointer hover:bg-muted/30 relative" style={{ zIndex: 61 }} onClick={() => { if (!empDropdownOpen) setEmpDropdownOpen(true); }}>
                    <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                    {empDropdownOpen ? (
                      <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Digite nome ou CPF..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setEmpDropdownOpen(false); setEmpSearch(''); } }} onClick={e => e.stopPropagation()} />
                    ) : (
                      <span className={`flex-1 text-sm ${selectedEmp ? "text-foreground" : "text-muted-foreground"}`}>
                        {selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Selecione..."}
                      </span>
                    )}
                    {membroForm.employeeId && (
                      <button type="button" className="ml-2 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); setMembroForm({ ...membroForm, employeeId: undefined }); setEmpSearch(""); setEmpDropdownOpen(false); }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {empDropdownOpen && (
                    <>
                      <div className="fixed inset-0" style={{ zIndex: 55 }} onClick={() => { setEmpDropdownOpen(false); setEmpSearch(""); }} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto" style={{ zIndex: 62 }}>
                        {filteredEmps.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">Nenhum resultado para "{empSearch}"</div>
                        ) : filteredEmps.slice(0, 20).map((e: any) => (
                          <div key={e.id} className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm flex justify-between" onClick={() => { setMembroForm({ ...membroForm, employeeId: e.id }); setEmpDropdownOpen(false); setEmpSearch(""); }}>
                            <span className="font-medium">{e.nomeCompleto}</span>
                            <span className="text-muted-foreground">{formatCPF(e.cpf)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Cargo na CIPA *</label>
                <Select value={membroForm.cargoCipa || ""} onValueChange={v => setMembroForm({ ...membroForm, cargoCipa: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Presidente">Presidente</SelectItem>
                    <SelectItem value="Vice_Presidente">Vice-Presidente</SelectItem>
                    <SelectItem value="Secretario">Secretário</SelectItem>
                    <SelectItem value="Membro_Titular">Membro Titular</SelectItem>
                    <SelectItem value="Membro_Suplente">Membro Suplente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Representação *</label>
                <Select value={membroForm.representacao || ""} onValueChange={v => setMembroForm({ ...membroForm, representacao: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Empregador">Empregador</SelectItem>
                    <SelectItem value="Empregados">Empregados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {membroForm.representacao === "Empregados" && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <strong>Estabilidade automática:</strong> Representantes dos empregados terão estabilidade calculada automaticamente (desde o registro da candidatura até 1 ano após o mandato).
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowMembroDialog(false); setMembroForm({}); }}>Cancelar</Button>
              <Button onClick={() => {
                if (!membroForm.employeeId || !membroForm.cargoCipa || !membroForm.representacao) { toast.error("Preencha todos os campos"); return; }
                createMembro.mutate({ companyId, electionId: selectedEleicaoId!, ...membroForm });
              }} disabled={createMembro.isPending}>
                {createMembro.isPending ? "Salvando..." : "Adicionar Membro"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* Dialog: Nova Reunião */}
        <FullScreenDialog open={showReuniaoDialog} onClose={() => { setShowReuniaoDialog(false); setReuniaoForm({}); }} title="Nova Reunião CIPA" icon={<CalendarDays className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Data da Reunião *</label>
                <Input type="date" value={reuniaoForm.dataReuniao || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, dataReuniao: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <Select value={reuniaoForm.tipo || "ordinaria"} onValueChange={v => setReuniaoForm({ ...reuniaoForm, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ordinaria">Ordinária</SelectItem>
                    <SelectItem value="extraordinaria">Extraordinária</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Hora Início</label>
                <Input type="time" value={reuniaoForm.horaInicio || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, horaInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Hora Fim</label>
                <Input type="time" value={reuniaoForm.horaFim || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, horaFim: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Local</label>
                <Input value={reuniaoForm.local || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, local: e.target.value })} placeholder="Ex: Sala de Reuniões" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Pauta</label>
                <Textarea value={reuniaoForm.pauta || ""} onChange={e => setReuniaoForm({ ...reuniaoForm, pauta: e.target.value })} rows={3} placeholder="Assuntos a serem discutidos..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowReuniaoDialog(false); setReuniaoForm({}); }}>Cancelar</Button>
              <Button onClick={() => {
                if (!reuniaoForm.dataReuniao) { toast.error("Informe a data da reunião"); return; }
                createReuniao.mutate({ mandateId: selectedEleicaoId!, companyId, ...reuniaoForm });
              }} disabled={createReuniao.isPending}>
                {createReuniao.isPending ? "Salvando..." : "Agendar Reunião"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}
