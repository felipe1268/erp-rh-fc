import React from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";

function formatDateExtenso(d: string | null | undefined) {
  if (!d) return "_______________";
  try {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}

export default function AditivoPJViewWrapper() {
  const [, params] = useRoute("/contrato-pj/:contractId/aditivo/:aditivoId");
  const aditivoId = params?.aditivoId ? parseInt(params.aditivoId, 10) : 0;
  return <AditivoPJViewInner key={aditivoId} aditivoId={aditivoId} />;
}

function AditivoPJViewInner({ aditivoId }: { aditivoId: number }) {
  const [, navigate] = useLocation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const { data: aditivo, isLoading, error } = (trpc as any).pj.aditivos.getById.useQuery(
    { id: aditivoId, companyId },
    { enabled: !!aditivoId && companyId > 0 }
  );

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-600">Carregando aditivo...</p>
        </div>
      </div>
    );
  }

  if (error || !aditivo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center space-y-4">
          <p className="text-red-600 text-lg font-semibold">Aditivo não encontrado</p>
          <Button onClick={() => window.history.back()} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  const nomeEmpresa = aditivo.companyRazaoSocial || selectedCompany?.razaoSocial || "FC Engenharia e Construção LTDA";
  const cnpjEmpresa = aditivo.companyCnpj || selectedCompany?.cnpj || "29.353.906/0001-71";
  const enderecoEmpresa = aditivo.companyEndereco || selectedCompany?.endereco || "_______________";
  const cidadeEmpresa = aditivo.companyCidade || selectedCompany?.cidade || "Guaratinguetá";
  const estadoEmpresa = aditivo.companyEstado || selectedCompany?.estado || "SP";
  const logoUrl = aditivo.companyLogoUrl || (selectedCompany as any)?.logoUrl || null;
  const representante = aditivo.responsavelLegal || (selectedCompany as any)?.responsavelLegal || "_______________";
  const nomePrestador = aditivo.razaoSocialPrestador || aditivo.employeeName || "_______________";
  const cnpjPrestador = aditivo.cnpjPrestador || "_______________";
  const dataAditivo = formatDateExtenso(aditivo.dataAditivo);
  const dataContratoOriginal = formatDateExtenso(aditivo.dataInicio);

  let clausulasData: Array<{ clausulaNum: string; clausulaTitulo: string; novoTexto: string }> = [];
  try {
    clausulasData = JSON.parse(aditivo.clausulasAlteradas || "[]");
  } catch { clausulasData = []; }

  return (
    <>
      <div className="print:hidden sticky top-0 z-50 bg-gradient-to-r from-blue-800 to-blue-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="text-white hover:bg-white/20 h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Aditivo Contratual nº {aditivo.numeroAditivo}</h1>
            <p className="text-sm text-white/80">{aditivo.numeroContrato || "S/N"} — {aditivo.employeeName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20 gap-1.5 border border-white/30">
            <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="text-white hover:bg-white/20 gap-1.5 border border-white/30">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>

      <div className="aditivo-pj-page bg-gray-200 print:bg-white min-h-screen">
        <div className="aditivo-body max-w-[750px] mx-auto bg-white print:shadow-none shadow-xl my-8 print:my-0 px-16 py-14 print:px-0 print:py-0" style={{ fontFamily: "'Times New Roman', 'Georgia', serif" }}>

          <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-blue-800">
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
              ) : (
                <div className="h-16 w-16 bg-blue-800 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                  {nomeEmpresa.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                </div>
              )}
              <div>
                <p className="text-[13pt] font-bold text-blue-900">{nomeEmpresa}</p>
                <p className="text-[9pt] text-gray-500">CNPJ: {cnpjEmpresa}</p>
                <p className="text-[9pt] text-gray-500">{enderecoEmpresa}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9pt] text-gray-400">Contrato nº</p>
              <p className="text-[11pt] font-bold text-blue-900">{aditivo.numeroContrato || "S/N"}</p>
              <p className="text-[9pt] text-gray-400 mt-1">Aditivo nº {String(aditivo.numeroAditivo).padStart(2, '0')}</p>
            </div>
          </div>

          <h1 className="text-center text-[14pt] font-bold uppercase mb-8 leading-relaxed">
            ADITIVO CONTRATUAL
          </h1>

          <p className="text-justify text-[11pt] leading-[1.8] mb-4">
            De um lado, <strong>{nomeEmpresa}</strong>, inscrita no CNPJ {cnpjEmpresa}, com sede em {enderecoEmpresa}, {cidadeEmpresa}-{estadoEmpresa}, representada por {representante}, doravante denominada <strong>CONTRATANTE</strong> e do outro, <strong>{nomePrestador}</strong>, inscrita no CNPJ/CPF sob nº {cnpjPrestador}, doravante denominada simplesmente <strong>CONTRATADA</strong>.
          </p>

          <h2 className="text-[12pt] font-bold uppercase mt-8 mb-4">CONSIDERANDO QUE:</h2>

          <p className="text-justify text-[11pt] leading-[1.8] mb-4 ml-4">
            As partes celebraram Contrato de Prestação de Serviços nº {aditivo.numeroContrato || "___"}, firmado em {dataContratoOriginal}, e que desejam alterar determinadas cláusulas do referido contrato, conforme abaixo especificado.
          </p>

          {clausulasData.map((cl, idx) => (
            <React.Fragment key={idx}>
              <h2 className="text-[12pt] font-bold uppercase mt-6 mb-2">
                CLÁUSULA {String(idx + 1).padStart(2, '0')} DO ADITIVO
              </h2>
              <p className="text-justify text-[11pt] leading-[1.8] mb-2 ml-4">
                O presente aditivo contratual destina-se à alteração da <strong>Cláusula {cl.clausulaNum} — {cl.clausulaTitulo}</strong>, do contrato original firmado em {dataContratoOriginal}.
              </p>
              <p className="text-justify text-[11pt] leading-[1.8] mb-4 ml-4">
                As partes acordam que a referida cláusula passa a vigorar com a seguinte redação:
              </p>
              <div className="ml-8 mr-4 border-l-4 border-blue-800 pl-4 py-2 mb-4 bg-blue-50/30">
                <p className="text-justify text-[11pt] leading-[1.8] italic whitespace-pre-line">
                  {cl.novoTexto}
                </p>
              </div>
            </React.Fragment>
          ))}

          <h2 className="text-[12pt] font-bold uppercase mt-8 mb-2">
            CLÁUSULA {String(clausulasData.length + 1).padStart(2, '0')} DO ADITIVO — DISPOSIÇÕES FINAIS
          </h2>
          <p className="text-justify text-[11pt] leading-[1.8] mb-4 ml-4">
            As demais cláusulas do contrato original permanecem inalteradas e em pleno vigor.
          </p>

          <p className="text-justify text-[11pt] leading-[1.8] mt-8 mb-2">
            Por estarem de acordo com o presente aditivo contratual, para a firmeza e validade do que aqui resta ajustado, fica lido em sua totalidade pelas partes e achado conforme, assinam o presente termo.
          </p>

          <p className="text-center text-[11pt] leading-[1.8] mt-8 mb-12">
            {cidadeEmpresa}, {dataAditivo}.
          </p>

          <div className="flex justify-between mt-16 px-8">
            <div className="text-center">
              <div className="w-56 border-t border-black pt-2">
                <p className="text-[11pt] font-bold">CONTRATANTE</p>
                <p className="text-[10pt]">{nomeEmpresa}</p>
                <p className="text-[10pt]">{representante}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="w-56 border-t border-black pt-2">
                <p className="text-[11pt] font-bold">CONTRATADA</p>
                <p className="text-[10pt]">{nomePrestador}</p>
                <p className="text-[10pt]">CNPJ/CPF: {cnpjPrestador}</p>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <p className="text-[11pt] font-bold mb-8">Testemunhas</p>
            <div className="flex justify-between px-8">
              <div className="text-center">
                <div className="w-56 border-t border-black pt-2">
                  <p className="text-[10pt]">Nome:</p>
                  <p className="text-[10pt]">CPF:</p>
                </div>
              </div>
              <div className="text-center">
                <div className="w-56 border-t border-black pt-2">
                  <p className="text-[10pt]">Nome:</p>
                  <p className="text-[10pt]">CPF:</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(#root) { display: none !important; }
          .print\\:hidden { display: none !important; }
          @page { size: A4 portrait; margin: 2cm; }
          .aditivo-pj-page { background: white !important; padding: 0 !important; margin: 0 !important; }
          .aditivo-body { max-width: none !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
        }
      `}</style>
      <PrintFooterLGPD />
    </>
  );
}
