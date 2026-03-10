import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find IVAN DOS SANTOS
const [rows] = await conn.execute(`
  SELECT tn.*, e.nomeCompleto, e.dataAdmissao, e.salarioBase as empSalario, e.cpf
  FROM termination_notices tn
  JOIN employees e ON tn.employeeId = e.id
  WHERE e.nomeCompleto LIKE '%IVAN%SANTOS%'
`);

for (const r of rows) {
  console.log('=== IVAN DOS SANTOS ===');
  const salStr = r.salarioBase || r.empSalario;
  const salarioBase = parseFloat(String(salStr).replace(/[^\d,.-]/g, '').replace(',', '.') || '0');
  const dataAdmissao = typeof r.dataAdmissao === 'string' ? r.dataAdmissao.split('T')[0] : r.dataAdmissao?.toISOString().split('T')[0];
  const dataFimAviso = typeof r.dataFim === 'string' ? r.dataFim.split('T')[0] : r.dataFim?.toISOString().split('T')[0];
  
  console.log('Admissão:', dataAdmissao, 'Salário:', salarioBase, 'Fim Aviso:', dataFimAviso);
  
  // dataSaida = dia seguinte ao término (para saldo salário)
  const dtFim = new Date(dataFimAviso + 'T00:00:00');
  const dtSaida = new Date(dtFim);
  dtSaida.setDate(dtSaida.getDate() + 1);
  const dataSaida = dtSaida.toISOString().split('T')[0];
  const diasTrabalhadosMes = dtSaida.getDate();
  
  // dataProjecao = último dia do mês de término (para férias, 13º, FGTS)
  const dtProjecao = new Date(dtFim.getFullYear(), dtFim.getMonth() + 1, 0);
  const dataProjecao = dtProjecao.toISOString().split('T')[0];
  
  console.log('Data Saída:', dataSaida, '| Data Projeção:', dataProjecao);
  console.log('Dias Trabalhados Mês:', diasTrabalhadosMes);
  
  // 1. Saldo de salário
  const DIVISOR_CLT = 30;
  const salarioDia = salarioBase / DIVISOR_CLT;
  const saldoSalario = salarioDia * diasTrabalhadosMes;
  console.log('\n1. Saldo Salário:', diasTrabalhadosMes, '/', DIVISOR_CLT, '= R$', saldoSalario.toFixed(2), '(esperado: R$ 1.021,07)');
  
  // 2. Férias (usando dataProjecao)
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const proj = new Date(dataProjecao + 'T00:00:00');
  let mesesTotais = (proj.getFullYear() - admissao.getFullYear()) * 12 + (proj.getMonth() - admissao.getMonth());
  if (proj.getDate() < admissao.getDate()) mesesTotais--;
  
  const mesesProporcionais = mesesTotais % 12;
  const mesesFerias = mesesProporcionais === 0 && mesesTotais > 0 ? 12 : mesesProporcionais;
  const periodosVencidos = Math.max(0, Math.floor(mesesTotais / 12) - 1);
  
  console.log('\n2. Férias: mesesTotais:', mesesTotais, 'mesesProp:', mesesProporcionais, 'mesesFerias:', mesesFerias, 'vencidos:', periodosVencidos);
  
  const feriasProp = (salarioBase * mesesFerias) / 12;
  const terco = feriasProp / 3;
  const feriasVencidas = periodosVencidos > 0 ? (salarioBase + salarioBase / 3) * periodosVencidos : 0;
  console.log('   Férias Prop:', feriasProp.toFixed(2), '+ 1/3:', terco.toFixed(2));
  console.log('   Férias Vencidas:', feriasVencidas.toFixed(2));
  console.log('   Esperado: Férias Vencidas R$ 2.189,00 + 1/3 R$ 729,67');
  
  // 3. 13º (usando dataProjecao)
  const anoDeslig = proj.getFullYear();
  const mesInicio = admissao.getFullYear() === anoDeslig ? admissao.getMonth() : 0;
  const mesFim = proj.getMonth();
  let meses13o = mesFim - mesInicio + 1;
  if (admissao.getFullYear() === anoDeslig && admissao.getMonth() === mesInicio) {
    const diasNoMes = new Date(anoDeslig, mesInicio + 1, 0).getDate() - admissao.getDate() + 1;
    if (diasNoMes < 15) meses13o--;
  }
  if (proj.getDate() < 15) meses13o--;
  meses13o = Math.max(0, Math.min(12, meses13o));
  
  const decimo = (salarioBase * meses13o) / 12;
  console.log('\n3. 13º:', meses13o, '/12 = R$', decimo.toFixed(2), '(esperado: 3/12 = R$ 547,25)');
  
  // 4. FGTS (usando dataProjecao)
  const fgts = salarioBase * 0.08 * mesesTotais;
  const multa = fgts * 0.4;
  console.log('\n4. FGTS:', mesesTotais, 'meses = R$', fgts.toFixed(2), '| Multa 40%: R$', multa.toFixed(2), '(esperado: R$ 833,67)');
  
  const total = saldoSalario + feriasProp + terco + feriasVencidas + decimo;
  console.log('\nTOTAL RESCISÃO: R$', total.toFixed(2), '(esperado: R$ 5.320,65)');
}

// Also test ANTONIO RENATO
console.log('\n\n');
const [rows2] = await conn.execute(`
  SELECT tn.*, e.nomeCompleto, e.dataAdmissao, e.salarioBase as empSalario
  FROM termination_notices tn
  JOIN employees e ON tn.employeeId = e.id
  WHERE e.nomeCompleto LIKE '%ANTONIO RENATO%'
`);

for (const r of rows2) {
  console.log('=== ANTONIO RENATO DE SANTANA ===');
  const salStr = r.salarioBase || r.empSalario;
  const salarioBase = parseFloat(String(salStr).replace(/[^\d,.-]/g, '').replace(',', '.') || '0');
  const dataAdmissao = typeof r.dataAdmissao === 'string' ? r.dataAdmissao.split('T')[0] : r.dataAdmissao?.toISOString().split('T')[0];
  const dataFimAviso = typeof r.dataFim === 'string' ? r.dataFim.split('T')[0] : r.dataFim?.toISOString().split('T')[0];
  
  console.log('Admissão:', dataAdmissao, 'Salário:', salarioBase, 'Fim Aviso:', dataFimAviso);
  
  const dtFim = new Date(dataFimAviso + 'T00:00:00');
  const dtSaida = new Date(dtFim);
  dtSaida.setDate(dtSaida.getDate() + 1);
  const dataSaida = dtSaida.toISOString().split('T')[0];
  const diasTrabalhadosMes = dtSaida.getDate();
  
  const dtProjecao = new Date(dtFim.getFullYear(), dtFim.getMonth() + 1, 0);
  const dataProjecao = dtProjecao.toISOString().split('T')[0];
  
  console.log('Data Saída:', dataSaida, '| Data Projeção:', dataProjecao);
  
  const DIVISOR_CLT = 30;
  const salarioDia = salarioBase / DIVISOR_CLT;
  const saldoSalario = salarioDia * diasTrabalhadosMes;
  console.log('Saldo Salário:', diasTrabalhadosMes, '/', DIVISOR_CLT, '= R$', saldoSalario.toFixed(2), '(esperado: R$ 3.305,16)');
  
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const proj = new Date(dataProjecao + 'T00:00:00');
  let mesesTotais = (proj.getFullYear() - admissao.getFullYear()) * 12 + (proj.getMonth() - admissao.getMonth());
  if (proj.getDate() < admissao.getDate()) mesesTotais--;
  
  const mesesProporcionais = mesesTotais % 12;
  const mesesFerias = mesesProporcionais === 0 && mesesTotais > 0 ? 12 : mesesProporcionais;
  
  const feriasProp = (salarioBase * mesesFerias) / 12;
  const terco = feriasProp / 3;
  console.log('Férias:', mesesFerias, '/12 = R$', feriasProp.toFixed(2), '+ 1/3 R$', terco.toFixed(2), '(esperado: 10/12 = R$ 5.166,67 + 1/3 R$ 1.722,22)');
  
  const anoDeslig = proj.getFullYear();
  const mesInicio = admissao.getFullYear() === anoDeslig ? admissao.getMonth() : 0;
  const mesFim = proj.getMonth();
  let meses13o = mesFim - mesInicio + 1;
  if (proj.getDate() < 15) meses13o--;
  meses13o = Math.max(0, Math.min(12, meses13o));
  
  const decimo = (salarioBase * meses13o) / 12;
  console.log('13º:', meses13o, '/12 = R$', decimo.toFixed(2), '(esperado: 3/12 = R$ 1.550,00)');
  
  const fgts = salarioBase * 0.08 * mesesTotais;
  const multa = fgts * 0.4;
  console.log('FGTS:', mesesTotais, 'meses | Multa 40%: R$', multa.toFixed(2), '(esperado: R$ 2.009,00)');
}

await conn.end();
