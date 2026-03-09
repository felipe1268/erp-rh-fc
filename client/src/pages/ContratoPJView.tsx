import React from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";

function formatDate(d: string | null | undefined) {
  if (!d) return "___/___/______";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function formatDateExtenso(d: string | null | undefined) {
  if (!d) return "_______________";
  try {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}

function parseMoney(val: string | null | undefined): number {
  if (!val) return 0;
  const s = String(val).trim();
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  return parseFloat(s) || 0;
}

function formatMoeda(val: number): string {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function valorPorExtenso(valor: number): string {
  if (valor === 0) return "zero reais";
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function grupo(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cem";
    let s = "";
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    if (c > 0) s += centenas[c];
    if (d === 1) {
      if (s) s += " e ";
      s += especiais[u];
      return s;
    }
    if (d > 0) {
      if (s) s += " e ";
      s += dezenas[d];
    }
    if (u > 0) {
      if (s) s += " e ";
      s += unidades[u];
    }
    return s;
  }

  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);
  
  let resultado = "";
  const milhares = Math.floor(inteiro / 1000);
  const resto = inteiro % 1000;
  
  if (milhares > 0) {
    resultado += grupo(milhares) + " mil";
    if (resto > 0) resultado += " e " + grupo(resto);
  } else {
    resultado += grupo(resto);
  }
  
  resultado += inteiro === 1 ? " real" : " reais";
  
  if (centavos > 0) {
    resultado += " e " + grupo(centavos) + (centavos === 1 ? " centavo" : " centavos");
  }
  
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

export default function ContratoPJView() {
  const [, params] = useRoute("/contrato-pj/:id");
  const [, navigate] = useLocation();
  const contratoId = params?.id ? parseInt(params.id, 10) : 0;
  const { selectedCompany, selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();

  const { data: contrato, isLoading, error } = (trpc as any).pj.contratos.getById.useQuery(
    { id: contratoId },
    { enabled: !!contratoId }
  );

  // Buscar o template editável do contrato PJ (usar companyId do contrato, não do contexto)
  const contratoCompanyId = contrato?.companyId || companyId;
  const { data: template } = (trpc as any).docs.templates.getByTipo.useQuery(
    { companyId: contratoCompanyId, tipo: 'contrato_pj' },
    { enabled: contratoCompanyId > 0 }
  );

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-600">Carregando contrato...</p>
        </div>
      </div>
    );
  }

  if (error || !contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center space-y-4">
          <p className="text-red-600 text-lg font-semibold">Contrato não encontrado</p>
          <Button onClick={() => navigate("/relatorios/raio-x")} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao Raio-X
          </Button>
        </div>
      </div>
    );
  }

  const valorMensal = parseMoney(contrato.valorMensal);
  const nomeEmpresa = contrato.companyRazaoSocial || selectedCompany?.razaoSocial || selectedCompany?.nomeFantasia || "Empresa";
  const cnpjEmpresa = contrato.companyCnpj || selectedCompany?.cnpj || "_______________";
  const enderecoEmpresa = contrato.companyEndereco || selectedCompany?.endereco || "_______________";
  const cidadeEmpresa = contrato.companyCidade || selectedCompany?.cidade || "São José dos Campos";
  const estadoEmpresa = contrato.companyEstado || selectedCompany?.estado || "SP";
  const logoUrl = contrato.companyLogoUrl || (selectedCompany as any)?.logoUrl || null;
  const telefoneEmpresa = contrato.companyTelefone || (selectedCompany as any)?.telefone || "";
  const emailEmpresa = contrato.companyEmail || (selectedCompany as any)?.email || "";
  const siteEmpresa = contrato.companySite || (selectedCompany as any)?.site || "";
  const representante = (selectedCompany as any)?.responsavelLegal || (selectedCompany as any)?.representanteLegal || "_______________";

  const nomePrestador = contrato.razaoSocialPrestador || contrato.employeeName || "_______________";
  const cnpjPrestador = contrato.cnpjPrestador || "_______________";
  const enderecoPrestador = contrato.enderecoPrestador || "_______________";
  const cidadePrestador = contrato.cidadePrestador || cidadeEmpresa;
  const estadoPrestador = contrato.estadoPrestador || estadoEmpresa;

  // Substituir placeholders no template
  function replacePlaceholders(text: string): string {
    return text
      .replace(/\[CONTRATANTE_NOME\]/g, nomeEmpresa)
      .replace(/\[CONTRATANTE_CNPJ\]/g, cnpjEmpresa)
      .replace(/\[CONTRATANTE_ENDERECO\]/g, enderecoEmpresa)
      .replace(/\[CONTRATANTE_CIDADE\]/g, cidadeEmpresa)
      .replace(/\[CONTRATANTE_ESTADO\]/g, estadoEmpresa)
      .replace(/\[CONTRATANTE_REPRESENTANTE\]/g, representante)
      .replace(/\[CONTRATADA_RAZAO_SOCIAL\]/g, nomePrestador)
      .replace(/\[CONTRATADA_CNPJ\]/g, cnpjPrestador)
      .replace(/\[CONTRATADA_ENDERECO\]/g, enderecoPrestador)
      .replace(/\[CONTRATADA_CIDADE\]/g, cidadePrestador)
      .replace(/\[CONTRATADA_ESTADO\]/g, estadoPrestador)
      .replace(/\[OBJETO_CONTRATO\]/g, contrato.objetoContrato || contrato.employeeCargo || "engenharia civil")
      .replace(/\[VALOR_MENSAL\]/g, formatMoeda(valorMensal))
      .replace(/\[VALOR_EXTENSO\]/g, valorPorExtenso(valorMensal))
      .replace(/\[DATA_INICIO\]/g, formatDateExtenso(contrato.dataInicio))
      .replace(/\[DATA_FIM\]/g, formatDate(contrato.dataFim))
      .replace(/\[FORO_COMARCA\]/g, cidadeEmpresa + " - " + estadoEmpresa);
  }

  // Renderizar o texto do template com formatação
  function renderContractText(text: string): React.ReactNode[] {
    const replaced = replacePlaceholders(text);
    const paragraphs = replaced.split('\n');
    
    return paragraphs.map((p, i) => {
      const trimmed = p.trim();
      if (!trimmed) return <div key={i} className="h-3" />;
      
      // Títulos de cláusulas (CLÁUSULA PRIMEIRA, etc)
      if (/^CL[ÁA]USULA\s/i.test(trimmed)) {
        return <h2 key={i} className="text-[12pt] font-bold uppercase mt-6 mb-2">{trimmed}</h2>;
      }
      
      // Sub-itens numerados (1.1, 2.1, etc)
      if (/^\d+\.\d+\s/.test(trimmed)) {
        return <p key={i} className="text-justify text-[11pt] leading-[1.8] mb-1 ml-4">{formatBoldText(trimmed)}</p>;
      }
      
      // Itens com letras (a), b), etc)
      if (/^[a-z]\)/.test(trimmed)) {
        return <p key={i} className="text-justify text-[11pt] leading-[1.8] mb-0.5 ml-8">{formatBoldText(trimmed)}</p>;
      }
      
      // CONSIDERANDO QUE, RESOLVEM, etc - destaque
      if (/^(CONSIDERANDO|RESOLVEM|CONTRATANTE:|CONTRATADA:)/i.test(trimmed)) {
        return <p key={i} className="text-justify text-[11pt] leading-[1.8] mb-2 font-semibold">{formatBoldText(trimmed)}</p>;
      }
      
      // (I), (II), etc
      if (/^\([IVX]+\)/.test(trimmed)) {
        return <p key={i} className="text-justify text-[11pt] leading-[1.8] mb-1 ml-4">{formatBoldText(trimmed)}</p>;
      }
      
      // Parágrafo Único
      if (/^Par[áa]grafo\s[ÚU]nico/i.test(trimmed)) {
        return <p key={i} className="text-justify text-[11pt] leading-[1.8] mb-2 ml-4 italic">{formatBoldText(trimmed)}</p>;
      }
      
      // Título principal do contrato (primeira linha em CAPS)
      if (i <= 1 && trimmed === trimmed.toUpperCase() && trimmed.length > 10) {
        return <h1 key={i} className="text-center text-[15pt] font-bold uppercase tracking-wide mb-1">{trimmed}</h1>;
      }
      
      // Linhas de assinatura
      if (trimmed.startsWith('_____')) {
        return <div key={i} className="border-t border-black w-64 mx-auto mt-12 mb-1" />;
      }
      
      // Texto normal
      return <p key={i} className="text-justify text-[11pt] leading-[1.8] mb-1">{formatBoldText(trimmed)}</p>;
    });
  }

  // Formatar texto em negrito (entre ** ou "CONTRATANTE"/"CONTRATADA")
  function formatBoldText(text: string): React.ReactNode[] {
    // Destacar termos importantes em negrito
    const parts = text.split(/("CONTRATANTE"|"CONTRATADA"|CONTRATANTE|CONTRATADA)/g);
    return parts.map((part, i) => {
      if (part === '"CONTRATANTE"' || part === 'CONTRATANTE') {
        return <strong key={i}>{part}</strong>;
      }
      if (part === '"CONTRATADA"' || part === 'CONTRATADA') {
        return <strong key={i}>{part}</strong>;
      }
      return part;
    });
  }

  const templateText = template?.conteudo || '';

  return (
    <>
      {/* BARRA DE AÇÕES - só aparece na tela, esconde na impressão */}
      <div className="print:hidden sticky top-0 z-50 bg-gradient-to-r from-blue-800 to-blue-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="text-white hover:bg-white/20 h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Contrato de Prestação de Serviços PJ</h1>
            <p className="text-sm text-white/80">{contrato.numeroContrato || "S/N"} — {contrato.employeeName}</p>
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

      {/* CONTRATO */}
      <div className="contrato-pj-page bg-gray-200 print:bg-white min-h-screen">
        <div className="contrato-body max-w-[750px] mx-auto bg-white print:shadow-none shadow-xl my-8 print:my-0 px-16 py-14 print:px-0 print:py-0" style={{ fontFamily: "'Times New Roman', 'Georgia', serif" }}>
          
          {/* CABEÇALHO COM LOGO */}
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
              <p className="text-[11pt] font-bold text-blue-900">{contrato.numeroContrato || "S/N"}</p>
            </div>
          </div>

          {/* CORPO DO CONTRATO - Renderizado a partir do template */}
          <div className="contract-content">
            {templateText ? (
              renderContractText(templateText)
            ) : (
              <p className="text-center text-gray-500 py-8">
                Nenhum modelo de contrato configurado. Acesse Configurações → Contrato PJ para definir o modelo.
              </p>
            )}
          </div>

          {/* RODAPÉ COM DADOS DA EMPRESA */}
          {(telefoneEmpresa || emailEmpresa || siteEmpresa) && (
            <div className="mt-12 pt-4 border-t border-gray-300 text-center">
              <p className="text-[9pt] font-bold text-blue-900 mb-1">{nomeEmpresa}</p>
              <p className="text-[8pt] text-gray-500">
                {[telefoneEmpresa && `Tel: ${telefoneEmpresa}`, emailEmpresa && `E-mail: ${emailEmpresa}`, siteEmpresa && `Site: ${siteEmpresa}`].filter(Boolean).join(" | ")}
              </p>
              {enderecoEmpresa && enderecoEmpresa !== "_______________" && (
                <p className="text-[8pt] text-gray-500">{enderecoEmpresa}{cidadeEmpresa ? ` \u2014 ${cidadeEmpresa}/${estadoEmpresa}` : ""}</p>
              )}
            </div>
          )}

        </div>
      </div>

      {/* CSS DE IMPRESSÃO */}
      <style>{`
        @media print {
          body > *:not(#root) { display: none !important; }
          .print\\:hidden { display: none !important; }
          
          @page {
            size: A4 portrait;
            margin: 2cm;
          }
          
          .contrato-pj-page {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .contrato-body {
            max-width: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
          <PrintFooterLGPD />
    </>
  );
}
