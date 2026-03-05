import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { contractTemplates, employeeContracts, employees, companies } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { storagePut } from "../storage";

// ==========================================
// Valor por extenso em pt-BR
// ==========================================
function valorPorExtenso(valor: number): string {
  if (valor === 0) return "Zero Reais";

  const unidades = ["", "Um", "Dois", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove"];
  const especiais = ["Dez", "Onze", "Doze", "Treze", "Quatorze", "Quinze", "Dezesseis", "Dezessete", "Dezoito", "Dezenove"];
  const dezenas = ["", "", "Vinte", "Trinta", "Quarenta", "Cinquenta", "Sessenta", "Setenta", "Oitenta", "Noventa"];
  const centenas = ["", "Cento", "Duzentos", "Trezentos", "Quatrocentos", "Quinhentos", "Seiscentos", "Setecentos", "Oitocentos", "Novecentos"];

  function grupoExtenso(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "Cem";
    const parts: string[] = [];
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (c > 0) parts.push(centenas[c]);
    if (resto >= 10 && resto <= 19) {
      parts.push(especiais[resto - 10]);
    } else {
      if (d > 0) parts.push(dezenas[d]);
      if (u > 0) parts.push(unidades[u]);
    }
    return parts.join(" e ");
  }

  const parteInteira = Math.floor(valor);
  const centavos = Math.round((valor - parteInteira) * 100);

  const milhares = Math.floor(parteInteira / 1000);
  const resto = parteInteira % 1000;

  const parts: string[] = [];
  if (milhares > 0) {
    parts.push(milhares === 1 ? "Mil" : `${grupoExtenso(milhares)} Mil`);
  }
  if (resto > 0) {
    parts.push(grupoExtenso(resto));
  }

  let resultado = parts.join(" e ");
  if (parteInteira === 0) resultado = "Zero";

  if (parteInteira === 1) {
    resultado += " Real";
  } else if (parteInteira > 0) {
    resultado += " Reais";
  }

  if (centavos > 0) {
    const centavosExtenso = grupoExtenso(centavos);
    if (parteInteira > 0) resultado += " e ";
    resultado += centavos === 1 ? `${centavosExtenso} Centavo` : `${centavosExtenso} Centavos`;
  }

  return resultado;
}

// ==========================================
// Substituir placeholders no template
// ==========================================
function substituirPlaceholders(template: string, dados: Record<string, string>): string {
  let resultado = template;
  for (const [key, value] of Object.entries(dados)) {
    resultado = resultado.replace(new RegExp(`\\[${key}\\]`, "g"), value || "_______________");
  }
  return resultado;
}

function formatarData(dateStr: string | null | undefined): string {
  if (!dateStr) return "_______________";
  const d = new Date(dateStr + "T12:00:00");
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatarDataCurta(dateStr: string | null | undefined): string {
  if (!dateStr) return "__/__/____";
  const d = new Date(dateStr + "T12:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// ==========================================
// Templates padrão
// ==========================================
const TEMPLATE_EXPERIENCIA = `<div style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px;">
<h2 style="text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 30px;">CONTRATO DE TRABALHO A TÍTULO DE EXPERIÊNCIA</h2>

<p style="text-align: justify;">Pelo presente instrumento particular de Contrato de Trabalho a título de experiência, a empresa <strong>[EMPRESA_RAZAO_SOCIAL]</strong>, com sede na [EMPRESA_ENDERECO], [EMPRESA_CIDADE], estado de [EMPRESA_ESTADO], CNPJ nº [EMPRESA_CNPJ], denominada a seguir EMPREGADORA e o(a) Sr(a) <strong>[NOME_FUNCIONARIO]</strong> domiciliado na [ENDERECO_FUNCIONARIO], [NUMERO_FUNCIONARIO], [BAIRRO_FUNCIONARIO], na cidade de [CIDADE_FUNCIONARIO], estado de [ESTADO_FUNCIONARIO], portador do CPF [CPF], CTPS nº [CTPS], série [SERIE_CTPS] e PIS [PIS], doravante designado EMPREGADO, celebram o presente Contrato Individual de trabalho para fins de experiência, conforme legislação trabalhista em vigor, regido pelas cláusulas abaixo e demais disposições legais vigentes.</p>

<p style="text-align: justify;"><strong>1.</strong> O EMPREGADO trabalhará para a EMPREGADORA na função de <strong>[FUNCAO]</strong> e mais as funções que vierem a ser objetos de ordem verbais, cartas ou avisos, segundo as necessidades da empregadora desde que compatíveis com suas atribuições. A circunstância, porém, de ser a função específica não importa na intransferibilidade do EMPREGADO para outro serviço, no qual demonstre melhor capacidade de adaptação desde que compatível com sua condição pessoal.</p>

<p style="text-align: justify;"><strong>2.</strong> O local de trabalho será na [LOCAL_TRABALHO], podendo a EMPREGADORA a qualquer tempo, transferir o EMPREGADO a título temporário ou definitivo, tanto no âmbito da unidade para a qual foi admitido, como para outras, em qualquer localidade deste estado ou outro dentro do país.</p>

<p style="text-align: justify;"><strong>3.</strong> O EMPREGADO trabalhará no horário descrito abaixo e aceita trabalhar em regime de compensação e de prorrogação de horas, inclusive em período noturno, sempre que as necessidades assim o exigirem, observadas as formalidades legais.</p>
<p style="margin-left: 40px;">[HORARIO_TRABALHO]</p>
<p style="text-align: justify;"><strong>Parágrafo único:</strong> Convindo as partes, poderá ser estabelecido um horário de trabalho diferente do mencionado nesta cláusula, inclusive da jornada diurna para noturna e vice-versa, ou em horários mistos e, quando necessário em regime de revezamento, prorrogação e compensação e horário extraordinário. Ao EMPREGADOR cabe a faculdade de indicar e alterar os períodos durante a jornada, observando as formalidades legais.</p>

<p style="text-align: justify;"><strong>4.</strong> O EMPREGADO perceberá a remuneração de <strong>R$[VALOR_HORA]</strong> ([VALOR_HORA_EXTENSO]) por hora.</p>

<p style="text-align: justify;"><strong>5.</strong> O prazo deste contrato é de <strong>[PRAZO_EXPERIENCIA] dias</strong>, com início em <strong>[DATA_INICIO]</strong> e término em <strong>[DATA_FIM]</strong>, podendo ser prorrogado por mais [PRAZO_PRORROGACAO] dias, obedecendo o Parágrafo Único do artigo 445 da CLT.</p>

<p style="text-align: justify;"><strong>6.</strong> Além dos descontos previstos em lei, em caso de danos causados pelo EMPREGADO, fica a EMPREGADORA, autorizada a efetivar o desconto da importância correspondente ao prejuízo, o qual fará, com fundamento no parágrafo 1 do Artigo 462 da CLT, já que essa possibilidade fica expressamente prevista em contrato.</p>

<p style="text-align: justify;"><strong>7.</strong> O EMPREGADO fica ciente do regulamento da empresa e das Normas de segurança que regulam suas atividades na EMPREGADORA e se compromete a usar os equipamentos de segurança fornecidos, sob pena de ser punido por falta grave, nos termos da legislação vigente e demais disposições inerentes a segurança e medicina do trabalho.</p>

<p style="text-align: justify;"><strong>8.</strong> Obriga-se o EMPREGADO, além de executar com dedicação e lealdade o seu serviço, cumprir o Regulamento Interno da EMPREGADORA, as instruções de sua administração e as ordens de seus superiores hierárquicos, relativos as peculiaridades dos serviços que lhe forem confiados.</p>

<p style="text-align: justify;"><strong>9.</strong> Permanecendo o EMPREGADO a serviço da EMPREGADORA após o término da experiência, o contrato passará a vigorar por prazo indeterminado e continuarão em vigor as cláusulas constantes neste instrumento.</p>

<p style="text-align: justify;"><strong>10.</strong> No afastamento previdenciário por auxílio doença (cód. 31), durante o contrato de experiência, a contagem será interrompida após o 15º dia, continuando a contagem do período restante no dia imediatamente posterior a alta previdenciária de acordo com o parágrafo 2º, do artigo 472 da CLT.</p>

<p style="text-align: justify;"><strong>11.</strong> A rescisão do presente contrato, sem justa causa, por parte da EMPREGADORA ou do EMPREGADO, antes do término do contrato de experiência, implicará em indenização, de metade dos dias a que teria direito até o término do contrato, conforme art. 479 e 480 da CLT.</p>

<p style="text-align: justify;"><strong>12.</strong> Considerando a Lei 13.709/2018 - Lei Geral de Proteção de Dados (LGPD), as partes se obrigam na observância e cumprimento das regras quanto a proteção de dados, inclusive no tratamento de dados pessoais e sensíveis, mediante aditivos e termos específicos, de acordo com a necessidade e/ou obrigação legal de coleta dos dados.</p>

<p style="text-align: justify;"><strong>13.</strong> A EMPREGADORA executará os trabalhos a partir das premissas da LGPD, em especial os princípios da finalidade, adequação, transparência, livre acesso, segurança, prevenção e não discriminação no tratamento dos dados.</p>

<p style="text-align: justify;"><strong>14.</strong> As partes concordam que a coleta e tratamento de dados, sempre que possível e recomendável, observará o consentimento do empregado no fornecimento de dados e deverá ser livre, informado, inequívoco e relacionado a uma determinada finalidade.</p>

<p style="text-align: justify;"><strong>15.</strong> A EMPREGADORA se compromete a correta conservação dos dados pessoais e demais dados pertinentes a relação de emprego, na vigência e após o seu eventual término para cumprimento de obrigação legal ou regulatória do controlador, respeitando os prazos legais trabalhistas, previdenciários e fiscais para guarda de tais dados, nos termos do art. 16, I da Lei 13.709/2018.</p>

<p style="text-align: justify;"><strong>16.</strong> A EMPREGADORA esclarece que possui política interna para tratamento em caso de vazamento de dados. Bem como, uma política de privacidade que visa garantir a confidencialidade dos dados coletados.</p>

<p style="text-align: justify;"><strong>17.</strong> A EMPREGADORA, no caso de controlador fica autorizado a compartilhar os dados do EMPREGADO somente com outros agentes de tratamento de dados governamentais e/ou agentes relacionados ao vínculo empregatício, como empresa de saúde e segurança, operadoras de planos de saúde, instituição bancária para abertura de conta salário, empresas privadas que mantenham convênios de benefícios com a empregadora - e de cujos benefícios o EMPREGADO ou dependentes farão o aproveitamento, e eventuais situações similares, devendo serem observados os princípios e as garantias estabelecidas pela Lei nº 13.709/2018.</p>

<p style="text-align: justify;"><strong>18.</strong> O EMPREGADO a qualquer momento pode revogar o consentimento, e pedir a exclusão ou inutilização dos dados pessoais fornecidos para a relação contratual de vínculo empregatício, pedido este que deverá ser formalizado via e-mail ou correspondência à EMPREGADORA.</p>

<p style="text-align: justify;"><strong>19.</strong> O EMPREGADO obriga-se expressamente a guardar sigilo absoluto de toda e qualquer informação que venha a ter acesso, nela compreendidas as suas mais variadas formas, por mais irrelevantes que possam vir a ser ou parecer, em decorrência do desempenho de suas funções, sejam elas atinentes à EMPREGADORA e/ou a terceiros, clientes ou não desta.</p>

<p style="text-align: justify;"><strong>20.</strong> O EMPREGADO declara-se sabedor de que a não observância do que acima consta, seja por culpa ou dolo, tornará passível a rescisão do contrato de trabalho por justa causa, sem prejuízo da competente ação civil e/ou criminal que o caso vier a merecer.</p>

<p style="text-align: justify;">E por estarem de pleno acordo, as partes contratantes assinam o presente contrato de Trabalho em duas vias ficando a primeira em poder da EMPREGADORA, e a seguinte com o EMPREGADO.</p>

<p style="text-align: center; margin-top: 30px;">[EMPRESA_CIDADE], [DATA_EXTENSO].</p>

<div style="margin-top: 60px; display: flex; justify-content: space-between;">
<div style="text-align: center; width: 45%;">
<div style="border-top: 1px solid #000; padding-top: 5px;">[NOME_FUNCIONARIO]</div>
</div>
<div style="text-align: center; width: 45%;">
<div style="border-top: 1px solid #000; padding-top: 5px;">Assinatura do responsável quando menor</div>
</div>
</div>

<div style="margin-top: 40px; text-align: center;">
<div style="border-top: 1px solid #000; display: inline-block; padding-top: 5px; min-width: 300px;">[EMPRESA_RAZAO_SOCIAL]</div>
</div>

<div style="margin-top: 30px;">
<p><strong>Testemunhas</strong></p>
<div style="display: flex; justify-content: space-between; margin-top: 30px;">
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">Nome / CPF</div></div>
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">Nome / CPF</div></div>
</div>
</div>

<div style="page-break-before: always; margin-top: 60px;">
<h2 style="text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 30px;">TERMO DE PRORROGAÇÃO</h2>
<p style="text-align: justify;">Por mútuo acordo entre as Partes, fica o contrato de experiência prorrogado por mais <strong>[PRAZO_PRORROGACAO] dias</strong>, a contar da data de hoje, cujo término é <strong>[DATA_FIM_PRORROGACAO]</strong>.</p>

<p style="text-align: center; margin-top: 30px;">[EMPRESA_CIDADE], _______ de _________________ de _______.</p>

<div style="margin-top: 60px; display: flex; justify-content: space-between;">
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">[NOME_FUNCIONARIO]</div></div>
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">Assinatura do responsável quando menor</div></div>
</div>
<div style="margin-top: 40px; text-align: center;">
<div style="border-top: 1px solid #000; display: inline-block; padding-top: 5px; min-width: 300px;">[EMPRESA_RAZAO_SOCIAL]</div>
</div>
<div style="margin-top: 30px;">
<p><strong>Testemunhas</strong></p>
<div style="display: flex; justify-content: space-between; margin-top: 30px;">
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">Nome / CPF</div></div>
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">Nome / CPF</div></div>
</div>
</div>
</div>
</div>`;

const TEMPLATE_INDETERMINADO = `<div style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px;">
<h2 style="text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 30px;">CONTRATO DE TRABALHO POR PRAZO INDETERMINADO</h2>

<p style="text-align: justify;">Pelo presente instrumento particular que entre si fazem a empresa <strong>[EMPRESA_RAZAO_SOCIAL]</strong>, com sede na [EMPRESA_ENDERECO], [EMPRESA_CIDADE], estado de [EMPRESA_ESTADO], CNPJ nº [EMPRESA_CNPJ], denominada a seguir EMPREGADORA e o(a) Sr(a) <strong>[NOME_FUNCIONARIO]</strong> domiciliado na [ENDERECO_FUNCIONARIO], [NUMERO_FUNCIONARIO], [BAIRRO_FUNCIONARIO], na cidade de [CIDADE_FUNCIONARIO], estado de [ESTADO_FUNCIONARIO], portador da CTPS nº [CTPS], série [SERIE_CTPS], doravante designado EMPREGADO, fica justo e contratado o seguinte:</p>

<p style="text-align: justify;"><strong>1.</strong> O EMPREGADO trabalhará para a EMPREGADORA na função de <strong>[FUNCAO]</strong> e mais as funções que vierem a ser objetos de ordem verbais, cartas ou avisos, segundo as necessidades da empregadora desde que compatíveis com suas atribuições. A circunstância, porém, de ser a função específica não importa na intransferibilidade do EMPREGADO para outro serviço, no qual demonstre melhor capacidade de adaptação desde que compatível com sua condição pessoal.</p>

<p style="text-align: justify;"><strong>2.</strong> O local de trabalho será na [LOCAL_TRABALHO], podendo a EMPREGADORA a qualquer tempo, transferir o EMPREGADO a título temporário ou definitivo, tanto no âmbito da unidade para a qual foi admitido, como para outras, em qualquer localidade deste estado ou outro dentro do país.</p>

<p style="text-align: justify;"><strong>3.</strong> O EMPREGADO trabalhará no horário descrito abaixo e aceita trabalhar em regime de compensação e de prorrogação de horas, inclusive em período noturno, sempre que as necessidades assim o exigirem, observadas as formalidades legais.</p>
<p style="margin-left: 40px;">[HORARIO_TRABALHO]</p>
<p style="text-align: justify;"><strong>Parágrafo único:</strong> Convindo as partes, poderá ser estabelecido um horário de trabalho diferente do mencionado nesta cláusula, inclusive da jornada diurna para noturna e vice-versa, ou em horários mistos e, quando necessário em regime de revezamento, prorrogação e compensação e horário extraordinário. Ao EMPREGADOR cabe a faculdade de indicar e alterar os períodos durante a jornada, observando as formalidades legais.</p>

<p style="text-align: justify;"><strong>4.</strong> O EMPREGADO perceberá a remuneração de <strong>R$[VALOR_HORA]</strong> ([VALOR_HORA_EXTENSO]) por hora.</p>

<p style="text-align: justify;"><strong>5.</strong> Além dos descontos previstos em lei, em caso de danos causados pelo EMPREGADO, fica a EMPREGADORA, autorizada a efetivar o desconto da importância correspondente ao prejuízo, o qual fará, com fundamento no parágrafo 1 do Artigo 462 da CLT, já que essa possibilidade fica expressamente prevista em contrato.</p>

<p style="text-align: justify;"><strong>6.</strong> O EMPREGADO fica ciente do regulamento da empresa e das Normas de segurança que regulam suas atividades na EMPREGADORA e se compromete a usar os equipamentos de segurança fornecidos, sob pena de ser punido por falta grave, nos termos da legislação vigente e demais disposições inerentes a segurança e medicina do trabalho.</p>

<p style="text-align: justify;"><strong>7.</strong> Obriga-se o EMPREGADO, além de executar com dedicação e lealdade o seu serviço, cumprir o Regulamento Interno da EMPREGADORA, as instruções de sua administração e as ordens de seus superiores hierárquicos, relativos as peculiaridades dos serviços que lhe forem confiados.</p>

<p style="text-align: justify;"><strong>8.</strong> Considerando a Lei 13.709/2018 - Lei Geral de Proteção de Dados (LGPD), as partes se obrigam na observância e cumprimento das regras quanto a proteção de dados, inclusive no tratamento de dados pessoais e sensíveis, mediante aditivos e termos específicos, de acordo com a necessidade e/ou obrigação legal de coleta dos dados.</p>

<p style="text-align: justify;"><strong>9.</strong> A EMPREGADORA executará os trabalhos a partir das premissas da LGPD, em especial os princípios da finalidade, adequação, transparência, livre acesso, segurança, prevenção e não discriminação no tratamento dos dados.</p>

<p style="text-align: justify;"><strong>10.</strong> As partes concordam que a coleta e tratamento de dados, sempre que possível e recomendável, observará o consentimento do empregado no fornecimento de dados e deverá ser livre, informado, inequívoco e relacionado a uma determinada finalidade.</p>

<p style="text-align: justify;"><strong>11.</strong> A EMPREGADORA se compromete a correta conservação dos dados pessoais e demais dados pertinentes a relação de emprego, na vigência e após o seu eventual término para cumprimento de obrigação legal ou regulatória do controlador, respeitando os prazos legais trabalhistas, previdenciários e fiscais para guarda de tais dados, nos termos do art. 16, I da Lei 13.709/2018.</p>

<p style="text-align: justify;"><strong>12.</strong> A EMPREGADORA esclarece que possui política interna para tratamento em caso de vazamento de dados. Bem como, uma política de privacidade que visa garantir a confidencialidade dos dados coletados.</p>

<p style="text-align: justify;"><strong>13.</strong> A EMPREGADORA, no caso de controlador fica autorizado a compartilhar os dados do EMPREGADO somente com outros agentes de tratamento de dados governamentais e/ou agentes relacionados ao vínculo empregatício, como empresa de saúde e segurança, operadoras de planos de saúde, instituição bancária para abertura de conta salário, empresas privadas que mantenham convênios de benefícios com a empregadora - e de cujos benefícios o EMPREGADO ou dependentes farão o aproveitamento, e eventuais situações similares, devendo serem observados os princípios e as garantias estabelecidas pela Lei nº 13.709/2018.</p>

<p style="text-align: justify;"><strong>14.</strong> O EMPREGADO a qualquer momento pode revogar o consentimento, e pedir a exclusão ou inutilização dos dados pessoais fornecidos para a relação contratual de vínculo empregatício, pedido este que deverá ser formalizado via e-mail ou correspondência à EMPREGADORA.</p>

<p style="text-align: justify;"><strong>15.</strong> O EMPREGADO obriga-se expressamente a guardar sigilo absoluto de toda e qualquer informação que venha a ter acesso, nela compreendidas as suas mais variadas formas, por mais irrelevantes que possam vir a ser ou parecer, em decorrência do desempenho de suas funções, sejam elas atinentes à EMPREGADORA e/ou a terceiros, clientes ou não desta.</p>

<p style="text-align: justify;"><strong>16.</strong> O EMPREGADO declara-se sabedor de que a não observância do que acima consta, seja por culpa ou dolo, tornará passível a rescisão do contrato de trabalho por justa causa, sem prejuízo da competente ação civil e/ou criminal que o caso vier a merecer.</p>

<p style="text-align: justify;">E por estarem de pleno acordo, as partes contratantes assinam o presente contrato de Trabalho em duas vias ficando a primeira em poder da EMPREGADORA.</p>

<p style="text-align: center; margin-top: 30px;">[EMPRESA_CIDADE], [DATA_EXTENSO].</p>

<div style="margin-top: 60px; display: flex; justify-content: space-between;">
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">[NOME_FUNCIONARIO]</div></div>
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">Assinatura do responsável quando menor</div></div>
</div>
<div style="margin-top: 40px; text-align: center;">
<div style="border-top: 1px solid #000; display: inline-block; padding-top: 5px; min-width: 300px;">[EMPRESA_RAZAO_SOCIAL]</div>
</div>
<div style="margin-top: 30px;">
<p><strong>Testemunhas</strong></p>
<div style="display: flex; justify-content: space-between; margin-top: 30px;">
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">Nome / CPF</div></div>
<div style="text-align: center; width: 45%;"><div style="border-top: 1px solid #000; padding-top: 5px;">Nome / CPF</div></div>
</div>
</div>
</div>`;

// ==========================================
// Router
// ==========================================
export const contractsRouter = router({
  // Listar templates
  listTemplates: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(contractTemplates)
        .where(and(eq(contractTemplates.companyId, input.companyId), eq(contractTemplates.ativo, 1)))
        .orderBy(contractTemplates.tipo);
    }),

  // Obter template por ID
  getTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [tmpl] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, input.id));
      return tmpl || null;
    }),

  // Criar/atualizar template
  saveTemplate: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      tipo: z.enum(["experiencia", "indeterminado", "prorrogacao"]),
      nome: z.string().min(1),
      conteudoHtml: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (input.id) {
        await db.update(contractTemplates)
          .set({ nome: input.nome, conteudoHtml: input.conteudoHtml, tipo: input.tipo })
          .where(eq(contractTemplates.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(contractTemplates).values({
        companyId: input.companyId,
        tipo: input.tipo,
        nome: input.nome,
        conteudoHtml: input.conteudoHtml,
        criadoPor: ctx.user.name || ctx.user.email,
        criadoPorUserId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  // Deletar template
  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(contractTemplates).set({ ativo: 0 }).where(eq(contractTemplates.id, input.id));
      return { success: true };
    }),

  // Inicializar templates padrão para uma empresa
  initTemplates: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.select().from(contractTemplates)
        .where(and(eq(contractTemplates.companyId, input.companyId), eq(contractTemplates.ativo, 1)));
      if (existing.length > 0) return { message: "Templates já existem", count: existing.length };

      await db.insert(contractTemplates).values([
        {
          companyId: input.companyId,
          tipo: "experiencia" as const,
          nome: "Contrato de Experiência CLT (Padrão FC)",
          conteudoHtml: TEMPLATE_EXPERIENCIA,
          criadoPor: ctx.user.name || ctx.user.email,
          criadoPorUserId: ctx.user.id,
        },
        {
          companyId: input.companyId,
          tipo: "indeterminado" as const,
          nome: "Contrato Indeterminado CLT (Padrão FC)",
          conteudoHtml: TEMPLATE_INDETERMINADO,
          criadoPor: ctx.user.name || ctx.user.email,
          criadoPorUserId: ctx.user.id,
        },
      ]);
      return { message: "Templates criados com sucesso", count: 2 };
    }),

  // Gerar contrato preenchido (preview)
  gerarContrato: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      tipo: z.enum(["experiencia", "indeterminado"]),
      templateId: z.number().optional(),
      prazoExperienciaDias: z.number().optional(),
      prazoProrrogacaoDias: z.number().optional(),
      dataInicio: z.string().optional(),
      valorHoraOverride: z.string().optional(),
      funcaoOverride: z.string().optional(),
      localTrabalhoOverride: z.string().optional(),
      horarioTrabalhoOverride: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Buscar funcionário
      const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
      if (!emp) throw new Error("Funcionário não encontrado");

      // Buscar empresa
      const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
      if (!company) throw new Error("Empresa não encontrada");

      // Buscar template
      let templateHtml: string;
      if (input.templateId) {
        const [tmpl] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, input.templateId));
        if (!tmpl) throw new Error("Template não encontrado");
        templateHtml = tmpl.conteudoHtml;
      } else {
        templateHtml = input.tipo === "experiencia" ? TEMPLATE_EXPERIENCIA : TEMPLATE_INDETERMINADO;
      }

      const dataInicio = input.dataInicio || emp.dataAdmissao || new Date().toISOString().split("T")[0];
      const prazo = input.prazoExperienciaDias || 45;
      const prazoProrr = input.prazoProrrogacaoDias || prazo;
      const dataFimObj = new Date(dataInicio + "T12:00:00");
      dataFimObj.setDate(dataFimObj.getDate() + prazo);
      const dataFim = dataFimObj.toISOString().split("T")[0];
      const dataFimProrr = new Date(dataFim + "T12:00:00");
      dataFimProrr.setDate(dataFimProrr.getDate() + prazoProrr);

      const valorHora = input.valorHoraOverride || emp.valorHora || emp.salarioBase || "0";
      const valorHoraNum = parseFloat(valorHora.replace(",", ".")) || 0;

      const horario = input.horarioTrabalhoOverride || emp.jornadaTrabalho || "de 2ª feira à 5ª feira: 07h00 às 12h00 e das 13h00 às 17h00<br>na 6ª feira: 07h00 às 12h00 e das 13h00 às 16h00";

      const placeholders: Record<string, string> = {
        EMPRESA_RAZAO_SOCIAL: company.razaoSocial,
        EMPRESA_CNPJ: company.cnpj,
        EMPRESA_ENDERECO: company.endereco || "",
        EMPRESA_CIDADE: company.cidade || "Guaratinguetá",
        EMPRESA_ESTADO: company.estado || "SP",
        NOME_FUNCIONARIO: emp.nomeCompleto,
        CPF: emp.cpf,
        CTPS: emp.ctps || "",
        SERIE_CTPS: emp.serieCtps || "",
        PIS: emp.pis || "",
        ENDERECO_FUNCIONARIO: emp.logradouro || "",
        NUMERO_FUNCIONARIO: emp.numero || "",
        BAIRRO_FUNCIONARIO: emp.bairro || "",
        CIDADE_FUNCIONARIO: emp.cidade || "",
        ESTADO_FUNCIONARIO: emp.estado || "",
        FUNCAO: input.funcaoOverride || emp.funcao || emp.cargo || "",
        LOCAL_TRABALHO: input.localTrabalhoOverride || `${company.endereco || ""}, ${company.cidade || ""}, estado de ${company.estado || ""}`,
        HORARIO_TRABALHO: horario,
        VALOR_HORA: valorHora,
        VALOR_HORA_EXTENSO: valorPorExtenso(valorHoraNum),
        DATA_INICIO: formatarDataCurta(dataInicio),
        DATA_FIM: formatarDataCurta(dataFim),
        DATA_FIM_PRORROGACAO: formatarDataCurta(dataFimProrr.toISOString().split("T")[0]),
        PRAZO_EXPERIENCIA: String(prazo),
        PRAZO_PRORROGACAO: String(prazoProrr),
        DATA_EXTENSO: formatarData(dataInicio),
        DATA_ADMISSAO: formatarDataCurta(emp.dataAdmissao),
      };

      const conteudoGerado = substituirPlaceholders(templateHtml, placeholders);

      return {
        conteudoHtml: conteudoGerado,
        dados: {
          tipo: input.tipo,
          dataInicio,
          dataFim: input.tipo === "experiencia" ? dataFim : null,
          prazoExperienciaDias: input.tipo === "experiencia" ? prazo : null,
          prazoProrrogacaoDias: input.tipo === "experiencia" ? prazoProrr : null,
          salarioBase: emp.salarioBase,
          valorHora,
          funcao: input.funcaoOverride || emp.funcao || emp.cargo || "",
          jornadaTrabalho: horario,
          localTrabalho: placeholders.LOCAL_TRABALHO,
        },
      };
    }),

  // Salvar contrato gerado
  salvarContrato: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      templateId: z.number().optional(),
      tipo: z.enum(["experiencia", "indeterminado", "prorrogacao"]),
      dataInicio: z.string(),
      dataFim: z.string().optional(),
      prazoExperienciaDias: z.number().optional(),
      prazoProrrogacaoDias: z.number().optional(),
      salarioBase: z.string().optional(),
      valorHora: z.string().optional(),
      funcao: z.string().optional(),
      jornadaTrabalho: z.string().optional(),
      localTrabalho: z.string().optional(),
      conteudoGerado: z.string(),
      contratoAnteriorId: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [result] = await db.insert(employeeContracts).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        templateId: input.templateId || null,
        tipo: input.tipo,
        status: "vigente",
        dataInicio: input.dataInicio,
        dataFim: input.dataFim || null,
        prazoExperienciaDias: input.prazoExperienciaDias || null,
        prazoProrrogacaoDias: input.prazoProrrogacaoDias || null,
        salarioBase: input.salarioBase || null,
        valorHora: input.valorHora || null,
        funcao: input.funcao || null,
        jornadaTrabalho: input.jornadaTrabalho || null,
        localTrabalho: input.localTrabalho || null,
        conteudoGerado: input.conteudoGerado,
        contratoAnteriorId: input.contratoAnteriorId || null,
        observacoes: input.observacoes || null,
        criadoPor: ctx.user.name || ctx.user.email,
        criadoPorUserId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  // Listar contratos de um funcionário
  listarContratos: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(employeeContracts)
        .where(eq(employeeContracts.employeeId, input.employeeId))
        .orderBy(desc(employeeContracts.createdAt));
    }),

  // Obter contrato por ID
  getContrato: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [contrato] = await db.select().from(employeeContracts).where(eq(employeeContracts.id, input.id));
      return contrato || null;
    }),

  // Upload contrato assinado
  uploadAssinado: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      tipoProrrogacao: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const buffer = Buffer.from(input.fileBase64, "base64");
      const suffix = Math.random().toString(36).substring(2, 8);
      const key = `contratos/${input.contratoId}/${suffix}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      if (input.tipoProrrogacao) {
        await db.update(employeeContracts)
          .set({ prorrogacaoAssinadaUrl: url, prorrogacaoAssinadaKey: key })
          .where(eq(employeeContracts.id, input.contratoId));
      } else {
        await db.update(employeeContracts)
          .set({ contratoAssinadoUrl: url, contratoAssinadoKey: key })
          .where(eq(employeeContracts.id, input.contratoId));
      }
      return { url, key };
    }),

  // Atualizar status do contrato
  atualizarStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["vigente", "prorrogado", "efetivado", "encerrado", "rescindido"]),
      dataProrrogacao: z.string().optional(),
      dataEfetivacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const updateData: any = { status: input.status };
      if (input.dataProrrogacao) updateData.dataProrrogacao = input.dataProrrogacao;
      if (input.dataEfetivacao) updateData.dataEfetivacao = input.dataEfetivacao;
      await db.update(employeeContracts).set(updateData).where(eq(employeeContracts.id, input.id));
      return { success: true };
    }),

  // Valor por extenso (utilitário público)
  valorExtenso: protectedProcedure
    .input(z.object({ valor: z.number() }))
    .query(({ input }) => ({ extenso: valorPorExtenso(input.valor) })),
});
