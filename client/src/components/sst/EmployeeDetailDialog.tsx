import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useState } from "react";
import DocumentPreviewDialog from "@/components/DocumentPreviewDialog";
import {
  User, Stethoscope, AlertTriangle, FileText, Calendar, Clock,
  MapPin, FileWarning, Briefcase, Loader2, Eye,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: number | null;
  dataInicio: string;
  dataFim: string;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, dd] = d.split("T")[0].split("-");
  if (!y || !m || !dd) return d;
  return `${dd}/${m}/${y}`;
}

function fileNameFromUrl(url?: string | null): string {
  if (!url) return "documento";
  try {
    const path = new URL(url, window.location.origin).pathname;
    const last = path.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "documento";
  } catch {
    const last = url.split("?")[0].split("#")[0].split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "documento";
  }
}

const GRAV_BADGE: Record<string, string> = {
  "Quase-acidente": "bg-blue-100 text-blue-700 border-blue-300",
  "Primeiros Socorros": "bg-cyan-100 text-cyan-700 border-cyan-300",
  "Leve sem afastamento": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "Leve com afastamento": "bg-emerald-100 text-emerald-700 border-emerald-300",
  Moderado: "bg-amber-100 text-amber-700 border-amber-300",
  Grave: "bg-red-100 text-red-700 border-red-300",
  Gravíssimo: "bg-red-200 text-red-800 border-red-400",
  Fatal: "bg-gray-900 text-white border-gray-900",
};

export function EmployeeDetailDialog({ open, onOpenChange, employeeId, dataInicio, dataFim }: Props) {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;

  const detailQuery = trpc.sstAnalytics.porFuncionario.useQuery(
    {
      companyId: queryCompanyId,
      companyIds: isConstrutoras ? companyIds : undefined,
      employeeId: employeeId || 0,
      dataInicio,
      dataFim,
    },
    { enabled: open && !!employeeId },
  );

  const d = detailQuery.data;
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        resizable={false}
        className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] overflow-hidden flex flex-col bg-white sm:rounded-xl p-0 border-0 sm:border"
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-blue-600" />
            {d?.funcionario.nome || "Carregando..."}
            {(d?.funcionario as any)?.codigoInterno ? (
              <span className="text-sm text-gray-400 font-normal">#{(d!.funcionario as any).codigoInterno}</span>
            ) : d?.funcionario.matricula ? (
              <span className="text-sm text-gray-400 font-normal">#{d.funcionario.matricula}</span>
            ) : null}
          </DialogTitle>
          {d?.funcionario.funcao && (
            <p className="text-sm text-gray-600 flex items-center gap-1">
              <Briefcase className="h-3 w-3" /> {d.funcionario.funcao}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 px-6 py-4">
          {detailQuery.isLoading && (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando dados...
            </div>
          )}

          {d && (
            <>
              <p className="text-xs text-gray-500">
                Período: <span className="font-medium">{fmtDate(d.periodo.dataInicio)}</span> a{" "}
                <span className="font-medium">{fmtDate(d.periodo.dataFim)}</span>
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-emerald-50 border-emerald-200 border">
                  <CardContent className="p-3">
                    <p className="text-[11px] uppercase text-gray-600 font-semibold">Atestados</p>
                    <p className="text-2xl font-bold text-emerald-700">{d.resumo.qtdAtestados}</p>
                    <p className="text-[10px] text-gray-500">{d.resumo.comAfastamentoINSS} c/ INSS</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-200 border">
                  <CardContent className="p-3">
                    <p className="text-[11px] uppercase text-gray-600 font-semibold">Dias Atestado</p>
                    <p className="text-2xl font-bold text-blue-700">{d.resumo.totalDiasAtestado}</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200 border">
                  <CardContent className="p-3">
                    <p className="text-[11px] uppercase text-gray-600 font-semibold">Acidentes</p>
                    <p className="text-2xl font-bold text-red-700">{d.resumo.qtdAcidentes}</p>
                    <p className="text-[10px] text-gray-500">{d.resumo.comCAT} c/ CAT</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200 border">
                  <CardContent className="p-3">
                    <p className="text-[11px] uppercase text-gray-600 font-semibold">Dias Acidente</p>
                    <p className="text-2xl font-bold text-orange-700">{d.resumo.totalDiasAcidente}</p>
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="atestados">
                <TabsList>
                  <TabsTrigger value="atestados" className="gap-1">
                    <Stethoscope className="h-4 w-4" /> Atestados ({d.atestados.length})
                  </TabsTrigger>
                  <TabsTrigger value="acidentes" className="gap-1">
                    <AlertTriangle className="h-4 w-4" /> Acidentes ({d.acidentes.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="atestados" className="space-y-2 mt-3">
                  {d.atestados.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">Nenhum atestado no período.</p>
                  ) : (
                    d.atestados.map((a: any) => (
                      <Card key={a.id} className="border">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-[280px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline">
                                  {a.tipo}
                                </Badge>
                                {a.cid && (
                                  <Badge variant="outline" className="text-xs">CID: {a.cid}</Badge>
                                )}
                                {(a.afastamentoINSS ?? 0) > 0 && (
                                  <Badge className="bg-purple-100 text-purple-700 border-purple-300" variant="outline">
                                    INSS
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm mt-2 flex items-center gap-3 text-gray-700 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> Emissão: <strong>{fmtDate(a.dataEmissao)}</strong>
                                </span>
                                {a.dataRetorno && (
                                  <span className="flex items-center gap-1">
                                    Retorno: <strong>{fmtDate(a.dataRetorno)}</strong>
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {(a.afastamentoTipo === "hora" || a.afastamentoTipo === "horas")
                                    ? (() => { const h = Number(a.horasAfastamento || 0); const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return <strong>{mm > 0 ? `${hh}h${String(mm).padStart(2,"0")}` : `${hh}h`}</strong>; })()
                                    : <><strong>{a.diasAfastamento || 0}</strong> dia(s)</>}
                                </span>
                              </p>
                              {a.motivo && (
                                <p className="text-xs text-gray-600 mt-1"><strong>Motivo:</strong> {a.motivo}</p>
                              )}
                              {(a.medico || a.crm) && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Médico: {a.medico || "—"} {a.crm ? `· CRM ${a.crm}` : ""}
                                </p>
                              )}
                              {a.descricao && (
                                <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{a.descricao}</p>
                              )}
                            </div>
                            {a.documentoUrl && (
                              <button
                                type="button"
                                onClick={() => setViewerUrl(a.documentoUrl)}
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1 flex-shrink-0"
                              >
                                <FileText className="h-3 w-3" /> Documento <Eye className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="acidentes" className="space-y-2 mt-3">
                  {d.acidentes.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">Nenhum acidente no período.</p>
                  ) : (
                    d.acidentes.map((a: any) => (
                      <Card key={a.id} className="border">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-[280px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={GRAV_BADGE[a.gravidade] || "bg-gray-100 text-gray-700"} variant="outline">
                                  {a.gravidade}
                                </Badge>
                                {a.tipoAcidente && <Badge variant="outline" className="text-xs">{a.tipoAcidente}</Badge>}
                                {a.houveCAT === 1 && (
                                  <Badge className="bg-amber-100 text-amber-700 border-amber-300" variant="outline">
                                    <FileWarning className="h-3 w-3 mr-1" /> CAT {a.catNumero || ""}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm mt-2 flex items-center gap-3 text-gray-700 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> <strong>{fmtDate(a.dataAcidente)}</strong>
                                  {a.horaAcidente ? ` ${a.horaAcidente}` : ""}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> <strong>{a.diasAfastamento || 0}</strong> dia(s) afast.
                                </span>
                                {a.obraNome && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {a.obraNome}
                                  </span>
                                )}
                              </p>
                              {a.localAcidente && (
                                <p className="text-xs text-gray-600 mt-1"><strong>Local:</strong> {a.localAcidente}</p>
                              )}
                              {a.parteCorpoAtingida && (
                                <p className="text-xs text-gray-600"><strong>Parte do corpo:</strong> {a.parteCorpoAtingida}</p>
                              )}
                              {a.agenteCausador && (
                                <p className="text-xs text-gray-600"><strong>Agente:</strong> {a.agenteCausador}</p>
                              )}
                              {a.descricao && (
                                <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap"><strong>Descrição:</strong> {a.descricao}</p>
                              )}
                              {a.acaoCorretiva && (
                                <div className="text-xs text-gray-700 mt-2 bg-gray-50 rounded p-2 border">
                                  <p><strong>Ação corretiva:</strong> {a.acaoCorretiva}</p>
                                  <p className="text-gray-500 mt-1">
                                    {a.statusAcaoCorretiva && <>Status: <strong>{a.statusAcaoCorretiva}</strong> · </>}
                                    {a.prazoAcaoCorretiva && <>Prazo: <strong>{fmtDate(a.prazoAcaoCorretiva)}</strong> · </>}
                                    {a.responsavelAcao && <>Resp.: <strong>{a.responsavelAcao}</strong></>}
                                  </p>
                                </div>
                              )}
                            </div>
                            {a.documentoUrl && (
                              <button
                                type="button"
                                onClick={() => setViewerUrl(a.documentoUrl)}
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1 flex-shrink-0"
                              >
                                <FileText className="h-3 w-3" /> Documento <Eye className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </DialogContent>

      <DocumentPreviewDialog
        open={!!viewerUrl}
        onOpenChange={(v) => !v && setViewerUrl(null)}
        fileUrl={viewerUrl}
        fileName={fileNameFromUrl(viewerUrl)}
        title="Visualizar documento"
      />
    </Dialog>
  );
}
