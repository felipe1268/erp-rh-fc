import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { formatCPF } from "@/lib/formatters";
import {
  User, Stethoscope, GraduationCap, ClipboardList, ShieldAlert,
  Clock, DollarSign, HardHat, Calendar, MapPin, Phone, Mail, Building2
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

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-blue-600" /> Raio-X do Funcionário
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando dados do funcionário...</div>
        ) : !emp ? (
          <div className="text-center py-12 text-muted-foreground">Funcionário não encontrado</div>
        ) : (
          <div className="space-y-4">
            {/* DADOS PESSOAIS */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-blue-900">{emp.nomeCompleto}</h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-blue-700">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> CPF: {formatCPF(emp.cpf)}</span>
                    {emp.funcao && <span className="flex items-center gap-1"><HardHat className="h-3.5 w-3.5" /> {emp.funcao}</span>}
                    {emp.telefone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {emp.telefone}</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-blue-600">
                    {emp.dataAdmissao && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Admissão: {formatDate(emp.dataAdmissao)}</span>}
                    {emp.salarioBase && <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> R$ {Number(emp.salarioBase).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={emp.status === "Ativo" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                    {emp.status}
                  </Badge>
                  {emp.dataDemissao && <p className="text-xs text-red-600 mt-1">Desligado: {formatDate(emp.dataDemissao)}</p>}
                </div>
              </div>

              {/* RESUMO RÁPIDO */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-4">
                {[
                  { label: "ASOs", value: asos.length, icon: Stethoscope, color: "blue" },
                  { label: "Vencidos", value: asos.filter((a: any) => a.status === "VENCIDO").length, icon: Stethoscope, color: "red" },
                  { label: "Treinamentos", value: treinamentos.length, icon: GraduationCap, color: "emerald" },
                  { label: "Atestados", value: atestados.length, icon: ClipboardList, color: "purple" },
                  { label: "Advertências", value: advertencias.length, icon: ShieldAlert, color: "orange" },
                  { label: "Meses Ponto", value: pontoResumo.length, icon: Clock, color: "cyan" },
                  { label: "EPIs", value: epis.length, icon: HardHat, color: "teal" },
                ].map(c => (
                  <div key={c.label} className={`bg-white rounded-lg p-2 border text-center`}>
                    <p className={`text-lg font-bold ${c.color === "red" ? "text-red-600" : ""}`}>{c.value}</p>
                    <p className="text-[10px] text-muted-foreground">{c.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ABAS COM DETALHES */}
            <Tabs defaultValue="asos" className="w-full">
              <TabsList className="grid w-full grid-cols-7 h-10 text-xs">
                <TabsTrigger value="asos" className="text-xs gap-1"><Stethoscope className="h-3 w-3" /> ASOs</TabsTrigger>
                <TabsTrigger value="trein" className="text-xs gap-1"><GraduationCap className="h-3 w-3" /> Trein.</TabsTrigger>
                <TabsTrigger value="atest" className="text-xs gap-1"><ClipboardList className="h-3 w-3" /> Atest.</TabsTrigger>
                <TabsTrigger value="adv" className="text-xs gap-1"><ShieldAlert className="h-3 w-3" /> Advert.</TabsTrigger>
                <TabsTrigger value="ponto" className="text-xs gap-1"><Clock className="h-3 w-3" /> Ponto</TabsTrigger>
                <TabsTrigger value="folha" className="text-xs gap-1"><DollarSign className="h-3 w-3" /> Folha</TabsTrigger>
                <TabsTrigger value="epis" className="text-xs gap-1"><HardHat className="h-3 w-3" /> EPIs</TabsTrigger>
              </TabsList>

              {/* ASOs */}
              <TabsContent value="asos">
                {asos.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nenhum ASO registrado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium">Tipo</th>
                          <th className="p-2 text-left font-medium">Data Exame</th>
                          <th className="p-2 text-left font-medium">Validade</th>
                          <th className="p-2 text-left font-medium">Status</th>
                          <th className="p-2 text-left font-medium">Resultado</th>
                          <th className="p-2 text-left font-medium">Médico</th>
                          <th className="p-2 text-left font-medium">Exames</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asos.map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="p-2">{a.tipo}</td>
                            <td className="p-2">{formatDate(a.dataExame)}</td>
                            <td className="p-2">{a.validadeDias} dias</td>
                            <td className="p-2"><StatusBadge status={a.status} diasRestantes={a.diasRestantes} /></td>
                            <td className="p-2">
                              <span className={a.resultado === "Apto" ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                {a.resultado}
                              </span>
                            </td>
                            <td className="p-2">{a.medico || "-"} {a.crm ? `(CRM: ${a.crm})` : ""}</td>
                            <td className="p-2 max-w-[200px] truncate">{a.examesRealizados || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* TREINAMENTOS */}
              <TabsContent value="trein">
                {treinamentos.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nenhum treinamento registrado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium">Treinamento</th>
                          <th className="p-2 text-left font-medium">Norma</th>
                          <th className="p-2 text-left font-medium">Carga H.</th>
                          <th className="p-2 text-left font-medium">Realização</th>
                          <th className="p-2 text-left font-medium">Validade</th>
                          <th className="p-2 text-left font-medium">Status</th>
                          <th className="p-2 text-left font-medium">Instrutor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {treinamentos.map((t: any) => (
                          <tr key={t.id} className="border-b last:border-0">
                            <td className="p-2 font-medium">{t.nome}</td>
                            <td className="p-2">{t.norma || "-"}</td>
                            <td className="p-2">{t.cargaHoraria || "-"}</td>
                            <td className="p-2">{formatDate(t.dataRealizacao)}</td>
                            <td className="p-2">{formatDate(t.dataValidade)}</td>
                            <td className="p-2">{t.dataValidade ? <StatusBadge status={t.statusCalculado || "VÁLIDO"} diasRestantes={t.diasRestantes || 999} /> : "-"}</td>
                            <td className="p-2">{t.instrutor || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ATESTADOS */}
              <TabsContent value="atest">
                {atestados.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nenhum atestado registrado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium">Tipo</th>
                          <th className="p-2 text-left font-medium">Data</th>
                          <th className="p-2 text-left font-medium">Dias Afastamento</th>
                          <th className="p-2 text-left font-medium">Retorno</th>
                          <th className="p-2 text-left font-medium">CID</th>
                          <th className="p-2 text-left font-medium">Médico</th>
                        </tr>
                      </thead>
                      <tbody>
                        {atestados.map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="p-2">{a.tipo}</td>
                            <td className="p-2">{formatDate(a.dataEmissao)}</td>
                            <td className="p-2 text-center">{a.diasAfastamento || 0}</td>
                            <td className="p-2">{formatDate(a.dataRetorno)}</td>
                            <td className="p-2">{a.cid || "-"}</td>
                            <td className="p-2">{a.medico || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ADVERTÊNCIAS */}
              <TabsContent value="adv">
                {advertencias.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nenhuma advertência registrada</div>
                ) : (
                  <div className="space-y-3">
                    {advertencias.length >= 3 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-800">
                        <strong>Alerta CLT:</strong> Este colaborador possui {advertencias.length} advertências.
                        {advertencias.length >= 4 ? " Recomenda-se análise para possível Justa Causa." : " Próximo passo: Suspensão."}
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="p-2 text-left font-medium">Seq.</th>
                            <th className="p-2 text-left font-medium">Tipo</th>
                            <th className="p-2 text-left font-medium">Data</th>
                            <th className="p-2 text-left font-medium">Motivo</th>
                            <th className="p-2 text-left font-medium">Testemunhas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {advertencias.map((a: any, idx: number) => (
                            <tr key={a.id} className={`border-b last:border-0 ${a.tipoAdvertencia === "Suspensao" ? "bg-red-50" : ""}`}>
                              <td className="p-2">
                                <span className={`px-1.5 py-0.5 rounded text-xs ${idx + 1 >= 3 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                                  {a.sequencia || idx + 1}ª
                                </span>
                              </td>
                              <td className="p-2">
                                <Badge variant={a.tipoAdvertencia === "Suspensao" ? "destructive" : a.tipoAdvertencia === "Escrita" ? "secondary" : "outline"} className="text-xs">
                                  {a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia}
                                </Badge>
                              </td>
                              <td className="p-2">{formatDate(a.dataOcorrencia)}</td>
                              <td className="p-2 max-w-[250px] truncate" title={a.motivo}>{a.motivo}</td>
                              <td className="p-2">{a.testemunhas || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* PONTO */}
              <TabsContent value="ponto">
                {pontoResumo.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nenhum registro de ponto encontrado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium">Competência</th>
                          <th className="p-2 text-center font-medium">Dias Trab.</th>
                          <th className="p-2 text-center font-medium">Horas Trab.</th>
                          <th className="p-2 text-center font-medium">Horas Extras</th>
                          <th className="p-2 text-center font-medium">Atrasos</th>
                          <th className="p-2 text-center font-medium">Faltas</th>
                          <th className="p-2 text-center font-medium">Ajustes Manuais</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pontoResumo.map((p: any) => (
                          <tr key={p.mesReferencia} className="border-b last:border-0">
                            <td className="p-2 font-medium">{p.mesReferencia}</td>
                            <td className="p-2 text-center">{p.diasTrabalhados}</td>
                            <td className="p-2 text-center font-mono">{p.horasTrabalhadas}</td>
                            <td className="p-2 text-center font-mono text-green-600 font-semibold">{p.horasExtras || "0:00"}</td>
                            <td className="p-2 text-center font-mono text-amber-600">{p.atrasos || "0:00"}</td>
                            <td className="p-2 text-center">{p.faltas || 0}</td>
                            <td className="p-2 text-center">{p.ajustesManuais || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* FOLHA */}
              <TabsContent value="folha">
                {folhaPagamento.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nenhum registro de folha de pagamento encontrado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium">Competência</th>
                          <th className="p-2 text-right font-medium">Salário Base</th>
                          <th className="p-2 text-right font-medium">H. Extras</th>
                          <th className="p-2 text-right font-medium">Descontos</th>
                          <th className="p-2 text-right font-medium">Líquido</th>
                          <th className="p-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folhaPagamento.map((f: any) => (
                          <tr key={f.id} className="border-b last:border-0">
                            <td className="p-2 font-medium">{f.mesReferencia}</td>
                            <td className="p-2 text-right font-mono">R$ {Number(f.salarioBase || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono text-green-600">R$ {Number(f.horasExtrasValor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono text-red-600">R$ {Number(f.totalDescontos || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono font-bold">R$ {Number(f.salarioLiquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-center">
                              <Badge variant={f.status === "Pago" ? "default" : "secondary"} className="text-xs">{f.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* EPIs */}
              <TabsContent value="epis">
                {epis.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nenhuma entrega de EPI registrada</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium">EPI</th>
                          <th className="p-2 text-left font-medium">CA</th>
                          <th className="p-2 text-center font-medium">Qtd</th>
                          <th className="p-2 text-left font-medium">Data Entrega</th>
                          <th className="p-2 text-left font-medium">Data Devolução</th>
                          <th className="p-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {epis.map((e: any) => (
                          <tr key={e.id} className="border-b last:border-0">
                            <td className="p-2 font-medium">{e.nomeEpi || "-"}</td>
                            <td className="p-2">{e.ca || "-"}</td>
                            <td className="p-2 text-center">{e.quantidade || 1}</td>
                            <td className="p-2">{formatDate(e.dataEntrega)}</td>
                            <td className="p-2">{formatDate(e.dataDevolucao)}</td>
                            <td className="p-2 text-center">
                              <Badge variant={e.status === "Entregue" ? "default" : "secondary"} className="text-xs">{e.status || "Entregue"}</Badge>
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
      </DialogContent>
    </Dialog>
  );
}
