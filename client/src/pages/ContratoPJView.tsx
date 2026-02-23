import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCPF } from "@/lib/formatters";

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

export default function ContratoPJView() {
  const [, params] = useRoute("/contrato-pj/:id");
  const [, navigate] = useLocation();
  const contratoId = params?.id ? parseInt(params.id, 10) : 0;
  const { selectedCompany } = useCompany();

  const { data: contrato, isLoading, error } = trpc.pj.contratos.getById.useQuery(
    { id: contratoId },
    { enabled: !!contratoId }
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
  const percAdiant = contrato.percentualAdiantamento || 40;
  const percFech = contrato.percentualFechamento || 60;
  const valorAdiant = valorMensal * percAdiant / 100;
  const valorFech = valorMensal * percFech / 100;

  const nomeEmpresa = selectedCompany?.razaoSocial || selectedCompany?.nomeFantasia || "FC ENGENHARIA PROJETOS E OBRAS LTDA";
  const cnpjEmpresa = selectedCompany?.cnpj || "_______________";
  const enderecoEmpresa = selectedCompany?.endereco || "_______________";
  const cidadeEmpresa = selectedCompany?.cidade || "São José dos Campos";
  const estadoEmpresa = selectedCompany?.estado || "SP";

  const nomePrestador = contrato.razaoSocialPrestador || contrato.employeeName || "_______________";
  const cnpjPrestador = contrato.cnpjPrestador;
  const cpfPrestador = contrato.employeeCpf || "_______________";

  return (
    <>
      {/* BARRA DE AÇÕES - só aparece na tela, esconde na impressão */}
      <div className="print:hidden sticky top-0 z-50 bg-gradient-to-r from-purple-700 to-indigo-800 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="text-white hover:bg-white/20 h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Contrato de Prestação de Serviços</h1>
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

      {/* CONTRATO - renderizado diretamente na página */}
      <div className="contrato-pj-page bg-gray-200 print:bg-white min-h-screen">
        <div className="contrato-body max-w-[750px] mx-auto bg-white print:shadow-none shadow-xl my-8 print:my-0 px-16 py-14 print:px-0 print:py-0" style={{ fontFamily: "'Times New Roman', 'Georgia', serif" }}>
          
          {/* TÍTULO */}
          <h1 className="text-center text-[18pt] font-bold uppercase tracking-wider mb-2">
            Contrato de Prestação de Serviços
          </h1>
          <p className="text-center text-[11pt] text-gray-500 mb-10">
            Contrato nº {contrato.numeroContrato || "S/N"}
          </p>

          {/* PREÂMBULO */}
          <p className="text-justify text-[12pt] leading-[1.8] mb-4">
            Pelo presente instrumento particular, de um lado <strong>{nomeEmpresa}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {cnpjEmpresa}, com sede em {enderecoEmpresa}, doravante denominada <strong>CONTRATANTE</strong>, e de outro lado <strong>{nomePrestador}</strong>, {cnpjPrestador ? `inscrita no CNPJ sob o nº ${cnpjPrestador}` : `portador(a) do CPF nº ${formatCPF(cpfPrestador)}`}, doravante denominada <strong>CONTRATADA</strong>, têm entre si justo e contratado o seguinte:
          </p>

          {/* CLÁUSULA 1 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 1ª — Do Objeto</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2">
              {contrato.objetoContrato || `A CONTRATADA se obriga a prestar serviços técnicos especializados de ${contrato.employeeCargo || "consultoria"}, conforme demanda da CONTRATANTE, de acordo com as especificações e condições estabelecidas neste contrato.`}
            </p>
          </div>

          {/* CLÁUSULA 2 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 2ª — Da Vigência</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2">
              O presente contrato terá vigência de <strong>{formatDate(contrato.dataInicio)}</strong> a <strong>{formatDate(contrato.dataFim)}</strong>{contrato.renovacaoAutomatica ? ", podendo ser renovado automaticamente por igual período, salvo manifestação contrária de qualquer das partes com antecedência mínima de 30 (trinta) dias." : "."}
            </p>
          </div>

          {/* CLÁUSULA 3 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 3ª — Do Valor e Forma de Pagamento</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2">
              Pela prestação dos serviços, a CONTRATANTE pagará à CONTRATADA o valor mensal de <strong>R$ {formatMoeda(valorMensal)}</strong>, sendo:
            </p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-1 pl-8">
              a) <strong>{percAdiant}%</strong> (R$ {formatMoeda(valorAdiant)}) a título de adiantamento, até o dia <strong>{contrato.diaAdiantamento || 15}</strong> de cada mês;
            </p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2 pl-8">
              b) <strong>{percFech}%</strong> (R$ {formatMoeda(valorFech)}) referente ao fechamento, até o dia <strong>{contrato.diaFechamento || 5}</strong> do mês subsequente.
            </p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2">
              Os pagamentos serão efetuados mediante apresentação de Nota Fiscal de Serviços pela CONTRATADA.
            </p>
          </div>

          {/* CLÁUSULA 4 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 4ª — Das Obrigações da Contratada</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-1 pl-8">a) Executar os serviços com qualidade, zelo e dentro dos prazos acordados;</p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-1 pl-8">b) Manter regularidade fiscal e tributária durante a vigência do contrato;</p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-1 pl-8">c) Emitir Nota Fiscal de Serviço correspondente ao valor mensal contratado;</p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-1 pl-8">d) Responsabilizar-se por todos os encargos trabalhistas, previdenciários e fiscais decorrentes da execução dos serviços;</p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2 pl-8">e) Guardar sigilo sobre informações confidenciais da CONTRATANTE.</p>
          </div>

          {/* CLÁUSULA 5 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 5ª — Das Obrigações da Contratante</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-1 pl-8">a) Efetuar os pagamentos nos prazos e condições estabelecidos;</p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-1 pl-8">b) Fornecer as informações e condições necessárias à execução dos serviços;</p>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2 pl-8">c) Comunicar à CONTRATADA quaisquer alterações nas condições de trabalho.</p>
          </div>

          {/* CLÁUSULA 6 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 6ª — Da Rescisão</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2">
              O presente contrato poderá ser rescindido por qualquer das partes, mediante comunicação por escrito com antecedência mínima de 30 (trinta) dias, sem ônus para a parte que rescindir, ressalvados os pagamentos devidos pelos serviços já prestados.
            </p>
          </div>

          {/* CLÁUSULA 7 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 7ª — Da Inexistência de Vínculo Empregatício</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2">
              O presente contrato não gera vínculo empregatício entre as partes, sendo a CONTRATADA pessoa jurídica autônoma, responsável por seus próprios encargos e obrigações.
            </p>
          </div>

          {/* CLÁUSULA 8 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 8ª — Da Confidencialidade</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2">
              A CONTRATADA compromete-se a manter sigilo sobre todas as informações, dados e documentos a que tiver acesso em razão da prestação dos serviços, durante e após a vigência deste contrato.
            </p>
          </div>

          {/* CLÁUSULA 9 */}
          <div className="mt-8">
            <h2 className="text-[13pt] font-bold uppercase mb-3">Cláusula 9ª — Do Foro</h2>
            <p className="text-justify text-[12pt] leading-[1.8] mb-2">
              Fica eleito o foro da Comarca de {cidadeEmpresa} - {estadoEmpresa} para dirimir quaisquer dúvidas oriundas do presente contrato.
            </p>
          </div>

          {/* ENCERRAMENTO */}
          <p className="text-center text-[12pt] leading-[1.8] mt-10 mb-4">
            E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.
          </p>
          <p className="text-center text-[12pt] leading-[1.8] mb-16">
            {cidadeEmpresa}, {formatDateExtenso(new Date().toISOString().split("T")[0])}.
          </p>

          {/* ASSINATURAS */}
          <div className="flex justify-between mt-20 px-4">
            <div className="text-center w-[45%]">
              <div className="border-t border-black pt-2 mt-16">
                <p className="font-bold text-[11pt]">{nomeEmpresa}</p>
                <p className="text-[10pt] text-gray-600">CONTRATANTE</p>
              </div>
            </div>
            <div className="text-center w-[45%]">
              <div className="border-t border-black pt-2 mt-16">
                <p className="font-bold text-[11pt]">{nomePrestador}</p>
                <p className="text-[10pt] text-gray-600">CONTRATADA</p>
              </div>
            </div>
          </div>

          {/* TESTEMUNHAS */}
          <div className="mt-16 text-center">
            <p className="text-[10pt] text-gray-500 mb-8">Testemunhas:</p>
            <div className="flex justify-between px-4">
              <div className="text-center w-[45%]">
                <div className="border-t border-black pt-2 mt-12">
                  <p className="text-[10pt]">Nome:</p>
                  <p className="text-[10pt]">CPF:</p>
                </div>
              </div>
              <div className="text-center w-[45%]">
                <div className="border-t border-black pt-2 mt-12">
                  <p className="text-[10pt]">Nome:</p>
                  <p className="text-[10pt]">CPF:</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* CSS DE IMPRESSÃO */}
      <style>{`
        @media print {
          /* Esconder TUDO que não é o contrato */
          body > *:not(#root) { display: none !important; }
          .print\\:hidden { display: none !important; }
          
          /* Configurar página A4 */
          @page {
            size: A4 portrait;
            margin: 2.5cm;
          }
          
          /* O contrato ocupa tudo */
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
    </>
  );
}
