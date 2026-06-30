import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2, FilePlus2, Check, Pencil, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompany } from "@/contexts/CompanyContext";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { toast } from "sonner";
import { calcularPrazoVigencia } from "@shared/contratoPrazo";

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

export default function ContratoPJViewWrapper() {
  const [, params] = useRoute("/contrato-pj/:id");
  const contratoId = params?.id ? parseInt(params.id, 10) : 0;
  return <ContratoPJViewInner key={contratoId} routeContratoId={contratoId} />;
}

function ContratoPJViewInner({ routeContratoId }: { routeContratoId: number }) {
  const [, navigate] = useLocation();
  const contratoId = routeContratoId;
  const { selectedCompany, selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();

  const { data: contrato, isLoading, error } = (trpc as any).pj.contratos.getById.useQuery(
    { id: contratoId },
    { enabled: !!contratoId }
  );

  const { data: modeloPadrao } = trpc.pj.modeloContrato.useQuery();

  const [showAditivoModal, setShowAditivoModal] = useState(false);
  const [selectedClausulas, setSelectedClausulas] = useState<Record<string, boolean>>({});
  const [novoTextoClausulas, setNovoTextoClausulas] = useState<Record<string, string>>({});
  const [dataAditivo, setDataAditivo] = useState(new Date().toISOString().split('T')[0]);

  // Edição de cláusulas
  const [showEditClausulas, setShowEditClausulas] = useState(false);
  const [editClausulasTexto, setEditClausulasTexto] = useState("");

  // Rev. 1340: auto-save de rascunho do aditivo no navegador (localStorage)
  const draftKey = `pj-aditivo-draft-${contratoId}`;
  // Restaura rascunho ao abrir o modal
  React.useEffect(() => {
    if (!showAditivoModal) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.dataAditivo) setDataAditivo(d.dataAditivo);
        if (d?.selectedClausulas) setSelectedClausulas(d.selectedClausulas);
        if (d?.novoTextoClausulas) setNovoTextoClausulas(d.novoTextoClausulas);
        if (d?.dataAditivo || Object.keys(d?.selectedClausulas || {}).length > 0) {
          toast.info("Rascunho recuperado do navegador.");
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAditivoModal]);
  // Salva rascunho enquanto digita (apenas se houver algo)
  React.useEffect(() => {
    if (!showAditivoModal) return;
    const hasContent = Object.values(selectedClausulas).some(Boolean) || Object.values(novoTextoClausulas).some(v => (v || "").trim().length > 0);
    try {
      if (hasContent) {
        localStorage.setItem(draftKey, JSON.stringify({ dataAditivo, selectedClausulas, novoTextoClausulas }));
      }
    } catch {}
  }, [showAditivoModal, draftKey, dataAditivo, selectedClausulas, novoTextoClausulas]);
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch {} };

  const clausulasQ = (trpc as any).pj.extrairClausulas.useQuery(
    { contractId: contratoId, companyId },
    { enabled: showAditivoModal && companyId > 0 },
  );
  const clausulas = clausulasQ.data ?? [];

  // Aditivos já gerados para este contrato
  const aditivosListQ = (trpc as any).pj.aditivos.list.useQuery(
    { contractId: contratoId, companyId },
    { enabled: !!contratoId && companyId > 0 },
  );
  const aditivosExistentes: Array<{ id: number; numeroAditivo: number; dataAditivo: string }> = aditivosListQ.data ?? [];

  const utils = trpc.useUtils();
  const salvarClausulasMut = (trpc as any).pj.salvarClausulas.useMutation({
    onSuccess: () => {
      toast.success("Cláusulas salvas com sucesso!");
      setShowEditClausulas(false);
      utils.pj.contratos.getById.invalidate({ id: contratoId });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao salvar cláusulas"),
  });

  // Pré-carrega o editor com o texto atual ao abrir
  useEffect(() => {
    if (!showEditClausulas) return;
    const textoAtual = (contrato as any)?.clausulasCustomizadas || modeloPadrao?.modelo || "";
    setEditClausulasTexto(textoAtual);
  }, [showEditClausulas]);

  const criarAditivo = (trpc as any).pj.aditivos.create.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Aditivo nº ${data.numeroAditivo} criado com sucesso!`);
      setShowAditivoModal(false);
      setSelectedClausulas({});
      setNovoTextoClausulas({});
      clearDraft();
      navigate(`/contrato-pj/${contratoId}/aditivo/${data.id}`);
    },
    onError: (err: any) => toast.error(err.message || "Erro ao criar aditivo"),
  });

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

  const percAdiantamento = contrato?.percentualAdiantamento || 40;
  const percFechamento = contrato?.percentualFechamento || 60;
  const diaAdiantamento = contrato?.diaAdiantamento || 20;
  const diaFechamento = contrato?.diaFechamento || 5;
  const valorAdiantamento = formatMoeda(valorMensal * percAdiantamento / 100);
  const valorFechamento = formatMoeda(valorMensal * percFechamento / 100);
  const hoje = new Date();
  const dataAssinatura = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

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
      .replace(/\[VALOR_ADIANTAMENTO\]/g, valorAdiantamento)
      .replace(/\[VALOR_FECHAMENTO\]/g, valorFechamento)
      .replace(/\[PERCENTUAL_ADIANTAMENTO\]/g, String(percAdiantamento))
      .replace(/\[PERCENTUAL_FECHAMENTO\]/g, String(percFechamento))
      .replace(/\[DIA_ADIANTAMENTO\]/g, String(diaAdiantamento))
      .replace(/\[DIA_FECHAMENTO\]/g, String(diaFechamento))
      .replace(/\[PRAZO_VIGENCIA\]/g, calcularPrazoVigencia(contrato.dataInicio, contrato.dataFim))
      .replace(/\[DATA_INICIO\]/g, formatDateExtenso(contrato.dataInicio))
      .replace(/\[DATA_FIM\]/g, formatDate(contrato.dataFim))
      .replace(/\[DATA_ASSINATURA\]/g, dataAssinatura)
      .replace(/\[FORO_COMARCA\]/g, cidadeEmpresa + " - " + estadoEmpresa)
      .replace(/\[PRESTADOR_NOME\]/g, contrato.employeeName || nomePrestador)
      .replace(/\[PRESTADOR_CPF\]/g, contrato.employeeCpf || "_______________");
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
        return <p key={i} className="text-justify text-[11pt] leading-[1.8] mb-2 ml-4">{formatBoldText(trimmed)}</p>;
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

  const templateText = (contrato as any)?.clausulasCustomizadas || modeloPadrao?.modelo || '';
  const temClausulasCustomizadas = !!(contrato as any)?.clausulasCustomizadas;

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
          {aditivosExistentes.length > 0 && (
            <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-white/20">
              <span className="text-[11px] uppercase tracking-wider text-white/70 mr-1">Aditivos:</span>
              {aditivosExistentes.map(a => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/contrato-pj/${contratoId}/aditivo/${a.id}`)}
                  title={`Abrir Aditivo nº ${a.numeroAditivo} (${a.dataAditivo})`}
                  className="px-2 py-1 text-xs font-bold rounded bg-amber-500/90 hover:bg-amber-400 text-white shadow"
                >
                  Nº {String(a.numeroAditivo).padStart(2, '0')}
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowEditClausulas(true)} className="text-white hover:bg-white/20 gap-1.5 border border-green-300/50 text-green-200">
            <Pencil className="h-4 w-4" /> Editar Cláusulas
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAditivoModal(true)} className="text-white hover:bg-white/20 gap-1.5 border border-amber-300/50 text-amber-200">
            <FilePlus2 className="h-4 w-4" /> Criar Aditivo
          </Button>
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
              {(contrato as any).revisao && (
                <p className="text-[9pt] text-gray-400 mt-1">Rev. {(contrato as any).revisao}</p>
              )}
            </div>
          </div>

          {/* CORPO DO CONTRATO - Renderizado a partir do template */}
          {temClausulasCustomizadas && (
            <div className="print:hidden mb-4 flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
              <Pencil className="h-4 w-4 shrink-0 text-green-600" />
              <span>Este contrato possui <strong>cláusulas personalizadas</strong>. Clique em "Editar Cláusulas" para modificar.</span>
            </div>
          )}
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

      {/* MODAL CRIAR ADITIVO */}
      <Dialog open={showAditivoModal} onOpenChange={setShowAditivoModal}>
        <DialogContent className="max-w-2xl w-[90vw] max-h-[85vh] overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-gray-900">
              <FilePlus2 className="h-5 w-5 text-amber-600" />
              Criar Aditivo Contratual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                Selecione as cláusulas que deseja alterar e informe a nova redação para cada uma. As demais cláusulas do contrato original serão mantidas automaticamente.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Data do Aditivo</label>
              <input
                type="date"
                value={dataAditivo}
                onChange={e => setDataAditivo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Cláusulas do Contrato</p>
              {clausulasQ.isLoading ? (
                <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" /> Extraindo cláusulas...
                </div>
              ) : (
                <div className="space-y-2">
                  {clausulas.map((cl: any) => {
                    const isSelected = selectedClausulas[cl.numero] ?? false;
                    return (
                      <div key={cl.numero} className={`rounded-lg border-2 transition-all ${isSelected ? "border-blue-400 bg-blue-50/50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedClausulas(prev => ({ ...prev, [cl.numero]: !prev[cl.numero] }))}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 bg-white"}`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-gray-700">Cláusula {cl.numero}</span>
                            <span className="text-xs text-gray-500 ml-2">{cl.titulo}</span>
                          </div>
                        </button>
                        {isSelected && (
                          <div className="px-3 pb-3">
                            <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-1 block">
                              Nova redação da cláusula
                            </label>
                            <textarea
                              value={novoTextoClausulas[cl.numero] ?? ""}
                              onChange={e => setNovoTextoClausulas(prev => ({ ...prev, [cl.numero]: e.target.value }))}
                              rows={4}
                              placeholder={`Informe a nova redação para a Cláusula ${cl.numero} — ${cl.titulo}...`}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-200">
              <span className="text-xs text-gray-400">
                {Object.values(selectedClausulas).filter(Boolean).length} cláusula(s) selecionada(s)
              </span>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowAditivoModal(false)} className="text-gray-600 px-6">
                  Fechar (manter rascunho)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!confirm("Descartar rascunho deste aditivo? Esta ação não pode ser desfeita.")) return;
                    setSelectedClausulas({});
                    setNovoTextoClausulas({});
                    setDataAditivo(new Date().toISOString().split('T')[0]);
                    clearDraft();
                    toast.success("Rascunho descartado.");
                  }}
                  className="text-red-600 border-red-200 hover:bg-red-50 px-4"
                >
                  Descartar Rascunho
                </Button>
                <Button
                  onClick={() => {
                    const selecionadas = Object.entries(selectedClausulas).filter(([, v]) => v).map(([num]) => num);
                    if (selecionadas.length === 0) {
                      toast.error("Selecione pelo menos uma cláusula para alterar.");
                      return;
                    }
                    const semTexto = selecionadas.filter(num => !novoTextoClausulas[num]?.trim());
                    if (semTexto.length > 0) {
                      toast.error(`Preencha a nova redação para a(s) cláusula(s): ${semTexto.join(", ")}`);
                      return;
                    }
                    const clausulasPayload = selecionadas.map(num => {
                      const cl = clausulas.find((c: any) => c.numero === num);
                      return {
                        clausulaNum: num,
                        clausulaTitulo: cl?.titulo || "",
                        novoTexto: novoTextoClausulas[num]?.trim() || "",
                      };
                    });
                    criarAditivo.mutate({
                      companyId,
                      contractId: contratoId,
                      clausulasAlteradas: JSON.stringify(clausulasPayload),
                      dataAditivo,
                    });
                  }}
                  disabled={criarAditivo.isPending}
                  className="bg-amber-600 hover:bg-amber-500 text-white gap-1.5 px-6"
                >
                  {criarAditivo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                  Gerar Aditivo
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL EDITAR CLÁUSULAS */}
      <Dialog open={showEditClausulas} onOpenChange={setShowEditClausulas}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] flex flex-col" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-gray-900">
              <Pencil className="h-5 w-5 text-green-600" />
              Editar Cláusulas do Contrato
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-y-auto">
            <div className="rounded-lg border-2 border-green-200 bg-green-50 p-3">
              <p className="text-sm text-green-800">
                Edite o texto das cláusulas diretamente abaixo. Os placeholders como <code className="bg-green-100 px-1 rounded">[VALOR_MENSAL]</code>, <code className="bg-green-100 px-1 rounded">[DATA_INICIO]</code> e outros serão substituídos automaticamente ao visualizar/imprimir.
              </p>
            </div>
            {temClausulasCustomizadas && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const original = modeloPadrao?.modelo || "";
                    setEditClausulasTexto(original);
                  }}
                  className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 hover:underline"
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar modelo padrão
                </button>
              </div>
            )}
            <textarea
              value={editClausulasTexto}
              onChange={e => setEditClausulasTexto(e.target.value)}
              rows={24}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-y"
              placeholder="Cole ou edite o texto das cláusulas aqui..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 shrink-0">
            <Button variant="outline" onClick={() => setShowEditClausulas(false)} className="text-gray-600">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const textoFinal = editClausulasTexto.trim();
                if (!textoFinal) { toast.error("O texto das cláusulas não pode ser vazio."); return; }
                salvarClausulasMut.mutate({ contractId: contratoId, companyId, clausulasTexto: textoFinal });
              }}
              disabled={salvarClausulasMut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {salvarClausulasMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><Check className="h-4 w-4" /> Salvar Cláusulas</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
