import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import {
  ddsTemas, ddsSessoes, ddsSessaoFuncionarios,
  employees, obras, accidents, obraFuncionarios,
  // Rev. 2021 — DDS pode incluir funcionários terceiros vinculados à obra.
  funcionariosTerceiros, ddsParticipacoesTerceiros,
} from "../../drizzle/schema";
import { eq, and, sql, desc, isNull, inArray, notInArray, gte, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import { coerceDDSArea, DDS_AREAS_PROMPT_TEXT, DDS_AREA_VALUES } from "../../shared/ddsAreas";
import { TEMAS_BIBLIOTECA, buildRoteiroLib } from "../_shared/temasBiblioteca";
import { TEMAS_BIBLIOTECA_EXTRA } from "../_shared/temasBibliotecaExtra";

function assertCompanyAccess(ctx: any, companyId: number) {
  if (ctx.user?.companyId && String(ctx.user.companyId) !== String(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a esta empresa" });
  }
}

// Rev. 1735 — Expande obraIds para incluir TODAS as obras da empresa que compartilham
// o mesmo nome canônico (trim+UPPER). Mesma regra do `getEfetivoPorObra` (server/db.ts L2336)
// e do cadastro > aba "Efetivo por Obra". Resolve o caso de obras duplicadas com IDs diferentes
// (ex.: REVTE-CIVIL aparece em listActive com 1 ID, mas o efetivo está vinculado a outro ID).
async function expandObraIdsByCanonicalName(
  db: any, companyId: number, obraIdsInput: number[]
): Promise<number[]> {
  if (obraIdsInput.length === 0) return [];
  // 1. Pega os nomes canônicos das obras informadas (validando ownership)
  const seedRows = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
    .where(and(inArray(obras.id, obraIdsInput), eq(obras.companyId, companyId)));
  if (seedRows.length !== obraIdsInput.length) {
    console.error("[DDS expand] Ownership mismatch", { companyId, obraIdsInput, seedFound: seedRows.map((r:any)=>r.id) });
    throw new TRPCError({ code: "FORBIDDEN", message: `Obra(s) não pertence(m) à empresa ${companyId}. Inputs=${JSON.stringify(obraIdsInput)} encontrados=${JSON.stringify(seedRows.map((r:any)=>r.id))}` });
  }
  const canonicalNames = Array.from(new Set(
    seedRows.map((r: any) => (r.nome || "").trim().toUpperCase()).filter(Boolean)
  ));
  if (canonicalNames.length === 0) return obraIdsInput;
  // 2. Busca TODAS as obras da empresa (não-deletadas) e filtra por nome canônico
  const allCompanyObras = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
    .where(and(eq(obras.companyId, companyId), isNull(obras.deletedAt)));
  const expanded = new Set<number>(obraIdsInput);
  for (const o of allCompanyObras) {
    const k = (o.nome || "").trim().toUpperCase();
    if (canonicalNames.includes(k)) expanded.add(o.id);
  }
  return Array.from(expanded);
}

// Rev. 1726 — Calendário oficial de campanhas governamentais brasileiras
// (gov.br + portal Saúde). Usado pra semear ddsTemas categoria=CAMPANHA.
const CAMPANHAS_GOV: Array<{
  mes: number; codigo: string; titulo: string; cor: string;
  descricao: string; norma: string;
}> = [
  { mes: 1, codigo: "JANEIRO-BRANCO", titulo: "Janeiro Branco — Saúde Mental", cor: "branco",
    descricao: "Conscientização sobre saúde mental, prevenção de transtornos psicológicos e cuidado emocional no trabalho.",
    norma: "Lei 14.556/2023 — Política Nacional de Saúde Mental" },
  { mes: 2, codigo: "FEVEREIRO-LARANJA", titulo: "Fevereiro Laranja — Combate à Leucemia", cor: "laranja",
    descricao: "Conscientização sobre leucemia, doação de medula óssea e diagnóstico precoce.",
    norma: "Lei 11.584/2007 — Cadastro Nacional de Doadores" },
  { mes: 3, codigo: "MARCO-LILAS", titulo: "Março Lilás — Câncer de Colo do Útero", cor: "lilas",
    descricao: "Prevenção do câncer de colo do útero, importância do exame papanicolau e vacinação contra HPV.",
    norma: "Portaria MS 874/2013 — Política Nacional para Prevenção e Controle do Câncer" },
  { mes: 4, codigo: "ABRIL-VERDE", titulo: "Abril Verde — Saúde e Segurança no Trabalho", cor: "verde",
    descricao: "Mês mundial da SST. Foco em prevenção de acidentes, doenças ocupacionais e cultura de segurança. 28/04 — Dia Mundial em Memória às Vítimas de Acidentes de Trabalho.",
    norma: "OIT C155 + NR-1 (Disposições Gerais) + Lei 11.121/2005" },
  { mes: 5, codigo: "MAIO-AMARELO", titulo: "Maio Amarelo — Trânsito Seguro", cor: "amarelo",
    descricao: "Movimento mundial pela segurança no trânsito. Direção defensiva, uso de cinto de segurança, álcool zero ao volante.",
    norma: "Lei 9.503/97 — Código de Trânsito Brasileiro + Resolução CONTRAN 277/2008" },
  { mes: 6, codigo: "JUNHO-VERMELHO", titulo: "Junho Vermelho — Doação de Sangue", cor: "vermelho",
    descricao: "Estímulo à doação de sangue. 14/06 — Dia Mundial do Doador. Campanha 'Junho Verde' (meio ambiente, 05/06) também é tradicional no setor de construção.",
    norma: "Lei 13.297/2016 + Lei 6.938/81 (Política Nacional do Meio Ambiente)" },
  { mes: 7, codigo: "JULHO-AMARELO", titulo: "Julho Amarelo — Hepatites Virais", cor: "amarelo",
    descricao: "Conscientização sobre hepatites A, B e C. Importância da vacinação e testes rápidos.",
    norma: "Lei 13.802/2019 — Mês Nacional de Prevenção e Combate às Hepatites Virais" },
  { mes: 8, codigo: "AGOSTO-LILAS", titulo: "Agosto Lilás — Combate à Violência contra a Mulher", cor: "lilas",
    descricao: "Campanha contra violência doméstica e familiar. Lei Maria da Penha. Canais de denúncia (Disque 180).",
    norma: "Lei 11.340/2006 (Maria da Penha) + Lei 13.772/2018" },
  { mes: 9, codigo: "SETEMBRO-AMARELO", titulo: "Setembro Amarelo — Prevenção ao Suicídio", cor: "amarelo",
    descricao: "Conscientização e prevenção do suicídio. CVV (Centro de Valorização da Vida) — 188. Apoio emocional no trabalho.",
    norma: "Lei 13.819/2019 — Política Nacional de Prevenção da Automutilação e do Suicídio" },
  { mes: 10, codigo: "OUTUBRO-ROSA", titulo: "Outubro Rosa — Câncer de Mama", cor: "rosa",
    descricao: "Prevenção do câncer de mama. Importância do autoexame e mamografia anual após os 40 anos.",
    norma: "Lei 11.664/2008 — SUS para diagnóstico/tratamento de câncer de mama e colo do útero" },
  { mes: 11, codigo: "NOVEMBRO-AZUL", titulo: "Novembro Azul — Câncer de Próstata", cor: "azul",
    descricao: "Prevenção do câncer de próstata. Exames preventivos a partir dos 50 anos (45 com histórico familiar).",
    norma: "Lei 13.045/2014 — Política Nacional para Prevenção e Controle do Câncer" },
  { mes: 12, codigo: "DEZEMBRO-VERMELHO", titulo: "Dezembro Vermelho — Combate ao HIV/AIDS", cor: "vermelho",
    descricao: "Prevenção, testagem e tratamento de HIV/AIDS e outras IST. 01/12 — Dia Mundial de Luta contra a AIDS.",
    norma: "Lei 13.504/2017 + Lei 12.984/2014 (criminalização da discriminação)" },
];

// Rev. 1729 — Calendário oficial PNI/MS 2026 (Programa Nacional de Imunizações).
// Fontes: gov.br/saude/pt-br/assuntos/saude-de-a-a-z/c/calendario-nacional-de-vacinacao
//          + portarias do Ministério da Saúde para Influenza/Multivacinação 2026.
// Atende Lei 15.377/2026 (CLT art. 169-A): empregador deve divulgar campanhas
// oficiais de vacinação aos trabalhadores. Categoria='VACINACAO', mesCampanha
// = mês de PICO da campanha (descrição traz janela completa quando multi-mês).
const VACINACAO_PNI: Array<{
  mes: number; codigo: string; titulo: string; cor: string;
  descricao: string; norma: string;
}> = [
  { mes: 3, codigo: "VAC-COVID-19-REFORCO", titulo: "💉 Reforço COVID-19 — Dose Anual", cor: "azul",
    descricao: "Dose de reforço anual contra COVID-19 (vacina bivalente/atualizada). Recomendada a TODOS os trabalhadores conforme protocolo MS — especialmente >60 anos, gestantes, imunossuprimidos e trabalhadores de obra com aglomeração. Janela: rotina anual a partir de março.",
    norma: "PNI/MS — Nota Técnica COVID-19 + Lei 15.377/2026 (CLT art. 169-A)" },
  { mes: 3, codigo: "VAC-HPV-9-14", titulo: "💉 Vacinação HPV — Filhos(as) 9-14 anos", cor: "lilas",
    descricao: "Vacina HPV gratuita no SUS para meninas e meninos de 9 a 14 anos. Esquema: 2 doses (0 e 6 meses). Previne câncer de colo do útero, vulva, ânus, pênis e orofaringe. Comunicar aos colaboradores que tenham filhos nessa faixa.",
    norma: "PNI/MS — Calendário Nacional + Lei 15.377/2026 (CLT art. 169-A — orientação obrigatória sobre HPV)" },
  { mes: 4, codigo: "VAC-INFLUENZA-2026", titulo: "💉 Campanha Nacional Influenza (Gripe) 2026", cor: "amarelo",
    descricao: "Campanha Nacional de Vacinação contra a Influenza 2026 — janela tradicional ABRIL a JUNHO. Grupos prioritários: >60 anos, gestantes, puérperas, crianças 6m-6a, profissionais de saúde, comorbidades, trabalhadores da construção civil expostos. Vacina trivalente disponível em UBS.",
    norma: "Portaria MS — Campanha Nacional Influenza 2026 + Lei 15.377/2026" },
  { mes: 4, codigo: "VAC-TRABALHADOR-NR7", titulo: "💉 Vacinação do Trabalhador (NR-7/PCMSO)", cor: "verde",
    descricao: "Vacinas obrigatórias por exposição ocupacional conforme PCMSO: Hepatite B (3 doses), Tétano/dT (reforço 10 anos), Febre Amarela (áreas endêmicas), Tríplice Viral. Empresa custeia se não disponível no SUS. Documentar no ASO.",
    norma: "NR-07 (PCMSO) item 7.5 + Anexo I + Lei 15.377/2026" },
  { mes: 6, codigo: "VAC-TETANO-DT", titulo: "💉 Tétano/dT — Reforço a cada 10 anos (obras)", cor: "vermelho",
    descricao: "Reforço da vacina dT (dupla adulto — difteria/tétano) a cada 10 anos. CRÍTICO para trabalhadores de construção civil pelo risco constante de ferimentos com pregos, ferragens, terra e materiais cortantes (porta de entrada do tétano).",
    norma: "PNI/MS — Calendário Adulto + NR-18 (Construção) + Lei 15.377/2026" },
  { mes: 7, codigo: "VAC-HEPATITE-B", titulo: "💉 Hepatite B — 3 doses (risco biológico)", cor: "amarelo",
    descricao: "Vacina Hepatite B (esquema 0-1-6 meses) gratuita no SUS para todas as idades. Trabalhadores expostos a sangue/fluidos corporais (acidentes em obra, primeiros socorros) devem completar esquema. Verificar comprovante de imunização anti-HBs.",
    norma: "PNI/MS — Calendário + NR-32 (analogia risco biológico) + Lei 15.377/2026" },
  { mes: 8, codigo: "VAC-MULTIVACINACAO-2026", titulo: "💉 Campanha Multivacinação Crianças/Adolescentes 2026", cor: "laranja",
    descricao: "Campanha Nacional de Multivacinação — janela tradicional AGOSTO a SETEMBRO. Atualização da caderneta de vacinação de crianças <15 anos. Comunicar aos colaboradores que levem filhos à UBS para colocar em dia: BCG, Pólio, Tríplice Viral, HPV, Meningo, etc.",
    norma: "Portaria MS — Multivacinação 2026 + Lei 15.377/2026" },
  { mes: 4, codigo: "VAC-FEBRE-AMARELA", titulo: "💉 Febre Amarela — Áreas de risco e viajantes", cor: "amarelo",
    descricao: "Vacina dose única (após 9 meses de idade). OBRIGATÓRIA para trabalhadores em obras de áreas com recomendação de vacinação (ACRV) e para qualquer pessoa que viaje para essas regiões. Validade: vitalícia (1 dose). Verificar antes de mobilizar equipe para nova obra.",
    norma: "PNI/MS — Mapa ACRV atualizado + RSI/OMS + Lei 15.377/2026" },
];

// NRs mais aplicadas em construção civil (sugestões pro DDS).
const NRS_CONSTRUCAO: Array<{ codigo: string; titulo: string; descricao: string; norma: string; }> = [
  { codigo: "NR-01", titulo: "NR-01 — Disposições Gerais e GRO/PGR", descricao: "Direitos e deveres em SST. Apresentação do PGR. Direito de recusa ao trabalho em risco grave e iminente.", norma: "NR-01 (Portaria MTP 6.730/2020)" },
  { codigo: "NR-06", titulo: "NR-06 — Equipamentos de Proteção Individual (EPI)", descricao: "Tipos de EPI, obrigatoriedade de uso, conservação e CA. Penalidades pelo não uso.", norma: "NR-06 (Portaria SSST 25/2001)" },
  { codigo: "NR-10", titulo: "NR-10 — Segurança em Instalações Elétricas", descricao: "Riscos elétricos, choque, arco voltaico. Bloqueio e etiquetagem (LOTO). Distâncias seguras.", norma: "NR-10 (Portaria MTE 598/2004)" },
  { codigo: "NR-11", titulo: "NR-11 — Movimentação de Materiais", descricao: "Operação segura de empilhadeiras, guindastes, içamento de cargas. Sinalização.", norma: "NR-11 (Portaria 3.214/78)" },
  { codigo: "NR-12", titulo: "NR-12 — Máquinas e Equipamentos", descricao: "Proteções fixas e móveis, dispositivos de segurança, capacitação para operação.", norma: "NR-12 (Portaria MTE 1.893/2013)" },
  { codigo: "NR-17", titulo: "NR-17 — Ergonomia", descricao: "Postura, levantamento de carga, mobiliário, pausas. Prevenção de LER/DORT.", norma: "NR-17 (Portaria 3.751/90)" },
  { codigo: "NR-18", titulo: "NR-18 — Construção Civil", descricao: "Áreas de vivência, escadas, andaimes, plataformas, escavações, demolição.", norma: "NR-18 (Portaria MTP 3.733/2020)" },
  { codigo: "NR-20", titulo: "NR-20 — Inflamáveis e Combustíveis", descricao: "Armazenamento, manuseio e transporte de líquidos e gases inflamáveis. Plano de emergência.", norma: "NR-20 (Portaria MTE 308/2012)" },
  { codigo: "NR-23", titulo: "NR-23 — Proteção Contra Incêndios", descricao: "Saídas de emergência, sinalização, extintores, brigada de incêndio.", norma: "NR-23 (Portaria SIT 221/2011)" },
  { codigo: "NR-24", titulo: "NR-24 — Condições Sanitárias e de Conforto", descricao: "Instalações sanitárias, vestiários, refeitório, água potável.", norma: "NR-24 (Portaria SEPRT 1.066/2019)" },
  { codigo: "NR-26", titulo: "NR-26 — Sinalização de Segurança", descricao: "Cores e símbolos de segurança. Rotulagem de produtos químicos (GHS).", norma: "NR-26 (Portaria MTE 229/2011)" },
  { codigo: "NR-33", titulo: "NR-33 — Espaços Confinados", descricao: "Identificação, permissão de entrada e trabalho (PET), monitoramento atmosférico, resgate.", norma: "NR-33 (Portaria MTE 202/2006)" },
  { codigo: "NR-35", titulo: "NR-35 — Trabalho em Altura", descricao: "Acima de 2m. Análise de risco, sistema de ancoragem, EPI, capacitação 8h + reciclagem 2 anos.", norma: "NR-35 (Portaria MTE 313/2012)" },
];

// Rev. 1740 — Roteiros DETALHADOS de cada tema padrão (NR / CAMPANHA / VACINACAO).
// Indexado por `codigo`. Markdown estruturado: Objetivo, Por que importa, Pontos-chave,
// Aplicação prática na obra, Perguntas pra equipe, Reforço final. Usado pelos seeds
// (`seedTemasPadrao` / `seedVacinacaoPNI`) e pela mutation `enriquecerTemasPadrao`
// (backfill em temas já cadastrados sem `conteudoMd`).
const ROTEIROS_DETALHADOS: Record<string, string> = {
  // ───────────────────── NRs ─────────────────────
  "NR-01": `## Objetivo
Apresentar à equipe o GRO/PGR da obra, os direitos e deveres em SST e o direito de recusa ao trabalho em risco grave e iminente.

## Por que importa
- A NR-01 é a "porta de entrada" de toda a legislação de SST — define como o empregador deve gerenciar riscos.
- Garante ao trabalhador o direito de **interromper a tarefa** quando enxergar risco grave e iminente, sem prejuízo ao salário.

## Pontos-chave a abordar
1. O que é o **PGR** (Programa de Gerenciamento de Riscos) e onde consultar o inventário e o plano de ação.
2. **Direitos**: receber EPI gratuito, treinamento, exames médicos (PCMSO) e informação sobre os riscos do posto.
3. **Deveres**: usar EPI corretamente, comunicar condições inseguras, seguir procedimentos.
4. Como **comunicar um risco** (líder imediato, técnico de segurança, CIPA).
5. Direito de recusa: art. 13 da NR-01 — pode parar a tarefa sem retaliação.

## Aplicação prática na obra
- Mostrar o quadro de riscos do PGR exposto na obra.
- Apontar 2 ou 3 riscos típicos da frente de serviço de hoje (queda, choque, soterramento, projeção, ruído).

## Perguntas pra equipe
- "Quem aqui sabe onde está afixado o PGR?"
- "Se você visse um andaime sem guarda-corpo agora, o que faria?"

## Reforço final
**Segurança não é opcional. Comunicar risco salva vida — a sua e a do colega ao lado.**`,

  "NR-06": `## Objetivo
Reforçar o uso correto, a conservação e a obrigatoriedade dos EPIs fornecidos pela empresa.

## Por que importa
- O EPI é a **última barreira** entre o trabalhador e o risco — quando falha, o acidente é direto no corpo.
- A empresa é obrigada a fornecer GRATUITAMENTE; o trabalhador é obrigado a USAR — descumprimento gera advertência, suspensão e até justa causa (Súmula TST).

## Pontos-chave a abordar
1. EPI tem que ter **CA (Certificado de Aprovação)** válido — verificar a data.
2. Cada EPI tem uma função: capacete (impacto), óculos (projeção/UV), luva (corte/química/térmica), bota (perfuração/escorregão), cinto (queda).
3. Conservação: limpar, guardar em local seco, **substituir quando danificado**.
4. EPI vencido, rasgado ou inadequado → comunicar líder/almoxarife na hora.
5. Higiene do EPI compartilhado (capacete, protetor auricular tipo concha) — limpeza periódica.

## Aplicação prática na obra
- Inspeção rápida ao vivo: cada um confere seu próprio capacete (trincas, jugular), bota (sola), luva (furos).

## Perguntas pra equipe
- "Quem está sem algum EPI agora? Por quê?"
- "Quando foi a última troca do seu protetor auricular?"

## Reforço final
**EPI no corpo, não no bolso. Sem CA válido = sem proteção legal nem real.**`,

  "NR-10": `## Objetivo
Conscientizar sobre os riscos elétricos na obra (choque, arco voltaico, queimaduras) e os procedimentos de segurança obrigatórios.

## Por que importa
- Choque elétrico mata em milissegundos — não dá tempo de "corrigir depois".
- Construção civil concentra muitos cabos provisórios, ligações expostas e umidade — combinação perigosa.

## Pontos-chave a abordar
1. **Só pessoa autorizada e treinada (NR-10 básico 40h)** mexe em painel/quadro elétrico.
2. **Bloqueio e Etiquetagem (LOTO)**: antes de manutenção, desligar, travar e sinalizar — nunca confiar só no aviso verbal.
3. **Distâncias seguras** de redes energizadas (especialmente alta tensão) — andaime, betoneira, escada de alumínio, içamento.
4. Cabos no chão: atenção a água, tráfego de caminhão, esmagamento — usar passa-cabos.
5. Em caso de choque: NÃO tocar a vítima sem desligar a chave geral. Acionar SAMU 192.

## Aplicação prática na obra
- Mostrar onde está o quadro geral e quem tem permissão de operar.
- Apontar uma extensão/cabo da frente de serviço e checar isolamento.

## Perguntas pra equipe
- "Quem aqui é autorizado pra mexer no quadro? E os outros?"
- "O que fazer se um colega levar um choque?"

## Reforço final
**Eletricidade não dá segunda chance. Em dúvida, desligue. Nunca improvise gambiarra.**`,

  "NR-11": `## Objetivo
Operar com segurança equipamentos de movimentação de materiais (empilhadeira, guindaste, grua, manipulador) e içamento de cargas.

## Por que importa
- Tombamento, queda de carga e atropelamento por equipamento são causas frequentes de acidentes graves/fatais em obra.

## Pontos-chave a abordar
1. **Só operador habilitado e treinado** opera (carteira específica + treinamento NR-11).
2. **Inspeção pré-uso**: pneus, freios, buzina, sinal sonoro de ré, hidráulico, lança/garfos.
3. **Capacidade de carga**: NUNCA exceder o limite da placa. Considerar centro de gravidade.
4. **Içamento**: laços/cintas/manilhas certificados, ângulo correto, ninguém embaixo da carga, sinaleiro único.
5. **Trânsito interno**: velocidade reduzida, buzinar em curvas/cruzamentos, cones/sinalização separando pedestres.

## Aplicação prática na obra
- Demarcar visualmente a área de manobra do equipamento em uso hoje.
- Reforçar o "ninguém abaixo da carga içada" — distância mínima.

## Perguntas pra equipe
- "Qual a capacidade da grua/empilhadeira que está aqui?"
- "Quem é o sinaleiro do içamento de hoje?"

## Reforço final
**Carga suspensa é bomba. Olho na rota, longe da projeção, comunicação clara.**`,

  "NR-12": `## Objetivo
Operar máquinas e equipamentos com proteções íntegras, dispositivos de segurança ativos e capacitação adequada.

## Por que importa
- Esmerilhadeira, serra circular, betoneira, makita: causas frequentes de amputação, corte profundo e projeção de partícula.

## Pontos-chave a abordar
1. **NÃO remover proteção** (capa do disco, coifa, guarda-mão, botão de emergência) — equipamento sem proteção é equipamento desligado.
2. Inspeção pré-uso: cabos elétricos, fixação do disco, botão liga/desliga responsivo.
3. Disco/lâmina compatível com o material e em bom estado (não trincado, não vencido).
4. EPI obrigatório: óculos, protetor facial, luva específica, protetor auricular, bota.
5. Manutenção: só com máquina desligada e desconectada da energia (LOTO).

## Aplicação prática na obra
- Demonstrar inspeção rápida no equipamento que será usado hoje.

## Perguntas pra equipe
- "Quem aqui já viu uma esmerilhadeira sem capa? O que aconteceu?"
- "Qual o EPI mínimo pra usar a serra circular?"

## Reforço final
**Máquina sem proteção é máquina parada. Dedo cortado não cresce de volta.**`,

  "NR-17": `## Objetivo
Prevenir LER/DORT, dor lombar e fadiga através de postura correta, levantamento adequado de cargas e organização do trabalho.

## Por que importa
- Doenças osteomusculares são a 2ª maior causa de afastamento previdenciário no Brasil.
- Lesão acumulada pode aposentar precocemente um trabalhador jovem.

## Pontos-chave a abordar
1. **Levantamento de carga**: agachar (não curvar a coluna), carga próxima ao corpo, pés afastados, pegada firme.
2. **Limite individual de levantamento eventual**: 23 kg (NR-17 anexo). Acima disso, em DUPLA ou com mecanização.
3. **Pausas**: 10 min a cada 50 min em atividade repetitiva intensa.
4. **Postura**: variar posições, evitar permanecer agachado/curvado por longos períodos.
5. Mobiliário de escritório/almoxarifado: cadeira regulável, monitor na altura dos olhos, mouse ao lado do teclado.

## Aplicação prática na obra
- Demonstração rápida da postura correta pra carregar saco de cimento (50 kg = 2 pessoas) ou içar com auxílio mecânico.

## Perguntas pra equipe
- "Quem teve dor nas costas semana passada?"
- "Como vocês carregam o saco de cimento aqui?"

## Reforço final
**Coluna é uma só. Agacha, ergue com a perna, divide o peso. Pausa não é frouxidão.**`,

  "NR-18": `## Objetivo
Reforçar os principais controles da NR-18 aplicáveis à frente de serviço atual: andaimes, escadas, guarda-corpo, escavações e áreas de vivência.

## Por que importa
- A NR-18 é a norma específica da construção civil — concentra os riscos que mais matam (queda em altura, soterramento, projeção, esmagamento).

## Pontos-chave a abordar
1. **Andaimes**: travados, com guarda-corpo + rodapé, plataforma de trabalho íntegra (sem tábua quebrada), acesso por escada (não escalando).
2. **Escadas**: marinheira com gaiola acima de 2 m, escada de mão amarrada, ângulo 75° (1 pra fora a cada 4 de altura).
3. **Aberturas no piso**: cobertas com tampa fixada e sinalizada (NUNCA com material solto).
4. **Escavação**: talude, escoramento ou recuo a partir de 1,25 m de profundidade. NUNCA descer em vala sem proteção.
5. **Áreas de vivência**: refeitório, vestiário, sanitário, água potável — direito do trabalhador.

## Aplicação prática na obra
- Inspeção visual da frente de serviço: apontar 1 conformidade e 1 não-conformidade pra corrigir hoje.

## Perguntas pra equipe
- "Tem alguma abertura no piso da nossa frente?"
- "Como vocês acessam o pavimento hoje — escada de mão? Andaime?"

## Reforço final
**A obra é viva — o que estava seguro ontem pode estar perigoso hoje. Olho aberto, comunique.**`,

  "NR-20": `## Objetivo
Operar com segurança líquidos e gases inflamáveis (combustível de equipamento, solventes, GLP, oxiacetileno) usados na obra.

## Por que importa
- Vapor inflamável + faísca = explosão. Em obra urbana, pode atingir vizinhos e via pública.

## Pontos-chave a abordar
1. **Armazenamento**: local ventilado, longe de fonte de ignição, bacia de contenção, sinalização (losango GHS).
2. **Manuseio**: NUNCA reabastecer equipamento quente ou ligado. Funil pra evitar derrame.
3. **GLP / oxiacetileno**: cilindro em pé, corrente de fixação, válvula tampada quando vazio, longe de calor.
4. **Trabalho a quente** (solda, maçarico) próximo a inflamável: PT (Permissão de Trabalho) + extintor + vigia.
5. Em caso de derrame: isolar, ventilar, comunicar SST. NUNCA jogar água em derrame de inflamável.

## Aplicação prática na obra
- Mostrar o local de armazenamento de combustível/solventes da obra. Conferir extintor PROCURÁVEL e na validade.

## Perguntas pra equipe
- "Onde fica o extintor mais próximo da nossa frente de serviço?"
- "Quem aqui já abasteceu equipamento ainda quente?"

## Reforço final
**Inflamável não avisa. Faísca curta = chama longa. Trabalho a quente exige PT.**`,

  "NR-23": `## Objetivo
Conhecer os recursos de combate a incêndio da obra (extintores, hidrantes, brigada) e o plano de evacuação.

## Por que importa
- Em obra, materiais combustíveis (madeira, plástico, solvente, papelão) e fontes de ignição (solda, elétrica) coexistem.
- Dominar o extintor nos primeiros 30 segundos faz toda diferença entre princípio de incêndio e perda total.

## Pontos-chave a abordar
1. **Tipos de extintor e classe de fogo**:
   - Pó ABC: serve pra quase tudo (sólido, líquido, elétrico).
   - CO₂: elétrico e líquido.
   - Água: SÓ sólido (Classe A). NUNCA em elétrico ou líquido inflamável.
2. **Como usar (PASS)**: Puxar pino, Apontar pra base, Apertar gatilho, Sobreposição (varrer).
3. **Saídas de emergência**: livres, sinalizadas, ponto de encontro definido.
4. **Brigadistas da obra**: quem são (apresentar nomes), como acionar.
5. Acionamento dos Bombeiros: **193**.

## Aplicação prática na obra
- Localizar o extintor mais próximo da frente de serviço — verificar lacre, manômetro na faixa verde, validade.

## Perguntas pra equipe
- "Onde fica o ponto de encontro em caso de evacuação?"
- "Quem são os brigadistas da obra?"

## Reforço final
**Extintor sem treino = peso morto. Conheça o seu, o caminho da saída e o ponto de encontro.**`,

  "NR-24": `## Objetivo
Garantir condições mínimas de higiene, conforto e dignidade nas áreas de vivência da obra (sanitários, vestiário, refeitório, água).

## Por que importa
- Não é "regalia" — é direito legal. Reflete diretamente em produtividade, saúde e clima de trabalho.

## Pontos-chave a abordar
1. **Sanitários**: 1 conjunto pra cada 20 trabalhadores, com água, papel, sabonete líquido, lixo. Limpeza diária.
2. **Vestiário**: armário individual com cadeado, banco, ventilação, separado do refeitório.
3. **Refeitório**: mesa, assento com encosto, água potável, lavatório, geladeira/forno se houver marmita.
4. **Água potável**: à vontade, em bebedouro com copo individual ou descartável. Próxima da frente de serviço.
5. **Limpeza e organização**: responsabilidade COMPARTILHADA — empresa fornece estrutura, equipe mantém.

## Aplicação prática na obra
- Convidar a equipe a apontar uma melhoria nas áreas de vivência. Anotar e levar pro líder/SESMT.

## Perguntas pra equipe
- "Tem água potável fácil aqui na frente de serviço?"
- "O sanitário está limpo hoje? Tem papel e sabonete?"

## Reforço final
**Vivência digna é direito. Comunique falta de água, sabão ou limpeza imediatamente.**`,

  "NR-26": `## Objetivo
Reconhecer os símbolos, cores e rotulagem (GHS) usados na sinalização de segurança da obra.

## Por que importa
- Sinalização padronizada salva vida quando não dá tempo de ler — o cérebro reconhece a cor/forma em milissegundos.

## Pontos-chave a abordar
1. **Cores de segurança**:
   - Vermelho: proibição, equipamento de combate a incêndio.
   - Amarelo: atenção, cuidado.
   - Verde: segurança, primeiros socorros, saída.
   - Azul: obrigação (use EPI X).
2. **Rotulagem GHS** (produto químico): 9 pictogramas (caveira = tóxico, chama = inflamável, ! = irritante, etc.) + frases de risco e segurança (FISPQ).
3. **Sinalização de obra**: placa de uso obrigatório de EPI na entrada, demarcação de área de risco, fitas de isolamento (zebrada).
4. **Demarcação de piso**: linhas amarelas (circulação), vermelhas (perigo), verdes (segurança).

## Aplicação prática na obra
- Caminhar pela frente de serviço identificando 3 sinalizações e o que cada uma significa.

## Perguntas pra equipe
- "O que a fita zebrada amarela e preta significa?"
- "O que diz a placa na entrada da obra?"

## Reforço final
**Cor + símbolo = mensagem instantânea. Respeite a sinalização — ela está ali por motivo.**`,

  "NR-33": `## Objetivo
Identificar espaços confinados na obra (caixa d'água, fossa, vala profunda, silo, galeria) e os controles obrigatórios pra entrada.

## Por que importa
- Espaço confinado mata por **asfixia silenciosa** — sem cheiro, sem aviso. Vítima desmaia em segundos.
- O **resgatador despreparado vira a 2ª vítima** em mais de 60% dos acidentes em confinado.

## Pontos-chave a abordar
1. **Definição**: ambiente com acesso restrito, ventilação deficiente e potencial de risco (atmosfera, líquido, sólido).
2. **PET (Permissão de Entrada e Trabalho)** OBRIGATÓRIA — emitida por supervisor habilitado.
3. **Monitoramento atmosférico ANTES e DURANTE**: O₂ (19,5–23%), gases inflamáveis (<10% LIE), tóxicos (CO, H₂S).
4. **Vigia externo permanente** + comunicação contínua + plano de resgate definido.
5. **NUNCA entrar pra resgatar** sem EPI + treinamento — chamar Bombeiros (193).

## Aplicação prática na obra
- Listar quais espaços confinados existem na obra atual e quem está autorizado/treinado.

## Perguntas pra equipe
- "Se um colega desmaiasse dentro da caixa d'água, o que você faria?"
- "Quem tem treinamento NR-33 aqui?"

## Reforço final
**Confinado sem PET = entrada proibida. Sem detector + vigia, ninguém entra. Resgate é dos Bombeiros.**`,

  "NR-35": `## Objetivo
Trabalhar acima de 2 m com segurança: análise de risco, sistema de ancoragem, EPI específico e capacitação.

## Por que importa
- Queda em altura é a **1ª causa de morte** na construção civil brasileira (Anuário SmartLab).
- Acima de 2 m, qualquer escorregão = lesão grave ou óbito.

## Pontos-chave a abordar
1. **Análise de Risco (AR)** específica para a tarefa em altura — antes de iniciar.
2. **Sistema de ancoragem**: ponto de fixação certificado (linha de vida, cabo de aço, viga estrutural). Resistência mínima: 22 kN.
3. **EPI**: cinturão paraquedista (NÃO talabarte abdominal), talabarte duplo Y com absorvedor de energia, capacete com jugular.
4. **Inspeção pré-uso** do EPI: cinta sem desfiamento, mosquetão sem trinca, costura íntegra, validade do CA.
5. **Capacitação 8 h + reciclagem a cada 2 anos** ou em mudança de procedimento.
6. **Plano de resgate** definido — vítima suspensa não pode ficar mais de 15 min (síndrome do arnês).

## Aplicação prática na obra
- Inspecionar ao vivo o cinturão do colega (se houver tarefa em altura hoje).
- Apontar onde está a linha de vida da frente de serviço.

## Perguntas pra equipe
- "Quem aqui tem NR-35 em dia?"
- "Onde você ancoraria seu talabarte se subisse no andaime agora?"

## Reforço final
**Acima de 2 m, ancoragem ou nada. Cinturão paraquedista, talabarte duplo, ponto certificado. Cair = morrer.**`,

  // ───────────────────── CAMPANHAS GOVERNAMENTAIS ─────────────────────
  "JANEIRO-BRANCO": `## Objetivo
Iniciar o ano falando de saúde mental — combater o estigma, identificar sinais de adoecimento emocional e apresentar canais de apoio.

## Por que importa
- 1 em cada 5 brasileiros enfrenta algum transtorno mental ao longo da vida (OMS).
- Saúde mental afeta diretamente segurança no trabalho: distração, fadiga, decisão errada → acidente.

## Pontos-chave a abordar
1. **Sinais de alerta** (em si ou no colega): tristeza persistente, irritabilidade, isolamento, queda no rendimento, sono ruim, uso de álcool/drogas.
2. **Diferença entre estresse passageiro e adoecimento** — quando procurar ajuda.
3. **Canais gratuitos**: CVV 188 (24 h), CAPS, UBS, app Conte com a Gente.
4. **Acolhimento entre colegas**: ouvir sem julgar, não diminuir o sofrimento ("frescura"), encorajar buscar ajuda.
5. Empresa: programa de apoio (se houver), licença médica psiquiátrica vale como qualquer outra.

## Aplicação prática
- Conversar abertamente: "Como vocês estão começando esse ano?"

## Reforço final
**Pedir ajuda é coragem, não fraqueza. CVV: 188. Você importa.**`,

  "FEVEREIRO-LARANJA": `## Objetivo
Conscientizar sobre leucemia, o papel da doação de medula óssea e o diagnóstico precoce.

## Por que importa
- Leucemia é o câncer do sangue. Em muitos casos, o transplante de medula é a única chance de cura.
- 1 em cada 100 mil pessoas é compatível — quanto mais doadores cadastrados, maior a chance dos pacientes.

## Pontos-chave a abordar
1. **Sintomas suspeitos**: fadiga sem motivo, hematomas/manchas roxas, sangramentos, infecções repetidas, palidez. Procurar médico.
2. **Como se cadastrar como doador (REDOME)**: hemocentro mais próximo. Idade 18–35 anos, em boa saúde. Coleta = simples exame de sangue.
3. **Quando chamado pra doar**: procedimento ambulatorial (aférese), sem retirada cirúrgica em 80% dos casos.
4. **Mitos**: "doar enfraquece" → falso. A medula se regenera em poucas semanas.

## Aplicação prática
- Apresentar endereço do hemocentro mais próximo (contato/horário).

## Reforço final
**Cadastrar é simples. Doar é salvar uma vida. REDOME espera por você.**`,

  "MARCO-LILAS": `## Objetivo
Falar sobre prevenção do câncer de colo do útero — papanicolau, vacina HPV e detecção precoce.

## Por que importa
- 3º câncer mais comum em mulheres no Brasil.
- 100% relacionado ao HPV — vacinável e detectável precocemente.

## Pontos-chave a abordar
1. **Papanicolau**: exame simples, gratuito no SUS, indicado a partir dos 25 anos (ou início da vida sexual). Periodicidade conforme orientação médica.
2. **Vacina HPV**: gratuita no SUS pra meninas e meninos de 9 a 14 anos (2 doses). Previne câncer de colo, vulva, ânus, pênis e orofaringe.
3. **Sinais de alerta**: sangramento fora do ciclo, corrimento persistente, dor pélvica → procurar ginecologista.
4. **Orientar familiares**: filhas, esposas, irmãs — campanha alcança a família toda.

## Aplicação prática
- Distribuir folder/info da UBS mais próxima (vacinação HPV + papanicolau).

## Reforço final
**Câncer de colo se previne. Vacina HPV até 14 anos + papanicolau anual = vida toda protegida.**`,

  "ABRIL-VERDE": `## Objetivo
Mês mundial da SST. Reforçar a cultura de segurança, lembrar as vítimas de acidentes de trabalho (28/04) e renovar o compromisso da equipe.

## Por que importa
- A construção civil é o setor com MAIOR número absoluto de acidentes graves no Brasil.
- Cada acidente tem nome, família, projeto interrompido — não é número.

## Pontos-chave a abordar
1. **28 de abril — Dia Mundial em Memória às Vítimas de Acidentes de Trabalho** (Lei 11.121/2005). Minuto de silêncio.
2. **Cultura de segurança não é punir, é prevenir**: comunicar quase-acidente é mais valioso que esconder.
3. **Hierarquia dos controles**: 1) eliminar risco, 2) substituir, 3) engenharia, 4) administrativo, 5) EPI. EPI é última barreira, não a primeira.
4. **Compromisso pessoal**: cada um se compromete com 1 atitude segura nova ao longo do mês.
5. Apresentar **número de acidentes da empresa no último ano** + plano de melhoria.

## Aplicação prática
- Cada colaborador escreve em um papel: "este mês eu vou..." (uma ação de segurança).

## Reforço final
**Abril é verde porque a vida é o que mais importa. Volta pra casa todo dia.**`,

  "MAIO-AMARELO": `## Objetivo
Conscientizar sobre segurança no trânsito — direção defensiva, uso de cinto, álcool zero, atenção ao celular.

## Por que importa
- Brasil registra ~30 mil mortes/ano no trânsito (Datasus). Trabalhador da construção é grupo de risco: motos, caminhões, ônibus de obra, deslocamento longo, fadiga.
- Acidente de trajeto **é acidente de trabalho** (Lei 8.213/91).

## Pontos-chave a abordar
1. **Cinto de segurança**: obrigatório em todos os bancos, inclusive traseiro. Reduz em 75% o risco de morte.
2. **Álcool zero ao volante**: tolerância zero (Lei Seca). Multa R$ 2.934 + suspensão CNH + crime se causar lesão.
3. **Celular ao dirigir**: 4× mais chance de acidente. Mensagem espera.
4. **Direção defensiva**: distância de 2 segundos, antever a manobra do outro, sinalizar antes.
5. **Motociclista**: capacete sempre afivelado, jaqueta, luva, bota. Faroleira ligada.
6. **Caminhoneiro/operador de equipamento**: respeitar jornada, intervalo, pausa pra descanso.

## Aplicação prática
- Quem vai pra casa de moto hoje? Conferir capacete, luz, retrovisores.

## Reforço final
**Trânsito não perdoa. Cinto sempre, álcool zero, celular guardado. Sua família espera você.**`,

  "JUNHO-VERMELHO": `## Objetivo
Estimular a doação regular de sangue e apresentar o hemocentro mais próximo.

## Por que importa
- Apenas 1,8% dos brasileiros doa sangue (meta OMS: 3%).
- Estoques caem em junho/julho (frio, festas) — toda doação salva até 4 vidas.

## Pontos-chave a abordar
1. **Quem pode doar**: 16–69 anos, peso ≥ 50 kg, boa saúde, documento com foto.
2. **Frequência**: homens podem doar a cada 2 meses (até 4×/ano), mulheres a cada 3 meses (até 3×/ano).
3. **Antes de doar**: alimentar-se bem, evitar álcool 12 h antes, dormir bem.
4. **Mitos**: "engorda" → falso. "Vicia" → falso. "Fica fraco" → falso (volume reposto em 24 h).
5. **Hemocentro mais próximo**: apresentar endereço, telefone, horário.
6. **Bônus 14/06 — Dia Mundial do Doador**.

## Aplicação prática
- Quem já doou? Quem nunca doou e gostaria de saber mais?

## Reforço final
**1 doação = até 4 vidas. Vai ali, leva 30 min, salva alguém. Dia 14/06 é o dia do doador.**`,

  "JULHO-AMARELO": `## Objetivo
Conscientizar sobre as hepatites virais (A, B, C) — formas de contágio, prevenção, vacinação e teste rápido gratuito.

## Por que importa
- Hepatite C é silenciosa: pode levar 20 anos sem sintoma e evoluir pra cirrose/câncer de fígado.
- Tem cura em mais de 95% dos casos com tratamento precoce.

## Pontos-chave a abordar
1. **Hepatite A**: transmissão fecal-oral (água/comida contaminada). Prevenção: higiene, saneamento, vacina (rede pública crianças 15 m).
2. **Hepatite B**: sangue, sexo, mãe-bebê. Prevenção: VACINA gratuita SUS (3 doses) — TRABALHADOR DE OBRA com risco biológico DEVE estar imunizado. Camisinha.
3. **Hepatite C**: sangue (compartilhamento de agulha, tatuagem sem esterilização, transfusão antiga). Prevenção: não compartilhar lâmina/alicate. Teste rápido gratuito.
4. **Sintomas tardios**: cansaço, urina escura, olhos amarelados (icterícia), dor abdominal.
5. **Teste rápido gratuito** em qualquer UBS — resultado em 30 min.

## Aplicação prática
- "Quem tomou as 3 doses da hepatite B? Quem tem dúvida? Procurar UBS."

## Reforço final
**Hepatite mata em silêncio. Vacinou? Testou? UBS atende de graça.**`,

  "AGOSTO-LILAS": `## Objetivo
Combater a violência contra a mulher — reconhecer, romper o silêncio, apresentar canais de denúncia e apoio.

## Por que importa
- Brasil registra 1 feminicídio a cada 6 horas.
- Construção civil é majoritariamente masculina — homens informados são aliados essenciais na quebra do ciclo.

## Pontos-chave a abordar
1. **Lei Maria da Penha (Lei 11.340/2006)**: tipos de violência protegidos — física, psicológica, moral, sexual, patrimonial.
2. **Sinais que uma mulher sofre violência**: hematomas frequentes, mudança de comportamento, isolamento, faltas no trabalho, controle financeiro pelo parceiro.
3. **Canais de denúncia**:
   - **Disque 180** (Central de Atendimento à Mulher) — 24 h, anônimo, em qualquer lugar do Brasil.
   - **190** (PM em emergência).
   - **Delegacia da Mulher (DEAM)**.
4. **Medida protetiva**: pode ser pedida pela vítima ou por terceiro que saiba do caso.
5. **Você homem é parte da solução**: respeito em casa, apoio à colega, denúncia se souber de caso.

## Aplicação prática
- Distribuir números (180, 190, DEAM mais próxima) — pode salvar vida de mãe, irmã, esposa.

## Reforço final
**Quem ama não bate. Disque 180 — 24 h, anônimo, salva. Homem de verdade respeita.**`,

  "SETEMBRO-AMARELO": `## Objetivo
Falar abertamente sobre suicídio — quebrar o tabu, identificar sinais, apresentar o CVV (188).

## Por que importa
- Brasil registra ~14 mil mortes por suicídio/ano (Ministério da Saúde).
- Construção civil tem taxas elevadas — pressão financeira, distância da família, longas jornadas, alcoolismo.

## Pontos-chave a abordar
1. **Falar SALVA vida** (mito derrubado): perguntar diretamente "você tem pensado em se machucar?" não induz, ABRE espaço pra ajuda.
2. **Sinais de alerta**: tristeza persistente, isolamento, doação de objetos pessoais, frases como "não aguento mais", "vão ficar melhor sem mim", uso elevado de álcool/drogas.
3. **CVV — Centro de Valorização da Vida**:
   - **Telefone 188** (24 h, ligação gratuita).
   - Chat e e-mail em www.cvv.org.br.
4. **CAPS** (Centro de Atenção Psicossocial) e UBS atendem gratuitamente.
5. **Acolhimento**: ouvir sem julgar, não dar lição de moral, encorajar a procurar ajuda profissional.

## Aplicação prática
- Pausa em silêncio: "se você ou alguém que conhece está sofrendo, busque ajuda. CVV 188."

## Reforço final
**Falar é a melhor prevenção. Ouvir sem julgar salva vida. CVV: 188, 24 h, gratuito.**`,

  "OUTUBRO-ROSA": `## Objetivo
Conscientizar sobre prevenção e detecção precoce do câncer de mama — autoexame, mamografia, fatores de risco.

## Por que importa
- Câncer de mama é o mais comum em mulheres no Brasil (~74 mil casos/ano).
- Detectado cedo, tem mais de 95% de chance de cura.

## Pontos-chave a abordar
1. **Autoexame mensal** (1 semana após menstruação): observar e palpar mama em busca de nódulo, alteração de pele/mamilo, secreção.
2. **Mamografia anual** a partir dos 40 anos (ou antes se histórico familiar). Gratuita no SUS.
3. **Sinais de alerta**: nódulo endurecido, retração da pele/mamilo, secreção espontânea (especialmente sanguinolenta), inchaço axilar.
4. **Fatores de risco**: histórico familiar, idade > 50, sedentarismo, obesidade, álcool, terapia hormonal prolongada.
5. **Homens também têm câncer de mama** (1% dos casos) — fica atento.
6. **Orientar familiares**: esposa, mãe, filha, irmã.

## Aplicação prática
- Distribuir folder com técnica de autoexame. Apoiar colegas a marcar exame.

## Reforço final
**Toque em si. 1 dedo encostado pode ser 1 vida salva. Mamografia anual após 40.**`,

  "NOVEMBRO-AZUL": `## Objetivo
Conscientizar os homens sobre saúde — câncer de próstata, mas também check-up geral, pressão, colesterol, saúde mental.

## Por que importa
- Câncer de próstata é o 2º mais comum em homens brasileiros (~72 mil casos/ano).
- Homens vão menos ao médico que mulheres — diagnóstico tardio mata.

## Pontos-chave a abordar
1. **Câncer de próstata**: silencioso no início. Detectado cedo, 90%+ de cura.
2. **Exames preventivos a partir dos 50** (45 com histórico familiar ou raça negra):
   - **PSA** (sangue).
   - **Toque retal** (15 segundos, salva vida — preconceito mata).
3. **Sinais tardios**: dificuldade pra urinar, jato fraco, sangue na urina/sêmen, dor lombar.
4. **Check-up anual completo**: pressão, glicemia, colesterol, peso, saúde mental.
5. **Saúde mental masculina**: 4× mais suicídios em homens. Procurar ajuda é coragem (ver Setembro Amarelo).

## Aplicação prática
- "A partir dos 50? Marque seu exame. Já fez este ano?"

## Reforço final
**Toque retal salva. 15 segundos contra anos de tratamento. Vá ao médico.**`,

  "DEZEMBRO-VERMELHO": `## Objetivo
Combate ao HIV/AIDS e outras infecções sexualmente transmissíveis (IST) — prevenção, teste rápido gratuito, fim do estigma.

## Por que importa
- Brasil registra ~40 mil novos casos de HIV/ano. Diagnóstico tardio aumenta mortalidade.
- Tratamento (TARV) gratuito no SUS torna a carga viral indetectável → não transmite (I=I).

## Pontos-chave a abordar
1. **Como se transmite**: sexo sem camisinha, compartilhamento de agulha, mãe pra bebê (sem tratamento).
2. **NÃO se transmite**: abraço, beijo, banheiro, copo, picada de mosquito, suor.
3. **Prevenção combinada**:
   - Camisinha (preservativo) — gratuito em UBS.
   - **PrEP** (profilaxia pré-exposição) pra grupos de risco.
   - **PEP** (profilaxia pós-exposição) — até 72 h após exposição (acidente, violência sexual).
4. **Teste rápido gratuito** em UBS — resultado em 30 min, sigiloso.
5. **Tratamento gratuito (TARV)**: pessoa com HIV vive com qualidade. Carga indetectável = intransmissível (I=I).
6. **Discriminar é crime** (Lei 12.984/2014).

## Aplicação prática
- "Camisinha grátis na UBS. Teste rápido em 30 min. Discrição total."

## Reforço final
**HIV não escolhe. Previne com camisinha. Teste salva. Tratamento dá vida normal.**`,

  // ───────────────────── VACINAÇÃO PNI ─────────────────────
  "VAC-COVID-19-REFORCO": `## Objetivo
Reforçar a importância da dose anual de COVID-19 e a obrigação da empresa de orientar (Lei 15.377/2026 — CLT art. 169-A).

## Por que importa
- COVID-19 ainda circula. Reforço anual mantém imunidade contra variantes novas.
- Trabalhador de obra: aglomeração no transporte, vestiário, refeitório → exposição contínua.

## Pontos-chave
1. **Dose de reforço anual** (vacina atualizada/bivalente) gratuita no SUS.
2. **Prioridade**: > 60 anos, gestantes, imunossuprimidos, trabalhadores de obra com aglomeração.
3. **Documentar no ASO** o status vacinal (orientação NR-7).
4. Sintomas (febre, tosse, falta de ar) → ficar em casa, testar, comunicar SST.

## Reforço final
**Vacina anual em dia. UBS mais próxima atende sem fila pra reforço.**`,

  "VAC-HPV-9-14": `## Objetivo
Orientar sobre a vacina HPV gratuita pra filhos(as) de 9 a 14 anos (Lei 15.377/2026).

## Por que importa
- HPV causa câncer de colo do útero, vulva, ânus, pênis e orofaringe.
- Vacinação na pré-adolescência tem MAIOR eficácia (antes do início da vida sexual).

## Pontos-chave
1. **Quem**: meninas E meninos de 9 a 14 anos. SUS gratuito.
2. **Esquema**: 2 doses (intervalo de 6 meses).
3. **Onde**: qualquer UBS, com cartão de vacina e documento do menor.
4. **Mitos**: "incentiva sexualidade precoce" → falso. "Causa autismo" → falso. ANVISA, OMS e SBP recomendam.

## Reforço final
**Filhos de 9–14 anos? Leve à UBS. 2 doses simples = proteção pra vida toda.**`,

  "VAC-INFLUENZA-2026": `## Objetivo
Engajar a equipe na Campanha Nacional de Influenza 2026 (abril a junho).

## Por que importa
- Gripe (Influenza) causa centenas de mortes/ano no Brasil — especialmente idosos, crianças, gestantes, doenças crônicas.
- Trabalhador da construção: grupo prioritário em vários estados (exposição ao tempo, aglomeração).

## Pontos-chave
1. **Quando**: abril a junho (data oficial varia — confirmar UBS local).
2. **Grupos prioritários**: > 60 anos, gestantes/puérperas, crianças 6m–6a, profissionais de saúde, comorbidades, trabalhadores da construção (em vários estados).
3. **Onde**: UBS, gratuita.
4. **Efeitos colaterais comuns**: dor leve no braço, febre baixa por 1–2 dias. NORMAL.
5. **Mito**: "vacina dá gripe" → falso (vírus inativado).

## Reforço final
**Vacina contra a gripe é gratuita. Abril a junho. Protege você, sua família e a equipe.**`,

  "VAC-TRABALHADOR-NR7": `## Objetivo
Apresentar o calendário vacinal do trabalhador (NR-7/PCMSO) e a obrigação da empresa.

## Pontos-chave
1. **Hepatite B**: 3 doses (0–1–6 meses). Obrigatória pra exposição a sangue/fluidos. Verificar anti-HBs.
2. **Tétano/dT**: reforço a cada 10 anos. Crítico pra obra (ferimento por prego/ferragem).
3. **Febre Amarela**: dose única, áreas com recomendação.
4. **Tríplice viral (sarampo/caxumba/rubéola)**: 2 doses até 29 anos; 1 dose 30–59.
5. **COVID-19**: reforço anual.
6. Empresa custeia se não disponível no SUS. Documentar TUDO no ASO.

## Reforço final
**Carteira de vacina em dia = ASO em dia = você protegido. Procure RH/SESMT.**`,

  "VAC-TETANO-DT": `## Objetivo
Reforço dT (tétano/difteria) a cada 10 anos — CRÍTICO pra obra.

## Por que importa
- Tétano mata em mais de 30% dos casos quando contraído.
- Construção civil = ambiente clássico de contaminação (prego enferrujado, ferragem, terra).

## Pontos-chave
1. **Quando**: reforço a cada 10 anos (adultos).
2. **Onde**: UBS, gratuita.
3. **Em caso de ferimento profundo/sujo**: se passaram > 5 anos da última dose, REFORÇO IMEDIATO.
4. Verificar a carteira de vacinação na admissão e renovar.

## Reforço final
**Prego no pé = corrida pra UBS se passou de 5 anos. Reforço dT a cada 10 anos: faça AGORA.**`,

  "VAC-HEPATITE-B": `## Objetivo
Garantir que toda a equipe esteja com o esquema completo de Hepatite B (3 doses).

## Por que importa
- Risco biológico em obra: acidente com sangue de colega (corte, primeiros socorros, contato com fluidos).
- Hepatite B crônica leva à cirrose e câncer de fígado.

## Pontos-chave
1. **Esquema**: 3 doses (0 – 1 mês – 6 meses). Gratuita SUS, qualquer idade.
2. **Verificar imunidade**: exame anti-HBs (se já vacinado e não tem certeza).
3. **Quando atualizar**: na admissão (parte do ASO) e em qualquer dúvida.
4. **NÃO precisa repetir** se já tomou as 3 doses na infância ou adolescência (proteção vitalícia na maioria dos casos).

## Reforço final
**3 doses = proteção pra vida toda. Confira sua carteira. UBS aplica grátis.**`,

  "VAC-MULTIVACINACAO-2026": `## Objetivo
Mobilizar a equipe pra Campanha Nacional de Multivacinação (agosto/setembro) — atualização da carteira de vacina dos filhos < 15 anos.

## Pontos-chave
1. **Quem**: crianças e adolescentes < 15 anos com carteira atrasada.
2. **Quando**: agosto e setembro (data oficial varia).
3. **Onde**: qualquer UBS — sem fila, sem agendamento.
4. **Vacinas atualizadas**: BCG, Pólio, Tríplice viral, HPV, Meningo, Hepatite B, Tetra viral, etc.
5. **Importante**: carteira de vacina é exigida em creche/escola/pré-natal.

## Reforço final
**Filhos < 15 anos? Leve a carteira na UBS em agosto/setembro. Tudo grátis, sem agendar.**`,

  "VAC-FEBRE-AMARELA": `## Objetivo
Garantir vacinação contra febre amarela ANTES de mobilizar equipe pra obra em área de risco (ACRV).

## Por que importa
- Febre amarela mata em ~50% dos casos graves.
- Mosquitos transmissores existem em mata, áreas rurais, periferia urbana de muitos municípios.
- Obra em região de mata/rural exige equipe vacinada.

## Pontos-chave
1. **Dose única vitalícia** (após 9 meses de idade).
2. **Verificar a carteira** ANTES de mobilizar pra nova obra (mapa ACRV no site do MS).
3. **Onde**: UBS, gratuita. Levar carteira.
4. **Contraindicações**: gestantes, imunossuprimidos, alergia grave a ovo — consultar médico.
5. **Reação possível**: febre baixa, dor no corpo por 1–2 dias.

## Reforço final
**Vai mobilizar pra obra em mata/rural? Carteira em dia ANTES. Dose única, vale pra vida toda.**`,
};

// Helper: retorna o roteiro detalhado pra um código (ou null se não houver).
function getRoteiroPadrao(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return ROTEIROS_DETALHADOS[codigo] ?? null;
}

export const ddsRouter = router({

  // ================= TEMAS / BIBLIOTECA =================

  listTemas: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), categoria: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)];
      if (input.categoria) conds.push(eq(ddsTemas.categoria, input.categoria));
      return db.select().from(ddsTemas).where(and(...conds)).orderBy(ddsTemas.categoria, ddsTemas.titulo);
    }),

  getTema: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.select().from(ddsTemas)
        .where(and(eq(ddsTemas.id, input.id), eq(ddsTemas.companyId, input.companyId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tema não encontrado" });
      return row;
    }),

  criarTema: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      codigo: z.string().max(30).optional(),
      titulo: z.string().min(3).max(255),
      descricao: z.string().optional(),
      conteudoMd: z.string().optional(),
      normaReferencia: z.string().max(120).optional(),
      categoria: z.enum(["NR", "CAMPANHA", "VACINACAO", "LIVRE"]).default("LIVRE"),
      // Rev. 1960 — Sub-classificação por área temática (vocabulário fechado em shared/ddsAreas.ts).
      areaTema: z.string().max(40).nullable().optional(),
      mesCampanha: z.number().int().min(1).max(12).optional(),
      corCampanha: z.string().max(30).optional(),
      duracaoMin: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.insert(ddsTemas).values({
        companyId: input.companyId,
        codigo: input.codigo ?? null,
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        conteudoMd: input.conteudoMd ?? null,
        normaReferencia: input.normaReferencia ?? null,
        categoria: input.categoria,
        areaTema: coerceDDSArea(input.areaTema),
        mesCampanha: input.mesCampanha ?? null,
        corCampanha: input.corCampanha ?? null,
        duracaoMin: input.duracaoMin ?? 15,
        createdBy: (ctx.user as any)?.id ?? null,
      } as any).returning();
      return row;
    }),

  atualizarTema: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      id: z.number().int().positive(),
      titulo: z.string().min(3).max(255).optional(),
      descricao: z.string().optional(),
      conteudoMd: z.string().optional(),
      normaReferencia: z.string().max(120).optional(),
      categoria: z.enum(["NR", "CAMPANHA", "VACINACAO", "LIVRE"]).optional(),
      // Rev. 1960 — sub-classificação por área (string|null; null limpa, undefined preserva).
      areaTema: z.string().max(40).nullable().optional(),
      mesCampanha: z.number().int().min(1).max(12).nullable().optional(),
      corCampanha: z.string().max(30).optional(),
      duracaoMin: z.number().int().positive().optional(),
      ativo: z.number().int().min(0).max(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const { id, companyId, ...patch } = input;
      // Rev. 1960 — coerção segura da área temática (string→enum|null).
      // - undefined: não toca na coluna (preserva valor atual).
      // - null ou valor inválido: limpa a coluna.
      // - valor válido: persiste em uppercase.
      const patchFinal: any = { ...patch };
      if ("areaTema" in patch) {
        patchFinal.areaTema = patch.areaTema === null ? null : coerceDDSArea(patch.areaTema);
      }
      const [row] = await db.update(ddsTemas).set({ ...patchFinal, updatedAt: sql`NOW()` } as any)
        .where(and(eq(ddsTemas.id, id), eq(ddsTemas.companyId, companyId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tema não encontrado" });
      return row;
    }),

  excluirTema: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(ddsTemas).set({ deletedAt: sql`NOW()` } as any)
        .where(and(eq(ddsTemas.id, input.id), eq(ddsTemas.companyId, input.companyId)));
      return { ok: true };
    }),

  // Semeia campanhas governamentais + NRs principais. Idempotente — pula
  // o que já existir (compara por codigo).
  seedTemasPadrao: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const existentes = await db.select({ codigo: ddsTemas.codigo })
        .from(ddsTemas)
        .where(and(eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)));
      const codigosExistentes = new Set(existentes.map((r: any) => r.codigo).filter(Boolean));
      let inseridos = 0;
      for (const c of CAMPANHAS_GOV) {
        if (codigosExistentes.has(c.codigo)) continue;
        await db.insert(ddsTemas).values({
          companyId: input.companyId,
          codigo: c.codigo,
          titulo: c.titulo,
          descricao: c.descricao,
          conteudoMd: getRoteiroPadrao(c.codigo), // Rev. 1740 — roteiro detalhado
          normaReferencia: c.norma,
          categoria: "CAMPANHA",
          mesCampanha: c.mes,
          corCampanha: c.cor,
          duracaoMin: 15,
          createdBy: (ctx.user as any)?.id ?? null,
        } as any);
        inseridos++;
      }
      for (const n of NRS_CONSTRUCAO) {
        if (codigosExistentes.has(n.codigo)) continue;
        await db.insert(ddsTemas).values({
          companyId: input.companyId,
          codigo: n.codigo,
          titulo: n.titulo,
          descricao: n.descricao,
          conteudoMd: getRoteiroPadrao(n.codigo), // Rev. 1740 — roteiro detalhado
          normaReferencia: n.norma,
          categoria: "NR",
          duracaoMin: 15,
          createdBy: (ctx.user as any)?.id ?? null,
        } as any);
        inseridos++;
      }
      // Rev. 1861 — Biblioteca expandida (172 temas adicionais cobrindo NRs
      // restantes, atividades de obra, equipamentos, EPI específico, saúde
      // física/mental, riscos, emergência, trânsito, documentação, cultura).
      for (const t of TEMAS_BIBLIOTECA) {
        if (codigosExistentes.has(t.codigo)) continue;
        await db.insert(ddsTemas).values({
          companyId: input.companyId,
          codigo: t.codigo,
          titulo: t.titulo,
          descricao: t.descricao,
          conteudoMd: buildRoteiroLib(t),
          normaReferencia: t.norma,
          categoria: t.categoria,
          duracaoMin: 15,
          createdBy: (ctx.user as any)?.id ?? null,
        } as any);
        inseridos++;
      }
      // Rev. 1954 — Pacote EXTRA (80 temas curados de construção civil real:
      // atividades de obra, escavação/fundação, acabamento, riscos físicos
      // específicos, elétrica, ferramentas manuais, químicos, saúde
      // ocupacional, trânsito, condições do canteiro, liderança, emergências
      // específicas). User: "Cria já mais itens, salva na biblioteca e deixa
      // salvo, vários temas importantes da construção civil".
      for (const t of TEMAS_BIBLIOTECA_EXTRA) {
        if (codigosExistentes.has(t.codigo)) continue;
        await db.insert(ddsTemas).values({
          companyId: input.companyId,
          codigo: t.codigo,
          titulo: t.titulo,
          descricao: t.descricao,
          conteudoMd: buildRoteiroLib(t),
          normaReferencia: t.norma,
          categoria: t.categoria,
          duracaoMin: 15,
          createdBy: (ctx.user as any)?.id ?? null,
        } as any);
        inseridos++;
      }
      return { inseridos };
    }),

  // Rev. 1740 — Backfill de roteiros detalhados em temas já cadastrados.
  // Atualiza `conteudoMd` em temas cujo `codigo` está no ROTEIROS_DETALHADOS
  // E que ainda não têm roteiro (NULL ou string curta < 80 chars). Idempotente.
  enriquecerTemasPadrao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      sobrescrever: z.boolean().default(false), // se true, sobrescreve mesmo quem já tem texto
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const codigos = Object.keys(ROTEIROS_DETALHADOS);
      const todos = await db.select({
        id: ddsTemas.id, codigo: ddsTemas.codigo, conteudoMd: ddsTemas.conteudoMd,
      }).from(ddsTemas).where(and(
        eq(ddsTemas.companyId, input.companyId),
        isNull(ddsTemas.deletedAt),
        inArray(ddsTemas.codigo, codigos),
      ));
      let atualizados = 0;
      for (const t of todos) {
        const roteiro = getRoteiroPadrao(t.codigo);
        if (!roteiro) continue;
        const tem = (t.conteudoMd ?? "").trim();
        if (!input.sobrescrever && tem.length >= 80) continue; // já tem conteúdo razoável
        await db.update(ddsTemas)
          .set({ conteudoMd: roteiro, updatedAt: sql`NOW()` } as any)
          .where(eq(ddsTemas.id, t.id));
        atualizados++;
      }
      return { atualizados };
    }),

  // Rev. 1729 — Semeia campanhas oficiais de vacinação PNI/MS 2026.
  // Atende Lei 15.377/2026 (CLT art. 169-A). Idempotente — pula códigos
  // já existentes. Atualiza CALENDÁRIO ANUAL automaticamente (categoria=VACINACAO).
  seedVacinacaoPNI: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const existentes = await db.select({ codigo: ddsTemas.codigo })
        .from(ddsTemas)
        .where(and(eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)));
      const codigosExistentes = new Set(existentes.map((r: any) => r.codigo).filter(Boolean));
      let inseridos = 0;
      for (const v of VACINACAO_PNI) {
        if (codigosExistentes.has(v.codigo)) continue;
        await db.insert(ddsTemas).values({
          companyId: input.companyId,
          codigo: v.codigo,
          titulo: v.titulo,
          descricao: v.descricao,
          conteudoMd: getRoteiroPadrao(v.codigo), // Rev. 1740 — roteiro detalhado
          normaReferencia: v.norma,
          categoria: "VACINACAO",
          mesCampanha: v.mes,
          corCampanha: v.cor,
          duracaoMin: 15,
          createdBy: (ctx.user as any)?.id ?? null,
        } as any);
        inseridos++;
      }
      return { inseridos };
    }),

  // Rev. 1740 — Gera roteiro detalhado via IA (Claude/Gemini) pra um tema arbitrário,
  // contextualizado com obra, função do efetivo presente e norma de referência.
  // Retorna o markdown — UI decide se salva no tema (atualizarTema) ou na sessão (atualizarSessao).
  gerarRoteiroComIA: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      titulo: z.string().min(3).max(255),
      descricao: z.string().optional(),
      normaReferencia: z.string().optional(),
      categoria: z.enum(["NR", "CAMPANHA", "VACINACAO", "LIVRE"]).optional(),
      obraNome: z.string().optional(),
      funcoesPresentes: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);

      const contexto: string[] = [];
      if (input.obraNome) contexto.push(`Obra: ${input.obraNome}`);
      if (input.funcoesPresentes?.length) {
        const func = Array.from(new Set(input.funcoesPresentes.filter(Boolean))).slice(0, 15);
        if (func.length) contexto.push(`Funções da equipe presente: ${func.join(", ")}`);
      }
      if (input.normaReferencia) contexto.push(`Norma/lei: ${input.normaReferencia}`);
      if (input.descricao) contexto.push(`Resumo: ${input.descricao}`);
      if (input.categoria) contexto.push(`Categoria: ${input.categoria}`);

      const systemPrompt = `Você é um Engenheiro de Segurança do Trabalho (CREA) especialista em construção civil brasileira. Sua tarefa é gerar um ROTEIRO PRÁTICO de Diálogo Diário de Segurança (DDS) — fala curta de 10 a 15 minutos no início do turno, na frente de serviço.

Regras OBRIGATÓRIAS:
1. **Idioma**: Português brasileiro, linguagem direta e simples (escolaridade média 5ª a 8ª série).
2. **Formato**: Markdown estruturado com EXATAMENTE estas seções (use ## como cabeçalho):
   - ## Objetivo (1 frase, o que o instrutor quer alcançar)
   - ## Por que importa (2 a 3 bullets curtos com dados, riscos ou contexto legal)
   - ## Pontos-chave a abordar (5 a 7 itens numerados, técnicos e específicos)
   - ## Aplicação prática na obra (2 a 4 bullets de ação concreta NA frente de serviço, citando a obra/função quando dado)
   - ## Perguntas pra equipe (2 a 3 perguntas pra engajar o pessoal)
   - ## Reforço final (1 frase de impacto, em **negrito**)
3. **Cite a norma** (NR, lei, portaria) quando aplicável.
4. **Seja específico pra construção civil**: exemplos reais (andaime, betoneira, escavação, EPI, içamento, etc.).
5. **NÃO** invente dados; quando não tiver certeza, omita o número/estatística.
6. Tamanho total: ENTRE 800 E 1.500 caracteres (sem contar markdown). Conciso.
7. Retorne APENAS o markdown do roteiro — sem preâmbulo ("Aqui está...") nem encerramento ("Espero ter ajudado...").
8. **CLASSIFICAÇÃO OBRIGATÓRIA (Rev. 1960)**: PRIMEIRA LINHA da resposta deve ser EXATAMENTE no formato \`<!-- AREA_TEMA: XXX -->\` onde XXX é UMA das áreas abaixo (escolha a MAIS específica e relevante pro tema):
${DDS_AREAS_PROMPT_TEXT}
   Após essa linha, deixe uma linha em branco e então inicie o markdown do roteiro normalmente.`;

      const userPrompt = `Tema do DDS: **${input.titulo}**

${contexto.join("\n")}

Gere o roteiro detalhado seguindo EXATAMENTE o formato exigido (lembre da 1ª linha com <!-- AREA_TEMA: XXX -->).`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 1200,
        });
        const content = response.choices?.[0]?.message?.content;
        let text = (typeof content === "string" ? content : Array.isArray(content)
          ? content.map((c: any) => c?.text ?? "").join("")
          : "").trim();

        // Rev. 1960 — extrai a tag "<!-- AREA_TEMA: XXX -->" e REMOVE do markdown.
        // Regex resiliente: aceita a tag em qualquer posição (não só 1ª linha) caso a IA
        // adicione preâmbulo. Match global p/ remover múltiplas ocorrências (se IA insistir).
        let areaTema: string | null = null;
        const reArea = /<!--\s*AREA_TEMA\s*:\s*([A-Z_]+)\s*-->/gi;
        const mArea = reArea.exec(text);
        if (mArea) {
          areaTema = coerceDDSArea(mArea[1]);
        }
        text = text.replace(reArea, "").replace(/^\s*\n+/, "").trim();

        // Validação de contrato (Rev. 1740): exige as 6 seções fixas e tamanho razoável.
        const SECOES_OBRIGATORIAS = ["Objetivo", "Por que importa", "Pontos-chave", "Aplicação prática", "Perguntas", "Reforço final"];
        const faltantes = SECOES_OBRIGATORIAS.filter(s =>
          !new RegExp(`^##\\s+${s.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`, "im").test(text));
        const tamSemMd = text.replace(/[#*\-`]/g, "").length;

        if (!text || tamSemMd < 400) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA retornou roteiro vazio ou muito curto (esperado ≥ 400 chars sem markdown)." });
        }
        if (faltantes.length >= 3) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `IA não respeitou o formato — seções ausentes: ${faltantes.join(", ")}.` });
        }
        if (tamSemMd > 2500) {
          // Trunca de forma conservadora preservando o último cabeçalho.
          const cut = text.slice(0, 3500);
          return { conteudoMd: cut, areaTema };
        }
        return { conteudoMd: text, areaTema };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        const msg = err?.message ?? String(err);
        if (msg.includes("Nenhuma chave de IA")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada (ANTHROPIC_API_KEY ou GOOGLE_API_KEY ausente)." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao gerar roteiro com IA: ${msg.slice(0, 200)}` });
      }
    }),

  // Rev. 1864 — Gera TEMA completo via IA a partir de um prompt curto.
  // Retorna JSON com todos os campos preenchidos (titulo, codigo, categoria, descricao,
  // normaReferencia, duracaoMin, conteudoMd) — UI auto-preenche o form do "Novo tema".
  gerarTemaIA: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      prompt: z.string().min(3).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);

      const systemPrompt = `Você é Engenheiro de Segurança do Trabalho (CREA) especialista em construção civil brasileira. Sua tarefa é converter um pedido curto do usuário em um TEMA DE DDS (Diálogo Diário de Segurança) COMPLETO, em formato JSON.

Regras OBRIGATÓRIAS:
1. **Idioma**: Português brasileiro, linguagem direta (escolaridade média 5ª a 8ª série).
2. **Formato de saída**: APENAS JSON válido (sem preâmbulo, sem markdown ao redor) com EXATAMENTE estas chaves:
   - "categoria": uma das strings "NR", "CAMPANHA", "VACINACAO" ou "LIVRE" — escolha "NR" se o tema for ligado a uma Norma Regulamentadora; "CAMPANHA" para campanhas governamentais (Outubro Rosa, Novembro Azul, Maio Amarelo etc); "VACINACAO" para imunização (PNI/MS); "LIVRE" caso contrário.
   - "areaTema": UMA das áreas temáticas abaixo (escolha a MAIS específica e relevante — Rev. 1960):
${DDS_AREAS_PROMPT_TEXT}
   - "codigo": código curto (ex.: "NR-35", "OUT-ROSA", "DDS-001"). Se NR, use "NR-XX". Se livre, gere um slug curto.
   - "titulo": 5 a 80 caracteres, claro e específico.
   - "descricao": resumo de 1 a 2 frases (máx 280 chars) — diz do que se trata.
   - "normaReferencia": NR/lei/portaria oficial brasileira aplicável (ex.: "NR-35 (Portaria MTE 313/2012)"). Se não houver, use string vazia "".
   - "duracaoMin": número inteiro entre 5 e 60 (típico DDS = 10 a 15 min).
   - "conteudoMd": ROTEIRO em Markdown com EXATAMENTE estas 6 seções (cada uma com cabeçalho ## ):
       ## Objetivo (1 frase)
       ## Por que importa (2 a 3 bullets curtos com riscos/dados/contexto legal)
       ## Pontos-chave a abordar (5 a 7 itens numerados, técnicos e específicos pra construção civil)
       ## Aplicação prática na obra (2 a 4 bullets de ação concreta)
       ## Perguntas pra equipe (2 a 3 perguntas de engajamento)
       ## Reforço final (1 frase de impacto, em **negrito**)
     Tamanho do conteudoMd: 800 a 1500 chars (sem contar markdown).
3. **NÃO invente dados** numéricos; quando incerto, omita.
4. Seja específico pra construção civil brasileira (andaime, betoneira, escavação, EPI, içamento, etc).
5. Retorne APENAS o JSON — nada antes, nada depois, nem cercas \`\`\`json.`;

      const userPrompt = `Pedido do usuário: "${input.prompt}"

Gere o JSON do tema seguindo EXATAMENTE o esquema acima.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 1500,
          response_format: { type: "json_object" },
        });
        const content = response.choices?.[0]?.message?.content;
        let raw = (typeof content === "string" ? content : Array.isArray(content)
          ? content.map((c: any) => c?.text ?? "").join("")
          : "").trim();
        // Tolerância: se a IA cercou em ```json ... ```, despe.
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (m) raw = m[1].trim();
        // Tolerância: se vier algum lixo antes/depois do {...}, recorta o objeto.
        const fi = raw.indexOf("{"); const li = raw.lastIndexOf("}");
        if (fi >= 0 && li > fi) raw = raw.slice(fi, li + 1);

        let parsed: any;
        try { parsed = JSON.parse(raw); }
        catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA retornou JSON inválido — tente reformular o pedido." }); }

        // Saneamento + defaults seguros
        const allowedCat = ["NR", "CAMPANHA", "VACINACAO", "LIVRE"];
        const categoria = allowedCat.includes(parsed.categoria) ? parsed.categoria : "LIVRE";
        const areaTema = coerceDDSArea(parsed.areaTema); // Rev. 1960 — null se inválido
        const codigo = String(parsed.codigo ?? "").trim().slice(0, 30);
        const titulo = String(parsed.titulo ?? "").trim().slice(0, 200);
        const descricao = String(parsed.descricao ?? "").trim().slice(0, 280);
        const normaReferencia = String(parsed.normaReferencia ?? "").trim().slice(0, 200);
        const dRaw = parseInt(String(parsed.duracaoMin ?? 15), 10);
        const duracaoMin = Number.isFinite(dRaw) ? Math.min(60, Math.max(5, dRaw)) : 15;
        const conteudoMd = String(parsed.conteudoMd ?? "").trim();

        if (titulo.length < 3) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não gerou título válido — tente reformular." });
        }
        if (conteudoMd.replace(/[#*\-`]/g, "").length < 300) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA gerou roteiro muito curto — tente reformular o pedido." });
        }

        return { categoria, areaTema, codigo, titulo, descricao, normaReferencia, duracaoMin, conteudoMd };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        const msg = err?.message ?? String(err);
        if (msg.includes("Nenhuma chave de IA")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada (ANTHROPIC_API_KEY ou GOOGLE_API_KEY ausente)." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao gerar tema com IA: ${msg.slice(0, 200)}` });
      }
    }),

  // Rev. 1953 — Gera N temas NOVOS de uma vez via IA (biblioteca expandida).
  // User: "Coloca um botão para gerar mais assuntos quero uma biblioteca com mais 200 temas
  // pertinentes a construção civil". Diferente de `gerarTemaIA` (1 tema a partir de prompt curto),
  // este gera um LOTE de N temas únicos, evitando duplicar os títulos/códigos já existentes na
  // company. Idempotente: títulos repetidos (case-insensitive, normalizados) são pulados.
  // Não gera roteiro detalhado aqui (mais rápido/barato) — usuário pode rodar "Gerar todos os
  // roteiros com IA" depois pra preencher o conteúdo dos novos temas.
  gerarMaisTemasIA: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      quantidade: z.number().int().min(5).max(30).default(20),
      foco: z.string().max(200).optional(), // ex.: "trabalho em altura", "saúde mental", "trânsito"
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      // Lê títulos/códigos existentes pra IA evitar repetir
      const existentes = await db.select({
        codigo: ddsTemas.codigo, titulo: ddsTemas.titulo,
      }).from(ddsTemas)
        .where(and(eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)));
      const normalizar = (s: string) => (s ?? "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
      const titulosExistentesSet = new Set(existentes.map((e: any) => normalizar(e.titulo)));
      const codigosExistentesSet = new Set(existentes.map((e: any) => (e.codigo ?? "").toUpperCase()).filter(Boolean));
      const amostraTitulos = existentes.slice(0, 60).map((e: any) => `- ${e.titulo}`).join("\n");

      const systemPrompt = `Você é Engenheiro de Segurança do Trabalho (CREA) especialista em construção civil brasileira. Sua tarefa é sugerir uma LISTA de NOVOS TEMAS de Diálogo Diário de Segurança (DDS) para enriquecer a biblioteca de uma construtora.

Regras OBRIGATÓRIAS:
1. **Idioma**: Português brasileiro, linguagem direta e técnica.
2. **Formato de saída**: APENAS JSON válido (sem preâmbulo, sem cercas \`\`\`json) com EXATAMENTE esta estrutura:
   {
     "temas": [
       { "titulo": "...", "descricao": "...", "normaReferencia": "...", "categoria": "NR" | "LIVRE", "areaTema": "<UMA das áreas listadas abaixo>" }
     ]
   }
   Áreas válidas (Rev. 1960 — use EXATAMENTE um destes valores em "areaTema"):
${DDS_AREAS_PROMPT_TEXT}
3. **titulo**: 8 a 90 caracteres, claro e ESPECÍFICO (evite genérico tipo "Segurança no trabalho"). Quando for tema ligado a NR, comece com o número (ex.: "NR-35 — Resgate em altura").
4. **descricao**: 1 frase de 80 a 220 caracteres descrevendo do que se trata.
5. **normaReferencia**: NR/lei/portaria brasileira oficial (ex.: "NR-18 (Portaria MTP 3.733/2020)"). Se não houver norma específica, use string vazia "".
6. **categoria**: "NR" se ligado a Norma Regulamentadora; "LIVRE" para temas de comportamento, saúde, cultura, qualidade de vida.
7. **DIVERSIDADE OBRIGATÓRIA**: distribua os temas entre os blocos abaixo (proporcional):
   - Riscos físicos da obra (queda, soterramento, eletricidade, máquinas, içamento, projeção, ruído, calor, frio)
   - EPI específico (capacete jugular, cinto paraquedista, óculos para soldador, luva química, bota dielétrica, protetor auricular)
   - Atividades específicas (forma, ferragem, concretagem, alvenaria, reboco, gesso, pintura, hidráulica, elétrica, cobertura, demolição, escavação, fundação)
   - Equipamentos (esmerilhadeira, serra circular, makita, serra mármore, betoneira, vibrador, compactador, bomba de concreto, grua, manipulador, plataforma elevatória)
   - Saúde física (LER/DORT, coluna, joelho, ombro, dermatite, silicose, perda auditiva, insolação, desidratação)
   - Saúde mental (estresse, sono, álcool, drogas, suicídio, depressão, conflito interpessoal)
   - Trânsito (caminhão, betoneira, motociclista, deslocamento casa-obra)
   - Emergência (primeiros socorros, queimadura, fratura, hemorragia, parada cardíaca, evacuação, incêndio, choque elétrico)
   - Cultura e comportamento (5S, observação de comportamento, pertencer ao time, denúncia, exemplo do líder)
   - Documentação (PT, APR, OS, check-list, LV, DDS, CIPA)
8. **NÃO REPITA** títulos já presentes na biblioteca (lista abaixo).
9. **NÃO INVENTE** normas — só cite NR/lei brasileira real.
10. Gere EXATAMENTE ${input.quantidade} temas no array "temas". Nem mais nem menos.`;

      const userPrompt = `Biblioteca atual da empresa tem ${existentes.length} temas. Amostra dos títulos já cadastrados (NÃO repita):
${amostraTitulos}

${input.foco ? `Foco solicitado pelo usuário: "${input.foco}". Priorize temas dentro desse foco mas mantenha alguma diversidade.\n` : ""}Gere ${input.quantidade} NOVOS temas únicos e relevantes para construção civil brasileira, seguindo EXATAMENTE o esquema JSON exigido.`;

      let parsed: any;
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: Math.min(8000, 400 + input.quantidade * 200),
          response_format: { type: "json_object" },
        });
        const content = response.choices?.[0]?.message?.content;
        let raw = (typeof content === "string" ? content : Array.isArray(content)
          ? content.map((c: any) => c?.text ?? "").join("")
          : "").trim();
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (m) raw = m[1].trim();
        const fi = raw.indexOf("{"); const li = raw.lastIndexOf("}");
        if (fi >= 0 && li > fi) raw = raw.slice(fi, li + 1);
        try { parsed = JSON.parse(raw); }
        catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA retornou JSON inválido — tente novamente." }); }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        const msg = err?.message ?? String(err);
        if (msg.includes("Nenhuma chave de IA")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada (ANTHROPIC_API_KEY ou GOOGLE_API_KEY ausente)." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao gerar temas com IA: ${msg.slice(0, 200)}` });
      }

      const lista = Array.isArray(parsed?.temas) ? parsed.temas : [];
      if (lista.length === 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou nenhum tema. Tente novamente." });
      }

      // Gera código único curto pra cada tema novo: IA-<seq> com padding (evita colisão com NR-XX/etc)
      let seq = 1;
      const proximoCodigo = (): string => {
        let cod: string;
        do {
          cod = `IA-${String(seq).padStart(4, "0")}`;
          seq++;
        } while (codigosExistentesSet.has(cod) && seq < 99999);
        codigosExistentesSet.add(cod);
        return cod;
      };

      let inseridos = 0; let ignorados = 0; let falhas = 0;
      for (const t of lista) {
        const titulo = String(t?.titulo ?? "").trim().slice(0, 200);
        const descricao = String(t?.descricao ?? "").trim().slice(0, 280);
        const normaReferencia = String(t?.normaReferencia ?? "").trim().slice(0, 120);
        const catRaw = String(t?.categoria ?? "LIVRE").trim().toUpperCase();
        const categoria = (catRaw === "NR" || catRaw === "CAMPANHA" || catRaw === "VACINACAO") ? catRaw : "LIVRE";
        const areaTema = coerceDDSArea(t?.areaTema); // Rev. 1960 — null se inválido/ausente

        if (titulo.length < 5 || descricao.length < 20) { falhas++; continue; }
        const norm = normalizar(titulo);
        if (titulosExistentesSet.has(norm)) { ignorados++; continue; }
        titulosExistentesSet.add(norm);

        try {
          await db.insert(ddsTemas).values({
            companyId: input.companyId,
            codigo: proximoCodigo(),
            titulo,
            descricao,
            conteudoMd: null,
            normaReferencia: normaReferencia || null,
            categoria,
            areaTema, // Rev. 1960
            duracaoMin: 15,
            createdBy: (ctx.user as any)?.id ?? null,
          } as any);
          inseridos++;
        } catch { falhas++; }
      }

      return { inseridos, ignorados, falhas, totalIa: lista.length };
    }),

  // ================= CALENDÁRIO ANUAL =================
  // Retorna estrutura pronta para a aba "Calendário": 12 meses com a
  // campanha governamental do mês + temas (NR/livres) sugeridos.
  calendarioAnual: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const todos = await db.select().from(ddsTemas)
        .where(and(eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)));
      const meses = [];
      for (let m = 1; m <= 12; m++) {
        const campanhas = todos.filter((t: any) => t.categoria === "CAMPANHA" && t.mesCampanha === m);
        // Rev. 1729 — vacinação PNI/MS (Lei 15.377/2026)
        const vacinacao = todos.filter((t: any) => t.categoria === "VACINACAO" && t.mesCampanha === m);
        const sessoesQtd = await db.select({ c: sql<number>`COUNT(*)` }).from(ddsSessoes)
          .where(and(
            eq(ddsSessoes.companyId, input.companyId),
            isNull(ddsSessoes.deletedAt),
            sql`EXTRACT(MONTH FROM ${ddsSessoes.data}) = ${m}`,
            sql`EXTRACT(YEAR FROM ${ddsSessoes.data}) = EXTRACT(YEAR FROM CURRENT_DATE)`,
          ));
        meses.push({
          mes: m,
          campanhas,
          vacinacao,
          sessoesNoMes: Number(sessoesQtd?.[0]?.c ?? 0),
        });
      }
      const nrs = todos.filter((t: any) => t.categoria === "NR");
      return { meses, nrsTotal: nrs.length };
    }),

  // ================= SESSÕES =================

  listSessoes: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().int().positive().max(500).default(200),
      mes: z.number().int().min(1).max(12).optional(),
      ano: z.number().int().min(2000).max(2100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(ddsSessoes.companyId, input.companyId), isNull(ddsSessoes.deletedAt)];
      if (input.obraId) conds.push(eq(ddsSessoes.obraId, input.obraId));
      if (input.status) conds.push(eq(ddsSessoes.status, input.status));
      if (input.ano) conds.push(sql`EXTRACT(YEAR FROM ${ddsSessoes.data}) = ${input.ano}`);
      if (input.mes) conds.push(sql`EXTRACT(MONTH FROM ${ddsSessoes.data}) = ${input.mes}`);
      // Rev. 1876 — LEFT JOIN com ddsTemas pra expor `categoriaTema` (fonte
      // herdada). Mantemos `categoria` da própria sessão como override; o
      // cliente prioriza `s.categoria ?? s.categoriaTema ?? "SEM_TEMA"` p/
      // exibir badge e dashboard.
      const sessoes = await db.select({
        // Todas colunas relevantes da sessão (snapshot do que era retornado por `select()`)
        id: ddsSessoes.id,
        companyId: ddsSessoes.companyId,
        obraId: ddsSessoes.obraId,
        obraNome: ddsSessoes.obraNome,
        data: ddsSessoes.data,
        hora: ddsSessoes.hora,
        temaId: ddsSessoes.temaId,
        tituloTema: ddsSessoes.tituloTema,
        conteudoMd: ddsSessoes.conteudoMd,
        instrutor: ddsSessoes.instrutor,
        instrutorCpf: ddsSessoes.instrutorCpf,
        instrutorCodigoInterno: ddsSessoes.instrutorCodigoInterno,
        categoria: ddsSessoes.categoria,
        local: ddsSessoes.local,
        observacoes: ddsSessoes.observacoes,
        status: ddsSessoes.status,
        envelopeId: ddsSessoes.envelopeId,
        createdBy: ddsSessoes.createdBy,
        finalizadaEm: ddsSessoes.finalizadaEm,
        createdAt: ddsSessoes.createdAt,
        updatedAt: ddsSessoes.updatedAt,
        // herdado do tema
        categoriaTema: ddsTemas.categoria,
      }).from(ddsSessoes)
        // Rev. 1876 — tenant-scoped join: garante que `categoriaTema` só venha
        // de temas da MESMA empresa e não-deletados. Sem esse guard, um `temaId`
        // que aponte por engano para tema de outra company vazaria a categoria
        // cross-tenant via COALESCE/categoriaEfetiva.
        .leftJoin(ddsTemas, and(
          eq(ddsTemas.id, ddsSessoes.temaId),
          eq(ddsTemas.companyId, input.companyId),
          isNull(ddsTemas.deletedAt),
        ))
        .where(and(...conds))
        .orderBy(desc(ddsSessoes.data), desc(ddsSessoes.id))
        .limit(input.limit);
      // contagem de presentes por sessão
      if (sessoes.length === 0) return [];
      const ids = sessoes.map((s: any) => s.id);
      const counts = await db.select({
        sessaoId: ddsSessaoFuncionarios.sessaoId,
        total: sql<number>`COUNT(*)`,
        presentes: sql<number>`SUM(CASE WHEN ${ddsSessaoFuncionarios.presente}=1 THEN 1 ELSE 0 END)`,
        assinados: sql<number>`SUM(CASE WHEN ${ddsSessaoFuncionarios.assinadoEm} IS NOT NULL THEN 1 ELSE 0 END)`,
      }).from(ddsSessaoFuncionarios)
        .where(inArray(ddsSessaoFuncionarios.sessaoId, ids))
        .groupBy(ddsSessaoFuncionarios.sessaoId);
      const byId = new Map(counts.map((c: any) => [c.sessaoId, c]));
      return sessoes.map((s: any) => ({
        ...s,
        // categoria efetiva (override → tema → null/SEM_TEMA tratado no client)
        categoriaEfetiva: s.categoria ?? s.categoriaTema ?? null,
        totalParticipantes: Number(byId.get(s.id)?.total ?? 0),
        presentes: Number(byId.get(s.id)?.presentes ?? 0),
        assinados: Number(byId.get(s.id)?.assinados ?? 0),
      }));
    }),

  // Rev. 1733 — Lista colaboradores ATIVOS vinculados às obras informadas.
  // Aceita obraId (legado) OU obraIds[] (novo — consolida duplicatas com mesmo nome,
  // alinhado com getEfetivoPorObra/cadastro > aba Efetivo).
  funcionariosDaObra: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraIds: z.array(z.number().int().positive()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        assertCompanyAccess(ctx, input.companyId);
        const db = (await getDb())!;
        const inputIds = (input.obraIds && input.obraIds.length > 0)
          ? input.obraIds
          : (input.obraId ? [input.obraId] : []);
        if (inputIds.length === 0) return [];
        const ids = await expandObraIdsByCanonicalName(db, input.companyId, inputIds);
        const rows = await db.select({
          employeeId: employees.id,
          nome: employees.nomeCompleto,
          cpf: employees.cpf,
          funcao: employees.funcao,
          funcaoNaObra: obraFuncionarios.funcaoNaObra,
          status: employees.status,
        }).from(obraFuncionarios)
          .innerJoin(employees, eq(employees.id, obraFuncionarios.employeeId))
          .where(and(
            eq(obraFuncionarios.companyId, input.companyId),
            inArray(obraFuncionarios.obraId, ids),
            eq(obraFuncionarios.isActive, 1),
            isNull(employees.deletedAt),
          ))
          .orderBy(employees.nomeCompleto);
        console.log("[DDS funcionariosDaObra] rows.length=", rows.length);
        const seen = new Set<number>();
        const dedup = rows.filter((r: any) => {
          if (seen.has(r.employeeId)) return false;
          seen.add(r.employeeId);
          return true;
        });
        const cltFinal = dedup
          .filter((r: any) => !["Desligado", "Lista_Negra", "ListaNegra"].includes(r.status))
          .map((r: any) => ({ ...r, tipo: "clt" as const, funcTerceiroId: null }));
        // Rev. 2021 — anexa funcionários terceiros vinculados às mesmas obras (funcionariosTerceiros.obraId).
        // try/catch defensivo: se a query falhar (ex: módulo Terceiros não migrado num tenant antigo),
        // mantém o comportamento original (só CLT) — DDS NÃO pode quebrar por causa de Terceiros.
        try {
          const terc = await db.select({
            funcTerceiroId: funcionariosTerceiros.id,
            nome: funcionariosTerceiros.nome,
            cpf: funcionariosTerceiros.cpf,
            funcao: funcionariosTerceiros.funcao,
            status: funcionariosTerceiros.status,
            empresaTerceiraId: funcionariosTerceiros.empresaTerceiraId,
            fotoUrl: funcionariosTerceiros.fotoUrl,
          }).from(funcionariosTerceiros).where(and(
            eq(funcionariosTerceiros.companyId, input.companyId),
            inArray(funcionariosTerceiros.obraId, ids),
            isNull(funcionariosTerceiros.deletedAt),
          )).orderBy(funcionariosTerceiros.nome);
          const tercFinal = terc
            .filter((t: any) => !["inativo", "desligado"].includes(String(t.status).toLowerCase()))
            .map((t: any) => ({
              tipo: "terceiro" as const,
              employeeId: null,
              funcTerceiroId: t.funcTerceiroId,
              nome: t.nome,
              cpf: t.cpf,
              funcao: t.funcao,
              funcaoNaObra: null,
              status: t.status,
              empresaTerceiraId: t.empresaTerceiraId,
              fotoUrl: t.fotoUrl,
            }));
          return [...cltFinal, ...tercFinal];
        } catch (e: any) {
          console.warn("[DDS funcionariosDaObra] terceiros falhou (seguindo só CLT):", e?.message);
          return cltFinal;
        }
      } catch (e: any) {
        console.error("[DDS funcionariosDaObra] FAIL", { input, msg: e?.message, stack: e?.stack });
        throw e;
      }
    }),

  // Rev. 1731/1733 — Lista colaboradores ativos da empresa que NÃO estão em nenhuma das obras informadas.
  colaboradoresParaTransferir: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraIds: z.array(z.number().int().positive()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const inputIds = (input.obraIds && input.obraIds.length > 0)
        ? input.obraIds
        : (input.obraId ? [input.obraId] : []);
      if (inputIds.length === 0) return [];
      // Rev. 1735 — expande pra TODAS as obras com mesmo nome canônico
      const ids = await expandObraIdsByCanonicalName(db, input.companyId, inputIds);
      // Subquery: ids já vinculados ATIVOS em QUALQUER das obras consolidadas
      const jaNaObra = db.select({ id: obraFuncionarios.employeeId })
        .from(obraFuncionarios)
        .where(and(
          eq(obraFuncionarios.companyId, input.companyId),
          inArray(obraFuncionarios.obraId, ids),
          eq(obraFuncionarios.isActive, 1),
        ));
      const rows = await db.select({
        id: employees.id, nome: employees.nomeCompleto, cpf: employees.cpf,
        funcao: employees.funcao, status: employees.status,
      }).from(employees).where(and(
        eq(employees.companyId, input.companyId),
        isNull(employees.deletedAt),
        notInArray(employees.id, jaNaObra),
        notInArray(employees.status, ["Desligado", "Lista_Negra", "ListaNegra"] as any),
      )).orderBy(employees.nomeCompleto);
      const cltOut = rows.map((r: any) => ({ ...r, tipo: "clt" as const, funcTerceiroId: null, obraAtualNome: null }));
      // Rev. 2024 — anexa terceiros disponíveis pra transferência. Critério:
      // terceiros ativos da empresa que NÃO estão vinculados a NENHUMA das
      // obras consolidadas (`ids`) hoje — podem ser:
      //   (a) sem obra alguma (obraId IS NULL), ou
      //   (b) vinculados a OUTRA obra (gestor pode "mover" pra esta).
      // try/catch defensivo: módulo Terceiros opcional, falha não quebra CLT.
      try {
        const terc = await db.select({
          funcTerceiroId: funcionariosTerceiros.id,
          nome: funcionariosTerceiros.nome,
          cpf: funcionariosTerceiros.cpf,
          funcao: funcionariosTerceiros.funcao,
          status: funcionariosTerceiros.status,
          obraIdAtual: funcionariosTerceiros.obraId,
          obraAtualNome: funcionariosTerceiros.obraNome,
          empresaTerceiraId: funcionariosTerceiros.empresaTerceiraId,
        }).from(funcionariosTerceiros).where(and(
          eq(funcionariosTerceiros.companyId, input.companyId),
          isNull(funcionariosTerceiros.deletedAt),
        )).orderBy(funcionariosTerceiros.nome);
        const tercOut = terc
          .filter((t: any) => !["inativo", "desligado"].includes(String(t.status).toLowerCase()))
          .filter((t: any) => !t.obraIdAtual || !ids.includes(t.obraIdAtual))
          .map((t: any) => ({
            tipo: "terceiro" as const,
            id: t.funcTerceiroId,
            funcTerceiroId: t.funcTerceiroId,
            nome: t.nome,
            cpf: t.cpf,
            funcao: t.funcao,
            status: t.status,
            obraAtualNome: t.obraAtualNome ?? null,
            empresaTerceiraId: t.empresaTerceiraId,
          }));
        return [...cltOut, ...tercOut];
      } catch (e: any) {
        console.warn("[dds.colaboradoresParaTransferir] terceiros falhou (seguindo só CLT):", e?.message);
        return cltOut;
      }
    }),

  // Rev. 1731 — Vincula colaborador à obra (cria/reativa registro em obra_funcionarios).
  // Rev. 2024 — aceita também terceiros (tipo:"terceiro" + funcTerceiroId) via
  // UPDATE direto em funcionariosTerceiros.obraId (terceiros não usam tabela
  // n:n obra_funcionarios — cada terceiro está em 0 ou 1 obra por vez).
  transferirParaObra: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive(),
      tipo: z.enum(["clt", "terceiro"]).default("clt"),
      employeeId: z.number().int().positive().optional(),
      funcTerceiroId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // Rev. 1731 fix (architect): valida ownership da obra (id + companyId) antes de qualquer escrita
      const [obraOk] = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
        .where(and(eq(obras.id, input.obraId), eq(obras.companyId, input.companyId))).limit(1);
      if (!obraOk) throw new TRPCError({ code: "FORBIDDEN", message: "Obra não pertence a esta empresa." });

      // Rev. 2024 — Branch TERCEIRO: UPDATE direto em funcionariosTerceiros.
      if (input.tipo === "terceiro") {
        if (!input.funcTerceiroId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "funcTerceiroId é obrigatório para tipo=terceiro." });
        }
        const [terc] = await db.select({
          id: funcionariosTerceiros.id,
          status: funcionariosTerceiros.status,
          obraIdAtual: funcionariosTerceiros.obraId,
        }).from(funcionariosTerceiros).where(and(
          eq(funcionariosTerceiros.id, input.funcTerceiroId),
          eq(funcionariosTerceiros.companyId, input.companyId),
          isNull(funcionariosTerceiros.deletedAt),
        )).limit(1);
        if (!terc) throw new TRPCError({ code: "FORBIDDEN", message: "Terceiro não pertence a esta empresa." });
        if (["inativo", "desligado"].includes(String(terc.status).toLowerCase())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Terceiro inativo não pode ser vinculado." });
        }
        if (terc.obraIdAtual === input.obraId) return { ok: true, reativado: false, tipo: "terceiro" as const, ja: true };
        await db.update(funcionariosTerceiros)
          .set({
            obraId: input.obraId,
            obraNome: obraOk.nome ?? null,
            updatedAt: new Date().toISOString(),
          } as any)
          .where(eq(funcionariosTerceiros.id, input.funcTerceiroId));
        return { ok: true, reativado: false, tipo: "terceiro" as const, ja: false };
      }

      // Branch CLT (comportamento original)
      if (!input.employeeId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "employeeId é obrigatório para tipo=clt." });
      }
      // Confere se o colaborador é da MESMA empresa
      const [emp] = await db.select({ id: employees.id, status: employees.status })
        .from(employees).where(and(
          eq(employees.id, input.employeeId),
          eq(employees.companyId, input.companyId),
          isNull(employees.deletedAt),
        ));
      if (!emp) throw new TRPCError({ code: "FORBIDDEN", message: "Colaborador não pertence a esta empresa." });
      if (["Desligado", "Lista_Negra", "ListaNegra"].includes(emp.status as any)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Colaborador desligado não pode ser vinculado." });
      }
      // Rev. 2559 — garantir o invariante "≤1 alocação ativa por funcionário"
      // também neste caminho (antes inseria/reativava direto, podendo criar
      // duplicata ativa cross-obra). Tudo em transação com advisory lock por
      // funcionário (mesmo padrão de `allocateEmployeeToObra`).
      const hoje = new Date().toISOString().slice(0, 10);
      try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.employeeId})`);
        // Vínculo nesta obra (ativo ou inativo)? — pega o mais recente
        const [exist] = await tx.select({ id: obraFuncionarios.id, isActive: obraFuncionarios.isActive })
          .from(obraFuncionarios).where(and(
            eq(obraFuncionarios.companyId, input.companyId),
            eq(obraFuncionarios.obraId, input.obraId),
            eq(obraFuncionarios.employeeId, input.employeeId),
          )).orderBy(desc(obraFuncionarios.id)).limit(1);
        // Desativa TODAS as alocações ativas do funcionário (qualquer obra /
        // duplicatas), deixando o caminho criar/reativar exatamente UMA.
        await tx.update(obraFuncionarios)
          .set({ isActive: 0, dataFim: hoje } as any)
          .where(and(
            eq(obraFuncionarios.employeeId, input.employeeId),
            eq(obraFuncionarios.isActive, 1),
          ));
        if (exist) {
          // Reativa a linha desta obra (a escolhida). `reativado` = true só
          // quando ela estava inativa antes (preserva a semântica original).
          const eraInativo = exist.isActive !== 1;
          await tx.update(obraFuncionarios)
            .set({ isActive: 1, dataFim: null as any })
            .where(eq(obraFuncionarios.id, exist.id));
          return { ok: true, reativado: eraInativo, tipo: "clt" as const };
        }
        await tx.insert(obraFuncionarios).values({
          obraId: input.obraId,
          employeeId: input.employeeId,
          companyId: input.companyId,
          dataInicio: hoje,
          isActive: 1,
        } as any);
        return { ok: true, reativado: false, tipo: "clt" as const };
      });
      } catch (e: any) {
        // Backstop de banco (Rev. 2560): unique violation do índice parcial
        // `uniq_obra_func_active_employee` (≤1 alocação ativa por funcionário).
        if (e?.code === '23505' && String(e?.constraint ?? e?.detail ?? '').includes('uniq_obra_func_active_employee')) {
          throw new TRPCError({ code: "CONFLICT", message: "Este funcionário já está alocado em outra obra (cada funcionário só pode estar em 1 obra ativa). Atualize a tela e tente novamente." });
        }
        throw e;
      }
    }),

  // Rev. 1731 — Acidentes recentes (default últimos 7 dias) que potencialmente exigem DDS de análise (Lei art. 157 CLT, NR-1).
  // Quando obraId é informado, prioriza acidentes daquela obra. D-1 (ontem) recebe flag obrigatorio=true.
  acidentesRecentes: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraIds: z.array(z.number().int().positive()).optional(),
      diasJanela: z.number().int().positive().default(7),
    }))
    .query(async ({ input, ctx }) => {
      try {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // Rev. 1733/1735 — aceita obraIds[] e expande pra todas as duplicatas com mesmo nome canônico
      const inputObraIds = (input.obraIds && input.obraIds.length > 0)
        ? input.obraIds
        : (input.obraId ? [input.obraId] : []);
      const obraIdsConsolidados = inputObraIds.length > 0
        ? await expandObraIdsByCanonicalName(db, input.companyId, inputObraIds)
        : [];
      // Rev. 1731 fix (architect): D-1 calculado em America/Sao_Paulo (regra legal brasileira) — robusto a TZ do servidor.
      const fmtSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      const agora = new Date();
      const hojeIso = fmtSP(agora);
      const ontemIso = fmtSP(new Date(agora.getTime() - 24 * 60 * 60 * 1000));
      const inicioIso = fmtSP(new Date(agora.getTime() - input.diasJanela * 24 * 60 * 60 * 1000));
      const conds: any[] = [
        eq(accidents.companyId, input.companyId),
        isNull(accidents.deletedAt),
        gte(accidents.dataAcidente, inicioIso),
        lte(accidents.dataAcidente, hojeIso), // sem acidentes no futuro
      ];
      if (obraIdsConsolidados.length > 0) {
        conds.push(or(inArray(accidents.obraId, obraIdsConsolidados), isNull(accidents.obraId)));
      }
      const rows = await db.select({
        id: accidents.id,
        dataAcidente: accidents.dataAcidente,
        horaAcidente: accidents.horaAcidente,
        tipoAcidente: accidents.tipoAcidente,
        gravidade: accidents.gravidade,
        localAcidente: accidents.localAcidente,
        parteCorpoAtingida: accidents.parteCorpoAtingida,
        agenteCausador: accidents.agenteCausador,
        descricao: accidents.descricao,
        acaoCorretiva: accidents.acaoCorretiva,
        diasAfastamento: accidents.diasAfastamento,
        employeeId: accidents.employeeId,
        empNome: employees.nomeCompleto,
        obraId: accidents.obraId,
        obraNome: obras.nome,
      }).from(accidents)
        .leftJoin(employees, eq(employees.id, accidents.employeeId))
        .leftJoin(obras, eq(obras.id, accidents.obraId))
        .where(and(...conds))
        .orderBy(desc(accidents.dataAcidente), desc(accidents.id));
      return rows.map((r: any) => ({
        ...r,
        obrigatorio: r.dataAcidente === ontemIso, // D-1 → DDS obrigatório no dia seguinte
      }));
      } catch (e: any) {
        console.error("[DDS acidentesRecentes] FAIL", { input, msg: e?.message, stack: e?.stack });
        throw e;
      }
    }),

  // Rev. 1863 — Dashboard DDS: KPIs agregados em uma chamada (não-N+1).
  // Filtros: companyId, dataInicio/dataFim (default últimos 365 dias), obraId opcional.
  // Retorna: kpis[], sessoesPorMes[], porCategoria[], porObra[], topTemas[],
  // topInstrutores[], statusBreakdown[], coberturaFuncionarios{...}, semDDS[].
  dashboardKpis: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      dataInicio: z.string().optional(), // YYYY-MM-DD
      dataFim: z.string().optional(),
      obraId: z.number().int().positive().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // Janela default: últimos 365 dias até hoje (America/Sao_Paulo)
      const fmtSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      const hojeIso = fmtSP(new Date());
      const ini = input.dataInicio || (() => { const d = new Date(); d.setDate(d.getDate() - 364); return fmtSP(d); })();
      const fim = input.dataFim || hojeIso;

      const condsBase: any[] = [
        eq(ddsSessoes.companyId, input.companyId),
        isNull(ddsSessoes.deletedAt),
        gte(ddsSessoes.data, ini),
        lte(ddsSessoes.data, fim),
      ];
      if (input.obraId) condsBase.push(eq(ddsSessoes.obraId, input.obraId));

      // 1) Sessões no período (com tema p/ categoria)
      // Rev. 1876 — `categoria` prioriza override da sessão (s.categoria) e cai
      // para a do tema vinculado (t.categoria). Assim o dashboard reflete o
      // que o engenheiro definiu por linha no botão Editar Categoria.
      const sessoesPeriodo = await db.select({
        id: ddsSessoes.id,
        data: ddsSessoes.data,
        obraId: ddsSessoes.obraId,
        obraNome: ddsSessoes.obraNome,
        temaId: ddsSessoes.temaId,
        tituloTema: ddsSessoes.tituloTema,
        instrutor: ddsSessoes.instrutor,
        status: ddsSessoes.status,
        categoria: sql<string | null>`COALESCE(${ddsSessoes.categoria}, ${ddsTemas.categoria})`,
      }).from(ddsSessoes)
        // Rev. 1876 — join tenant-scoped (ver listSessoes acima).
        .leftJoin(ddsTemas, and(
          eq(ddsTemas.id, ddsSessoes.temaId),
          eq(ddsTemas.companyId, input.companyId),
          isNull(ddsTemas.deletedAt),
        ))
        .where(and(...condsBase));

      const sessaoIds = sessoesPeriodo.map((s: any) => s.id);

      // 2) Participantes das sessões do período
      const participantes = sessaoIds.length > 0 ? await db.select({
        sessaoId: ddsSessaoFuncionarios.sessaoId,
        employeeId: ddsSessaoFuncionarios.employeeId,
        presente: ddsSessaoFuncionarios.presente,
        assinadoEm: ddsSessaoFuncionarios.assinadoEm,
      }).from(ddsSessaoFuncionarios)
        .where(inArray(ddsSessaoFuncionarios.sessaoId, sessaoIds)) : [];

      // 3) Temas ativos da empresa (count + por categoria)
      const temasAtivos = await db.select({
        categoria: ddsTemas.categoria,
        total: sql<number>`COUNT(*)`,
      }).from(ddsTemas)
        .where(and(
          eq(ddsTemas.companyId, input.companyId),
          eq(ddsTemas.ativo, 1),
          isNull(ddsTemas.deletedAt),
        ))
        .groupBy(ddsTemas.categoria);
      const totalTemasAtivos = temasAtivos.reduce((s: number, r: any) => s + Number(r.total || 0), 0);

      // 4) Funcionários ativos da empresa (universo p/ cobertura)
      const funcAtivosRows = await db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          isNull(employees.deletedAt),
          notInArray(employees.status, ["Desligado", "Lista_Negra", "ListaNegra"]),
        ));
      const totalFuncAtivos = funcAtivosRows.length;
      const funcAtivosIds = new Set(funcAtivosRows.map((f: any) => f.id));

      // ===== Agregações em memória =====
      const totalSessoes = sessoesPeriodo.length;
      const sessoesFinalizadas = sessoesPeriodo.filter((s: any) => s.status === "finalizada").length;
      const sessoesAbertas = sessoesPeriodo.filter((s: any) => s.status === "aberta").length;
      const sessoesCanceladas = sessoesPeriodo.filter((s: any) => s.status === "cancelada").length;

      // Janela últimos 30 dias (sub-período fixo p/ KPI)
      const ini30 = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return fmtSP(d); })();
      const sessoes30d = sessoesPeriodo.filter((s: any) => s.data >= ini30).length;

      // Total participantes / presentes / assinados
      const totalParticipantes = participantes.length;
      const totalPresentes = participantes.filter((p: any) => p.presente === 1).length;
      const totalAssinados = participantes.filter((p: any) => p.assinadoEm !== null).length;
      const taxaPresenca = totalParticipantes > 0 ? (totalPresentes / totalParticipantes) * 100 : 0;
      const taxaAssinatura = totalPresentes > 0 ? (totalAssinados / totalPresentes) * 100 : 0;

      // Funcionários únicos atendidos (presentes) no período
      const funcsAtendidos = new Set<number>();
      participantes.forEach((p: any) => { if (p.presente === 1 && p.employeeId) funcsAtendidos.add(p.employeeId); });
      const funcionariosAtendidos = funcsAtendidos.size;

      // Funcionários ativos sem NENHUM DDS no período (gap de cobertura)
      const semDDSIds: number[] = [];
      funcAtivosIds.forEach((id) => { if (!funcsAtendidos.has(id)) semDDSIds.push(id); });
      const semDDSLista = funcAtivosRows
        .filter((f: any) => !funcsAtendidos.has(f.id))
        .slice(0, 50)
        .map((f: any) => ({ id: f.id, nome: f.nome, funcao: f.funcao }));

      // Sessões por mês (bucket YYYY-MM)
      const porMesMap = new Map<string, { sessoes: number; participantes: number }>();
      sessoesPeriodo.forEach((s: any) => {
        const ym = (s.data || "").slice(0, 7);
        if (!ym) return;
        const cur = porMesMap.get(ym) || { sessoes: 0, participantes: 0 };
        cur.sessoes += 1;
        porMesMap.set(ym, cur);
      });
      participantes.forEach((p: any) => {
        const sess = sessoesPeriodo.find((s: any) => s.id === p.sessaoId);
        if (!sess) return;
        const ym = (sess.data || "").slice(0, 7);
        if (!ym) return;
        const cur = porMesMap.get(ym) || { sessoes: 0, participantes: 0 };
        cur.participantes += (p.presente === 1 ? 1 : 0);
        porMesMap.set(ym, cur);
      });
      const sessoesPorMes = Array.from(porMesMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, v]) => ({ mes, sessoes: v.sessoes, participantes: v.participantes }));

      // Por categoria (do tema)
      const porCatMap = new Map<string, number>();
      sessoesPeriodo.forEach((s: any) => {
        const cat = (s.categoria || "SEM_TEMA") as string;
        porCatMap.set(cat, (porCatMap.get(cat) || 0) + 1);
      });
      const porCategoria = Array.from(porCatMap.entries())
        .map(([categoria, sessoes]) => ({ categoria, sessoes }))
        .sort((a, b) => b.sessoes - a.sessoes);

      // Por obra (top 10)
      const porObraMap = new Map<string, number>();
      sessoesPeriodo.forEach((s: any) => {
        const k = s.obraNome || "(sem obra)";
        porObraMap.set(k, (porObraMap.get(k) || 0) + 1);
      });
      const porObra = Array.from(porObraMap.entries())
        .map(([obra, sessoes]) => ({ obra, sessoes }))
        .sort((a, b) => b.sessoes - a.sessoes)
        .slice(0, 10);

      // Top 10 temas mais aplicados
      const porTemaMap = new Map<string, number>();
      sessoesPeriodo.forEach((s: any) => {
        const k = s.tituloTema || "(sem título)";
        porTemaMap.set(k, (porTemaMap.get(k) || 0) + 1);
      });
      const topTemas = Array.from(porTemaMap.entries())
        .map(([tema, sessoes]) => ({ tema, sessoes }))
        .sort((a, b) => b.sessoes - a.sessoes)
        .slice(0, 10);

      // Top instrutores
      const porInstrutorMap = new Map<string, number>();
      sessoesPeriodo.forEach((s: any) => {
        const k = (s.instrutor || "").trim() || "(sem instrutor)";
        porInstrutorMap.set(k, (porInstrutorMap.get(k) || 0) + 1);
      });
      const topInstrutores = Array.from(porInstrutorMap.entries())
        .map(([instrutor, sessoes]) => ({ instrutor, sessoes }))
        .sort((a, b) => b.sessoes - a.sessoes)
        .slice(0, 10);

      // Heatmap dia da semana × hora (simples: por dia da semana)
      const dows = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const porDowMap = new Map<number, number>();
      sessoesPeriodo.forEach((s: any) => {
        if (!s.data) return;
        const d = new Date(s.data + "T12:00:00-03:00");
        const dow = d.getDay();
        porDowMap.set(dow, (porDowMap.get(dow) || 0) + 1);
      });
      const porDiaSemana = dows.map((label, i) => ({ dia: label, sessoes: porDowMap.get(i) || 0 }));

      // Cobertura: % de funcionários ativos que receberam ao menos 1 DDS no período
      const coberturaPct = totalFuncAtivos > 0 ? (funcionariosAtendidos / totalFuncAtivos) * 100 : 0;

      return {
        periodo: { dataInicio: ini, dataFim: fim },
        kpis: {
          totalSessoes,
          sessoesFinalizadas,
          sessoesAbertas,
          sessoesCanceladas,
          sessoes30d,
          totalTemasAtivos,
          totalParticipantes,
          totalPresentes,
          totalAssinados,
          taxaPresenca: Number(taxaPresenca.toFixed(1)),
          taxaAssinatura: Number(taxaAssinatura.toFixed(1)),
          funcionariosAtendidos,
          totalFuncAtivos,
          coberturaPct: Number(coberturaPct.toFixed(1)),
          funcionariosSemDDS: semDDSIds.length,
        },
        temasPorCategoria: temasAtivos.map((r: any) => ({ categoria: r.categoria, total: Number(r.total) })),
        sessoesPorMes,
        porCategoria,
        porObra,
        topTemas,
        topInstrutores,
        porDiaSemana,
        semDDS: semDDSLista,
        // Rev. 1872 — lista bruta para drill-down dos gráficos do Dashboard DDS.
        // Inclui contagens de participantes/presentes/assinados pré-agregadas para evitar N+1 no client.
        sessoesDetalhe: (() => {
          const contByS = new Map<number, { total: number; presentes: number; assinados: number }>();
          participantes.forEach((p: any) => {
            const cur = contByS.get(p.sessaoId) || { total: 0, presentes: 0, assinados: 0 };
            cur.total += 1;
            if (p.presente === 1) cur.presentes += 1;
            if (p.assinadoEm) cur.assinados += 1;
            contByS.set(p.sessaoId, cur);
          });
          return sessoesPeriodo.map((s: any) => {
            const c = contByS.get(s.id) || { total: 0, presentes: 0, assinados: 0 };
            const mes = (s.data || "").slice(0, 7);
            let dow = -1;
            if (s.data) { try { dow = new Date(s.data + "T12:00:00-03:00").getDay(); } catch { /* noop */ } }
            return {
              id: s.id,
              data: s.data,
              obraNome: s.obraNome || "(sem obra)",
              tituloTema: s.tituloTema || "(sem título)",
              categoria: (s.categoria || "SEM_TEMA") as string,
              instrutor: (s.instrutor || "").trim() || "(sem instrutor)",
              status: s.status,
              mes,
              dow,
              totalParticipantes: c.total,
              presentes: c.presentes,
              assinados: c.assinados,
            };
          });
        })(),
      };
    }),

  getSessao: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      try {
        assertCompanyAccess(ctx, input.companyId);
        const db = (await getDb())!;
        // Rev. 1753 — projeta colunas explícitas da sessão (igual aos funcionários).
        // Antes usava `select()` que trazia TUDO; algum campo problemático no spread
        // `{ ...s, ... }` causava "Cannot convert undefined or null to object" quando
        // o driver devolvia metadados fora do padrão (ex.: getter null em coluna nova).
        const [s] = await db.select({
          id: ddsSessoes.id,
          companyId: ddsSessoes.companyId,
          obraId: ddsSessoes.obraId,
          obraNome: ddsSessoes.obraNome,
          data: ddsSessoes.data,
          hora: ddsSessoes.hora,
          temaId: ddsSessoes.temaId,
          tituloTema: ddsSessoes.tituloTema,
          conteudoMd: ddsSessoes.conteudoMd,
          instrutor: ddsSessoes.instrutor,
          instrutorCpf: ddsSessoes.instrutorCpf,
          instrutorCodigoInterno: ddsSessoes.instrutorCodigoInterno,
          // Rev. 1876 — override de categoria por sessão.
          categoria: ddsSessoes.categoria,
          local: ddsSessoes.local,
          observacoes: ddsSessoes.observacoes,
          status: ddsSessoes.status,
          finalizadaEm: ddsSessoes.finalizadaEm,
          createdBy: ddsSessoes.createdBy,
          createdAt: ddsSessoes.createdAt,
          updatedAt: ddsSessoes.updatedAt,
        }).from(ddsSessoes)
          .where(and(eq(ddsSessoes.id, input.id), eq(ddsSessoes.companyId, input.companyId)));
        if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
        // Rev. 1748 — não retornamos `assinaturaImg` (PNG dataURL base64 até 2MB/linha).
        // Com 10+ funcionários assinados o payload chega a 20+MB e derruba o batch tRPC.
        // Devolvemos só `temAssinatura: boolean` calculado em SQL.
        const funcs = await db.select({
          id: ddsSessaoFuncionarios.id,
          sessaoId: ddsSessaoFuncionarios.sessaoId,
          employeeId: ddsSessaoFuncionarios.employeeId,
          nome: ddsSessaoFuncionarios.nome,
          cpf: ddsSessaoFuncionarios.cpf,
          funcao: ddsSessaoFuncionarios.funcao,
          presente: ddsSessaoFuncionarios.presente,
          assinadoEm: ddsSessaoFuncionarios.assinadoEm,
          assinaturaTipo: ddsSessaoFuncionarios.assinaturaTipo,
          createdAt: ddsSessaoFuncionarios.createdAt,
          temAssinatura: sql<boolean>`(${ddsSessaoFuncionarios.assinaturaImg} IS NOT NULL AND length(${ddsSessaoFuncionarios.assinaturaImg}) > 0)`,
        }).from(ddsSessaoFuncionarios)
          .where(eq(ddsSessaoFuncionarios.sessaoId, input.id))
          .orderBy(ddsSessaoFuncionarios.nome);
        // Rev. 2024 — anexa terceiros participantes (ddsParticipacoesTerceiros
        // filtrado por sessaoId). Faz LEFT JOIN com funcionariosTerceiros pra
        // pegar dados atualizados (nome/cpf/foto). try/catch defensivo: se
        // falhar (módulo Terceiros não migrado, coluna sessao_id ainda não
        // garantida em tenant antigo, etc.), retorna lista vazia — getSessao
        // NUNCA pode quebrar por causa de terceiros.
        let terceiros: any[] = [];
        try {
          terceiros = await db.select({
            id: ddsParticipacoesTerceiros.id,
            funcTerceiroId: ddsParticipacoesTerceiros.funcTerceiroId,
            nome: funcionariosTerceiros.nome,
            cpf: funcionariosTerceiros.cpf,
            funcao: funcionariosTerceiros.funcao,
            empresaTerceiraId: funcionariosTerceiros.empresaTerceiraId,
            fotoUrl: funcionariosTerceiros.fotoUrl,
            createdAt: ddsParticipacoesTerceiros.createdAt,
            observacoes: ddsParticipacoesTerceiros.observacoes,
          }).from(ddsParticipacoesTerceiros)
            .leftJoin(funcionariosTerceiros, eq(funcionariosTerceiros.id, ddsParticipacoesTerceiros.funcTerceiroId))
            .where(and(
              eq(ddsParticipacoesTerceiros.companyId, input.companyId),
              eq(ddsParticipacoesTerceiros.sessaoId, input.id),
              isNull(ddsParticipacoesTerceiros.deletedAt),
            ))
            .orderBy(funcionariosTerceiros.nome);
        } catch (e: any) {
          console.warn("[dds.getSessao] terceiros falhou (seguindo só CLT):", e?.message);
        }
        return { ...s, funcionarios: funcs ?? [], terceiros };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        console.error("[dds.getSessao] erro detalhado", { id: input.id, companyId: input.companyId, msg: e?.message, name: e?.name, stack: e?.stack });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao carregar sessão" });
      }
    }),

  // Rev. 1748 — endpoint sob demanda pra puxar a imagem da assinatura (PNG base64).
  // Usado quando o usuário clica na miniatura pra reabrir o pad de assinatura.
  getAssinaturaImg: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      sessaoId: z.number().int().positive(),
      funcionarioId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.select({ img: ddsSessaoFuncionarios.assinaturaImg })
        .from(ddsSessaoFuncionarios)
        .innerJoin(ddsSessoes, eq(ddsSessaoFuncionarios.sessaoId, ddsSessoes.id))
        .where(and(
          eq(ddsSessaoFuncionarios.id, input.funcionarioId),
          eq(ddsSessaoFuncionarios.sessaoId, input.sessaoId),
          eq(ddsSessoes.companyId, input.companyId),
        ));
      return { assinaturaImg: row?.img ?? null };
    }),

  criarSessao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      data: z.string().min(10),
      hora: z.string().optional(),
      temaId: z.number().int().positive().optional(),
      tituloTema: z.string().min(3).max(255),
      conteudoMd: z.string().optional(),
      instrutor: z.string().max(255).optional(),
      instrutorCpf: z.string().max(14).optional(),
      instrutorCodigoInterno: z.string().max(50).optional(),
      local: z.string().max(255).optional(),
      observacoes: z.string().optional(),
      funcionarioIds: z.array(z.number().int().positive()).optional(),
      // Rev. 2021 — Terceiros vinculados à obra também participam do DDS.
      funcTerceiroIds: z.array(z.number().int().positive()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      let obraNome: string | null = null;
      if (input.obraId) {
        const [o] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, input.obraId));
        obraNome = o?.nome ?? null;
      }
      const [sessao] = await db.insert(ddsSessoes).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        obraNome,
        data: input.data,
        hora: input.hora ?? null,
        temaId: input.temaId ?? null,
        tituloTema: input.tituloTema,
        conteudoMd: input.conteudoMd ?? null,
        instrutor: input.instrutor ?? null,
        instrutorCpf: input.instrutorCpf ?? null,
        instrutorCodigoInterno: input.instrutorCodigoInterno ?? null,
        local: input.local ?? null,
        observacoes: input.observacoes ?? null,
        status: "aberta",
        createdBy: (ctx.user as any)?.id ?? null,
      } as any).returning();
      // pré-carrega funcionários se vieram ids
      // Rev. 1730 — hardening de authz: força mesma companyId, exclui soft-deleted
      // e bloqueia status terminais (Desligado/Lista_Negra). Dedupe via Set.
      if (input.funcionarioIds && input.funcionarioIds.length > 0) {
        const idsUnicos = Array.from(new Set(input.funcionarioIds));
        const emps = await db.select({
          id: employees.id, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao,
        }).from(employees).where(and(
          inArray(employees.id, idsUnicos),
          eq(employees.companyId, input.companyId),
          isNull(employees.deletedAt),
          notInArray(employees.status, ["Desligado", "Lista_Negra", "ListaNegra"] as any),
        ));
        if (emps.length > 0) {
          await db.insert(ddsSessaoFuncionarios).values(
            emps.map((e: any) => ({
              sessaoId: sessao.id,
              employeeId: e.id,
              nome: e.nome,
              cpf: e.cpf ?? null,
              funcao: e.funcao ?? null,
              presente: 1,
            } as any))
          );
        }
      }
      // Rev. 2021 — grava participação dos terceiros marcados na tabela
      // dedicada `ddsParticipacoesTerceiros` (criada na Rev. 2004). Mesmas
      // proteções: dedupe, scope por companyId, só ativos não soft-deleted.
      // Falha não propaga (terceiros é módulo opcional) — toast separado avisa.
      if (input.funcTerceiroIds && input.funcTerceiroIds.length > 0) {
        try {
          const tercIds = Array.from(new Set(input.funcTerceiroIds));
          const tercs = await db.select({
            id: funcionariosTerceiros.id,
          }).from(funcionariosTerceiros).where(and(
            inArray(funcionariosTerceiros.id, tercIds),
            eq(funcionariosTerceiros.companyId, input.companyId),
            isNull(funcionariosTerceiros.deletedAt),
          ));
          if (tercs.length > 0) {
            await db.insert(ddsParticipacoesTerceiros).values(
              tercs.map((t: any) => ({
                companyId: input.companyId,
                funcTerceiroId: t.id,
                // Rev. 2024 — vincula participação à sessão coletiva pro
                // detalhe da sessão listar os terceiros direto, sem heurística.
                sessaoId: sessao.id,
                dataDds: input.data,
                tema: input.tituloTema,
                instrutor: input.instrutor ?? null,
                obraId: input.obraId ?? null,
                obraNome,
                observacoes: input.observacoes ?? null,
                createdBy: (ctx.user as any)?.id ?? null,
              } as any))
            );
          }
        } catch (e: any) {
          console.warn("[DDS criarSessao] gravação de terceiros falhou:", e?.message);
        }
      }
      return sessao;
    }),

  atualizarSessao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      id: z.number().int().positive(),
      data: z.string().optional(),
      hora: z.string().optional(),
      tituloTema: z.string().optional(),
      conteudoMd: z.string().optional(),
      instrutor: z.string().optional(),
      instrutorCpf: z.string().optional(),
      instrutorCodigoInterno: z.string().max(50).optional(),
      local: z.string().optional(),
      observacoes: z.string().optional(),
      status: z.enum(["aberta", "finalizada", "cancelada"]).optional(),
      // Rev. 1876 — override de categoria por sessão.
      // `null` explícito limpa o override (volta a herdar do tema).
      categoria: z.enum(["NR", "CAMPANHA", "VACINACAO", "LIVRE"]).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const { id, companyId, ...patch } = input;
      const [row] = await db.update(ddsSessoes)
        .set({ ...patch, updatedAt: sql`NOW()`, ...(patch.status === "finalizada" ? { finalizadaEm: sql`NOW()` } : {}) } as any)
        .where(and(eq(ddsSessoes.id, id), eq(ddsSessoes.companyId, companyId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
      return row;
    }),

  excluirSessao: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        assertCompanyAccess(ctx, input.companyId);
        const db = (await getDb())!;
        const [row] = await db.update(ddsSessoes)
          .set({ deletedAt: sql`NOW()` } as any)
          .where(and(eq(ddsSessoes.id, input.id), eq(ddsSessoes.companyId, input.companyId)))
          .returning({ id: ddsSessoes.id });
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada ou já excluída." });
        }
        return { ok: true, id: row.id };
      } catch (e: any) {
        console.error("[dds.excluirSessao] erro", { id: input.id, companyId: input.companyId, msg: e?.message, stack: e?.stack });
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao excluir sessão" });
      }
    }),

  // Rev. 1752 — exclusão em lote (multi-seleção na lista).
  excluirSessoes: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), ids: z.array(z.number().int().positive()).min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      try {
        assertCompanyAccess(ctx, input.companyId);
        const db = (await getDb())!;
        const rows = await db.update(ddsSessoes)
          .set({ deletedAt: sql`NOW()` } as any)
          .where(and(inArray(ddsSessoes.id, input.ids), eq(ddsSessoes.companyId, input.companyId)))
          .returning({ id: ddsSessoes.id });
        return { ok: true, excluidos: rows.length, ids: rows.map(r => r.id) };
      } catch (e: any) {
        console.error("[dds.excluirSessoes] erro", { ids: input.ids, companyId: input.companyId, msg: e?.message });
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao excluir sessões" });
      }
    }),

  // Adiciona / atualiza lista de presença em lote.
  marcarPresenca: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      sessaoId: z.number().int().positive(),
      adicionar: z.array(z.object({
        employeeId: z.number().int().positive().optional(),
        nome: z.string().min(2),
        cpf: z.string().optional(),
        funcao: z.string().optional(),
        presente: z.number().int().min(0).max(1).default(1),
      })).optional(),
      atualizar: z.array(z.object({
        id: z.number().int().positive(),
        presente: z.number().int().min(0).max(1).optional(),
        observacao: z.string().optional(),
      })).optional(),
      remover: z.array(z.number().int().positive()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // valida sessão
      const [s] = await db.select({ id: ddsSessoes.id }).from(ddsSessoes)
        .where(and(eq(ddsSessoes.id, input.sessaoId), eq(ddsSessoes.companyId, input.companyId)));
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
      if (input.adicionar?.length) {
        await db.insert(ddsSessaoFuncionarios).values(
          input.adicionar.map(a => ({
            sessaoId: input.sessaoId,
            employeeId: a.employeeId ?? null,
            nome: a.nome,
            cpf: a.cpf ?? null,
            funcao: a.funcao ?? null,
            presente: a.presente,
          } as any))
        );
      }
      if (input.atualizar?.length) {
        for (const u of input.atualizar) {
          await db.update(ddsSessaoFuncionarios).set({
            ...(u.presente !== undefined ? { presente: u.presente } : {}),
            ...(u.observacao !== undefined ? { observacao: u.observacao } : {}),
          } as any).where(eq(ddsSessaoFuncionarios.id, u.id));
        }
      }
      if (input.remover?.length) {
        await db.delete(ddsSessaoFuncionarios)
          .where(inArray(ddsSessaoFuncionarios.id, input.remover));
      }
      return { ok: true };
    }),

  // Rev. 1746 — Registra assinatura desenhada na tela (canvas → PNG dataURL).
  // Usado pelo modal de assinatura por funcionário (touch no iPad / mouse no desktop).
  registrarAssinatura: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      sessaoId: z.number().int().positive(),
      funcionarioId: z.number().int().positive(),
      assinaturaImg: z.string().min(50).max(2_000_000), // dataURL base64 PNG (~limite 2MB)
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // valida que a sessão pertence à empresa e está aberta
      const [s] = await db.select({ id: ddsSessoes.id, status: ddsSessoes.status })
        .from(ddsSessoes)
        .where(and(eq(ddsSessoes.id, input.sessaoId), eq(ddsSessoes.companyId, input.companyId)));
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
      if (s.status !== "aberta") throw new TRPCError({ code: "BAD_REQUEST", message: "Sessão já finalizada — reabra para coletar assinaturas." });
      // valida que o funcionário pertence à sessão
      const [f] = await db.select({ id: ddsSessaoFuncionarios.id })
        .from(ddsSessaoFuncionarios)
        .where(and(eq(ddsSessaoFuncionarios.id, input.funcionarioId), eq(ddsSessaoFuncionarios.sessaoId, input.sessaoId)));
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não está na lista da sessão" });
      await db.update(ddsSessaoFuncionarios).set({
        assinaturaImg: input.assinaturaImg,
        assinaturaTipo: "desenhada",
        assinadoEm: sql`NOW()` as any,
        presente: 1, // assinatura implica presença
      } as any).where(eq(ddsSessaoFuncionarios.id, input.funcionarioId));
      return { ok: true };
    }),

  removerAssinatura: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      sessaoId: z.number().int().positive(),
      funcionarioId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [s] = await db.select({ id: ddsSessoes.id, status: ddsSessoes.status })
        .from(ddsSessoes)
        .where(and(eq(ddsSessoes.id, input.sessaoId), eq(ddsSessoes.companyId, input.companyId)));
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
      if (s.status !== "aberta") throw new TRPCError({ code: "BAD_REQUEST", message: "Sessão já finalizada — reabra para alterar assinaturas." });
      await db.update(ddsSessaoFuncionarios).set({
        assinaturaImg: null,
        assinaturaTipo: null,
        assinadoEm: null,
      } as any).where(and(
        eq(ddsSessaoFuncionarios.id, input.funcionarioId),
        eq(ddsSessaoFuncionarios.sessaoId, input.sessaoId),
      ));
      return { ok: true };
    }),

  getSessaoPdfData: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [s] = await db.select({
        id: ddsSessoes.id,
        companyId: ddsSessoes.companyId,
        obraId: ddsSessoes.obraId,
        obraNome: ddsSessoes.obraNome,
        data: ddsSessoes.data,
        hora: ddsSessoes.hora,
        temaId: ddsSessoes.temaId,
        tituloTema: ddsSessoes.tituloTema,
        conteudoMd: ddsSessoes.conteudoMd,
        instrutor: ddsSessoes.instrutor,
        instrutorCpf: ddsSessoes.instrutorCpf,
        local: ddsSessoes.local,
        observacoes: ddsSessoes.observacoes,
        status: ddsSessoes.status,
        finalizadaEm: ddsSessoes.finalizadaEm,
        categoria: ddsSessoes.categoria,
      }).from(ddsSessoes)
        .where(and(eq(ddsSessoes.id, input.id), eq(ddsSessoes.companyId, input.companyId)));
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });

      const funcs = await db.select({
        id: ddsSessaoFuncionarios.id,
        nome: ddsSessaoFuncionarios.nome,
        cpf: ddsSessaoFuncionarios.cpf,
        funcao: ddsSessaoFuncionarios.funcao,
        presente: ddsSessaoFuncionarios.presente,
        assinadoEm: ddsSessaoFuncionarios.assinadoEm,
        fotoUrl: employees.fotoUrl,
      }).from(ddsSessaoFuncionarios)
        .leftJoin(employees, eq(employees.id, ddsSessaoFuncionarios.employeeId))
        .where(eq(ddsSessaoFuncionarios.sessaoId, input.id))
        .orderBy(ddsSessaoFuncionarios.nome);

      let terceiros: any[] = [];
      try {
        terceiros = await db.select({
          id: ddsParticipacoesTerceiros.id,
          nome: funcionariosTerceiros.nome,
          cpf: funcionariosTerceiros.cpf,
          funcao: funcionariosTerceiros.funcao,
          fotoUrl: funcionariosTerceiros.fotoUrl,
        }).from(ddsParticipacoesTerceiros)
          .leftJoin(funcionariosTerceiros, eq(funcionariosTerceiros.id, ddsParticipacoesTerceiros.funcTerceiroId))
          .where(and(
            eq(ddsParticipacoesTerceiros.companyId, input.companyId),
            eq(ddsParticipacoesTerceiros.sessaoId, input.id),
            isNull(ddsParticipacoesTerceiros.deletedAt),
          ))
          .orderBy(funcionariosTerceiros.nome);
      } catch { /* módulo terceiros opcional */ }

      return { ...s, funcionarios: funcs ?? [], terceiros };
    }),
});
