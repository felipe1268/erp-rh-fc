import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import FullScreenDialog from "@/components/FullScreenDialog";
import {
  Plus, Trash2, Camera, X as XIcon, ShieldCheck, Eye, Download, Copy,
  ExternalLink, CheckCircle2, Clock, Loader2, ArrowLeft, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";
import { useDocumentMargins } from "@/hooks/useDocumentMargins";
import { renderTemplate } from "@shared/documentTemplates";

// Rev. 2137 — Dialog do Termo de Responsabilidade. Espelha o fluxo FCSign
// do Contrato de Experiência mas com 3 diferenças chave:
//   1. Lista LIVRE de itens (descrição + estado de conservação + fotos)
//   2. Numeração sequencial por empresa/ano (`contract_counters` tipo
//      'termo_responsabilidade'), NÃO idempotente — cada termo = nº novo
//   3. Permite múltiplos termos ativos por colaborador (dedup desativado
//      no server p/ esse tipo, ver signatures.create Rev. 2137).
//
// Fotos: comprimidas client-side (canvas, max 800x600, JPEG q=0.7) e
// embutidas como data:URL no <img> do HTML. Sem upload separado p/ MVP.

type ItemFoto = { id: string; dataUrl: string };
type ItemEntregue = {
  id: string;
  descricao: string;
  quantidade: number;
  estado: string;
  fotos: ItemFoto[];
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: number;
  employeeId: number;
  empNome: string;
  empCpf?: string;
  empRg?: string;
  empFuncao?: string;
  comp: any; // empresa { razaoSocial, cnpj, endereco, cidade, estado, logoUrl? }
  geradoPor: string;
  isAdminMaster: boolean;
  onSendToFcSign: (payload: {
    companyId: number;
    employeeId: number;
    tipo: string;
    documentTitle: string;
    documentHtml: string;
    empregadoNome: string;
    empregadoCpf?: string;
  }) => void;
};

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    const safe = typeof ts === "string" ? ts.replace(" ", "T") : ts;
    const d = new Date(safe);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("pt-BR");
  } catch {
    return String(ts);
  }
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Compressão client-side: canvas resize p/ máx 800x600 + JPEG q=0.7.
// Rev. 2139 — validações reforçadas: rejeita HEIC (iPad camera roll, não
// renderiza em canvas Safari → produz toDataURL vazio "data:,"), valida
// dimensões > 0 e dataURL final começa com "data:image/jpeg;base64,".
async function comprimirImagem(file: File): Promise<string> {
  // Safari iOS NÃO consegue renderizar HEIC em canvas — gera tela preta ou
  // toDataURL inválido. Bloqueia upfront com mensagem clara.
  const isHeic =
    /\.heic$|\.heif$/i.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif";
  if (isHeic) {
    throw new Error(
      `${file.name}: formato HEIC não suportado. Nas configurações do iPhone/iPad, vá em Câmera → Formatos → "Mais Compatível" (JPEG).`,
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) {
          return reject(new Error("Imagem sem dimensões — formato incompatível."));
        }
        const MAX_W = 800;
        const MAX_H = 600;
        let { naturalWidth: width, naturalHeight: height } = img;
        const ratio = Math.min(MAX_W / width, MAX_H / height, 1);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponível"));
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        try {
          ctx.drawImage(img, 0, 0, width, height);
        } catch (e: any) {
          return reject(new Error("Falha ao renderizar imagem em canvas."));
        }
        let dataUrl = "";
        try {
          dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        } catch (e: any) {
          return reject(new Error("Falha ao gerar JPEG (imagem muito grande?)."));
        }
        // toDataURL vazio é "data:," em Safari quando falha silenciosamente
        if (!dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.length < 200) {
          return reject(new Error("Imagem ficou em branco (Safari/HEIC?)."));
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Imagem inválida ou formato não suportado."));
      const src = String(reader.result || "");
      if (!src.startsWith("data:image/")) {
        return reject(new Error("Arquivo não é uma imagem."));
      }
      img.src = src;
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export default function TermoResponsabilidadeDialog({
  open, onOpenChange, companyId, employeeId, empNome, empCpf, empRg, empFuncao,
  comp, geradoPor, isAdminMaster, onSendToFcSign,
}: Props) {
  const documentMargins = useDocumentMargins();
  const [mode, setMode] = useState<"list" | "compose">("list");
  const [items, setItems] = useState<ItemEntregue[]>([]);
  const [local, setLocal] = useState<string>("");
  const [dataDoc, setDataDoc] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [observacoes, setObservacoes] = useState<string>("");
  const [compressing, setCompressing] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const q = trpc.signatures.listByEmployee.useQuery(
    { companyId, employeeId },
    { enabled: open && !!companyId && !!employeeId, staleTime: 30 * 1000 },
  );
  const adminDeleteMut = trpc.signatures.adminDelete.useMutation();
  const allocateMut = trpc.employees.allocateTermoResponsabilidadeNumero.useMutation();
  // Rev. 2747 — template VIGENTE do Termo de Responsabilidade (Central de Docs ISO).
  // Se vigente, o corpo sai do template + tabela de itens/obs/local-data anexados;
  // senão, usa o corpo hard-coded abaixo (fallback).
  const termoVigenteQ = trpc.systemDocumentTemplates.getVigente.useQuery(
    { tipo: "termo_responsabilidade" },
    { enabled: open },
  );

  const sessoesTermo = useMemo(
    () => (q.data || []).filter((s: any) => s.tipo === "termo_responsabilidade"),
    [q.data],
  );

  // Defaults dinâmicos quando entra em compose
  const iniciarCompose = () => {
    setItems([{ id: crypto.randomUUID(), descricao: "", quantidade: 1, estado: "Novo", fotos: [] }]);
    setLocal(`${comp?.cidade || ""}${comp?.estado ? "/" + comp.estado : ""}`.trim() || "");
    setDataDoc(new Date().toISOString().split("T")[0]);
    setObservacoes("");
    setMode("compose");
  };

  const addItem = () =>
    setItems((arr) => [...arr, { id: crypto.randomUUID(), descricao: "", quantidade: 1, estado: "Novo", fotos: [] }]);
  const removeItem = (id: string) => setItems((arr) => arr.filter((it) => it.id !== id));
  const updateItem = (id: string, patch: Partial<ItemEntregue>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const onPickPhotos = async (itemId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setCompressing(true);
    try {
      const arr = Array.from(files);
      const dataUrls: string[] = [];
      for (const f of arr) {
        if (!f.type.startsWith("image/")) continue;
        try {
          dataUrls.push(await comprimirImagem(f));
        } catch (e: any) {
          toast.error(`Falha ao processar ${f.name}: ${e?.message || e}`);
        }
      }
      if (dataUrls.length === 0) return;
      setItems((arr2) =>
        arr2.map((it) =>
          it.id === itemId
            ? {
                ...it,
                fotos: [
                  ...it.fotos,
                  ...dataUrls.map((du) => ({ id: crypto.randomUUID(), dataUrl: du })),
                ],
              }
            : it,
        ),
      );
    } finally {
      setCompressing(false);
    }
  };

  const removerFoto = (itemId: string, fotoId: string) =>
    setItems((arr) =>
      arr.map((it) =>
        it.id === itemId ? { ...it, fotos: it.fotos.filter((f) => f.id !== fotoId) } : it,
      ),
    );

  const validar = (): string[] => {
    const faltando: string[] = [];
    if (!comp?.razaoSocial) faltando.push("Empresa: razão social");
    if (!comp?.cnpj) faltando.push("Empresa: CNPJ");
    if (!empNome) faltando.push("Colaborador: nome");
    if (!empCpf) faltando.push("Colaborador: CPF");
    if (items.length === 0) faltando.push("Adicione pelo menos 1 item");
    items.forEach((it, i) => {
      if (!it.descricao.trim()) faltando.push(`Item #${i + 1}: descrição`);
      if (!Number.isFinite(it.quantidade) || it.quantidade < 1) faltando.push(`Item #${i + 1}: quantidade (mín. 1)`);
      if (!it.estado.trim()) faltando.push(`Item #${i + 1}: estado de conservação`);
    });
    if (!local.trim()) faltando.push("Local");
    if (!dataDoc) faltando.push("Data");
    return faltando;
  };

  const handleGerarEnviar = async () => {
    const faltando = validar();
    if (faltando.length > 0) {
      toast.error(
        "Preencha os campos abaixo antes de enviar para assinatura:\n" +
          faltando.map((f) => `• ${f}`).join("\n"),
        {
          duration: 12000,
          style: { whiteSpace: "pre-line", maxWidth: 480 },
        },
      );
      return;
    }
    setAllocating(true);
    try {
      const { numero, ano } = await allocateMut.mutateAsync({ employeeId, companyId });
      const numeroFmt = `${String(numero).padStart(3, "0")}/${ano}`;
      const dataPt = (() => {
        try {
          const [y, m, d] = dataDoc.split("-").map(Number);
          return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
        } catch {
          return dataDoc;
        }
      })();

      // Rev. 2139 — filtra apenas fotos com data URL válido (descarta as que
      // a compressão produziu vazias em Safari/HEIC). Evita HTML inválido +
      // bloqueia o caminho que dispara "The string did not match the
      // expected pattern" no iPad quando o <img src="data:,"> falha downstream.
      const fotosValidas = (fotos: ItemFoto[]) =>
        fotos.filter(
          (f) =>
            typeof f.dataUrl === "string" &&
            f.dataUrl.startsWith("data:image/") &&
            f.dataUrl.length > 200,
        );

      const itensTabela = items
        .map((it, i) => {
          const fotos = fotosValidas(it.fotos);
          return `
        <tr>
          <td style="border:1px solid #cbd5e1;padding:6px 8px;text-align:center;width:36px;font-weight:600;vertical-align:top">${i + 1}</td>
          <td style="border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top">${esc(it.descricao)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top;width:60px;text-align:center">${it.quantidade}</td>
          <td style="border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top;width:180px">${esc(it.estado)}</td>
        </tr>
        ${
          fotos.length > 0
            ? `<tr>
                <td colspan="4" style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc">
                  <div style="font-size:9.5pt;color:#475569;margin-bottom:6px;font-weight:600">Fotos do item #${i + 1}:</div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px">
                    ${fotos
                      .map(
                        (f) =>
                          `<img src="${f.dataUrl}" style="max-width:220px;max-height:170px;border:1px solid #cbd5e1;border-radius:4px;background:#fff"/>`,
                      )
                      .join("")}
                  </div>
                </td>
              </tr>`
            : ""
        }`;
        })
        .join("");

      const obsHtml = observacoes.trim()
        ? `<p style="margin-top:14px;padding:10px 12px;background:#f8fafc;border-left:3px solid #1B2A4A;font-size:10.5pt"><strong>Observações:</strong><br/>${esc(observacoes).replace(/\n/g, "<br/>")}</p>`
        : "";

      // Rev. 2139 — Corpo do TERMO DE RESPONSABILIDADE seguindo
      // FIELMENTE o modelo institucional aprovado (.docx "Termo de
      // Responsabilidade Geral"): declaração + categorias gerais (Ferramentas/
      // Equipamentos/Máquinas/Aparelhos eletrônicos/Veículos/Acessórios) +
      // RELAÇÃO ESPECÍFICA com os itens entregues e fotos + 3 blocos de
      // compromissos (responsabilidade / desconto art. 462§1º CLT / veículos)
      // + vigência + local/data. Mesmo padrão visual do Contrato de
      // Experiência (clauses com border-left navy + Times serif 11.5pt
      // via buildFcDocument).
      const corpoHtml = `
<p style="text-align:justify;text-indent:30px;margin-bottom:12px">
  Eu, <strong>${esc(empNome)}</strong>,
  portador(a) do RG nº <strong>${esc(empRg || "________________")}</strong>
  e CPF nº <strong>${esc(empCpf || "________________")}</strong>,
  ${empFuncao ? `exercendo a função de <strong>${esc(empFuncao)}</strong>, ` : ""}colaborador(a) da empresa
  <strong>${esc(comp?.razaoSocial || "")}</strong>, inscrita no CNPJ sob o nº
  <strong>${esc(comp?.cnpj || "")}</strong>, declaro, para os devidos fins,
  que recebi da empresa, para utilização no exercício de minhas atividades
  profissionais, os seguintes bens:
</p>

<ul style="margin:6px 0 12px 28px;padding:0;font-size:11pt">
  <li>Ferramentas;</li>
  <li>Equipamentos;</li>
  <li>Máquinas;</li>
  <li>Aparelhos eletrônicos;</li>
  <li>Veículos;</li>
  <li>Acessórios e demais itens correlatos necessários à execução das atividades laborais.</li>
</ul>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">
  RELAÇÃO ESPECÍFICA DOS ITENS ENTREGUES NESTA DATA
</h3>
<table style="width:100%;border-collapse:collapse;font-size:10.5pt;margin-bottom:10px">
  <thead>
    <tr style="background:#1B2A4A;color:#fff">
      <th style="border:1px solid #1B2A4A;padding:6px 8px;text-align:center;width:36px">#</th>
      <th style="border:1px solid #1B2A4A;padding:6px 8px;text-align:left">Item / Descrição</th>
      <th style="border:1px solid #1B2A4A;padding:6px 8px;text-align:center;width:60px">Qtd.</th>
      <th style="border:1px solid #1B2A4A;padding:6px 8px;text-align:left;width:180px">Estado de Conservação</th>
    </tr>
  </thead>
  <tbody>${itensTabela}</tbody>
</table>
${obsHtml}

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">
  CLÁUSULA 1ª — DA PROPRIEDADE E DAS OBRIGAÇÕES
</h3>
<p style="text-align:justify;margin-bottom:8px">
  Declaro estar ciente de que os bens acima mencionados são de propriedade
  exclusiva da empresa, comprometendo-me a:
</p>
<ol style="margin:0 0 10px 28px;padding:0;font-size:11pt;text-align:justify">
  <li>Utilizá-los exclusivamente para fins profissionais e relacionados às atividades da empresa;</li>
  <li>Zelar pela boa conservação, guarda, limpeza e correto uso dos bens disponibilizados;</li>
  <li>Não permitir o uso por terceiros não autorizados;</li>
  <li>Comunicar imediatamente à empresa qualquer defeito, dano, extravio, furto, roubo, acidente ou irregularidade envolvendo os bens sob minha responsabilidade;</li>
  <li>Devolver todos os itens recebidos em perfeito estado de conservação, ressalvado o desgaste natural decorrente do uso adequado.</li>
</ol>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">
  CLÁUSULA 2ª — DESCONTOS POR DANO, PERDA OU MAU USO (ART. 462, §1º, CLT)
</h3>
<p style="text-align:justify;margin-bottom:6px">
  Fica expressamente estabelecido que, em caso de dano, perda, extravio,
  avaria, quebra ou qualquer prejuízo causado em decorrência de:
</p>
<ul style="margin:0 0 8px 28px;padding:0;font-size:11pt">
  <li>mau uso;</li>
  <li>negligência;</li>
  <li>imprudência;</li>
  <li>imperícia;</li>
  <li>utilização inadequada;</li>
  <li>descumprimento das orientações da empresa;</li>
  <li>dolo ou culpa do colaborador;</li>
</ul>
<p style="text-align:justify;margin-bottom:8px">
  o colaborador autoriza, desde já, nos termos do
  <strong>artigo 462, §1º, da CLT</strong>, o desconto em folha de pagamento
  dos valores correspondentes ao prejuízo causado, limitado ao valor
  efetivamente apurado pela empresa.
</p>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">
  CLÁUSULA 3ª — VEÍCULOS E INFRAÇÕES DE TRÂNSITO
</h3>
<p style="text-align:justify;margin-bottom:6px">
  No caso específico de veículos, o colaborador também se responsabiliza por:
</p>
<ul style="margin:0 0 8px 28px;padding:0;font-size:11pt">
  <li>multas decorrentes de infrações de trânsito cometidas durante sua utilização;</li>
  <li>danos ocasionados por condução inadequada;</li>
  <li>descumprimento das normas internas e legislação de trânsito vigente.</li>
</ul>

<h3 style="font-size:11pt;font-weight:bold;color:#1B2A4A;border-left:3px solid #1B2A4A;padding-left:8px;margin:18px 0 8px">
  CLÁUSULA 4ª — VIGÊNCIA
</h3>
<p style="text-align:justify;margin-bottom:8px">
  Este termo passa a vigorar na data de sua assinatura e permanecerá válido
  enquanto houver bens da empresa sob responsabilidade do colaborador.
</p>

<p style="text-align:justify;text-indent:30px;margin-top:10px;margin-bottom:8px">
  Por estarem de pleno acordo, firmam o presente termo.
</p>

<p style="text-align:right;margin-top:18px;font-size:10.5pt;color:#475569">
  ${esc(local)}, ${esc(dataPt)}.
</p>
`;

      // Rev. 2747 — se houver template VIGENTE na Central de Documentos, o corpo
      // sai dele (com a tabela de itens renderizada via {{itensTabela}}) e
      // anexamos observações + rodapé local/data (que não fazem parte do seed).
      const dadosTermo: Record<string, string> = {
        empNome: esc(empNome),
        empRg: esc(empRg || "________________"),
        empCpf: esc(empCpf || "________________"),
        empFuncao: esc(empFuncao || "________________"),
        empresaRazaoSocial: esc(comp?.razaoSocial || ""),
        empresaCnpj: esc(comp?.cnpj || ""),
        itensTabela,
      };
      const localFooterHtml = `<p style="text-align:right;margin-top:18px;font-size:10.5pt;color:#475569">${esc(local)}, ${esc(dataPt)}.</p>`;
      const vigenteTermoHtml = termoVigenteQ.data?.vigente ? termoVigenteQ.data.conteudoHtml : null;
      const corpoHtmlFinal = vigenteTermoHtml
        ? `${renderTemplate(vigenteTermoHtml, dadosTermo)}${obsHtml}${localFooterHtml}`
        : corpoHtml;

      const documentTitle = `Termo de Responsabilidade ${numeroFmt} - ${empNome}`;
      const documentHtml = buildFcDocument({
        forSign: true,
        empresa: {
          razaoSocial: comp?.razaoSocial || "",
          nomeFantasia: comp?.nomeFantasia,
          cnpj: comp?.cnpj || "",
          endereco: comp?.endereco,
          cidade: comp?.cidade,
          estado: comp?.estado,
          logoUrl: comp?.logoUrl,
        },
        titulo: "TERMO DE RESPONSABILIDADE",
        numero: numeroFmt,
        dataEmissao: dataPt,
        assunto: {
          label: "COLABORADOR:",
          valor: `${empNome}${empCpf ? ` — CPF ${empCpf}` : ""}`,
        },
        corpoHtml: corpoHtmlFinal,
        margins: documentMargins,
        assinaturas: {
          partes: [
            { role: "empregador", label: "EMPRESA", nome: comp?.razaoSocial || "", documento: comp?.cnpj || "" },
            { role: "empregado", label: "COLABORADOR", nome: empNome, documento: empCpf || "" },
          ],
        },
        geradoPor,
        pageTitle: documentTitle,
      });

      onSendToFcSign({
        companyId,
        employeeId,
        tipo: "termo_responsabilidade",
        documentTitle,
        documentHtml,
        empregadoNome: empNome,
        empregadoCpf: empCpf,
      });
      // Volta pra lista; refetch acontece quando o FCSign dialog fecha (parent)
      setMode("list");
      setItems([]);
      setObservacoes("");
      setTimeout(() => q.refetch(), 800);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar termo.");
    } finally {
      setAllocating(false);
    }
  };

  const copiarLink = async (token: string, who: string) => {
    const url = `${window.location.origin}/assinar/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      toast.success(`Link de ${who} copiado.`);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const cancelarSessao = (sess: any) => {
    if (!isAdminMaster) return;
    const msg =
      sess.status === "completo"
        ? `Apagar este Termo de Responsabilidade assinado? Será removido da RAIO-X (soft-delete).`
        : `Cancelar a sessão de assinatura em andamento? Os links enviados deixarão de funcionar.`;
    if (!window.confirm(msg)) return;
    adminDeleteMut.mutate(
      { companyId, id: sess.id },
      {
        onSuccess: () => {
          toast.success(sess.status === "completo" ? "Termo removido." : "Sessão cancelada.");
          q.refetch();
        },
        onError: (err) => toast.error(err.message || "Falha."),
      },
    );
  };

  const composeFooter =
    mode === "compose" ? (
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 w-full">
        <div className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "itens"} · {empNome}
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => setMode("list")}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={allocating || compressing}
            onClick={handleGerarEnviar}
            className="bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white"
          >
            {allocating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-1" />
            )}
            Gerar e Enviar para Assinatura
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end w-full">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </div>
    );

  return (
    <FullScreenDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Termo de Responsabilidade — ${empNome}`}
      subtitle="Registre itens entregues (com fotos do estado de conservação) e envie para assinatura digital via FCSign."
      icon={<FileText className="h-5 w-5" />}
      footer={composeFooter}
      zIndex={70}
    >
      <div className="max-w-5xl mx-auto w-full">
        {mode === "list" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {q.isLoading
                  ? "Carregando..."
                  : `${sessoesTermo.length} termo(s) registrado(s).`}
              </div>
              <Button
                type="button"
                onClick={iniciarCompose}
                className="bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white"
              >
                <Plus className="h-4 w-4 mr-1" /> Novo Termo
              </Button>
            </div>

            {q.isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando termos...
              </div>
            )}

            {!q.isLoading && sessoesTermo.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                Nenhum Termo de Responsabilidade emitido ainda.
                <br />
                Clique em <strong>Novo Termo</strong> para registrar a entrega de equipamentos.
              </div>
            )}

            {sessoesTermo.map((sess: any) => {
              const signers = (sess.signers || []) as Array<{
                id: number; role: string; nome: string; token: string; signedAt: string | null;
              }>;
              const assinados = signers.filter((s) => s.signedAt).length;
              const completo = sess.status === "completo";
              const cancelado = sess.status === "cancelado";
              return (
                <div
                  key={sess.id}
                  className={`rounded-lg border px-4 py-3 ${
                    completo
                      ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                      : cancelado
                      ? "border-gray-300 bg-gray-50 dark:bg-gray-900/30 opacity-70"
                      : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-2 min-w-0">
                      {completo ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                      ) : cancelado ? (
                        <XIcon className="h-5 w-5 text-gray-500 mt-0.5" />
                      ) : (
                        <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">
                          {sess.documentTitle}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {completo
                            ? `Assinado · ${fmtTs(sess.completedAt)}`
                            : cancelado
                            ? "Cancelado"
                            : `Aguardando assinaturas (${assinados}/${signers.length})`}
                          {" · "}
                          Criado em {fmtTs(sess.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {completo && sess.finalDocumentUrl && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(sess.finalDocumentUrl, "_blank", "noopener")}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = sess.finalDocumentUrl;
                              a.download = `Termo_Responsabilidade_${empNome.replace(/\s+/g, "_")}_${sess.id}.html`;
                              a.target = "_blank";
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                            }}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" /> Baixar
                          </Button>
                        </>
                      )}
                      {isAdminMaster && !cancelado && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-50"
                          disabled={adminDeleteMut.isPending}
                          onClick={() => cancelarSessao(sess)}
                        >
                          {adminDeleteMut.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          {completo ? "Apagar" : "Cancelar"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {!completo && !cancelado && signers.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {signers.map((s) => {
                        const done = !!s.signedAt;
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between gap-2 text-xs bg-white dark:bg-amber-900/20 rounded px-2 py-1 border border-amber-200"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {done ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              )}
                              <span className="uppercase text-[10px] tracking-wider text-muted-foreground">
                                {s.role}
                              </span>
                              <span className="truncate">{s.nome}</span>
                            </div>
                            {!done && (
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5"
                                  onClick={() => copiarLink(s.token, s.nome)}
                                  title="Copiar link"
                                >
                                  {copied === s.token ? (
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5"
                                  onClick={() =>
                                    window.open(
                                      `${window.location.origin}/assinar/${s.token}`,
                                      "_blank",
                                      "noopener",
                                    )
                                  }
                                  title="Abrir"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {mode === "compose" && (
          <div className="space-y-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("list")}
              className="text-muted-foreground -ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>

            {/* Itens entregues */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-sm font-semibold text-primary">
                  Itens entregues ao colaborador
                </Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                </Button>
              </div>
              <div className="space-y-3">
                {items.map((it, i) => (
                  <div key={it.id} className="border rounded-lg p-3 bg-muted/30 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="text-xs font-bold text-primary bg-primary/10 rounded px-2 py-1 mt-1">
                        #{i + 1}
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_90px_200px] gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Descrição do item</Label>
                          <Input
                            placeholder="Ex: Notebook Dell Latitude 7420, S/N ABC12345"
                            value={it.descricao}
                            onChange={(e) => updateItem(it.id, { descricao: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Quantidade</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="1"
                            value={it.quantidade === 0 ? "" : String(it.quantidade)}
                            onChange={(e) => {
                              // Aceita vazio / dígitos livremente enquanto digita
                              // (clamp só no blur). 0 internamente = "vazio".
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              if (raw === "") {
                                updateItem(it.id, { quantidade: 0 });
                              } else {
                                const n = parseInt(raw, 10);
                                updateItem(it.id, { quantidade: Number.isFinite(n) ? n : 0 });
                              }
                            }}
                            onBlur={() => {
                              if (!Number.isFinite(it.quantidade) || it.quantidade < 1) {
                                updateItem(it.id, { quantidade: 1 });
                              }
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Estado de conservação</Label>
                          <Input
                            placeholder="Ex: Novo / Bom uso / Usado"
                            value={it.estado}
                            onChange={(e) => updateItem(it.id, { estado: e.target.value })}
                          />
                        </div>
                      </div>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 mt-5"
                          onClick={() => removeItem(it.id)}
                          title="Remover item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {/* Fotos */}
                    <div className="pl-10">
                      <div className="flex items-center gap-2 mb-1">
                        <Label className="text-xs text-muted-foreground">
                          Fotos do estado ({it.fotos.length})
                        </Label>
                        <input
                          ref={(el) => { fileInputRefs.current[it.id] = el; }}
                          type="file"
                          accept="image/*"
                          multiple
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            onPickPhotos(it.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={compressing}
                          onClick={() => fileInputRefs.current[it.id]?.click()}
                        >
                          {compressing ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Camera className="h-3.5 w-3.5 mr-1" />
                          )}
                          Adicionar fotos
                        </Button>
                      </div>
                      {it.fotos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {it.fotos.map((f) => (
                            <div key={f.id} className="relative">
                              <img
                                src={f.dataUrl}
                                alt=""
                                className="h-28 w-36 sm:h-32 sm:w-44 object-cover rounded border shadow-sm"
                              />
                              <button
                                type="button"
                                onClick={() => removerFoto(it.id, f.id)}
                                className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-700"
                                title="Remover foto"
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Local + Data */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Local</Label>
                <Input
                  placeholder="Ex: São Paulo/SP"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input
                  type="date"
                  value={dataDoc}
                  onChange={(e) => setDataDoc(e.target.value)}
                />
              </div>
            </div>

            {/* Observações */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Observações (opcional)
              </Label>
              <Textarea
                placeholder="Detalhes adicionais sobre a entrega, condições especiais, etc."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
              />
            </div>

          </div>
        )}
      </div>
    </FullScreenDialog>
  );
}
