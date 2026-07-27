// ============================================================================
// Rev. 4644 — FICHA DE EPI (por funcionário) — componente REUTILIZÁVEL
// Aberto de 3 lugares: aba lateral "Ficha de EPI" (SST), Raio-X do colaborador
// e Ficha Documental do Controle de Documentos.
// Documento no padrão do modelo físico (CONTROLE DE E.P.I.'s / Termo de
// Compromisso — art. 158 e 166 CLT + NR-06): todas as entregas com produto,
// quantidade, C.A., datas e a ASSINATURA DIGITAL de cada entrega, com
// autenticação (data/hora, IP e hash SHA-256) p/ envio a cliente ou MTE.
// ============================================================================
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ShieldCheck, PenLine } from "lucide-react";
import { formatCPF } from "@/lib/formatters";
import EpiAssinatura from "@/pages/EpiAssinatura";

// Miniatura de /uploads (memória: fotos originais quebram no Safari/iPad — usar ?w=)
// Só anexa ?w= em caminhos internos /uploads — URL externa/pré-assinada quebraria.
function thumb(u?: string | null, w = 256): string {
  if (!u) return "";
  if (!u.startsWith("/uploads")) return u;
  return u.includes("?") ? `${u}&w=${w}` : `${u}?w=${w}`;
}

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const s = String(v).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const s = String(v);
  const d = fmtDate(s);
  const hm = s.match(/[T ](\d{2}):(\d{2})/);
  return hm ? `${d} ${hm[1]}:${hm[2]}` : d;
}

export default function FichaEpiDialog({ employeeId, open, onClose, companyId, companyIds }: {
  employeeId: number | null;
  open: boolean;
  onClose: () => void;
  companyId: number;
  companyIds?: number[];
}) {
  // Rev. 4646 — coleta de assinatura pendente direto da ficha
  const [signDelivery, setSignDelivery] = useState<any | null>(null);
  // Rev. 4648 — clique na foto amplia
  const [fotoZoom, setFotoZoom] = useState(false);
  const enabled = open && !!employeeId && (!!companyId || (companyIds?.length ?? 0) > 0);
  const { data, isLoading, refetch } = trpc.epis.fichaEpiFuncionario.useQuery(
    { companyId, companyIds, employeeId: employeeId! },
    { enabled }
  );
  const termoQ = trpc.epis.getFormText.useQuery(
    { companyId: data?.empresa?.id || companyId || 0 },
    { enabled: enabled && !!(data?.empresa?.id || companyId) }
  );
  const termo = termoQ.data?.texto || "";

  const entregas = data?.entregas || [];
  const assinadas = useMemo(() => entregas.filter((e: any) => !!e.assinaturaUrl).length, [entregas]);
  const emp = data?.funcionario;
  const empresa = data?.empresa;

  // ===================== IMPRESSÃO / PDF =====================
  // Memória: NUNCA window.print() de container fixed → HTML autocontido em
  // window.open(); esc() LOCAL (XSS) p/ todo texto vindo do banco.
  const handlePrint = () => {
    if (!emp || !empresa) return;
    const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const abs = (u?: string | null) => !u ? "" : (/^(https?:|data:|blob:)/.test(u) ? u : window.location.origin + u);
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = entregas.map((e: any) => `
      <tr>
        <td class="c">${esc(e.quantidade)}</td>
        <td>${esc(e.nomeEpi || "—")}${e.tamanhoEpi ? ` <span class="mut">(${esc(e.tamanhoEpi)})</span>` : ""}</td>
        <td class="c">${esc(e.caEpi || "—")}</td>
        <td class="c">${fmtDate(e.dataEntrega)}</td>
        <td class="c">${fmtDate(e.dataDevolucao) === "—" ? "" : fmtDate(e.dataDevolucao)}</td>
        <td class="c sig">${e.assinaturaUrl
          ? `<img src="${esc(abs(e.assinaturaUrl))}" alt="assinatura" /><div class="aut">${e.autenticacao ? `${esc(fmtDateTime(e.autenticacao.assinadoEm))}${e.autenticacao.ipAddress ? ` · IP ${esc(e.autenticacao.ipAddress)}` : ""}${e.autenticacao.hashSha256 ? `<br/>SHA-256 ${esc(String(e.autenticacao.hashSha256).slice(0, 16))}…` : ""}` : esc(fmtDateTime(e.createdAt))}</div>`
          : `<span class="pend">SEM ASSINATURA</span>`}</td>
      </tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ficha de EPI — ${esc(emp.nomeCompleto)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
  .top { border: 1.5px solid #0A1E3C; }
  .titulo { background: #0A1E3C; color: #fff; font-size: 14px; font-weight: bold; padding: 4px 8px; letter-spacing: 1px; display: flex; align-items: center; min-height: 32px; }
  .titulo .logobox { width: 110px; flex: 0 0 110px; display: flex; align-items: center; }
  .titulo .logobox .logo { background: #fff; border-radius: 3px; padding: 2px 5px; max-height: 24px; max-width: 100px; width: auto; height: auto; object-fit: contain; display: block; }
  .titulo span.t { flex: 1; text-align: center; }
  .titulo .sp { width: 110px; flex: 0 0 110px; }
  .cab { display: flex; align-items: stretch; }
  .cab .grid { flex: 1; }
  .foto { width: 88px; border-left: 1px solid #0A1E3C; display: flex; align-items: center; justify-content: center; padding: 4px; }
  .foto img { width: 78px; height: 96px; object-fit: cover; border: 1px solid #99a; border-radius: 3px; }
  .sub { text-align: center; font-weight: bold; font-size: 11px; padding: 3px; border-bottom: 1px solid #0A1E3C; background: #f4f6fa; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; }
  .grid div { padding: 4px 6px; border-bottom: 1px solid #ccd; font-size: 10px; }
  .grid b { color: #0A1E3C; }
  .termo { padding: 7px 8px; font-size: 9.5px; text-align: justify; line-height: 1.45; border-bottom: 1px solid #0A1E3C; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #0A1E3C; color: #fff; font-size: 9px; padding: 4px 3px; border: 1px solid #0A1E3C; }
  td { border: 1px solid #99a; padding: 3px 4px; font-size: 9.5px; vertical-align: middle; }
  td.c { text-align: center; } .mut { color: #666; }
  td.sig img { height: 26px; max-width: 110px; object-fit: contain; display: block; margin: 0 auto; }
  .aut { font-size: 6.5px; color: #555; margin-top: 1px; line-height: 1.25; }
  .pend { color: #b91c1c; font-weight: bold; font-size: 8px; }
  .rodape { margin-top: 10px; font-size: 8.5px; color: #333; border: 1px solid #99a; padding: 6px 8px; background: #f8fafc; line-height: 1.5; }
  .footer { margin-top: 8px; display: flex; justify-content: space-between; font-size: 8px; color: #777; }
</style></head><body>
<div class="top">
  <div class="titulo">
    <div class="logobox">${empresa.logoUrl ? `<img class="logo" src="${esc(abs(empresa.logoUrl))}" alt="logo" />` : ""}</div>
    <span class="t">CONTROLE DE E.P.I.'S</span>
    <div class="sp"></div>
  </div>
  <div class="cab">
    <div class="grid">
      <div><b>EMPRESA:</b> ${esc(empresa.razaoSocial)}</div>
      <div><b>CNPJ:</b> ${esc(empresa.cnpj)}</div>
      <div><b>NOME:</b> ${esc(emp.nomeCompleto)}</div>
      <div><b>CPF:</b> ${esc(formatCPF(emp.cpf))}</div>
      <div><b>FUNÇÃO:</b> ${esc(emp.funcao || "—")}</div>
      <div><b>Nº INTERNO:</b> ${esc(emp.numeroInterno || "—")}${emp.dataAdmissao ? ` &nbsp; <b>ADMISSÃO:</b> ${fmtDate(emp.dataAdmissao)}` : ""}</div>
    </div>
    ${emp.fotoUrl ? `<div class="foto"><img src="${esc(abs(thumb(emp.fotoUrl, 512)))}" alt="foto" /></div>` : ""}
  </div>
  <div class="sub">TERMO DE COMPROMISSO</div>
  <div class="termo">${esc(termo)}</div>
</div>
<table>
  <thead><tr><th style="width:34px">Quant.</th><th>Descrição</th><th style="width:56px">C.A.</th><th style="width:64px">Data Entrega</th><th style="width:64px">Data Devolução</th><th style="width:130px">Assinatura do Funcionário</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="6" class="c">Nenhuma entrega registrada.</td></tr>`}</tbody>
</table>
<div class="rodape"><b>AUTENTICAÇÃO DIGITAL:</b> As assinaturas desta ficha foram coletadas eletronicamente no ato de cada entrega, com registro de data/hora, endereço IP e hash criptográfico SHA-256 da imagem da assinatura, garantindo integridade e autenticidade do documento nos termos da MP 2.200-2/2001 (ICP-Brasil), art. 158 e 166 da CLT e NR-06 do MTE. Total: ${entregas.length} entrega(s), ${assinadas} assinada(s).</div>
<div class="footer"><span>ERP Gestão Integrada — Ficha de EPI</span><span>Emitido em ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR").slice(0, 5)}</span></div>
</body></html>`);
    w.document.close();
    // Rev. 4646 — espera foto/logo/assinaturas carregarem antes de imprimir
    setTimeout(() => w.print(), 1200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[92vh] overflow-y-auto" style={{ background: "#fff", color: "#111" }}>
        {isLoading || !data ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <Loader2 className="animate-spin mr-2 h-5 w-5" /> Carregando ficha de EPI...
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-[#0A1E3C]" /> Ficha de EPI — Controle de E.P.I.'s
              </DialogTitle>
            </DialogHeader>

            {/* Cabeçalho do documento — com logo da empresa e foto do colaborador */}
            <div className="rounded-lg border-2 border-[#0A1E3C] overflow-hidden text-xs">
              <div className="bg-[#0A1E3C] text-white flex items-center px-2 py-1 min-h-[38px]">
                <div className="w-[110px] shrink-0 flex items-center">
                  {empresa?.logoUrl ? (
                    <span className="inline-flex items-center justify-center bg-white rounded px-1.5 py-0.5 h-[28px] max-w-[106px] overflow-hidden">
                      <img src={thumb(empresa.logoUrl, 256)} alt="logo" className="max-h-[24px] max-w-[96px] w-auto h-auto object-contain" />
                    </span>
                  ) : null}
                </div>
                <span className="flex-1 text-center font-bold tracking-wider text-[13px]">CONTROLE DE E.P.I.'S</span>
                <div className="w-[110px] shrink-0" />
              </div>
              <div className="flex items-stretch">
                <div className="grid grid-cols-1 sm:grid-cols-2 flex-1">
                  <div className="px-3 py-1.5 border-b border-gray-200"><b className="text-[#0A1E3C]">EMPRESA:</b> {empresa?.razaoSocial}</div>
                  <div className="px-3 py-1.5 border-b border-gray-200"><b className="text-[#0A1E3C]">CNPJ:</b> {empresa?.cnpj}</div>
                  <div className="px-3 py-1.5 border-b border-gray-200 break-words"><b className="text-[#0A1E3C]">NOME:</b> {emp?.nomeCompleto}</div>
                  <div className="px-3 py-1.5 border-b border-gray-200"><b className="text-[#0A1E3C]">CPF:</b> {formatCPF(emp?.cpf)}</div>
                  <div className="px-3 py-1.5 border-b border-gray-200"><b className="text-[#0A1E3C]">FUNÇÃO:</b> {emp?.funcao || "—"}</div>
                  <div className="px-3 py-1.5 border-b border-gray-200"><b className="text-[#0A1E3C]">Nº INTERNO:</b> {emp?.numeroInterno || "—"}</div>
                </div>
                {emp?.fotoUrl ? (
                  <div className="w-[92px] border-l border-[#0A1E3C] flex items-center justify-center p-1.5 shrink-0">
                    <button type="button" title="Ampliar foto" onClick={() => setFotoZoom(true)}>
                      <img src={thumb(emp.fotoUrl, 256)} alt={emp?.nomeCompleto || "foto"} className="w-[80px] h-[100px] object-cover rounded border border-gray-300" loading="lazy" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="bg-gray-50 px-3 py-2 text-[11px] text-justify leading-relaxed border-t border-[#0A1E3C]">
                <p className="font-bold text-center text-[#0A1E3C] mb-1">TERMO DE COMPROMISSO</p>
                {termo}
              </div>
            </div>

            {/* Resumo */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold">{entregas.length} entrega(s)</span>
              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${assinadas === entregas.length && entregas.length > 0 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}>
                {assinadas} assinada(s)
              </span>
              {entregas.length > 0 && assinadas < entregas.length && (
                <span className="text-red-600 font-medium">{entregas.length - assinadas} sem assinatura</span>
              )}
            </div>

            {/* Tabela de entregas */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0A1E3C] text-white">
                    <th className="px-2 py-1.5 text-center">Qt.</th>
                    <th className="px-2 py-1.5 text-left">Descrição</th>
                    <th className="px-2 py-1.5 text-center">C.A.</th>
                    <th className="px-2 py-1.5 text-center">Entrega</th>
                    <th className="px-2 py-1.5 text-center">Devolução</th>
                    <th className="px-2 py-1.5 text-center">Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Nenhuma entrega de EPI registrada para este colaborador.</td></tr>
                  ) : entregas.map((e: any) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-2 py-1.5 text-center">{e.quantidade}</td>
                      <td className="px-2 py-1.5 break-words">{e.nomeEpi || "—"}{e.tamanhoEpi ? <span className="text-muted-foreground"> ({e.tamanhoEpi})</span> : null}</td>
                      <td className="px-2 py-1.5 text-center">{e.caEpi || "—"}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{fmtDate(e.dataEntrega)}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{fmtDate(e.dataDevolucao) === "—" ? "" : fmtDate(e.dataDevolucao)}</td>
                      <td className="px-2 py-1.5 text-center">
                        {e.assinaturaUrl ? (
                          <div>
                            <img src={e.assinaturaUrl} alt="assinatura" className="h-7 max-w-[110px] object-contain mx-auto" loading="lazy" />
                            <p className="text-[8px] text-muted-foreground leading-tight mt-0.5">
                              {e.autenticacao ? (
                                <>
                                  {fmtDateTime(e.autenticacao.assinadoEm)}{e.autenticacao.ipAddress ? ` · IP ${e.autenticacao.ipAddress}` : ""}
                                  {e.autenticacao.hashSha256 ? <><br />SHA-256 {String(e.autenticacao.hashSha256).slice(0, 16)}…</> : null}
                                </>
                              ) : fmtDateTime(e.createdAt)}
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-bold text-red-600">SEM ASSINATURA</span>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 border-[#0A1E3C] text-[#0A1E3C]"
                              onClick={() => setSignDelivery(e)}>
                              <PenLine className="h-3 w-3" /> Coletar assinatura
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <b>Autenticação digital:</b> cada assinatura foi coletada eletronicamente no ato da entrega, com registro de data/hora, IP e hash SHA-256 — válida nos termos da MP 2.200-2/2001, art. 158 e 166 da CLT e NR-06 do MTE.
            </p>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
              <Button size="sm" onClick={handlePrint} disabled={!emp || !empresa} className="gap-1.5">
                <Printer className="h-4 w-4" /> Imprimir / PDF
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Rev. 4648 — Lightbox da foto do colaborador */}
        {fotoZoom && emp?.fotoUrl ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setFotoZoom(false)}>
            <div className="max-w-md w-full">
              <img src={thumb(emp.fotoUrl, 1024)} alt={emp?.nomeCompleto || "foto"} className="w-full max-h-[70vh] object-contain rounded-t-lg bg-black" />
              <div className="bg-[#0A1E3C] text-white px-4 py-2.5 rounded-b-lg">
                <p className="font-semibold text-sm">{emp?.nomeCompleto}</p>
                {emp?.funcao ? <p className="text-xs text-white/70">{emp.funcao}</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Rev. 4646 — Overlay de coleta de assinatura pendente (mesmo fluxo da entrega) */}
        {signDelivery && emp ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
            <div className="max-w-lg w-full my-auto">
              <EpiAssinatura
                employeeId={emp.id}
                employeeName={emp.nomeCompleto || ""}
                deliveryId={signDelivery.id}
                tipo="entrega"
                tipoAssinante="funcionario"
                epiNome={signDelivery.nomeEpi || undefined}
                companyIdOverride={signDelivery.companyId || undefined}
                onComplete={() => { setSignDelivery(null); refetch(); }}
                onCancel={() => setSignDelivery(null)}
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
