
function pad(str: string, len: number, fill = ' ', align: 'left' | 'right' = 'left'): string {
  const s = (str || '').substring(0, len);
  if (align === 'right') return s.padStart(len, fill);
  return s.padEnd(len, fill);
}

function numPad(val: number | string, len: number): string {
  const n = typeof val === 'number' ? Math.round(val) : parseInt(String(val).replace(/\D/g, '') || '0', 10);
  return String(n).padStart(len, '0').substring(0, len);
}

function onlyDigits(str: string): string {
  return (str || '').replace(/\D/g, '');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '00000000';
  const d = new Date(dateStr + 'T12:00:00Z');
  if (isNaN(d.getTime())) return '00000000';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return dd + mm + yyyy;
}

function today8(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return dd + mm + yyyy;
}

function todayHHMMSS(): string {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
}

export interface CnabEmpresa {
  cnpj: string;
  razaoSocial: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  convenio: string;
}

export interface CnabFuncionario {
  nome: string;
  cpf: string;
  banco: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  valorLiquido: number;
  dataPagamento: string;
  tipoChavePix?: string;
  chavePix?: string;
}

function getBankCode(banco: string): string {
  const map: Record<string, string> = {
    'caixa': '104',
    'santander': '033',
    'bradesco': '237',
    'itau': '341',
    'itaú': '341',
    'banco do brasil': '001',
    'c6': '336',
    'nubank': '260',
    'inter': '077',
  };
  const lower = (banco || '').toLowerCase();
  for (const [key, code] of Object.entries(map)) {
    if (lower.includes(key)) return code;
  }
  return '000';
}

function tipoCamara(codigoBancoEmpresa: string, codigoBancoFunc: string): string {
  if (codigoBancoEmpresa === codigoBancoFunc) return '018';
  return '700';
}

function formaPagamento(codigoBancoEmpresa: string, codigoBancoFunc: string): string {
  if (codigoBancoEmpresa === codigoBancoFunc) return '01';
  return '41';
}

export function gerarCnab240(
  empresa: CnabEmpresa,
  funcionarios: CnabFuncionario[],
  sequencialArquivo: number = 1
): string {
  const lines: string[] = [];
  const cnpjDigits = onlyDigits(empresa.cnpj);
  const agEmpresa = onlyDigits(empresa.agencia);
  const contaEmpresa = onlyDigits(empresa.conta);
  const codBanco = empresa.codigoBanco || '000';
  const convenio = empresa.convenio || '';
  const nomeBanco = codBanco === '104' ? 'CAIXA ECONOMICA FEDERAL' : codBanco === '033' ? 'BANCO SANTANDER' : 'BANCO';

  let headerArq = '';
  headerArq += pad(codBanco, 3, '0', 'right');       // 1-3: Código do banco
  headerArq += '0000';                                 // 4-7: Lote de serviço (0000 = header arquivo)
  headerArq += '0';                                    // 8: Tipo de registro (0 = header arquivo)
  headerArq += pad('', 9);                             // 9-17: Brancos
  headerArq += '2';                                    // 18: Tipo de inscrição da empresa (2=CNPJ)
  headerArq += numPad(cnpjDigits, 14);                 // 19-32: CNPJ
  headerArq += pad(convenio, 20);                      // 33-52: Código do convênio
  headerArq += numPad(agEmpresa, 5);                   // 53-57: Agência
  headerArq += pad(' ', 1);                            // 58: Dígito agência
  headerArq += numPad(contaEmpresa, 12);               // 59-70: Conta
  headerArq += pad(' ', 1);                            // 71: Dígito conta
  headerArq += pad(' ', 1);                            // 72: Dígito verificador ag/conta
  headerArq += pad(empresa.razaoSocial.toUpperCase(), 30); // 73-102: Nome da empresa
  headerArq += pad(nomeBanco, 30);                     // 103-132: Nome do banco
  headerArq += pad('', 10);                            // 133-142: Brancos
  headerArq += '1';                                    // 143: Código remessa (1=remessa)
  headerArq += today8();                               // 144-151: Data de geração
  headerArq += todayHHMMSS();                          // 152-157: Hora de geração
  headerArq += numPad(sequencialArquivo, 6);           // 158-163: Sequencial do arquivo
  headerArq += '087';                                  // 164-166: Versão do layout (087)
  headerArq += numPad(0, 5);                           // 167-171: Densidade de gravação
  headerArq += pad('', 20);                            // 172-191: Reservado banco
  headerArq += pad('', 20);                            // 192-211: Reservado empresa
  headerArq += pad('', 29);                            // 212-240: Brancos
  lines.push(headerArq);

  let headerLote = '';
  headerLote += pad(codBanco, 3, '0', 'right');       // 1-3: Código do banco
  headerLote += '0001';                                // 4-7: Lote de serviço (0001)
  headerLote += '1';                                   // 8: Tipo de registro (1 = header lote)
  headerLote += 'C';                                   // 9: Tipo de operação (C = crédito)
  headerLote += '30';                                  // 10-11: Tipo de serviço (30 = pagamento salários)
  headerLote += '01';                                  // 12-13: Forma de lançamento (01 = crédito em conta)
  headerLote += '046';                                 // 14-16: Versão layout lote
  headerLote += ' ';                                   // 17: Branco
  headerLote += '2';                                   // 18: Tipo de inscrição da empresa
  headerLote += numPad(cnpjDigits, 14);                // 19-32: CNPJ
  headerLote += pad(convenio, 20);                     // 33-52: Convênio
  headerLote += numPad(agEmpresa, 5);                  // 53-57: Agência
  headerLote += pad(' ', 1);                           // 58: Dígito agência
  headerLote += numPad(contaEmpresa, 12);              // 59-70: Conta
  headerLote += pad(' ', 1);                           // 71: Dígito conta
  headerLote += pad(' ', 1);                           // 72: Dígito verificador ag/conta
  headerLote += pad(empresa.razaoSocial.toUpperCase(), 30); // 73-102: Nome da empresa
  headerLote += pad('FOLHA DE PAGAMENTO', 40);         // 103-142: Mensagem 1
  headerLote += pad('', 40);                           // 143-182: Mensagem 2
  headerLote += numPad(sequencialArquivo, 8);          // 183-190: Número remessa/retorno
  headerLote += today8();                              // 191-198: Data de gravação
  headerLote += '00000000';                            // 199-206: Data do crédito
  headerLote += pad('', 33);                           // 207-239: Brancos
  headerLote += ' ';                                   // 240: Brancos
  lines.push(headerLote);

  let seqRegistro = 0;
  let totalValorLote = 0;

  for (const func of funcionarios) {
    seqRegistro++;
    const funcCpf = onlyDigits(func.cpf);
    const funcAg = onlyDigits(func.agencia);
    const funcConta = onlyDigits(func.conta);
    const funcCodBanco = func.codigoBanco || getBankCode(func.banco);
    const valorCentavos = Math.round(func.valorLiquido * 100);
    totalValorLote += valorCentavos;
    const dataPag = formatDate(func.dataPagamento);

    const camara = tipoCamara(codBanco, funcCodBanco);
    const forma = formaPagamento(codBanco, funcCodBanco);

    let segA = '';
    segA += pad(codBanco, 3, '0', 'right');            // 1-3: Código do banco
    segA += '0001';                                     // 4-7: Lote
    segA += '3';                                        // 8: Tipo registro (3 = detalhe)
    segA += numPad(seqRegistro, 5);                     // 9-13: Sequencial do registro
    segA += 'A';                                        // 14: Código segmento
    segA += '0';                                        // 15: Tipo de movimento (0 = inclusão)
    segA += '00';                                       // 16-17: Código de instrução
    segA += numPad(camara, 3);                          // 18-20: Câmara de compensação
    segA += numPad(funcCodBanco, 3);                    // 21-23: Código banco favorecido
    segA += numPad(funcAg, 5);                          // 24-28: Agência favorecido
    segA += pad(' ', 1);                                // 29: Dígito agência
    segA += numPad(funcConta, 12);                      // 30-41: Conta favorecido
    segA += pad(' ', 1);                                // 42: Dígito conta
    segA += pad(' ', 1);                                // 43: Dígito verificador ag/conta
    segA += pad(func.nome.toUpperCase(), 30);           // 44-73: Nome favorecido
    segA += pad('', 20);                                // 74-93: Nº documento atribuído empresa
    segA += dataPag;                                    // 94-101: Data do pagamento
    segA += pad('BRL', 3);                              // 102-104: Tipo moeda
    segA += numPad(0, 15);                              // 105-119: Quantidade moeda
    segA += numPad(valorCentavos, 15);                  // 120-134: Valor do pagamento
    segA += pad('', 20);                                // 135-154: Nº documento banco
    segA += '00000000';                                 // 155-162: Data real efetivação
    segA += numPad(0, 15);                              // 163-177: Valor real efetivação
    segA += pad('', 40);                                // 178-217: Informações complementares
    segA += numPad(forma, 2);                           // 218-219: Finalidade DOC/TED
    segA += pad('', 5);                                 // 220-224: Branco / código finalidade complementar
    segA += pad('', 3);                                 // 225-227: Branco / aviso ao favorecido
    segA += pad('', 10);                                // 228-237: Códigos ISPB
    segA += pad('', 3);                                 // 238-240: Brancos
    lines.push(segA);

    seqRegistro++;
    let segB = '';
    segB += pad(codBanco, 3, '0', 'right');            // 1-3: Código do banco
    segB += '0001';                                     // 4-7: Lote
    segB += '3';                                        // 8: Tipo registro
    segB += numPad(seqRegistro, 5);                     // 9-13: Sequencial
    segB += 'B';                                        // 14: Código segmento
    segB += pad('', 3);                                 // 15-17: Brancos
    segB += '1';                                        // 18: Tipo inscrição favorecido (1=CPF)
    segB += numPad(funcCpf, 14);                        // 19-32: CPF
    segB += pad('', 30);                                // 33-62: Logradouro
    segB += numPad(0, 5);                               // 63-67: Número
    segB += pad('', 15);                                // 68-82: Complemento
    segB += pad('', 15);                                // 83-97: Bairro
    segB += pad('', 20);                                // 98-117: Cidade
    segB += numPad(0, 5);                               // 118-122: CEP
    segB += pad('', 3);                                 // 123-125: Complemento CEP
    segB += pad('', 2);                                 // 126-127: UF
    segB += '00000000';                                 // 128-135: Data do vencimento
    segB += numPad(valorCentavos, 15);                  // 136-150: Valor do documento
    segB += numPad(0, 15);                              // 151-165: Abatimento
    segB += numPad(0, 15);                              // 166-180: Desconto
    segB += numPad(0, 15);                              // 181-195: Mora
    segB += numPad(0, 15);                              // 196-210: Multa
    segB += pad('', 15);                                // 211-225: Código documento favorecido
    segB += pad('', 15);                                // 226-240: Brancos
    lines.push(segB);
  }

  let trailerLote = '';
  trailerLote += pad(codBanco, 3, '0', 'right');       // 1-3: Código do banco
  trailerLote += '0001';                                // 4-7: Lote
  trailerLote += '5';                                   // 8: Tipo de registro (5 = trailer lote)
  trailerLote += pad('', 9);                            // 9-17: Brancos
  trailerLote += numPad(seqRegistro + 2, 6);            // 18-23: Qtd registros no lote
  trailerLote += numPad(totalValorLote, 18);            // 24-41: Somatória valores
  trailerLote += numPad(0, 18);                         // 42-59: Somatória qtd moeda
  trailerLote += numPad(0, 6);                          // 60-65: Nº aviso débito
  trailerLote += pad('', 165);                          // 66-230: Brancos
  trailerLote += pad('', 10);                           // 231-240: Ocorrências
  lines.push(trailerLote);

  let trailerArq = '';
  trailerArq += pad(codBanco, 3, '0', 'right');        // 1-3: Código do banco
  trailerArq += '9999';                                 // 4-7: Lote (9999 = trailer arquivo)
  trailerArq += '9';                                    // 8: Tipo de registro (9 = trailer arquivo)
  trailerArq += pad('', 9);                             // 9-17: Brancos
  trailerArq += numPad(1, 6);                           // 18-23: Qtd de lotes
  trailerArq += numPad(seqRegistro + 4, 6);             // 24-29: Qtd registros no arquivo
  trailerArq += numPad(0, 6);                           // 30-35: Qtd contas para conciliação
  trailerArq += pad('', 205);                           // 36-240: Brancos
  lines.push(trailerArq);

  return lines.map(line => {
    if (line.length < 240) return line + ' '.repeat(240 - line.length);
    return line.substring(0, 240);
  }).join('\r\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Rev. 5031 — GERADOR ESPECÍFICO CAIXA (banco 104)
// Manual "Intercâmbio de Informações entre Bancos e Empresas — CNAB240"
// (out/2023, 37.270 v029): leiaute de ARQUIVO versão 080, leiaute de LOTE
// versão 041, serviço 30 (Pagamento de Salários).
// Diferenças críticas vs o gerador FEBRABAN genérico acima:
//  • Header arquivo: convênio em 6 posições (33-38), parâmetro de transmissão
//    (39-40), Ambiente Cliente T/P (41), versão 080 (164-166), densidade 01600.
//  • Header lote: versão 041, convênio 6 pos, tipo de compromisso (39-40,
//    02=Pagamento de Salários), código do compromisso (41-44, fornecido pela
//    Caixa), ENDEREÇO da empresa (143-222).
//  • Conta Caixa em 12 posições = 4 de OPERAÇÃO + 8 de conta (ex.: op 001/003/013),
//    com DV de agência e de conta em campos próprios.
//  • Segmento A: favorecido = conta do FUNCIONÁRIO; câmara 000 p/ crédito em
//    conta Caixa e 018 p/ TED outros bancos; "seu número" em 74-79 (6 pos).
//  • Segmento B obrigatório: CPF + endereço do funcionário.
//  • NSA sequencial persistido (obrigatório evoluir 1 em 1).
// ═══════════════════════════════════════════════════════════════════════════

export interface CaixaContaParsed {
  agencia: string;      // 4-5 dígitos, sem DV
  agenciaDv: string;    // 1 dígito (ou vazio)
  operacao: string;     // 3-4 dígitos (vazio p/ contas de outros bancos / novo padrão)
  conta: string;        // número da conta sem DV
  contaDv: string;      // 1 dígito (ou vazio)
}

// Interpreta agência/conta digitadas livremente no cadastro.
// Convenções aceitas: DV separado por '-' ("1234-5"); operação Caixa separada
// por '.' ou espaço antes da conta ("013.00012345-6", "003 12345-0").
export function parseContaBancaria(agenciaRaw: string, contaRaw: string, isCaixa: boolean): CaixaContaParsed {
  const ag = String(agenciaRaw || '').trim();
  const ct = String(contaRaw || '').trim();
  let agencia = ag, agenciaDv = '';
  const agM = ag.match(/^(\d+)\s*-\s*(\d|x)$/i);
  if (agM) { agencia = agM[1]; agenciaDv = agM[2].toUpperCase(); }
  else agencia = onlyDigits(ag);

  let operacao = '', conta = ct, contaDv = '';
  const dvM = ct.match(/^(.*?)\s*-\s*(\d|x)$/i);
  let corpo = ct;
  if (dvM) { corpo = dvM[1]; contaDv = dvM[2].toUpperCase(); }
  const opM = corpo.match(/^(\d{3,4})[.\s](\d+)$/);
  if (isCaixa && opM) { operacao = opM[1]; conta = opM[2]; }
  else conta = onlyDigits(corpo);
  return { agencia, agenciaDv, operacao, conta, contaDv };
}

// Campo "conta" de 12 posições da Caixa: com operação = 4 pos op + 8 pos conta;
// sem operação = 12 pos conta.
function contaCampo12(p: CaixaContaParsed): string {
  if (p.operacao) return numPad(p.operacao, 4) + numPad(p.conta, 8);
  return numPad(p.conta, 12);
}

export interface CnabCaixaEmpresa {
  cnpj: string;
  razaoSocial: string;
  convenio: string;              // 6 posições (fornecido pela Caixa)
  parametroTransmissao: string;  // 2 posições (fornecido pela Caixa)
  ambiente: 'T' | 'P';           // T = teste, P = produção
  tipoCompromisso: string;       // 02 = Pagamento de Salários (ou 06 Ampliação de Base)
  codigoCompromisso: string;     // 4 posições (fornecido pela Caixa)
  agencia: string;               // texto livre do cadastro (parseado)
  conta: string;                 // texto livre do cadastro (parseado)
  logradouro: string;
  numero: string;
  complemento: string;
  cidade: string;
  cep: string;                   // 8 dígitos
  uf: string;
}

export interface CnabCaixaFuncionario {
  nome: string;
  cpf: string;
  codigoBanco: string;           // 104 = crédito em conta Caixa; outro = TED
  agencia: string;               // texto livre (parseado)
  conta: string;                 // texto livre (parseado)
  valorLiquido: number;
  dataPagamento: string;         // YYYY-MM-DD
  seuNumero: string;             // até 6 dígitos — identificador na empresa
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
  uf?: string;
}

export function gerarCnab240Caixa(
  empresa: CnabCaixaEmpresa,
  funcionarios: CnabCaixaFuncionario[],
  nsa: number,
): string {
  const lines: string[] = [];
  const cnpj = onlyDigits(empresa.cnpj);
  const contaEmp = parseContaBancaria(empresa.agencia, empresa.conta, true);
  const convenio = numPad(onlyDigits(empresa.convenio), 6);
  const paramTransm = pad((empresa.parametroTransmissao || '').trim(), 2, '0', 'right').replace(/[^0-9]/g, '0');
  const ambiente = empresa.ambiente === 'T' ? 'T' : 'P';

  // ── Header de Arquivo (registro 0, leiaute 080) ────────────────────────────
  let h = '';
  h += '104';                                    // 1-3 banco
  h += '0000';                                   // 4-7 lote
  h += '0';                                      // 8 registro
  h += pad('', 9);                               // 9-17 filler
  h += '2';                                      // 18 tipo inscrição (2=CNPJ)
  h += numPad(cnpj, 14);                         // 19-32 CNPJ
  h += convenio;                                 // 33-38 convênio (6 pos)
  h += numPad(paramTransm, 2);                   // 39-40 parâmetro de transmissão
  h += ambiente;                                 // 41 ambiente cliente (T/P)
  h += ' ';                                      // 42 ambiente Caixa
  h += pad('', 3);                               // 43-45 origem aplicativo
  h += numPad(0, 4);                             // 46-49 número versão
  h += pad('', 3);                               // 50-52 filler
  h += numPad(contaEmp.agencia, 5);              // 53-57 agência
  h += numPad(contaEmp.agenciaDv || '0', 1);     // 58 DV agência
  h += contaCampo12(contaEmp);                   // 59-70 conta (operação+conta)
  h += pad(contaEmp.contaDv || ' ', 1);          // 71 DV conta
  h += ' ';                                      // 72 DV agência/conta
  h += pad(sanitizeCnabText(empresa.razaoSocial), 30); // 73-102 nome empresa
  h += pad('CAIXA', 30);                         // 103-132 nome banco
  h += pad('', 10);                              // 133-142 filler
  h += '1';                                      // 143 tipo arquivo (1=remessa)
  h += today8();                                 // 144-151 data geração
  h += todayHHMMSS();                            // 152-157 hora geração
  h += numPad(nsa, 6);                           // 158-163 NSA
  h += '080';                                    // 164-166 versão leiaute arquivo
  h += '01600';                                  // 167-171 densidade
  h += pad('', 20);                              // 172-191 reservado banco
  h += pad('', 20);                              // 192-211 reservado empresa
  h += pad('', 11);                              // 212-222 uso FEBRABAN
  h += pad('', 3);                               // 223-225 ident. cobrança
  h += numPad(0, 3);                             // 226-228 uso VAN
  h += pad('', 2);                               // 229-230 tipo serviço
  h += pad('', 10);                              // 231-240 ocorrências
  lines.push(h);

  // Lotes: um por FORMA DE LANÇAMENTO — 01 (crédito conta Caixa) e 41 (TED
  // outra titularidade/outros bancos). O manual exige forma única por lote.
  const grupos: Array<{ forma: '01' | '41'; funcs: CnabCaixaFuncionario[] }> = [];
  const caixaFuncs = funcionarios.filter(f => f.codigoBanco === '104');
  const outrosFuncs = funcionarios.filter(f => f.codigoBanco !== '104');
  if (caixaFuncs.length) grupos.push({ forma: '01', funcs: caixaFuncs });
  if (outrosFuncs.length) grupos.push({ forma: '41', funcs: outrosFuncs });

  let numLote = 0;
  let totalRegistrosArquivo = 1; // header arquivo

  for (const grupo of grupos) {
    numLote++;
    const loteStr = numPad(numLote, 4);

    let hl = '';
    hl += '104';                                  // 1-3
    hl += loteStr;                                // 4-7 lote
    hl += '1';                                    // 8 registro
    hl += 'C';                                    // 9 operação (crédito)
    hl += '30';                                   // 10-11 serviço (30=salários)
    hl += grupo.forma;                            // 12-13 forma de lançamento
    hl += '041';                                  // 14-16 versão leiaute lote
    hl += ' ';                                    // 17 filler
    hl += '2';                                    // 18 tipo inscrição
    hl += numPad(cnpj, 14);                       // 19-32 CNPJ
    hl += convenio;                               // 33-38 convênio
    hl += numPad(onlyDigits(empresa.tipoCompromisso || '2'), 2); // 39-40 tipo compromisso (02=salários)
    hl += numPad(onlyDigits(empresa.codigoCompromisso), 4);      // 41-44 código compromisso
    hl += numPad(paramTransm, 2);                 // 45-46 parâmetro transmissão
    hl += pad('', 6);                             // 47-52 filler
    hl += numPad(contaEmp.agencia, 5);            // 53-57 agência
    hl += numPad(contaEmp.agenciaDv || '0', 1);   // 58 DV agência
    hl += contaCampo12(contaEmp);                 // 59-70 conta
    hl += pad(contaEmp.contaDv || ' ', 1);        // 71 DV conta
    hl += ' ';                                    // 72 DV ag/conta
    hl += pad(sanitizeCnabText(empresa.razaoSocial), 30); // 73-102 nome empresa
    hl += pad('FOLHA DE PAGAMENTO', 40);          // 103-142 mensagem 1
    hl += pad(sanitizeCnabText(empresa.logradouro), 30);  // 143-172 logradouro
    hl += numPad(onlyDigits(empresa.numero), 5);  // 173-177 número
    hl += pad(sanitizeCnabText(empresa.complemento), 15); // 178-192 complemento
    hl += pad(sanitizeCnabText(empresa.cidade), 20);      // 193-212 cidade
    hl += numPad(onlyDigits(empresa.cep).slice(0, 5), 5); // 213-217 CEP
    hl += numPad(onlyDigits(empresa.cep).slice(5, 8), 3); // 218-220 compl. CEP
    hl += pad((empresa.uf || '').toUpperCase(), 2);       // 221-222 UF
    hl += pad('', 8);                             // 223-230 uso FEBRABAN
    hl += pad('', 10);                            // 231-240 ocorrências
    lines.push(hl);

    let nsr = 0;
    let totalValorLote = 0;

    for (const f of grupo.funcs) {
      const isCaixaFav = f.codigoBanco === '104';
      const contaFav = parseContaBancaria(f.agencia, f.conta, isCaixaFav);
      const valorCent = Math.round(f.valorLiquido * 100);
      totalValorLote += valorCent;
      const dataPag = formatDate(f.dataPagamento);

      nsr++;
      let a = '';
      a += '104';                                 // 1-3
      a += loteStr;                               // 4-7
      a += '3';                                   // 8 registro detalhe
      a += numPad(nsr, 5);                        // 9-13 NSR
      a += 'A';                                   // 14 segmento
      a += '0';                                   // 15 tipo movimento (0=inclusão)
      a += '00';                                  // 16-17 código instrução
      a += (isCaixaFav ? '000' : '018');          // 18-20 câmara (000=conta Caixa, 018=TED)
      a += numPad(f.codigoBanco, 3);              // 21-23 banco favorecido
      a += numPad(contaFav.agencia, 5);           // 24-28 agência favorecido
      a += numPad(contaFav.agenciaDv || '0', 1);  // 29 DV agência
      a += contaCampo12(contaFav);                // 30-41 conta favorecido
      a += pad(contaFav.contaDv || ' ', 1);       // 42 DV conta
      a += ' ';                                   // 43 DV ag/conta
      a += pad(sanitizeCnabText(f.nome), 30);     // 44-73 nome favorecido
      a += numPad(onlyDigits(f.seuNumero).slice(-6), 6); // 74-79 nº documento empresa
      a += pad('', 13);                           // 80-92 filler
      a += (isCaixaFav ? ' ' : '1');              // 93 tipo de conta p/ TED (1=corrente)
      a += dataPag;                               // 94-101 data pagamento
      a += pad('BRL', 3);                         // 102-104 moeda
      a += numPad(0, 15);                         // 105-119 qtd moeda
      a += numPad(valorCent, 15);                 // 120-134 valor
      a += pad('', 9);                            // 135-143 nº documento banco
      a += pad('', 3);                            // 144-146 filler
      a += '01';                                  // 147-148 qtd parcelas
      a += '0';                                   // 149 indicador bloqueio (0/N per manual)
      a += '1';                                   // 150 forma parcelamento (1=data fixa)
      a += '00';                                  // 151-152 dia/período
      a += '01';                                  // 153-154 nº parcela
      a += '00000000';                            // 155-162 data real efetivação
      a += numPad(0, 15);                         // 163-177 valor real efetivado
      a += pad('', 40);                           // 178-217 informação 2
      a += '03';                                  // 218-219 finalidade DOC/TED (03=pagto salários)
      a += pad('', 10);                           // 220-229 uso FEBRABAN
      a += '0';                                   // 230 aviso ao favorecido (0=não emite)
      a += pad('', 10);                           // 231-240 ocorrências
      lines.push(a);

      nsr++;
      let b = '';
      b += '104';                                 // 1-3
      b += loteStr;                               // 4-7
      b += '3';                                   // 8
      b += numPad(nsr, 5);                        // 9-13 NSR
      b += 'B';                                   // 14 segmento
      b += pad('', 3);                            // 15-17 uso FEBRABAN
      b += '1';                                   // 18 tipo inscrição (1=CPF)
      b += numPad(onlyDigits(f.cpf), 14);         // 19-32 CPF
      b += pad(sanitizeCnabText(f.logradouro || ''), 30);   // 33-62 logradouro
      b += numPad(onlyDigits(f.numero || ''), 5); // 63-67 número
      b += pad(sanitizeCnabText(f.complemento || ''), 15);  // 68-82 complemento
      b += pad(sanitizeCnabText(f.bairro || ''), 15);       // 83-97 bairro
      b += pad(sanitizeCnabText(f.cidade || ''), 20);       // 98-117 cidade
      b += numPad(onlyDigits(f.cep || '').slice(0, 5), 5);  // 118-122 CEP
      b += pad(onlyDigits(f.cep || '').slice(5, 8), 3, '0', 'right'); // 123-125 compl. CEP
      b += pad((f.uf || '').toUpperCase(), 2);    // 126-127 UF
      b += dataPag;                               // 128-135 data vencimento
      b += numPad(valorCent, 15);                 // 136-150 valor documento
      b += numPad(0, 15);                         // 151-165 abatimento
      b += numPad(0, 15);                         // 166-180 desconto
      b += numPad(0, 15);                         // 181-195 mora
      b += numPad(0, 15);                         // 196-210 multa
      b += pad('', 15);                           // 211-225 código doc. favorecido
      b += pad('', 15);                           // 226-240 uso FEBRABAN
      lines.push(b);
    }

    let tl = '';
    tl += '104';                                  // 1-3
    tl += loteStr;                                // 4-7
    tl += '5';                                    // 8 registro trailer lote
    tl += pad('', 9);                             // 9-17 uso FEBRABAN
    tl += numPad(nsr + 2, 6);                     // 18-23 qtd registros do lote (header+detalhes+trailer)
    tl += numPad(totalValorLote, 18);             // 24-41 somatória valores
    tl += numPad(0, 18);                          // 42-59 somatória qtd moeda
    tl += numPad(0, 6);                           // 60-65 nº aviso débito
    tl += pad('', 165);                           // 66-230 uso FEBRABAN
    tl += pad('', 10);                            // 231-240 ocorrências
    lines.push(tl);

    totalRegistrosArquivo += nsr + 2;
  }

  totalRegistrosArquivo += 1; // trailer arquivo
  let t = '';
  t += '104';                                     // 1-3
  t += '9999';                                    // 4-7
  t += '9';                                       // 8
  t += pad('', 9);                                // 9-17
  t += numPad(numLote, 6);                        // 18-23 qtd lotes
  t += numPad(totalRegistrosArquivo, 6);          // 24-29 qtd registros do arquivo
  t += numPad(0, 6);                              // 30-35 qtd contas conciliação
  t += pad('', 205);                              // 36-240
  lines.push(t);

  return lines.map(l => (l.length < 240 ? l + ' '.repeat(240 - l.length) : l.substring(0, 240))).join('\r\n') + '\r\n';
}

// Remove acentos/caracteres fora do conjunto aceito pelo CNAB (o manual exige
// texto sem caracteres especiais; acentuação causa rejeição em alguns validadores).
function sanitizeCnabText(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,\/-]/g, ' ')
    .toUpperCase();
}
