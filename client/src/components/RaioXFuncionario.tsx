import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { formatCPF } from "@/lib/formatters";
import {
  User, Stethoscope, GraduationCap, ClipboardList, ShieldAlert,
  Clock, DollarSign, HardHat, Calendar, MapPin, Phone, Building2, Briefcase, CreditCard
} from "lucide-react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function StatusBadge({ status, diasRestantes }: { status: string; diasRestantes: number }) {
  if (status === "VENCIDO") return <Badge variant="destructive" className="text-xs">VENCIDO</Badge>;
  if (status?.includes("DIAS PARA VENCER")) {
    const cor = diasRestantes <= 7 ? "bg-red-100 text-red-800" : diasRestantes <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-orange-100 text-orange-800";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{status}</span>;
  }
  return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">VÁLIDO</Badge>;
}

interface RaioXProps {
  employeeId: number | null;
  open: boolean;
  onClose: () => void;
}

export default function RaioXFuncionario({ employeeId, open, onClose }: RaioXProps) {
  const { data: raioX, isLoading } = trpc.docs.raioX.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId && open }
  );

  if (!open || !employeeId) return null;

  const emp = raioX?.funcionario;
  const asos = raioX?.asos || [];
  const treinamentos = raioX?.treinamentos || [];
  const atestados = raioX?.atestados || [];
  const advertencias = raioX?.advertencias || [];
  const pontoResumo = raioX?.ponto || [];
  const folhaPagamento = raioX?.folhaPagamento || [];
  const epis = raioX?.epis || [];

  const asosVencidos = asos.filter((a: any) => a.status === "VENCIDO").length;
  const asosAVencer = asos.filter((a: any) => a.status?.includes("DIAS PARA VENCER")).length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] overflow-hidden flex flex-col p-0">
        {/* HEADER FIXO */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-t-lg shrink-0">
          <DialogTitle className="flex items-center gap-3 text-xl text-white">
            <div className="bg-white/20 p-2 rounded-lg">
              <User className="h-6 w-6" />
            </div>
            Raio-X do Funcionário
          </DialogTitle>
        </DialogHeader>

        {/* CONTEÚDO SCROLLÁVEL */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground text-lg">Carregando dados do funcionário...</div>
          ) : !emp ? (
            <div className="text-center py-20 text-muted-foreground text-lg">Funcionário não encontrado</div>
          ) : (
            <div className="space-y-6">
              {/* DADOS PESSOAIS - EXPANDIDO */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-blue-900">{emp.nomeCompleto}</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                      <div className="flex items-center gap-2 text-sm text-blue-700">
                        <CreditCard className="h-4 w-4 shrink-0" />
                        <span><strong>CPF:</strong> {formatCPF(emp.cpf)}</span>
                      </div>
                      {emp.rg && (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <CreditCard className="h-4 w-4 shrink-0" />
                          <span><strong>RG:</strong> {emp.rg}</span>
                        </div>
                      )}
                      {emp.funcao && (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <Briefcase className="h-4 w-4 shrink-0" />
                          <span><strong>Função:</strong> {emp.funcao}</span>
                        </div>
                      )}
                      {emp.setor && (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <Building2 className="h-4 w-4 shrink-0" />
                          <span><strong>Setor:</strong> {emp.setor}</span>
                        </div>
                      )}
                      {emp.telefone && (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <Phone className="h-4 w-4 shrink-0" />
                          <span><strong>Tel:</strong> {emp.telefone}</span>
                        </div>
                      )}
                      {emp.dataAdmissao && (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <Calendar className="h-4 w-4 shrink-0" />
                          <span><strong>Admissão:</strong> {formatDate(emp.dataAdmissao)}</span>
                        </div>
                      )}
                      {emp.salarioBase && (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <DollarSign className="h-4 w-4 shrink-0" />
                          <span><strong>Salário:</strong> R$ {Number(emp.salarioBase).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {emp.valorHora && (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <Clock className="h-4 w-4 shrink-0" />
                          <span><strong>Valor/Hora:</strong> R$ {Number(emp.valorHora).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                    {emp.logradouro && (
                      <div className="flex items-center gap-2 text-sm text-blue-600 mt-2">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span>{emp.logradouro}{emp.bairro ? `, ${emp.bairro}` : ""}{emp.cidade ? ` - ${emp.cidade}` : ""}{emp.estado ? `/${emp.estado}` : ""}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={`text-sm px-3 py-1 ${emp.status === "Ativo" ? "bg-green-100 text-green-800" : emp.status === "Desligado" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {emp.status}
                    </Badge>
                    {emp.dataDemissao && <p className="text-sm text-red-600 mt-2 font-medium">Desligado: {formatDate(emp.dataDemissao)}</p>}
                  </div>
                </div>

                {/* RESUMO RÁPIDO - CARDS MAIORES */}
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-5">
                  {[
                    { label: "ASOs", value: asos.length, icon: Stethoscope, bgColor: "bg-blue-100", textColor: "text-blue-700", iconColor: "text-blue-500" },
                    { label: "Vencidos", value: asosVencidos, icon: Stethoscope, bgColor: "bg-red-100", textColor: "text-red-700", iconColor: "text-red-500" },
                    { label: "A Vencer", value: asosAVencer, icon: Stethoscope, bgColor: "bg-amber-100", textColor: "text-amber-700", iconColor: "text-amber-500" },
                    { label: "Treinamentos", value: treinamentos.length, icon: GraduationCap, bgColor: "bg-emerald-100", textColor: "text-emerald-700", iconColor: "text-emerald-500" },
                    { label: "Atestados", value: atestados.length, icon: ClipboardList, bgColor: "bg-purple-100", textColor: "text-purple-700", iconColor: "text-purple-500" },
                    { label: "Advertências", value: advertencias.length, icon: ShieldAlert, bgColor: "bg-orange-100", textColor: "text-orange-700", iconColor: "text-orange-500" },
                    { label: "Meses Ponto", value: pontoResumo.length, icon: Clock, bgColor: "bg-cyan-100", textColor: "text-cyan-700", iconColor: "text-cyan-500" },
                    { label: "EPIs", value: epis.length, icon: HardHat, bgColor: "bg-teal-100", textColor: "text-teal-700", iconColor: "text-teal-500" },
                  ].map(c => (
                    <div key={c.label} className={`${c.bgColor} rounded-xl p-3 text-center border border-white/50`}>
                      <c.icon className={`h-5 w-5 mx-auto mb-1 ${c.iconColor}`} />
                      <p className={`text-2xl font-bold ${c.textColor}`}>{c.value}</p>
                      <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ALERTAS */}
              {advertencias.length >= 3 && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3">
                  <ShieldAlert className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-800 text-base">Alerta CLT — Advertências Progressivas</p>
                    <p className="text-sm text-red-700 mt-1">
                      Este colaborador possui <strong>{advertencias.length} advertências</strong>.
                      {advertencias.length >= 4 ? " Recomenda-se análise para possível Justa Causa (Art. 482 CLT)." : " Próximo passo recomendado: Suspensão (Art. 474 CLT, máximo 30 dias)."}
                    </p>
                  </div>
                </div>
              )}
              {asosVencidos > 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3">
                  <Stethoscope className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-800 text-base">Alerta — ASOs Vencidos</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Este colaborador possui <strong>{asosVencidos} ASO(s) vencido(s)</strong>. É necessário agendar novo exame ocupacional.
                    </p>
                  </div>
                </div>
              )}

              {/* ABAS COM DETALHES - EXPANDIDAS */}
              <Tabs defaultValue="asos" className="w-full">
                <TabsList className="grid w-full grid-cols-7 h-12">
                  <TabsTrigger value="asos" className="gap-1.5 text-sm font-medium data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800">
                    <Stethoscope className="h-4 w-4" /> ASOs ({asos.length})
                  </TabsTrigger>
                  <TabsTrigger value="trein" className="gap-1.5 text-sm font-medium data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800">
                    <GraduationCap className="h-4 w-4" /> Treinamentos ({treinamentos.length})
                  </TabsTrigger>
                  <TabsTrigger value="atest" className="gap-1.5 text-sm font-medium data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
                    <ClipboardList className="h-4 w-4" /> Atestados ({atestados.length})
                  </TabsTrigger>
                  <TabsTrigger value="adv" className="gap-1.5 text-sm font-medium data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800">
                    <ShieldAlert className="h-4 w-4" /> Advertências ({advertencias.length})
                  </TabsTrigger>
                  <TabsTrigger value="ponto" className="gap-1.5 text-sm font-medium data-[state=active]:bg-cyan-100 data-[state=active]:text-cyan-800">
                    <Clock className="h-4 w-4" /> Ponto ({pontoResumo.length})
                  </TabsTrigger>
                  <TabsTrigger value="folha" className="gap-1.5 text-sm font-medium data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800">
                    <DollarSign className="h-4 w-4" /> Folha ({folhaPagamento.length})
                  </TabsTrigger>
                  <TabsTrigger value="epis" className="gap-1.5 text-sm font-medium data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800">
                    <HardHat className="h-4 w-4" /> EPIs ({epis.length})
                  </TabsTrigger>
                </TabsList>

                {/* ASOs */}
                <TabsContent value="asos" className="mt-4">
                  {asos.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum ASO registrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-blue-50 border-b">
                            <th className="p-3 text-left font-semibold text-blue-900">Tipo</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Data Exame</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Validade</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Status</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Vencimento</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Resultado</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Médico</th>
                            <th className="p-3 text-left font-semibold text-blue-900">CRM</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Exames Realizados</th>
                          </tr>
                        </thead>
                        <tbody>
                          {asos.map((a: any) => (
                            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{a.tipo}</td>
                              <td className="p-3">{formatDate(a.dataExame)}</td>
                              <td className="p-3">{a.validadeDias} dias</td>
                              <td className="p-3"><StatusBadge status={a.status} diasRestantes={a.diasRestantes} /></td>
                              <td className="p-3">{formatDate(a.dataVencimento)}</td>
                              <td className="p-3">
                                <span className={a.resultado === "Apto" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                                  {a.resultado}
                                </span>
                              </td>
                              <td className="p-3">{a.medico || "-"}</td>
                              <td className="p-3">{a.crm || "-"}</td>
                              <td className="p-3 max-w-[300px]">{a.examesRealizados || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* TREINAMENTOS */}
                <TabsContent value="trein" className="mt-4">
                  {treinamentos.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum treinamento registrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-emerald-50 border-b">
                            <th className="p-3 text-left font-semibold text-emerald-900">Treinamento</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Norma</th>
                            <th className="p-3 text-center font-semibold text-emerald-900">Carga H.</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Realização</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Validade</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Status</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Instrutor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {treinamentos.map((t: any) => (
                            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{t.nome}</td>
                              <td className="p-3">{t.norma || "-"}</td>
                              <td className="p-3 text-center">{t.cargaHoraria || "-"}</td>
                              <td className="p-3">{formatDate(t.dataRealizacao)}</td>
                              <td className="p-3">{formatDate(t.dataValidade)}</td>
                              <td className="p-3">{t.dataValidade ? <StatusBadge status={t.statusCalculado || "VÁLIDO"} diasRestantes={t.diasRestantes || 999} /> : "-"}</td>
                              <td className="p-3">{t.instrutor || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* ATESTADOS */}
                <TabsContent value="atest" className="mt-4">
                  {atestados.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum atestado registrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-purple-50 border-b">
                            <th className="p-3 text-left font-semibold text-purple-900">Tipo</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Data</th>
                            <th className="p-3 text-center font-semibold text-purple-900">Dias Afastamento</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Retorno</th>
                            <th className="p-3 text-left font-semibold text-purple-900">CID</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Médico</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Observações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {atestados.map((a: any) => (
                            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{a.tipo}</td>
                              <td className="p-3">{formatDate(a.dataEmissao)}</td>
                              <td className="p-3 text-center font-semibold">{a.diasAfastamento || 0}</td>
                              <td className="p-3">{formatDate(a.dataRetorno)}</td>
                              <td className="p-3">{a.cid || "-"}</td>
                              <td className="p-3">{a.medico || "-"}</td>
                              <td className="p-3 max-w-[250px] truncate">{a.observacoes || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* ADVERTÊNCIAS */}
                <TabsContent value="adv" className="mt-4">
                  {advertencias.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhuma advertência registrada</div>
                  ) : (
                    <div className="space-y-4">
                      {/* Barra de progresso CLT */}
                      <div className="bg-gray-50 rounded-xl p-4 border">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Progressão Disciplinar (CLT)</p>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3].map(n => (
                            <div key={n} className={`flex-1 h-3 rounded-full ${advertencias.length >= n ? "bg-orange-500" : "bg-gray-200"}`} />
                          ))}
                          <div className={`flex-1 h-3 rounded-full ${advertencias.some((a: any) => a.tipoAdvertencia === "Suspensao") ? "bg-red-500" : "bg-gray-200"}`} />
                          <div className={`flex-1 h-3 rounded-full ${advertencias.some((a: any) => a.tipoAdvertencia === "JustaCausa") ? "bg-red-800" : "bg-gray-200"}`} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>1ª Adv.</span><span>2ª Adv.</span><span>3ª Adv.</span><span>Suspensão</span><span>Justa Causa</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-orange-50 border-b">
                              <th className="p-3 text-center font-semibold text-orange-900 w-16">Seq.</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Tipo</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Data</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Motivo</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Testemunhas</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Aplicado por</th>
                            </tr>
                          </thead>
                          <tbody>
                            {advertencias.map((a: any, idx: number) => (
                              <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${a.tipoAdvertencia === "Suspensao" ? "bg-red-50" : a.tipoAdvertencia === "JustaCausa" ? "bg-red-100" : ""}`}>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${idx + 1 >= 3 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                                    {a.sequencia || idx + 1}ª
                                  </span>
                                </td>
                                <td className="p-3">
                                  <Badge variant={a.tipoAdvertencia === "Suspensao" ? "destructive" : a.tipoAdvertencia === "JustaCausa" ? "destructive" : a.tipoAdvertencia === "Escrita" ? "secondary" : "outline"} className="text-xs">
                                    {a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia}
                                  </Badge>
                                </td>
                                <td className="p-3">{formatDate(a.dataOcorrencia)}</td>
                                <td className="p-3 max-w-[350px]">{a.motivo}</td>
                                <td className="p-3">{a.testemunhas || "-"}</td>
                                <td className="p-3 text-muted-foreground">{a.aplicadoPor || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* PONTO */}
                <TabsContent value="ponto" className="mt-4">
                  {pontoResumo.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum registro de ponto encontrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-cyan-50 border-b">
                            <th className="p-3 text-left font-semibold text-cyan-900">Competência</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Dias Trab.</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Horas Trab.</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Horas Extras</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Atrasos</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Faltas</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Ajustes Manuais</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pontoResumo.map((p: any) => (
                            <tr key={p.mesReferencia} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{p.mesReferencia}</td>
                              <td className="p-3 text-center">{p.diasTrabalhados}</td>
                              <td className="p-3 text-center font-mono">{p.horasTrabalhadas}</td>
                              <td className="p-3 text-center font-mono text-green-600 font-semibold">{p.horasExtras || "0:00"}</td>
                              <td className="p-3 text-center font-mono text-amber-600">{p.atrasos || "0:00"}</td>
                              <td className="p-3 text-center">{p.faltas || 0}</td>
                              <td className="p-3 text-center">{p.ajustesManuais || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* FOLHA */}
                <TabsContent value="folha" className="mt-4">
                  {folhaPagamento.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum registro de folha de pagamento encontrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-indigo-50 border-b">
                            <th className="p-3 text-left font-semibold text-indigo-900">Competência</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">Salário Base</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">H. Extras</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">Descontos</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">Líquido</th>
                            <th className="p-3 text-center font-semibold text-indigo-900">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {folhaPagamento.map((f: any) => (
                            <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{f.mesReferencia}</td>
                              <td className="p-3 text-right font-mono">R$ {Number(f.salarioBase || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right font-mono text-green-600">R$ {Number(f.horasExtrasValor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right font-mono text-red-600">R$ {Number(f.totalDescontos || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right font-mono font-bold text-lg">R$ {Number(f.salarioLiquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-center">
                                <Badge variant={f.status === "Pago" ? "default" : "secondary"}>{f.status}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* EPIs */}
                <TabsContent value="epis" className="mt-4">
                  {epis.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhuma entrega de EPI registrada</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-teal-50 border-b">
                            <th className="p-3 text-left font-semibold text-teal-900">EPI</th>
                            <th className="p-3 text-left font-semibold text-teal-900">CA</th>
                            <th className="p-3 text-center font-semibold text-teal-900">Qtd</th>
                            <th className="p-3 text-left font-semibold text-teal-900">Data Entrega</th>
                            <th className="p-3 text-left font-semibold text-teal-900">Data Devolução</th>
                            <th className="p-3 text-center font-semibold text-teal-900">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {epis.map((e: any) => (
                            <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{e.nomeEpi || "-"}</td>
                              <td className="p-3">{e.ca || "-"}</td>
                              <td className="p-3 text-center">{e.quantidade || 1}</td>
                              <td className="p-3">{formatDate(e.dataEntrega)}</td>
                              <td className="p-3">{formatDate(e.dataDevolucao)}</td>
                              <td className="p-3 text-center">
                                <Badge variant={e.status === "Entregue" ? "default" : "secondary"}>{e.status || "Entregue"}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
