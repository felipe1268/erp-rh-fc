import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import FluxogramaPagamento from "./FluxogramaPagamento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Save, FileText, Info, RefreshCw, Eye, Pencil,
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo, Redo, Type, Minus, ChevronDown, Building2, Settings, Image, FileDown, Droplets, X,
  History, RotateCcw, Clock, User
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import UnderlineExt from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";

const VARIAVEIS: { chave: string; descricao: string; categoria: string }[] = [
  { chave: "{{NUMERO_CONTRATO}}", descricao: "Número do contrato (ex: CT-2026-0001)", categoria: "Contrato" },
  { chave: "{{ANO_ATUAL}}", descricao: "Ano atual (ex: 2026)", categoria: "Contrato" },
  { chave: "{{DATA_ASSINATURA}}", descricao: "Data de assinatura (hoje)", categoria: "Contrato" },
  { chave: "{{DATA_INICIO}}", descricao: "Data de início do contrato", categoria: "Contrato" },
  { chave: "{{DATA_TERMINO}}", descricao: "Data de término do contrato", categoria: "Contrato" },
  { chave: "{{DESCRICAO_OBJETO}}", descricao: "Descrição do objeto/serviço contratado", categoria: "Contrato" },
  { chave: "{{VALOR_TOTAL}}", descricao: "Valor total do contrato em R$", categoria: "Contrato" },
  { chave: "{{OBRA_NOME}}", descricao: "Nome da obra vinculada", categoria: "Contrato" },
  { chave: "{{CONTRATANTE_NOME}}", descricao: "Razão social da contratante", categoria: "Contratante" },
  { chave: "{{CONTRATANTE_CNPJ}}", descricao: "CNPJ da contratante", categoria: "Contratante" },
  { chave: "{{CONTRATANTE_ENDERECO}}", descricao: "Endereço completo da contratante", categoria: "Contratante" },
  { chave: "{{CONTRATANTE_REPRESENTANTE}}", descricao: "Nome do representante legal da contratante", categoria: "Contratante" },
  { chave: "{{CONTRATANTE_CARGO}}", descricao: "Cargo do representante da contratante", categoria: "Contratante" },
  { chave: "{{CONTRATADA_NOME}}", descricao: "Razão social da contratada (empresa terceira)", categoria: "Contratada" },
  { chave: "{{CONTRATADA_CNPJ}}", descricao: "CNPJ da contratada", categoria: "Contratada" },
  { chave: "{{CONTRATADA_ENDERECO}}", descricao: "Endereço completo da contratada", categoria: "Contratada" },
  { chave: "{{CONTRATADA_REPRESENTANTE}}", descricao: "Nome do representante legal da contratada", categoria: "Contratada" },
  { chave: "{{CONTRATADA_CARGO}}", descricao: "Cargo do representante da contratada", categoria: "Contratada" },
  { chave: "{{CIDADE_ESTADO}}", descricao: "Cidade e estado da contratante (ex: Montes Claros - MG)", categoria: "Localização" },
  { chave: "{{TABELA_ITENS}}", descricao: "Tabela completa da EAP com descrição, unidade, quantidade, valor unitário e total", categoria: "Contrato" },
  { chave: "{{QTD_ITENS}}", descricao: "Quantidade de itens/atividades do contrato", categoria: "Contrato" },
  { chave: "{{TESTEMUNHA_FINANCEIRO}}", descricao: "Nome do responsável financeiro (testemunha 1)", categoria: "Testemunhas" },
  { chave: "{{TESTEMUNHA_GESTOR_PROJETO}}", descricao: "Engenheiro / Responsável do cadastro da obra (testemunha 2)", categoria: "Testemunhas" },
  { chave: "{{REVISAO_CRONOGRAMA}}", descricao: "Revisão do cronograma considerada para o prazo (ex: Baseline Rev 00)", categoria: "Contrato" },
  { chave: "{{FLUXOGRAMA_PAGAMENTO}}", descricao: "Diagrama visual do fluxo de medição e pagamento (6 etapas)", categoria: "Medição/Pagamento" },
  { chave: "{{DIA_MEDICAO}}", descricao: "Dia da medição física (ex: 25)", categoria: "Medição/Pagamento" },
  { chave: "{{PRAZO_APROVACAO}}", descricao: "Prazo de aprovação da medição em dias úteis (ex: 5)", categoria: "Medição/Pagamento" },
  { chave: "{{PRAZO_EMISSAO_NF}}", descricao: "Prazo para emissão da NF em dias úteis (ex: 3)", categoria: "Medição/Pagamento" },
  { chave: "{{PRAZO_LIBERACAO_OP}}", descricao: "Prazo para liberação da OP em dias úteis (ex: 5)", categoria: "Medição/Pagamento" },
  { chave: "{{DIA_PAGAMENTO}}", descricao: "Dia do pagamento no mês subsequente (ex: 10)", categoria: "Medição/Pagamento" },
];

const TEMPLATE_PADRAO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº {{NUMERO_CONTRATO}}

Pelo presente instrumento particular de contrato de prestação de serviços, as partes abaixo identificadas:

CONTRATANTE: {{CONTRATANTE_NOME}}, inscrita no CNPJ sob nº {{CONTRATANTE_CNPJ}}, com sede à {{CONTRATANTE_ENDERECO}}, neste ato representada por seu(sua) {{CONTRATANTE_CARGO}}, Sr(a). {{CONTRATANTE_REPRESENTANTE}};

CONTRATADA: {{CONTRATADA_NOME}}, inscrita no CNPJ sob nº {{CONTRATADA_CNPJ}}, com sede à {{CONTRATADA_ENDERECO}}, neste ato representada por seu(sua) {{CONTRATADA_CARGO}}, Sr(a). {{CONTRATADA_REPRESENTANTE}};

Têm entre si, justo e contratado, o seguinte:

CLÁUSULA PRIMEIRA – DO OBJETO

1.1 O presente contrato tem por objeto a prestação de serviços de {{DESCRICAO_OBJETO}}, a serem executados na obra {{OBRA_NOME}}, conforme escopo detalhado abaixo:

{{TABELA_ITENS}}

CLÁUSULA SEGUNDA – DO PRAZO

2.1 Os serviços deverão ser iniciados em {{DATA_INICIO}} e concluídos até {{DATA_TERMINO}}, salvo prorrogação por acordo escrito entre as partes.

2.2 As datas acima foram definidas com base na revisão do cronograma: {{REVISAO_CRONOGRAMA}}.

CLÁUSULA TERCEIRA – DO VALOR E FORMA DE PAGAMENTO

3.1 O valor total do presente contrato é de {{VALOR_TOTAL}}.

3.2 CRITÉRIOS DE MEDIÇÃO E PAGAMENTO — Os pagamentos serão processados conforme o fluxo obrigatório abaixo, cujos prazos são improrrogáveis salvo acordo formal entre as partes:

{{FLUXOGRAMA_PAGAMENTO}}

a) MEDIÇÃO FÍSICA (Dia {{DIA_MEDICAO}} de cada mês) — Levantamento e conferência do avanço físico dos serviços efetivamente executados, a ser realizado conjuntamente pelo gestor da obra e o representante da CONTRATADA no canteiro;

b) APROVAÇÃO DA MEDIÇÃO (Até {{PRAZO_APROVACAO}} dias úteis após a medição) — Análise e aprovação da medição pelo gestor do contrato da CONTRATANTE. A medição poderá ser aprovada total ou parcialmente, cabendo à CONTRATADA acatar os ajustes solicitados;

c) DOCUMENTAÇÃO COMPROBATÓRIA — Após aprovação da medição, a CONTRATADA deverá enviar obrigatoriamente: Nota Fiscal/Fatura, guias de recolhimento de INSS e FGTS quitadas, Certidão Negativa de Débitos Trabalhistas (CNDT), comprovante de seguro de vida dos funcionários alocados na obra e demais documentos que a CONTRATANTE julgar necessários. A ausência de qualquer documento suspende o fluxo de pagamento até a regularização;

d) EMISSÃO DA NOTA FISCAL (Até {{PRAZO_EMISSAO_NF}} dias úteis após aprovação) — Liberação para emissão da Nota Fiscal pela CONTRATADA, que deverá ser emitida com os dados corretos da CONTRATANTE e o valor exato da medição aprovada;

e) LIBERAÇÃO DA ORDEM DE PAGAMENTO (Até {{PRAZO_LIBERACAO_OP}} dias úteis após recebimento da NF) — Conferência da Nota Fiscal e liberação da Ordem de Pagamento (OP) pela área financeira da CONTRATANTE;

f) PAGAMENTO (Dia {{DIA_PAGAMENTO}} do mês subsequente) — Crédito em conta bancária da CONTRATADA, referente à medição aprovada do mês anterior.

3.3 RESUMO DOS PRAZOS:
• Dia da Medição: dia {{DIA_MEDICAO}} de cada mês
• Prazo de Aprovação: até {{PRAZO_APROVACAO}} dias úteis após a medição
• Prazo para Emissão da NF: até {{PRAZO_EMISSAO_NF}} dias úteis após aprovação
• Prazo para Liberação da OP: até {{PRAZO_LIBERACAO_OP}} dias úteis após NF
• Dia do Pagamento: dia {{DIA_PAGAMENTO}} do mês subsequente

3.4 O descumprimento dos prazos estabelecidos na subcláusula 3.2 por parte da CONTRATADA (itens "c" e "d") implicará no adiamento automático do pagamento para o ciclo subsequente, sem incidência de juros ou multa a favor da CONTRATADA.

3.5 A CONTRATANTE não será responsabilizada pelo atraso no pagamento quando este decorrer de pendências documentais ou irregularidades na Nota Fiscal emitida pela CONTRATADA.

3.6 Serviços executados sem a devida autorização do gestor do contrato ou em desacordo com as especificações não serão objeto de medição nem de pagamento.

CLÁUSULA QUARTA – DAS OBRIGAÇÕES DA CONTRATADA

4.1 A CONTRATADA se obriga a:
a) Executar os serviços com boa técnica, materiais de qualidade e dentro do prazo estabelecido;
b) Cumprir todas as normas de segurança do trabalho, fornecendo EPI's a seus empregados;
c) Manter em dia todas as obrigações trabalhistas e previdenciárias de seus empregados;
d) Responsabilizar-se por danos causados à CONTRATANTE ou a terceiros em decorrência da execução dos serviços;
e) Apresentar os documentos exigidos para pagamento no prazo de até 5 (cinco) dias após a aprovação da medição.

CLÁUSULA QUINTA – DAS OBRIGAÇÕES DA CONTRATANTE

5.1 A CONTRATANTE se obriga a:
a) Fornecer à CONTRATADA as condições necessárias para a execução dos serviços;
b) Efetuar os pagamentos nas condições e prazos estipulados neste contrato;
c) Notificar a CONTRATADA, por escrito, sobre qualquer irregularidade verificada na execução dos serviços.

CLÁUSULA SEXTA – DA RESCISÃO

6.1 Este contrato poderá ser rescindido por qualquer das partes, mediante aviso prévio de 30 (trinta) dias, por escrito, ou imediatamente, em caso de descumprimento de suas cláusulas.

6.2 Em caso de rescisão motivada por inadimplência da CONTRATADA, esta responderá pelos prejuízos causados, incluindo o custo de contratação de terceiros para conclusão dos serviços.

CLÁUSULA SÉTIMA – DO FORO

7.1 Fica eleito o foro da Comarca de {{CIDADE_ESTADO}} para dirimir quaisquer dúvidas ou litígios oriundos do presente contrato, com renúncia de qualquer outro, por mais privilegiado que seja.

E por estarem assim justos e contratados, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, juntamente com 2 (duas) testemunhas.

{{CIDADE_ESTADO}}, {{DATA_ASSINATURA}}.


_________________________________________
{{CONTRATANTE_NOME}}
CNPJ: {{CONTRATANTE_CNPJ}}
Representante: {{CONTRATANTE_REPRESENTANTE}}


_________________________________________
{{CONTRATADA_NOME}}
CNPJ: {{CONTRATADA_CNPJ}}
Representante: {{CONTRATADA_REPRESENTANTE}}


TESTEMUNHAS:

1. _________________________________________
   Nome: {{TESTEMUNHA_FINANCEIRO}}
   Cargo: Responsável Financeiro

2. _________________________________________
   Nome: {{TESTEMUNHA_GESTOR_PROJETO}}
   Cargo: Gestor de Projeto
`;

const categorias = [...new Set(VARIAVEIS.map(v => v.categoria))];

function plainTextToHtml(text: string): string {
  const lines = text.split("\n");
  let html = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      html += "<p></p>";
      continue;
    }
    const escaped = trimmed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const withVars = escaped.replace(
      /\{\{([A-Z_]+)\}\}/g,
      '<mark data-color="#dbeafe" style="background-color:#dbeafe;padding:1px 3px;border-radius:3px;font-family:monospace;font-size:0.85em">{{$1}}</mark>'
    );
    html += `<p>${withVars}</p>`;
  }
  return html;
}

function htmlToPlainText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  const paragraphs = div.querySelectorAll("p, h1, h2, h3, li");
  if (paragraphs.length === 0) return div.textContent || "";
  const lines: string[] = [];
  paragraphs.forEach(p => {
    lines.push(p.textContent || "");
  });
  return lines.join("\n");
}

function ToolbarButton({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}
    >
      {children}
    </button>
  );
}

export default function ContratoTemplate({ embedded = false }: { embedded?: boolean } = {}) {
  const [, navigate] = useLocation();
  const { companyId: rawCompanyId, isConstrutoras, getCompanyIds } = useCompany();
  const companyId = rawCompanyId > 0 ? rawCompanyId : (isConstrutoras ? (getCompanyIds()[0] || 0) : 0);

  const [nome, setNome] = useState("Contrato Padrão de Prestação de Serviços");
  const [texto, setTexto] = useState(TEMPLATE_PADRAO);
  const [templateId, setTemplateId] = useState<number | undefined>(undefined);
  const [versao, setVersao] = useState(1);
  const [categoriaFiltro, setCategoriaFiltro] = useState("Contrato");
  const [varBusca, setVarBusca] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [showVars, setShowVars] = useState(true);
  const [showLayoutConfig, setShowLayoutConfig] = useState(false);
  const [showRevisoes, setShowRevisoes] = useState(false);
  const [layoutLogoUrl, setLayoutLogoUrl] = useState("");
  const [layoutRodape, setLayoutRodape] = useState("");
  const [layoutMarcaDaguaUrl, setLayoutMarcaDaguaUrl] = useState("");
  const [layoutOpacidade, setLayoutOpacidade] = useState(0.06);

  const utils = trpc.useUtils();
  const { data: tpl, isLoading } = trpc.terceiroContratos.getTemplate.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const companyInfo = tpl?.companyData ?? null;

  const resetLayoutToSaved = useCallback(() => {
    if (companyInfo) {
      setLayoutLogoUrl(companyInfo.logoUrl || "");
      setLayoutRodape(companyInfo.docRodapeTexto || "");
      setLayoutMarcaDaguaUrl(companyInfo.docMarcaDaguaUrl || "");
      setLayoutOpacidade(Number(companyInfo.docMarcaDaguaOpacidade) || 0.06);
    }
  }, [companyInfo]);

  useEffect(() => {
    resetLayoutToSaved();
  }, [resetLayoutToSaved]);

  const salvarLayoutMut = trpc.terceiroContratos.salvarDocLayout.useMutation({
    onSuccess: () => {
      toast.success("Layout do documento salvo!");
      setShowLayoutConfig(false);
      utils.terceiroContratos.getTemplate.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: revisoes = [] } = trpc.terceiroContratos.listarTemplateRevisoes.useQuery(
    { templateId: templateId!, companyId },
    { enabled: !!templateId && companyId > 0 }
  );

  const restaurarRevMut = trpc.terceiroContratos.restaurarTemplateRevisao.useMutation({
    onSuccess: (r) => {
      toast.success(`Template restaurado! Agora na versão ${r.versao}`);
      setVersao(r.versao);
      setTexto(r.texto);
      setNome(r.nome);
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(plainTextToHtml(r.texto));
      }
      setShowRevisoes(false);
      utils.terceiroContratos.getTemplate.invalidate();
      utils.terceiroContratos.listarTemplateRevisoes.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      UnderlineExt,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: "Digite o texto do contrato aqui..." }),
    ],
    content: plainTextToHtml(texto),
    editorProps: {
      attributes: {
        class: "outline-none min-h-[800px] px-[72px] py-10",
        style: "font-family: 'Georgia', 'Times New Roman', serif; font-size: 13px; line-height: 1.8; color: #1f2937;",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const plain = htmlToPlainText(ed.getHTML());
      setTexto(plain);
    },
  });

  useEffect(() => {
    if (tpl && tpl.id > 0 && tpl.texto) {
      setNome(tpl.nome);
      setTexto(tpl.texto);
      setTemplateId(tpl.id);
      setVersao(tpl.versao ?? 1);
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(plainTextToHtml(tpl.texto));
      }
    }
  }, [tpl, editor]);

  const salvarMut = trpc.terceiroContratos.salvarTemplate.useMutation({
    onSuccess: (r) => {
      toast.success(`Template salvo! Versão ${r.versao}`);
      setTemplateId(r.id);
      setVersao(r.versao);
      utils.terceiroContratos.listarTemplateRevisoes.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const inserirVariavel = useCallback((chave: string) => {
    if (editor && !editor.isDestroyed) {
      editor.chain().focus().insertContent(
        `<mark data-color="#dbeafe" style="background-color:#dbeafe;padding:1px 3px;border-radius:3px;font-family:monospace;font-size:0.85em">${chave}</mark> `
      ).run();
    }
  }, [editor]);

  const restaurarPadrao = () => {
    if (confirm("Isso vai restaurar o template padrão. Continuar?")) {
      setTexto(TEMPLATE_PADRAO);
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(plainTextToHtml(TEMPLATE_PADRAO));
      }
    }
  };

  const varsFiltradas = VARIAVEIS.filter(v =>
    (categoriaFiltro === "todas" || v.categoria === categoriaFiltro) &&
    (!varBusca || v.chave.toLowerCase().includes(varBusca.toLowerCase()) || v.descricao.toLowerCase().includes(varBusca.toLowerCase()))
  );

  const previewTexto = texto
    .replace(/\{\{NUMERO_CONTRATO\}\}/g, "CT-2026-0001")
    .replace(/\{\{ANO_ATUAL\}\}/g, "2026")
    .replace(/\{\{DATA_ASSINATURA\}\}/g, "16/03/2026")
    .replace(/\{\{DATA_INICIO\}\}/g, "01/04/2026")
    .replace(/\{\{DATA_TERMINO\}\}/g, "30/06/2026")
    .replace(/\{\{DESCRICAO_OBJETO\}\}/g, "execução de alvenaria estrutural")
    .replace(/\{\{VALOR_TOTAL\}\}/g, "R$ 185.000,00")
    .replace(/\{\{OBRA_NOME\}\}/g, "Residencial Exemplo")
    .replace(/\{\{CONTRATANTE_NOME\}\}/g, "FC Engenharia e Construção LTDA")
    .replace(/\{\{CONTRATANTE_CNPJ\}\}/g, "29.353.906/0001-71")
    .replace(/\{\{CONTRATANTE_ENDERECO\}\}/g, "Av. Juscelino Kubitschek, 100, Montes Claros - MG")
    .replace(/\{\{CONTRATANTE_REPRESENTANTE\}\}/g, "Felipe Costa Alves")
    .replace(/\{\{CONTRATANTE_CARGO\}\}/g, "Sócio Administrador")
    .replace(/\{\{CONTRATADA_NOME\}\}/g, "Construções ABC LTDA")
    .replace(/\{\{CONTRATADA_CNPJ\}\}/g, "00.000.000/0001-00")
    .replace(/\{\{CONTRATADA_ENDERECO\}\}/g, "Rua das Flores, 200, Montes Claros - MG")
    .replace(/\{\{CONTRATADA_REPRESENTANTE\}\}/g, "João da Silva")
    .replace(/\{\{CONTRATADA_CARGO\}\}/g, "Sócio Administrador")
    .replace(/\{\{CIDADE_ESTADO\}\}/g, "Montes Claros - MG")
    .replace(/\{\{TABELA_ITENS\}\}/g, `ESCOPO DETALHADO DOS SERVIÇOS (EAP):

EAP          | Descrição                                             | Un    | Qtd       | Vlr Unit.      | Total
-------------|-------------------------------------------------------|-------|-----------|----------------|----------------
09.01.01.01  | Argamassa de Regularização e/ou Proteção e=4cm 1:6    | m²    |    121,85 |      R$ 25,00  |    R$ 3.046,25
09.01.02.01  | Impermeabilização com Manta Asfáltica 3mm             | m²    |    121,85 |      R$ 48,50  |    R$ 5.909,73
-------------|-------------------------------------------------------|-------|-----------|----------------|----------------
             |                                                       |       |           |         TOTAL: |    R$ 8.955,98`)
    .replace(/\{\{QTD_ITENS\}\}/g, "2")
    .replace(/\{\{TESTEMUNHA_FINANCEIRO\}\}/g, "Maria Souza")
    .replace(/\{\{TESTEMUNHA_GESTOR_PROJETO\}\}/g, "Carlos Oliveira")
    .replace(/\{\{REVISAO_CRONOGRAMA\}\}/g, "Baseline (Rev 00)");

  const inner = (
    <>
      <div className="h-full flex flex-col bg-gray-100 overflow-hidden">
        {/* Header bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
          {!embedded && (
            <button onClick={() => navigate("/terceiros/contratos")} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="text-sm font-semibold border-none bg-transparent px-2 py-1 h-auto focus-visible:ring-0 focus-visible:bg-gray-50 rounded"
              placeholder="Nome do Template"
            />
            <p className="text-[10px] text-gray-400 px-2">
              {templateId ? `Versão ${versao} salva` : "Nenhum template salvo"} — Gerado automaticamente ao emitir contratos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setPreviewMode(p => !p)}
            >
              {previewMode ? <><Pencil className="w-3.5 h-3.5" /> Editar</> : <><Eye className="w-3.5 h-3.5" /> Visualizar</>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setShowVars(v => !v)}
            >
              <Type className="w-3.5 h-3.5" />
              Variáveis
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => { resetLayoutToSaved(); setShowLayoutConfig(true); }}
            >
              <Settings className="w-3.5 h-3.5" />
              Layout
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setShowRevisoes(true)}
              disabled={!templateId}
            >
              <History className="w-3.5 h-3.5" />
              Revisões{revisoes.length > 0 && ` (${revisoes.length})`}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700"
              disabled={salvarMut.isPending}
              onClick={() => salvarMut.mutate({ companyId, nome, texto, id: templateId })}
            >
              <Save className="w-3.5 h-3.5" />
              {salvarMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        {/* Toolbar (Word-style) */}
        {!previewMode && editor && (
          <div className="bg-white border-b border-gray-200 px-4 py-1.5 flex items-center gap-0.5 flex-shrink-0 overflow-x-auto">
            <ToolbarButton active={false} onClick={() => editor.chain().focus().undo().run()} title="Desfazer">
              <Undo className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={false} onClick={() => editor.chain().focus().redo().run()} title="Refazer">
              <Redo className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-6 bg-gray-200 mx-1.5" />

            <select
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300 mr-1"
              value={editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"}
              onChange={e => {
                const val = e.target.value;
                if (val === "p") editor.chain().focus().setParagraph().run();
                else if (val === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();
                else if (val === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
                else if (val === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();
              }}
            >
              <option value="p">Normal</option>
              <option value="h1">Título 1</option>
              <option value="h2">Título 2</option>
              <option value="h3">Título 3</option>
            </select>

            <div className="w-px h-6 bg-gray-200 mx-1.5" />

            <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito">
              <Bold className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico">
              <Italic className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Sublinhado">
              <UnderlineIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
              <Minus className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-6 bg-gray-200 mx-1.5" />

            <ToolbarButton active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Alinhar à esquerda">
              <AlignLeft className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Centralizar">
              <AlignCenter className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Alinhar à direita">
              <AlignRight className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()} title="Justificar">
              <AlignJustify className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-6 bg-gray-200 mx-1.5" />

            <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista com marcadores">
              <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
              <ListOrdered className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-6 bg-gray-200 mx-1.5" />

            <ToolbarButton active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha horizontal">
              <Minus className="w-4 h-4" />
            </ToolbarButton>

            <div className="flex-1" />

            <button
              onClick={restaurarPadrao}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              <RefreshCw className="w-3 h-3" /> Restaurar padrão
            </button>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Document area */}
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            {previewMode ? (
              <div className="w-full max-w-[794px] bg-white shadow-xl rounded-sm border border-gray-300 relative overflow-hidden" style={{ minHeight: "1123px" }}>
                {companyInfo?.docMarcaDaguaUrl && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                    <img src={companyInfo.docMarcaDaguaUrl} alt="" className="w-[400px] h-auto" style={{ opacity: Number(companyInfo.docMarcaDaguaOpacidade) || 0.06 }} />
                  </div>
                )}
                <div className="border-b border-gray-200 px-4 py-2 flex items-center gap-2 bg-gray-50 relative z-10">
                  <Eye className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[11px] text-gray-500">Pré-visualização com dados de exemplo</span>
                </div>
                <div className="border-b border-gray-300 px-[72px] py-6 flex items-center justify-between relative z-10">
                  {companyInfo?.logoUrl ? (
                    <img src={companyInfo.logoUrl} alt="Logo" className="h-14 object-contain" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-8 h-8 text-gray-300" />
                      <p className="text-sm font-bold text-gray-700">{companyInfo?.razaoSocial || "Empresa"}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase tracking-[0.15em] font-semibold">Contrato</p>
                    <p className="text-base font-bold text-gray-800">CT-2026-0001</p>
                  </div>
                </div>
                <div className="px-[72px] py-10 relative z-10" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: "13px", lineHeight: "1.8", color: "#1f2937" }}>
                  {previewTexto.split("\n").map((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={idx} className="h-3" />;
                    if (/^\{\{FLUXOGRAMA_PAGAMENTO\}\}$/.test(trimmed)) {
                      return <FluxogramaPagamento key={idx} compact />;
                    }
                    const isClausula = /^CL[ÁA]USULA\s/i.test(trimmed);
                    const isTitulo = /^CONTRATO\s+DE\s+/i.test(trimmed);
                    const isAlinea = /^[a-z]\)\s/.test(trimmed);
                    const isSubClausulaTitle = /^\d+\.\d+\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(trimmed) && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(trimmed.split(/\s+/)[1] || "");
                    const isBullet = /^[•●▪▸►-]\s/.test(trimmed);
                    const isSectionHeader = /^RESUMO DOS PRAZOS/i.test(trimmed);
                    if (isTitulo) return <h1 key={idx} className="text-[15px] font-bold text-center mb-6 uppercase tracking-wider">{trimmed}</h1>;
                    if (isClausula) return <h2 key={idx} className="text-[13px] font-bold mt-6 mb-2 uppercase tracking-wide">{trimmed}</h2>;
                    if (isSectionHeader) return <p key={idx} className="text-[12px] font-bold text-gray-700 mt-4 mb-1 uppercase">{trimmed}</p>;
                    if (isSubClausulaTitle) return <p key={idx} className="text-[12.5px] font-semibold mt-3 mb-1 pl-3">{trimmed}</p>;
                    if (isAlinea) return <p key={idx} className="text-[12px] text-gray-700 leading-[1.8] mb-1.5 pl-10 pr-4 text-justify">{trimmed}</p>;
                    if (isBullet) return <p key={idx} className="text-[12px] text-gray-700 leading-[1.7] mb-0.5 pl-12 pr-4">{trimmed}</p>;
                    return <p key={idx} className="mb-1.5 text-justify">{trimmed}</p>;
                  })}
                </div>
                {companyInfo?.docRodapeTexto && (
                  <div className="border-t border-gray-200 px-[72px] py-3 text-center relative z-10 mt-auto">
                    {companyInfo.docRodapeTexto.split("\n").map((line: string, i: number) => (
                      <p key={i} className="text-[8px] text-gray-400 leading-tight italic">{line}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full max-w-[794px] bg-white shadow-xl rounded-sm border border-gray-300 cursor-text relative overflow-hidden" style={{ minHeight: "1123px" }}>
                {companyInfo?.docMarcaDaguaUrl && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                    <img src={companyInfo.docMarcaDaguaUrl} alt="" className="w-[400px] h-auto" style={{ opacity: Number(companyInfo.docMarcaDaguaOpacidade) || 0.06 }} />
                  </div>
                )}
                <div className="border-b border-gray-300 px-[72px] py-6 flex items-center justify-between relative z-10">
                  {companyInfo?.logoUrl ? (
                    <img src={companyInfo.logoUrl} alt="Logo" className="h-14 object-contain" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-8 h-8 text-gray-300" />
                      <p className="text-sm font-bold text-gray-700">{companyInfo?.razaoSocial || "Empresa"}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase tracking-[0.15em] font-semibold">Template</p>
                    <p className="text-xs font-medium text-gray-600">{tpl?.nome || "Contrato Padrão"}</p>
                  </div>
                </div>
                <div className="relative z-10">
                  <EditorContent editor={editor} />
                </div>
                {companyInfo?.docRodapeTexto && (
                  <div className="border-t border-gray-200 px-[72px] py-3 text-center relative z-10">
                    {companyInfo.docRodapeTexto.split("\n").map((line: string, i: number) => (
                      <p key={i} className="text-[8px] text-gray-400 leading-tight italic">{line}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Variables panel */}
          {showVars && !previewMode && (
            <div className="w-64 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
              <div className="px-3 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-700 mb-2">Variáveis</p>
                <Input
                  className="text-[11px] h-7"
                  placeholder="Buscar variável..."
                  value={varBusca}
                  onChange={e => setVarBusca(e.target.value)}
                />
                <div className="flex gap-1 flex-wrap mt-2">
                  <button
                    onClick={() => setCategoriaFiltro("todas")}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${categoriaFiltro === "todas" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >
                    Todas
                  </button>
                  {categorias.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoriaFiltro(cat)}
                      className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${categoriaFiltro === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                <p className="text-[10px] text-gray-400 px-1 mb-1">Clique para inserir no texto</p>
                {varsFiltradas.map(v => (
                  <button
                    key={v.chave}
                    onClick={() => inserirVariavel(v.chave)}
                    className="w-full text-left px-2 py-1.5 rounded border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                  >
                    <div className="font-mono text-[10px] text-blue-600 group-hover:text-blue-800 truncate">{v.chave}</div>
                    <div className="text-[10px] text-gray-400 leading-snug truncate">{v.descricao}</div>
                  </button>
                ))}
                {varsFiltradas.length === 0 && (
                  <p className="text-[10px] text-gray-400 text-center py-4">Nenhuma variável encontrada</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showRevisoes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRevisoes(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-800">Histórico de Revisões</h3>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{revisoes.length} versões</span>
              </div>
              <button onClick={() => setShowRevisoes(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {revisoes.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <History className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">Nenhuma revisão anterior</p>
                  <p className="text-xs text-gray-400 mt-1">As revisões aparecem aqui após cada salvamento do template</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  <div className="px-5 py-3 bg-blue-50/50 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">v{versao}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-blue-800">Versão atual</p>
                        <p className="text-[10px] text-blue-600">{nome}</p>
                      </div>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Ativa</span>
                    </div>
                  </div>
                  {revisoes.map((rev: any) => (
                    <div key={rev.id} className="px-5 py-3 hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-bold">v{rev.versao}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700">{rev.nome}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                              <User className="w-3 h-3" />
                              {rev.criadoPor || "sistema"}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                              <Clock className="w-3 h-3" />
                              {rev.criadoEm ? new Date(rev.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </div>
                          </div>
                          {rev.observacao && (
                            <p className="text-[10px] text-gray-400 italic mt-0.5">{rev.observacao}</p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7 gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          disabled={restaurarRevMut.isPending}
                          onClick={() => {
                            if (confirm(`Restaurar o template para a versão ${rev.versao}? A versão atual será salva no histórico.`)) {
                              restaurarRevMut.mutate({ templateId: templateId!, revisaoId: rev.id, companyId });
                            }
                          }}
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restaurar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setShowRevisoes(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {showLayoutConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { resetLayoutToSaved(); setShowLayoutConfig(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-800">Layout do Documento</h3>
              </div>
              <button onClick={() => { resetLayoutToSaved(); setShowLayoutConfig(false); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Image className="w-3.5 h-3.5 text-blue-500" />
                  <Label className="text-xs font-semibold text-gray-700">Cabeçalho — Logo da Empresa</Label>
                </div>
                <Input
                  value={layoutLogoUrl}
                  onChange={e => setLayoutLogoUrl(e.target.value)}
                  placeholder="URL do logo (ex: /logo-fc.jpg)"
                  className="text-xs h-8"
                />
                {layoutLogoUrl && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 flex items-center gap-3">
                    <img src={layoutLogoUrl} alt="Preview" className="h-10 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="text-[10px] text-gray-400">Preview do logo</span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileDown className="w-3.5 h-3.5 text-green-500" />
                  <Label className="text-xs font-semibold text-gray-700">Rodapé — Texto (endereço, contato)</Label>
                </div>
                <Textarea
                  value={layoutRodape}
                  onChange={e => setLayoutRodape(e.target.value)}
                  placeholder="Ex: Av. Principal, 100, Sala 10 &#10;Cidade-UF – Tel: (11) 1234-5678"
                  className="text-xs min-h-[60px] resize-none"
                  rows={3}
                />
                <p className="text-[10px] text-gray-400 mt-1">Use Enter para quebrar linha. Aparece centralizado no rodapé.</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="w-3.5 h-3.5 text-purple-500" />
                  <Label className="text-xs font-semibold text-gray-700">Marca d'Água</Label>
                </div>
                <Input
                  value={layoutMarcaDaguaUrl}
                  onChange={e => setLayoutMarcaDaguaUrl(e.target.value)}
                  placeholder="URL da imagem (ex: /logo-fc.jpg)"
                  className="text-xs h-8 mb-2"
                />
                <div className="flex items-center gap-3">
                  <Label className="text-[10px] text-gray-500 whitespace-nowrap">Opacidade: {Math.round(layoutOpacidade * 100)}%</Label>
                  <input
                    type="range"
                    min="0"
                    max="0.3"
                    step="0.01"
                    value={layoutOpacidade}
                    onChange={e => setLayoutOpacidade(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 accent-purple-500"
                  />
                </div>
                {layoutMarcaDaguaUrl && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center">
                    <img src={layoutMarcaDaguaUrl} alt="Marca d'água" className="h-16 object-contain" style={{ opacity: layoutOpacidade }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => { resetLayoutToSaved(); setShowLayoutConfig(false); }}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="text-xs h-8 bg-blue-600 hover:bg-blue-700 gap-1.5"
                disabled={salvarLayoutMut.isPending}
                onClick={() => salvarLayoutMut.mutate({
                  companyId,
                  logoUrl: layoutLogoUrl || null,
                  docRodapeTexto: layoutRodape || null,
                  docMarcaDaguaUrl: layoutMarcaDaguaUrl || null,
                  docMarcaDaguaOpacidade: layoutOpacidade,
                })}
              >
                <Save className="w-3.5 h-3.5" />
                {salvarLayoutMut.isPending ? "Salvando..." : "Salvar Layout"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <div
        className="flex flex-col bg-gray-100 rounded-xl border border-gray-200 overflow-hidden"
        style={{ height: "calc(100vh - 240px)", minHeight: "600px" }}
      >
        {inner}
      </div>
    );
  }

  return <DashboardLayout noPadding>{inner}</DashboardLayout>;
}
