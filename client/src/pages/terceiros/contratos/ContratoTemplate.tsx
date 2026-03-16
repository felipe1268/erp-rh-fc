import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, FileText, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";

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
];

const TEMPLATE_PADRAO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº {{NUMERO_CONTRATO}}

Pelo presente instrumento particular de contrato de prestação de serviços, as partes abaixo identificadas:

CONTRATANTE: {{CONTRATANTE_NOME}}, inscrita no CNPJ sob nº {{CONTRATANTE_CNPJ}}, com sede à {{CONTRATANTE_ENDERECO}}, neste ato representada por seu(sua) {{CONTRATANTE_CARGO}}, Sr(a). {{CONTRATANTE_REPRESENTANTE}};

CONTRATADA: {{CONTRATADA_NOME}}, inscrita no CNPJ sob nº {{CONTRATADA_CNPJ}}, com sede à {{CONTRATADA_ENDERECO}}, neste ato representada por seu(sua) {{CONTRATADA_CARGO}}, Sr(a). {{CONTRATADA_REPRESENTANTE}};

Têm entre si, justo e contratado, o seguinte:

CLÁUSULA PRIMEIRA – DO OBJETO

1.1 O presente contrato tem por objeto a prestação de serviços de {{DESCRICAO_OBJETO}}, a serem executados na obra {{OBRA_NOME}}.

CLÁUSULA SEGUNDA – DO PRAZO

2.1 Os serviços deverão ser iniciados em {{DATA_INICIO}} e concluídos até {{DATA_TERMINO}}, salvo prorrogação por acordo escrito entre as partes.

CLÁUSULA TERCEIRA – DO VALOR E FORMA DE PAGAMENTO

3.1 O valor total do presente contrato é de {{VALOR_TOTAL}}.

3.2 Os pagamentos serão efetuados conforme medição dos serviços efetivamente executados e aceitos pela CONTRATANTE, mediante apresentação de nota fiscal/fatura, após aprovação da medição.

3.3 Para fins de pagamento, a CONTRATADA deverá apresentar, juntamente com a nota fiscal, os seguintes documentos: INSS, FGTS, certidão negativa de débitos trabalhistas (CNDT) e seguro de vida dos funcionários alocados na obra.

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
   Nome:
   CPF:

2. _________________________________________
   Nome:
   CPF:
`;

const categorias = [...new Set(VARIAVEIS.map(v => v.categoria))];

export default function ContratoTemplate() {
  const [, navigate] = useLocation();
  const { companyId } = useCompany();

  const [nome, setNome] = useState("Contrato Padrão de Prestação de Serviços");
  const [texto, setTexto] = useState(TEMPLATE_PADRAO);
  const [templateId, setTemplateId] = useState<number | undefined>(undefined);
  const [versao, setVersao] = useState(1);
  const [categoriaFiltro, setCategoriaFiltro] = useState("Contrato");
  const [varBusca, setVarBusca] = useState("");
  const [previewMode, setPreviewMode] = useState(false);

  const { data: tpl, isLoading } = trpc.terceiroContratos.getTemplate.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  useEffect(() => {
    if (tpl) {
      setNome(tpl.nome);
      setTexto(tpl.texto);
      setTemplateId(tpl.id);
      setVersao(tpl.versao ?? 1);
    }
  }, [tpl]);

  const salvarMut = trpc.terceiroContratos.salvarTemplate.useMutation({
    onSuccess: (r) => {
      toast.success(`Template salvo! Versão ${r.versao}`);
      setTemplateId(r.id);
      setVersao(r.versao);
    },
    onError: (e) => toast.error(e.message),
  });

  const inserirVariavel = (chave: string) => {
    const ta = document.getElementById("template-textarea") as HTMLTextAreaElement | null;
    if (ta) {
      const start = ta.selectionStart ?? texto.length;
      const end = ta.selectionEnd ?? texto.length;
      const novo = texto.slice(0, start) + chave + texto.slice(end);
      setTexto(novo);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + chave.length, start + chave.length);
      }, 0);
    } else {
      setTexto(prev => prev + chave);
    }
  };

  const varsFiltradas = VARIAVEIS.filter(v =>
    (categoriaFiltro === "todas" || v.categoria === categoriaFiltro) &&
    (!varBusca || v.chave.toLowerCase().includes(varBusca.toLowerCase()) || v.descricao.toLowerCase().includes(varBusca.toLowerCase()))
  );

  const previewTexto = texto
    .replace(/{{NUMERO_CONTRATO}}/g, "CT-2026-0001")
    .replace(/{{ANO_ATUAL}}/g, "2026")
    .replace(/{{DATA_ASSINATURA}}/g, "16/03/2026")
    .replace(/{{DATA_INICIO}}/g, "01/04/2026")
    .replace(/{{DATA_TERMINO}}/g, "30/06/2026")
    .replace(/{{DESCRICAO_OBJETO}}/g, "execução de alvenaria estrutural")
    .replace(/{{VALOR_TOTAL}}/g, "R$ 185.000,00")
    .replace(/{{OBRA_NOME}}/g, "Residencial Exemplo")
    .replace(/{{CONTRATANTE_NOME}}/g, "FC Engenharia e Construção LTDA")
    .replace(/{{CONTRATANTE_CNPJ}}/g, "29.353.906/0001-71")
    .replace(/{{CONTRATANTE_ENDERECO}}/g, "Av. Juscelino Kubitschek, 100, Montes Claros - MG")
    .replace(/{{CONTRATANTE_REPRESENTANTE}}/g, "Felipe Costa Alves")
    .replace(/{{CONTRATANTE_CARGO}}/g, "Sócio Administrador")
    .replace(/{{CONTRATADA_NOME}}/g, "Construções ABC LTDA")
    .replace(/{{CONTRATADA_CNPJ}}/g, "00.000.000/0001-00")
    .replace(/{{CONTRATADA_ENDERECO}}/g, "Rua das Flores, 200, Montes Claros - MG")
    .replace(/{{CONTRATADA_REPRESENTANTE}}/g, "João da Silva")
    .replace(/{{CONTRATADA_CARGO}}/g, "Sócio Administrador")
    .replace(/{{CIDADE_ESTADO}}/g, "Montes Claros - MG");

  return (
    <DashboardLayout>
      <div className="p-5 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/terceiros/contratos")} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Template de Contrato</h1>
            <p className="text-sm text-gray-500">
              {templateId ? `Versão ${versao} salva` : "Nenhum template salvo"} — Gerado automaticamente ao emitir contratos
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setPreviewMode(p => !p)}
          >
            {previewMode ? "Editar" : "Pré-visualizar"}
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            disabled={salvarMut.isPending}
            onClick={() => salvarMut.mutate({ companyId, nome, texto, id: templateId })}
          >
            <Save className="w-4 h-4" />
            {salvarMut.isPending ? "Salvando..." : "Salvar Template"}
          </Button>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Use as variáveis <code className="bg-blue-100 px-1 rounded text-xs font-mono">{"{{NOME_VARIAVEL}}"}</code> no texto — elas serão substituídas automaticamente pelos dados do contrato ao gerar o documento.
            Clique em uma variável para inserí-la na posição do cursor.
          </p>
        </div>

        <div className="flex gap-4">
          {/* Editor ou Preview */}
          <div className="flex-1 space-y-3">
            <div>
              <Label className="text-xs text-gray-500">Nome do Template</Label>
              <Input
                value={nome}
                onChange={e => setNome(e.target.value)}
                className="mt-1 text-sm"
                placeholder="Ex: Contrato Padrão de Empreitada"
              />
            </div>
            {previewMode ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="border-b border-gray-100 px-4 py-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Pré-visualização com dados de exemplo</span>
                </div>
                <pre className="p-5 text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed min-h-[600px]">
                  {previewTexto}
                </pre>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Texto do Contrato</Label>
                <textarea
                  id="template-textarea"
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  className="w-full h-[600px] rounded-xl border border-gray-200 p-4 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y leading-relaxed"
                  placeholder="Digite o texto do contrato aqui, usando {{VARIAVEL}} para campos dinâmicos..."
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          {/* Painel de variáveis */}
          <div className="w-72 flex-shrink-0 space-y-3">
            <div>
              <Label className="text-xs text-gray-500">Variáveis Disponíveis</Label>
              <Input
                className="mt-1 text-xs"
                placeholder="Buscar variável..."
                value={varBusca}
                onChange={e => setVarBusca(e.target.value)}
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setCategoriaFiltro("todas")}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${categoriaFiltro === "todas" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                Todas
              </button>
              {categorias.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoriaFiltro(cat)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${categoriaFiltro === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-1">
              {varsFiltradas.map(v => (
                <button
                  key={v.chave}
                  onClick={() => inserirVariavel(v.chave)}
                  className="w-full text-left p-2.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                >
                  <div className="font-mono text-xs text-blue-700 group-hover:text-blue-800 truncate">{v.chave}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-snug">{v.descricao}</div>
                </button>
              ))}
              {varsFiltradas.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Nenhuma variável encontrada</p>
              )}
            </div>
            <div className="border-t border-gray-100 pt-3">
              <button
                onClick={() => { if (confirm("Isso vai restaurar o template padrão. Continuar?")) setTexto(TEMPLATE_PADRAO); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Restaurar template padrão
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
