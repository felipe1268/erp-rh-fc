/**
 * XlsxPrintPreview.tsx — Visualizador de impressão fiel ao template FC
 * Replica o layout exato de excelFcTemplate.ts como HTML/CSS:
 *   - Logo B2:C7  |  Título D2:LCD4  |  Info D5:LCD7
 *   - Row 8 divisória  |  Row 9 cabeçalho colorido  |  Row 10+ dados
 * Inclui: letras de colunas, números de linhas, barra de fórmulas,
 *         formatação condicional, rodapé de impressão e logo da empresa.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PreviewCol {
  header: string;
  width?: number;           // unidade relativa (fr)
  align?: "left" | "right" | "center";
  isDebit?: boolean;        // valor de saída → fundo vermelho claro
  isCredit?: boolean;       // valor de entrada → fundo verde claro
  isStatus?: boolean;       // coluna de status → cor por texto
  isValue?: boolean;        // valor numérico genérico
  formula?: string;         // fórmula exibida na barra quando total selecionado
}

export interface PreviewRow {
  cells: string[];
  isTotal?: boolean;        // linha de TOTAL: bold, borda, fundo tênue
  isHeader?: boolean;       // ignorar (header é renderizado separado)
}

export interface ReportPreviewDef {
  nome: string;
  titulo: string;           // Título em MAIÚSCULAS no Excel
  subtitulo: string;        // Período / subtítulo
  usesTemplate: boolean;
  cols: PreviewCol[];
  rows: PreviewRow[];
}

// ── Dados completos de cada relatório ────────────────────────────────────────

export const REPORT_PREVIEWS: ReportPreviewDef[] = [
  // ─── Extrato Bancário ────────────────────────────────────────────────────
  {
    nome: "Extrato Bancário",
    titulo: "EXTRATO BANCÁRIO CONSOLIDADO",
    subtitulo: "Conta Principal · Banco Caixa Econômica Federal · Ag. 0001",
    usesTemplate: true,
    cols: [
      { header: "Data",                  width: 10, align: "center" },
      { header: "Histórico / Descrição", width: 32, align: "left"   },
      { header: "Documento",             width: 12, align: "center" },
      { header: "Débito (R$)",           width: 14, align: "right",  isDebit: true,  formula: "=SOMA(D10:D13)" },
      { header: "Crédito (R$)",          width: 14, align: "right",  isCredit: true, formula: "=SOMA(E10:E13)" },
      { header: "Saldo (R$)",            width: 14, align: "right",  isValue: true,  formula: "=E13" },
    ],
    rows: [
      { cells: ["01/06/2026", "SALDO ANTERIOR",                  "—",        "",             "",             "42.850,00"] },
      { cells: ["03/06/2026", "TED CLIENTE XYZ ENGENHARIA LTDA", "4521",     "",             "18.500,00",    "61.350,00"] },
      { cells: ["05/06/2026", "FOLHA DE PAGAMENTO — JUN/2026",   "FOLHA",    "38.200,00",    "",             "23.150,00"] },
      { cells: ["10/06/2026", "PIX RECEBIDO — OBRA UTC",         "PIX",      "",             "9.800,00",     "32.950,00"] },
      { cells: ["15/06/2026", "PAGTO FORNECEDOR ABC MAT.",       "TED",      "4.200,00",     "",             "28.750,00"] },
      { cells: ["20/06/2026", "PGTO GUIA DARF — IRPJ",          "DARF",     "2.500,00",     "",             "26.250,00"] },
      { cells: ["28/06/2026", "RECEITA — MEDIÇÃO OBRA ABC",      "DEP",      "",             "32.000,00",    "58.250,00"] },
      { cells: ["TOTAL", "", "", "44.900,00", "60.300,00", "58.250,00"], isTotal: true },
    ],
  },

  // ─── Extrato de Cartão de Crédito ────────────────────────────────────────
  {
    nome: "Extrato de Cartão de Crédito",
    titulo: "EXTRATO DE CARTÃO DE CRÉDITO CORPORATIVO",
    subtitulo: "Cartão Corporativo · Administradora XYZ · Fatura Jun/2026",
    usesTemplate: false,
    cols: [
      { header: "Data",        width: 10, align: "center" },
      { header: "Descrição",   width: 36, align: "left"   },
      { header: "Parcela",     width: 10, align: "center" },
      { header: "Categoria",   width: 18, align: "left"   },
      { header: "Valor (R$)",  width: 14, align: "right",  isDebit: true, formula: "=SOMA(E10:E14)" },
    ],
    rows: [
      { cells: ["02/06/2026", "POSTO IPIRANGA — COMBUSTÍVEL VEÍC. 01",   "À vista", "Combustível",   "280,00"]   },
      { cells: ["04/06/2026", "HOTEL NACIONAL BRASÍLIA — DIÁRIA 2 NOITES","1/2",     "Hospedagem",    "1.200,00"] },
      { cells: ["08/06/2026", "PAPELARIA E MATERIAIS DE ESCRITÓRIO",      "À vista", "Material",      "156,50"]   },
      { cells: ["12/06/2026", "RESTAURANTE EXECUTIVO — REFEIÇÃO EQUIPE",  "À vista", "Alimentação",   "320,00"]   },
      { cells: ["22/06/2026", "ASSINATURA SOFTWARE ENGENHARIA",           "À vista", "Software",      "890,00"]   },
      { cells: ["TOTAL", "", "", "", "2.846,50"], isTotal: true },
    ],
  },

  // ─── Pacote do Contador ───────────────────────────────────────────────────
  {
    nome: "Pacote do Contador (ZIP)",
    titulo: "PACOTE DO CONTADOR — RELATÓRIOS CONSOLIDADOS",
    subtitulo: "Competência: Junho / 2026 · Pacote ZIP gerado automaticamente",
    usesTemplate: true,
    cols: [
      { header: "Planilha (aba)",       width: 22, align: "left"   },
      { header: "Descrição",            width: 36, align: "left"   },
      { header: "Período",              width: 14, align: "center" },
      { header: "Registros",            width: 12, align: "center" },
      { header: "Status",               width: 14, align: "center", isStatus: true },
    ],
    rows: [
      { cells: ["Extrato_Jun26",   "Extrato Bancário Consolidado",        "Jun/2026", "47 lançtos.", "✓ Gerada"] },
      { cells: ["DRE_Jun26",       "Demonstrativo de Resultado (DRE)",    "Jun/2026", "32 linhas",   "✓ Gerada"] },
      { cells: ["Balancete_Jun26", "Balancete Mensal de Contas",          "Jun/2026", "18 contas",   "✓ Gerada"] },
      { cells: ["Impostos_Jun26",  "Guias e Obrigações Tributárias",      "Jun/2026", "6 tributos",  "✓ Gerada"] },
      { cells: ["CustosObra_Jun26","Custos por Obra — Folha + Compras",   "Jun/2026", "24 linhas",   "✓ Gerada"] },
      { cells: ["PJ_Jun26",        "Pagamentos a Prestadores PJ",         "Jun/2026", "8 registros", "✓ Gerada"] },
      { cells: ["TOTAL", "6 planilhas incluídas no pacote ZIP", "", "", "✓ Completo"], isTotal: true },
    ],
  },

  // ─── Custos por Obra ─────────────────────────────────────────────────────
  {
    nome: "Custos por Obra",
    titulo: "RELATÓRIO DE CUSTOS POR OBRA — PESSOAL",
    subtitulo: "Mês de Referência: Junho / 2026 · Todas as obras ativas",
    usesTemplate: true,
    cols: [
      { header: "Funcionário",       width: 22, align: "left"   },
      { header: "Função / Cargo",    width: 20, align: "left"   },
      { header: "Obra / Centro de Custo", width: 20, align: "left" },
      { header: "H. Trabalhadas",    width: 12, align: "right",  isValue: true, formula: "=SOMA(E10:E13)" },
      { header: "H. Extras",         width: 10, align: "right",  isCredit: true,formula: "=SOMA(F10:F13)" },
      { header: "Custo Total (R$)",  width: 15, align: "right",  isValue: true, formula: "=SOMA(G10:G13)" },
    ],
    rows: [
      { cells: ["Felipe Costa Alves",   "Engenheiro Civil",        "UTC - Unidade Compostagem", "176", "0",  "8.500,00"]  },
      { cells: ["Carlos A. Souza",      "Técnico de Segurança",    "Escritório Central",        "160", "8",  "4.200,00"]  },
      { cells: ["Ana B. Lima",          "Administrativo",           "Escritório Central",        "176", "0",  "3.800,00"]  },
      { cells: ["Marcos R. Silva",      "Operador de Equipamentos", "UTC - Unidade Compostagem", "176", "12", "5.100,00"]  },
      { cells: ["Juliana M. Costa",     "Aux. Administrativo",      "Escritório Central",        "176", "0",  "3.200,00"]  },
      { cells: ["TOTAL", "", "", "864", "20", "24.800,00"], isTotal: true },
    ],
  },

  // ─── Conformidade PJ ─────────────────────────────────────────────────────
  {
    nome: "Conformidade PJ",
    titulo: "RELATÓRIO DE CONFORMIDADE — PRESTADORES PJ",
    subtitulo: "Referência: Junho / 2026 · Prestadores ativos com contrato vigente",
    usesTemplate: false,
    cols: [
      { header: "Prestador / Empresa",  width: 28, align: "left"   },
      { header: "CNPJ",                 width: 18, align: "center" },
      { header: "Contrato",             width: 14, align: "center" },
      { header: "Certidões / Docs",     width: 16, align: "center", isStatus: true },
      { header: "Vencimento",           width: 12, align: "center" },
      { header: "Situação",             width: 12, align: "center", isStatus: true },
    ],
    rows: [
      { cells: ["Consultoria ABC Ltda",  "12.345.678/0001-00", "CT-2024-012", "✓ OK",       "30/09/2026", "✓ Regular"]   },
      { cells: ["TecnoServ ME",          "98.765.432/0001-11", "CT-2025-003", "⚠ Pendente", "—",          "⚠ Pendente"]  },
      { cells: ["Construseg Ltda",       "55.444.333/0001-22", "CT-2024-018", "✓ OK",       "15/08/2026", "✓ Regular"]   },
      { cells: ["RH Soluções ME",        "11.222.333/0001-44", "CT-2025-007", "✗ Vencida",  "01/06/2026", "✗ Irregular"] },
      { cells: ["Arq. Projetos Ltda",    "33.444.555/0001-66", "CT-2025-011", "✓ OK",       "31/12/2026", "✓ Regular"]   },
    ],
  },

  // ─── Pagamentos PJ ───────────────────────────────────────────────────────
  {
    nome: "Pagamentos PJ",
    titulo: "RELATÓRIO DE PAGAMENTOS A PRESTADORES PJ",
    subtitulo: "Mês de Referência: Junho / 2026 · Retenções INSS/ISS/IR aplicadas",
    usesTemplate: false,
    cols: [
      { header: "Prestador / Empresa",  width: 28, align: "left"   },
      { header: "CNPJ",                 width: 18, align: "center" },
      { header: "Mês Ref.",             width: 10, align: "center" },
      { header: "Valor Bruto (R$)",     width: 14, align: "right",  isValue: true,  formula: "=SOMA(D10:D12)" },
      { header: "Retenções (R$)",       width: 14, align: "right",  isDebit: true,  formula: "=SOMA(E10:E12)" },
      { header: "Valor Líquido (R$)",   width: 15, align: "right",  isCredit: true, formula: "=SOMA(F10:F12)" },
    ],
    rows: [
      { cells: ["Consultoria ABC Ltda", "12.345.678/0001-00", "Jun/2026", "8.000,00",  "1.040,00", "6.960,00"]  },
      { cells: ["TecnoServ ME",         "98.765.432/0001-11", "Jun/2026", "3.500,00",  "455,00",   "3.045,00"]  },
      { cells: ["Construseg Ltda",      "55.444.333/0001-22", "Jun/2026", "12.000,00", "1.560,00", "10.440,00"] },
      { cells: ["TOTAL", "", "", "23.500,00", "3.055,00", "20.445,00"], isTotal: true },
    ],
  },

  // ─── Exemplo de Template ─────────────────────────────────────────────────
  {
    nome: "Exemplo de Template",
    titulo: "EXEMPLO DO TEMPLATE PADRÃO FC ENGENHARIA",
    subtitulo: "Planilha-modelo para validação do cabeçalho institucional",
    usesTemplate: true,
    cols: [
      { header: "Coluna A (Texto)",     width: 22, align: "left"   },
      { header: "Coluna B (Texto)",     width: 22, align: "left"   },
      { header: "Coluna C (Texto)",     width: 22, align: "left"   },
      { header: "Coluna D (Texto)",     width: 22, align: "left"   },
      { header: "Coluna E (Valor R$)",  width: 14, align: "right",  isValue: true, formula: "=SOMA(F10:F12)" },
    ],
    rows: [
      { cells: ["Dado 1A — Exemplo",  "Dado 1B — Exemplo", "Dado 1C — Exemplo", "Dado 1D — Exemplo", "100,00"] },
      { cells: ["Dado 2A — Exemplo",  "Dado 2B — Exemplo", "Dado 2C — Exemplo", "Dado 2D — Exemplo", "200,00"] },
      { cells: ["Dado 3A — Exemplo",  "Dado 3B — Exemplo", "Dado 3C — Exemplo", "Dado 3D — Exemplo", "300,00"] },
      { cells: ["TOTAL", "", "", "", "600,00"], isTotal: true },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function mesAnoBR() {
  return new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" });
}

function hexToRgb(hex: string) {
  const h = hex.replace(/^#/, "");
  return {
    r: parseInt(h.slice(0,2),16),
    g: parseInt(h.slice(2,4),16),
    b: parseInt(h.slice(4,6),16),
  };
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126*(r/255) + 0.7152*(g/255) + 0.0722*(b/255);
}

function cellStatusStyle(text: string): React.CSSProperties {
  if (text.startsWith("✓"))  return { color: "#166534", backgroundColor: "#dcfce7", fontWeight: 600 };
  if (text.startsWith("⚠"))  return { color: "#92400e", backgroundColor: "#fef3c7", fontWeight: 600 };
  if (text.startsWith("✗"))  return { color: "#991b1b", backgroundColor: "#fee2e2", fontWeight: 600 };
  return {};
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  report: ReportPreviewDef;
  tituloEmpresa: string;
  revisao: string;
  corCabecalho: string;    // hex sem #, ex: "7030A0"
  aprovadoPor: string;
  logoUrl?: string;        // URL da logo da empresa
}

export default function XlsxPrintPreview({
  report, tituloEmpresa, revisao, corCabecalho, aprovadoPor, logoUrl,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedFormula, setSelectedFormula] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const headerBg = "#" + corCabecalho;
  const headerText = luminance(headerBg) > 0.45 ? "#111" : "#fff";

  // Índice de colunas do Excel: A=1(vazia), B=2, C=3...
  const dataColLetters = report.cols.map((_, i) => String.fromCharCode(66 + i)); // B, C, D...
  const lastDataCol = dataColLetters[dataColLetters.length - 1];

  // Linha 5-7 do cabeçalho: divisão empresa | data/revisão/aprovador
  // A borda D:G | H:lastDataCol é baseada na quantidade de colunas
  const midColIdx = Math.floor(dataColLetters.length / 2);
  const leftInfoCols  = dataColLetters.slice(2, 2 + midColIdx);   // ex: D E F
  const rightInfoCols = dataColLetters.slice(2 + midColIdx);       // ex: G H

  const allCols = ["A", ...dataColLetters]; // A (vazia) + dados

  // Numeração de linhas para exibição
  // Row 1: empty, 2-7: header block, 8: divider, 9: col headers, 10+: data
  const dataStartRow = 10;

  return (
    <>
      {/* Trigger */}
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5 shrink-0"
        onClick={() => { setOpen(true); setSelectedFormula(null); setSelectedCell(null); }}
      >
        <Printer className="w-3.5 h-3.5" />
        Ver completo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[98vw] w-[1100px] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0 flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-sm font-semibold text-gray-800">
                Pré-visualização de Impressão — {report.nome}
              </DialogTitle>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Layout fiel ao template FC · dados fictícios para visualização
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          {/* Barra de fórmulas estilo Excel */}
          <div className="flex items-center gap-0 border-b border-gray-200 bg-white shrink-0">
            {/* Name box */}
            <div className="w-24 px-3 py-1.5 border-r border-gray-200 text-xs font-mono text-gray-600 bg-gray-50 select-none">
              {selectedCell || "A1"}
            </div>
            {/* fx */}
            <div className="px-2 text-xs text-gray-400 border-r border-gray-200 py-1.5 bg-white select-none italic">
              fx
            </div>
            {/* Formula */}
            <div className="flex-1 px-3 py-1.5 text-xs font-mono text-gray-700 bg-white">
              {selectedFormula
                ? <span className="text-blue-700">{selectedFormula}</span>
                : <span className="text-gray-300">Passe o mouse sobre uma célula de TOTAL para ver a fórmula</span>
              }
            </div>
          </div>

          {/* Área de scroll do conteúdo */}
          <div className="flex-1 overflow-auto bg-gray-200 p-6">
            {/* Página impressa — fundo branco com sombra */}
            <div
              className="bg-white mx-auto shadow-2xl"
              style={{ minWidth: 860, maxWidth: 1040 }}
            >
              {/* Área de impressão com margens */}
              <div className="px-8 pt-6 pb-8">

                {/* ─── Bloco de cabeçalho FC (Rows 1-7) ─────────────────── */}
                {report.usesTemplate ? (
                  <table className="w-full border-collapse mb-0" style={{ fontSize: 10 }}>
                    <colgroup>
                      <col style={{ width: "3%" }} />                    {/* Col A vazia */}
                      <col style={{ width: "9%" }} />                    {/* Col B — logo */}
                      <col style={{ width: "9%" }} />                    {/* Col C — logo */}
                      {report.cols.map((c, i) => (
                        <col key={i} style={{ width: `${(88 / report.cols.length).toFixed(1)}%` }} />
                      ))}
                    </colgroup>
                    <tbody>
                      {/* Row 1 — vazia */}
                      <tr style={{ height: 12 }}>
                        <td colSpan={3 + report.cols.length} />
                      </tr>

                      {/* Rows 2-4: logo + título */}
                      <tr style={{ height: 28 }}>
                        <td />
                        {/* Logo B2:C7 — rowspan 6 */}
                        <td
                          rowSpan={6}
                          colSpan={2}
                          style={{
                            border: "2px solid #000",
                            padding: 4,
                            verticalAlign: "middle",
                            textAlign: "center",
                          }}
                        >
                          {logoUrl ? (
                            <img
                              src={logoUrl}
                              alt="Logo"
                              style={{ maxWidth: 140, maxHeight: 70, objectFit: "contain" }}
                            />
                          ) : (
                            <div style={{
                              width: 140, height: 70, display: "flex", alignItems: "center",
                              justifyContent: "center", backgroundColor: "#7030A0",
                              color: "#fff", fontWeight: "bold", fontSize: 11, textAlign: "center", padding: 4,
                            }}>
                              FC<br/>ENGENHARIA
                            </div>
                          )}
                        </td>
                        {/* Título D2:LCD4 — rowspan 3 */}
                        <td
                          rowSpan={3}
                          colSpan={report.cols.length}
                          style={{
                            border: "2px solid #000",
                            textAlign: "center",
                            verticalAlign: "middle",
                            fontWeight: "bold",
                            fontSize: 15,
                            fontFamily: "Calibri, sans-serif",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {report.titulo}
                        </td>
                      </tr>
                      <tr style={{ height: 14 }} />
                      <tr style={{ height: 14 }} />

                      {/* Row 5: empresa | data */}
                      <tr style={{ height: 16 }}>
                        <td />
                        <td
                          colSpan={Math.ceil(report.cols.length * 0.6)}
                          style={{
                            borderLeft: "2px solid #000",
                            borderTop: "2px solid #000",
                            borderBottom: "1px solid #000",
                            borderRight: "1px solid #ccc",
                            padding: "2px 6px",
                            fontWeight: "bold",
                            fontSize: 10,
                            fontFamily: "Calibri, sans-serif",
                          }}
                        >
                          {tituloEmpresa}
                        </td>
                        <td
                          colSpan={report.cols.length - Math.ceil(report.cols.length * 0.6)}
                          style={{
                            borderTop: "2px solid #000",
                            borderBottom: "1px solid #000",
                            borderRight: "2px solid #000",
                            padding: "2px 6px",
                            fontSize: 9,
                            textAlign: "right",
                            color: "#444",
                          }}
                        >
                          Data: {todayBR()}
                        </td>
                      </tr>

                      {/* Row 6: subtítulo | revisão */}
                      <tr style={{ height: 16 }}>
                        <td />
                        <td
                          colSpan={Math.ceil(report.cols.length * 0.6)}
                          style={{
                            borderLeft: "2px solid #000",
                            borderBottom: "1px solid #ccc",
                            borderRight: "1px solid #ccc",
                            padding: "2px 6px",
                            fontSize: 9,
                            color: "#555",
                          }}
                        >
                          {report.subtitulo}
                        </td>
                        <td
                          colSpan={report.cols.length - Math.ceil(report.cols.length * 0.6)}
                          style={{
                            borderBottom: "1px solid #ccc",
                            borderRight: "2px solid #000",
                            padding: "2px 6px",
                            fontSize: 9,
                            textAlign: "right",
                            color: "#444",
                          }}
                        >
                          {revisao}
                        </td>
                      </tr>

                      {/* Row 7: vazio | emitido por */}
                      <tr style={{ height: 16 }}>
                        <td />
                        <td
                          colSpan={Math.ceil(report.cols.length * 0.6)}
                          style={{
                            borderLeft: "2px solid #000",
                            borderBottom: "2px solid #000",
                            borderRight: "1px solid #ccc",
                            padding: "2px 6px",
                          }}
                        />
                        <td
                          colSpan={report.cols.length - Math.ceil(report.cols.length * 0.6)}
                          style={{
                            borderBottom: "2px solid #000",
                            borderRight: "2px solid #000",
                            padding: "2px 6px",
                            fontSize: 9,
                            textAlign: "right",
                            color: "#444",
                          }}
                        >
                          Emitido por: {aprovadoPor}
                        </td>
                      </tr>

                      {/* Row 8 — divisória */}
                      <tr style={{ height: 6 }}>
                        <td colSpan={3 + report.cols.length} />
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  /* Cabeçalho padrão (sem template FC) */
                  <div
                    className="border-2 border-gray-400 mb-0 px-4 py-3 bg-gray-700 text-white"
                    style={{ fontSize: 10 }}
                  >
                    <div style={{ fontWeight: "bold", fontSize: 13, letterSpacing: "0.04em" }}>
                      {report.titulo}
                    </div>
                    <div style={{ fontSize: 9, marginTop: 2, color: "#ccc" }}>
                      {report.subtitulo} · Gerado em {todayBR()} · por {aprovadoPor}
                    </div>
                  </div>
                )}

                {/* ─── Grade da planilha ─────────────────────────────── */}
                <div className="overflow-x-auto">
                  <table
                    className="border-collapse"
                    style={{ fontSize: 9.5, width: "100%", fontFamily: "Calibri, sans-serif" }}
                  >
                    <colgroup>
                      {/* Coluna de números de linha */}
                      <col style={{ width: 28 }} />
                      {/* Col A vazia */}
                      <col style={{ width: "2%" }} />
                      {/* Colunas de dados */}
                      {report.cols.map((c, i) => (
                        <col key={i} style={{ width: `${(c.width ?? 14)}%` }} />
                      ))}
                    </colgroup>

                    <thead>
                      {/* Letras de colunas (estilo Excel) */}
                      <tr>
                        <th
                          style={{
                            backgroundColor: "#e5e7eb", border: "1px solid #d1d5db",
                            padding: "2px 4px", fontSize: 8, textAlign: "center", color: "#6b7280",
                          }}
                        />
                        {/* Col A */}
                        <th
                          style={{
                            backgroundColor: "#e5e7eb", border: "1px solid #d1d5db",
                            padding: "2px 4px", fontSize: 8, textAlign: "center", color: "#6b7280",
                          }}
                        >A</th>
                        {dataColLetters.map(letter => (
                          <th
                            key={letter}
                            style={{
                              backgroundColor: "#e5e7eb", border: "1px solid #d1d5db",
                              padding: "2px 4px", fontSize: 8, textAlign: "center", color: "#6b7280",
                            }}
                          >
                            {letter}
                          </th>
                        ))}
                      </tr>

                      {/* Row 9 — Cabeçalho colorido das colunas */}
                      <tr>
                        {/* Número da linha */}
                        <td
                          style={{
                            backgroundColor: "#e5e7eb", border: "1px solid #d1d5db",
                            padding: "2px 4px", fontSize: 8, textAlign: "center", color: "#6b7280",
                          }}
                        >
                          9
                        </td>
                        {/* Col A vazia */}
                        <td style={{ border: "1px solid #d1d5db", backgroundColor: "#f9fafb" }} />
                        {report.cols.map((col, ci) => (
                          <th
                            key={ci}
                            style={{
                              backgroundColor: headerBg,
                              color: headerText,
                              border: "1px solid rgba(0,0,0,0.25)",
                              borderBottom: "2px solid rgba(0,0,0,0.4)",
                              padding: "5px 6px",
                              fontWeight: "bold",
                              textAlign: "center",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                            }}
                          >
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {report.rows.map((row, ri) => {
                        const rowNum = dataStartRow + ri;
                        const isTotal = row.isTotal === true;
                        return (
                          <tr key={ri} style={{ backgroundColor: isTotal ? headerBg + "18" : ri % 2 === 0 ? "#fff" : "#f9fafb" }}>
                            {/* Número da linha */}
                            <td
                              style={{
                                backgroundColor: "#e5e7eb", border: "1px solid #d1d5db",
                                padding: "2px 4px", fontSize: 8, textAlign: "center", color: "#6b7280",
                                userSelect: "none",
                              }}
                            >
                              {rowNum}
                            </td>
                            {/* Col A vazia */}
                            <td style={{ border: "1px solid #e5e7eb", backgroundColor: "#f9fafb" }} />
                            {/* Células de dados */}
                            {row.cells.map((cell, ci) => {
                              const colDef = report.cols[ci];
                              if (!colDef) return null;
                              const cellId = `${dataColLetters[ci]}${rowNum}`;

                              // Formatação condicional
                              let cellStyle: React.CSSProperties = {
                                border: isTotal ? "1px solid rgba(0,0,0,0.2)" : "1px solid #e5e7eb",
                                borderTop: isTotal ? "2px solid rgba(0,0,0,0.3)" : undefined,
                                padding: "4px 6px",
                                textAlign: colDef.align ?? "left",
                                fontWeight: isTotal ? "bold" : "normal",
                                whiteSpace: "nowrap",
                                fontSize: 9.5,
                              };

                              if (!isTotal) {
                                if (colDef.isDebit  && cell && cell !== "")   cellStyle = { ...cellStyle, color: "#b91c1c", backgroundColor: "#fff1f1" };
                                if (colDef.isCredit && cell && cell !== "")   cellStyle = { ...cellStyle, color: "#166534", backgroundColor: "#f0fdf4" };
                                if (colDef.isStatus && cell)                  cellStyle = { ...cellStyle, ...cellStatusStyle(cell) };
                              }

                              // Célula total com fórmula
                              const hasFormula = isTotal && !!colDef.formula;
                              const displayValue = cell;

                              return (
                                <td
                                  key={ci}
                                  style={cellStyle}
                                  title={hasFormula ? colDef.formula : undefined}
                                  onMouseEnter={() => {
                                    if (hasFormula) {
                                      setSelectedFormula(colDef.formula!);
                                      setSelectedCell(cellId);
                                    }
                                  }}
                                  onMouseLeave={() => {
                                    if (hasFormula) {
                                      setSelectedFormula(null);
                                      setSelectedCell(null);
                                    }
                                  }}
                                >
                                  <span style={{ display: "flex", alignItems: "center", justifyContent: colDef.align === "right" ? "flex-end" : "flex-start", gap: 2 }}>
                                    {hasFormula && (
                                      <span style={{ color: "#6b7280", fontSize: 8, marginRight: 2 }}>Σ</span>
                                    )}
                                    {displayValue}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* Rodapé da planilha */}
                      <tr>
                        <td style={{ backgroundColor: "#e5e7eb", border: "1px solid #d1d5db", padding: "2px 4px", fontSize: 8, textAlign: "center", color: "#6b7280" }}>
                          {dataStartRow + report.rows.length}
                        </td>
                        <td style={{ border: "1px solid #e5e7eb" }} />
                        <td
                          colSpan={report.cols.length}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderTop: "1px solid #d1d5db",
                            padding: "3px 6px",
                            fontSize: 8,
                            color: "#9ca3af",
                            textAlign: "right",
                            fontStyle: "italic",
                          }}
                        >
                          ERP Gestão Integrada · Gerado em {todayBR()} · {mesAnoBR()} · Dados fictícios para visualização
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* ─── Legenda de formatação condicional ─────────────── */}
                {(report.cols.some(c => c.isDebit || c.isCredit || c.isStatus)) && (
                  <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-gray-500 border-t border-gray-100 pt-3">
                    <span className="font-semibold text-gray-600">Formatação condicional:</span>
                    {report.cols.some(c => c.isDebit)  && <span className="flex items-center gap-1"><span style={{ width:12, height:12, backgroundColor:"#fff1f1", border:"1px solid #fca5a5", display:"inline-block", borderRadius:2 }} /> Débito / Saída</span>}
                    {report.cols.some(c => c.isCredit) && <span className="flex items-center gap-1"><span style={{ width:12, height:12, backgroundColor:"#f0fdf4", border:"1px solid #86efac", display:"inline-block", borderRadius:2 }} /> Crédito / Entrada</span>}
                    {report.cols.some(c => c.isStatus) && (
                      <>
                        <span className="flex items-center gap-1"><span style={{ width:12, height:12, backgroundColor:"#dcfce7", border:"1px solid #86efac", display:"inline-block", borderRadius:2 }} /> Regular / OK</span>
                        <span className="flex items-center gap-1"><span style={{ width:12, height:12, backgroundColor:"#fef3c7", border:"1px solid #fcd34d", display:"inline-block", borderRadius:2 }} /> Pendente</span>
                        <span className="flex items-center gap-1"><span style={{ width:12, height:12, backgroundColor:"#fee2e2", border:"1px solid #fca5a5", display:"inline-block", borderRadius:2 }} /> Irregular</span>
                      </>
                    )}
                    {report.cols.some(c => c.formula) && <span className="flex items-center gap-1"><span style={{ color:"#6b7280", fontWeight:"bold" }}>Σ</span> Célula com fórmula (passe o mouse para ver)</span>}
                  </div>
                )}

                {/* ─── Rodapé de impressão ───────────────────────────── */}
                <div className="mt-6 pt-3 border-t border-gray-200 flex items-center justify-between text-[9px] text-gray-400">
                  <span>{tituloEmpresa}</span>
                  <span>Página 1 de 1</span>
                  <span>Gerado em {todayBR()}</span>
                </div>

              </div>{/* /padding */}
            </div>{/* /page */}
          </div>{/* /scroll */}
        </DialogContent>
      </Dialog>
    </>
  );
}
