
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
