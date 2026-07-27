// ============================================================================
// Rev. 4667 — ORDEM DE SERVIÇO (OS / NR-01) DIGITAL
// Mesmo modelo da Ficha de EPI Digital: gera a OS na hora com o texto da
// função + EPIs entregues (CA) + treinamentos, coleta assinatura digital do
// colaborador e baixa em PDF. Entra automática no Dossiê ZIP (001.4).
// ============================================================================
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, FileText, PenLine, Download } from "lucide-react";
import EpiAssinatura from "@/pages/EpiAssinatura";

interface Props {
  employeeId: number | null;
  open: boolean;
  onClose: () => void;
  companyId: number;
  companyIds?: number[];
}

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const m = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v).slice(0, 10);
}
function fmtDateTime(v?: string | null): string {
  if (!v) return "";
  const s = String(v);
  const hm = s.match(/[T ](\d{2}):(\d{2})/);
  return `${fmtDate(s)}${hm ? ` ${hm[1]}:${hm[2]}` : ""}`;
}

export default function OrdemServicoDialog({ employeeId, open, onClose, companyId, companyIds }: Props) {
  const [assinando, setAssinando] = useState(false);
  const enabled = open && !!employeeId && (!!companyId || (companyIds?.length ?? 0) > 0);
  const { data, isLoading, error, refetch } = trpc.epis.ordemServicoFuncionario.useQuery(
    { companyId, companyIds, employeeId: employeeId! },
    { enabled }
  );

  const emp = data?.funcionario;
  const temConteudo = !!(data && ((data.textoOs || "").trim() || (data.episEntregues?.length ?? 0) > 0));

  const baixarPdf = () => {
    if (!data || !employeeId) return;
    window.open(`/api/download/ordem-servico-pdf?companyId=${data.companyId}&employeeId=${employeeId}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[92dvh] overflow-y-auto" aria-describedby={undefined}>
        {error ? (
          <div className="py-12 text-center text-sm text-red-600 break-words">
            Não foi possível carregar a Ordem de Serviço: {error.message}
          </div>
        ) : isLoading || !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#0A1E3C]" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-[#0A1E3C]" /> Ordem de Serviço (NR-01) — Digital
              </DialogTitle>
            </DialogHeader>

            {/* Cabeçalho */}
            <div className="rounded-lg border-2 border-[#0A1E3C] overflow-hidden text-xs">
              <div className="bg-[#0A1E3C] text-white text-center font-bold py-1.5">
                ORDEM DE SERVIÇO - OS
                <span className="block text-[9px] font-normal opacity-80">Conforme item 1.7, letra "b", NR-01 da Portaria 3.214/78</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="px-2 py-1 border-b"><b className="text-[#0A1E3C]">EMPRESA:</b> {data.empresa?.razaoSocial || "—"}</div>
                <div className="px-2 py-1 border-b"><b className="text-[#0A1E3C]">CNPJ:</b> {data.empresa?.cnpj || "—"}</div>
                <div className="px-2 py-1 border-b"><b className="text-[#0A1E3C]">NOME:</b> {emp?.nomeCompleto}</div>
                <div className="px-2 py-1 border-b"><b className="text-[#0A1E3C]">CPF:</b> {emp?.cpf || "—"}</div>
                <div className="px-2 py-1 border-b"><b className="text-[#0A1E3C]">FUNÇÃO:</b> {emp?.funcao || "—"}{data.cbo ? <> &nbsp; <b className="text-[#0A1E3C]">CBO:</b> {data.cbo}</> : null}</div>
                <div className="px-2 py-1 border-b">
                  {emp?.dataNascimento ? <><b className="text-[#0A1E3C]">NASC.:</b> {fmtDate(emp.dataNascimento)} &nbsp; </> : null}
                  {emp?.dataAdmissao ? <><b className="text-[#0A1E3C]">ADMISSÃO:</b> {fmtDate(emp.dataAdmissao)}</> : null}
                </div>
              </div>
            </div>

            {/* Texto da OS */}
            <div>
              <p className="text-[11px] font-bold text-white bg-[#0A1E3C] px-2 py-1 rounded-t">ORDEM DE SERVIÇO</p>
              <div className="border border-t-0 rounded-b px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                {(data.textoOs || "").trim() || (
                  <span className="text-amber-700">
                    Esta função ainda não tem texto de Ordem de Serviço cadastrado. Cadastre em <b>Recursos Humanos → Funções</b> (tem botão de gerar pela IA).
                  </span>
                )}
              </div>
            </div>

            {/* EPIs com CA */}
            {(data.episEntregues?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] font-bold text-white bg-[#0A1E3C] px-2 py-1 rounded-t">EPIs ENTREGUES</p>
                <table className="w-full text-[11px] border border-t-0">
                  <thead><tr className="bg-slate-100 text-[#0A1E3C]"><th className="text-left px-2 py-1">EPI</th><th className="w-24 px-2 py-1">C.A.</th></tr></thead>
                  <tbody>
                    {data.episEntregues.map((e: any, i: number) => (
                      <tr key={i} className="border-t"><td className="px-2 py-1">{e.nome}</td><td className="px-2 py-1 text-center">{e.ca || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Treinamentos */}
            {(data.treinamentos?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] font-bold text-white bg-[#0A1E3C] px-2 py-1 rounded-t">TREINAMENTOS</p>
                <table className="w-full text-[11px] border border-t-0">
                  <thead><tr className="bg-slate-100 text-[#0A1E3C]"><th className="w-20 px-2 py-1">Norma</th><th className="text-left px-2 py-1">Treinamento</th><th className="w-24 px-2 py-1">Realização</th></tr></thead>
                  <tbody>
                    {data.treinamentos.map((t: any, i: number) => (
                      <tr key={i} className="border-t"><td className="px-2 py-1 text-center">{t.norma || "—"}</td><td className="px-2 py-1">{t.nome || "—"}</td><td className="px-2 py-1 text-center">{fmtDate(t.dataRealizacao) || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Assinatura */}
            <div className="rounded-lg border px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              {data.assinatura ? (
                <div className="text-[11px]">
                  <span className="inline-block text-green-700 border border-green-600 rounded px-1.5 py-0.5 font-bold text-[10px]">✓ ASSINADA DIGITALMENTE</span>
                  <span className="block text-muted-foreground mt-1">
                    {fmtDateTime(data.assinatura.assinadoEm)}
                    {data.assinatura.ipAddress ? ` · IP ${data.assinatura.ipAddress}` : ""}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] font-bold text-red-600">SEM ASSINATURA DO COLABORADOR</span>
              )}
              <Button variant="outline" size="sm" className="gap-1 border-[#0A1E3C] text-[#0A1E3C]"
                onClick={() => setAssinando(true)}>
                <PenLine className="h-3.5 w-3.5" /> {data.assinatura ? "Assinar novamente" : "Coletar assinatura"}
              </Button>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
              <Button size="sm" className="gap-1.5 bg-[#0A1E3C] hover:bg-[#0A1E3C]/90" disabled={!temConteudo} onClick={baixarPdf}>
                <Download className="h-4 w-4" /> Baixar PDF
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Overlay de coleta de assinatura (mesmo fluxo da entrega de EPI) */}
        {assinando && emp ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
            <div className="max-w-lg w-full my-auto">
              <EpiAssinatura
                employeeId={emp.id}
                employeeName={emp.nomeCompleto || ""}
                tipo="ordem_servico"
                tipoAssinante="funcionario"
                companyIdOverride={data?.companyId || undefined}
                onComplete={() => { setAssinando(false); refetch(); }}
                onCancel={() => setAssinando(false)}
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
