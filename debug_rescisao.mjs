// Debug script to trace the rescisão calculation for ANTONIO RENATO DE SANTANA
// Data from screenshot:
// Início: 14/02/2026, Dias: 30, Término: 15/03/2026
// Salário: R$ 6.199,60 (based on férias calc)
// Tipo: Empregador (Trabalhado)

// The system says:
// - Saldo Salário: 13/30 dias = R$ 2.686,49
// - Férias Prop + 1/3: 9 meses = R$ 6.199,60
// - 13º Proporcional: 1/12 = R$ 516,63
// - FGTS Estimado: R$ 4.463,71
// - Multa 40%: R$ 1.785,48

// The correct values should be:
// - Saldo Salário: 16 dias (in March, which has 31 days)
// - Férias Prop: 10/12 (from admission to END of aviso 15/03/2026)
// - 13º Prop: 3/12 (Jan, Feb, Mar 2026)
// - FGTS: calculated until END of aviso

// Let's trace the logic

// dataDesligamento = "último dia trabalhado" - this is what the user inputs
// For aviso starting 14/02/2026, the "dataDesligamento" (último dia trabalhado) = 13/02/2026
// dataInicioAviso = dataDesligamento + 1 = 14/02/2026
// dataFimAviso = dataInicioAviso + 30 - 1 = 15/03/2026

const dataDesligamento = "2026-02-13"; // último dia trabalhado
const dataInicioAviso = "2026-02-14"; // início do aviso
const dataFimAviso = "2026-03-15"; // término do aviso

// diasTrabalhadosMes = dtFimAviso.getDate() = 15
const dtFimAviso = new Date(dataFimAviso + 'T00:00:00');
console.log("dtFimAviso.getDate() =", dtFimAviso.getDate()); // Should be 15

// But the system shows 13 days... 
// Wait - maybe the system is using dataDesligamento (13/02) instead of dataFimAviso?
// Let's check: 
const dtDeslig = new Date(dataDesligamento + 'T00:00:00');
console.log("dtDeslig.getDate() =", dtDeslig.getDate()); // 13 - THIS IS THE BUG!

// The system shows "13/30 dias" which means:
// - diasTrabalhadosMes = 13 (from dataDesligamento, not dataFimAviso)
// - diasReaisMes = 30 (from February? No, Feb has 28 days)
// Wait - 13/30 means divisor is 30. But Feb 2026 has 28 days.
// So the system is using the WRONG month for diasReaisMes too!

// Let's check what month the system uses for diasReaisMes:
// In calcularRescisaoCompleta: dtRef = new Date(dataRefCalculo + 'T00:00:00')
// dataRefCalculo = dataFimAviso || dataDesligamento
// If dataFimAviso = "2026-03-15", then diasReaisMes = 31 (March)
// But the system shows /30, which means it's using February (28) or a fixed 30

// Actually wait - if the system shows 13/30, and diasReaisMes should be 31 for March...
// This means dataRefCalculo is NOT using dataFimAviso
// Let me check if dataFimAviso is actually being passed

// Looking at the code:
// Line 520-528: calcularRescisaoCompleta is called with dataFimAviso
// Line 148: dataRefCalculo = params.dataFimAviso || dataDesligamento
// So dataRefCalculo SHOULD be dataFimAviso = "2026-03-15"

// But the output shows 13/30 which is:
// 13 = day of February (dataDesligamento)
// 30 = not matching any month (Feb=28, Mar=31)

// WAIT - let me re-read the code more carefully
// Line 406: diasTrabalhadosMes = input.diasTrabalhadosOverride ?? dtFimAviso.getDate()
// dtFimAviso.getDate() for "2026-03-15" = 15, not 13
// So if the system shows 13, it must be getting a different dtFimAviso

// Let me check: maybe the issue is in the frontend, not the backend
// The frontend might be calculating differently

// Actually, looking at the screenshot again:
// "Saldo de Salário (13/30 dias): R$ 2.686,49"
// salarioBase / 30 * 13 = ?
// 2686.49 / 13 * 30 = 6199.59 ≈ 6199.60 (salário base)
// So salarioBase = 6199.60, and the calc is 6199.60 / 30 * 13 = 2686.49
// This confirms: divisor = 30 (WRONG, should be 31 for March or 28 for Feb)
// And diasTrabalhados = 13 (WRONG, should be 15 or 16)

// The user says correct is 16 days. Let me check:
// If aviso ends 15/03/2026, and we count from 01/03 to 15/03 = 15 days
// But the user says 16 days... maybe they count differently
// Actually in CLT, the day of termination counts as worked
// So 1 to 15 March = 15 days. But user says 16.
// Maybe the user is counting from the 28th of Feb? 
// Feb has 28 days, so from Feb 28 to Mar 15 = 16 days?
// No, that doesn't make sense either.

// Let me reconsider: the user says "está calculando 03 dias a menos"
// System: 13 days, Correct: 16 days
// If we use March: 15 days (1-15 March)
// If we add the remaining Feb day: Feb has 28 days, aviso starts Feb 14
// Feb 14 to Feb 28 = 15 days in Feb
// Mar 1 to Mar 15 = 15 days in Mar
// Total = 30 days aviso

// For saldo de salário, we only count days in the LAST month (March)
// March 1 to March 15 = 15 days
// But user says 16... 

// Actually, maybe the user is right and I need to understand their calculation:
// Saldo Salário (16 DIAS) = R$ 3.305,16
// 6200 / 31 * 16 = 3200 (not matching)
// 6200 / 30 * 16 = 3306.67 (close to 3305.16)
// Hmm, 6199.60 / 30 * 16 = 3306.45 (not exact)
// Let me try: salário = 6200
// 6200 / 30 * 16 = 3306.67
// Or maybe the salary is different...

// From the correct table:
// FÉRIAS PROP. (10/12) = R$ 5.166,67
// salário * 10 / 12 = 5166.67
// salário = 5166.67 * 12 / 10 = 6200.00

// 13º SAL. PROP (3/12) = R$ 1.550,00
// 6200 * 3 / 12 = 1550.00 ✓

// SALDO SALÁRIO (16 DIAS) = R$ 3.305,16
// 6200 / X * 16 = 3305.16
// X = 6200 * 16 / 3305.16 = 30.01 ≈ 30
// So the user's calculation also uses 30 as divisor!
// 6200 / 30 * 16 = 3306.67 (but user says 3305.16)

// Hmm, let me try with the exact salary from the system:
// System says salário = 6199.60
// 6199.60 / 30 * 16 = 3306.45 (still not 3305.16)

// Wait - maybe the salary is slightly different
// 3305.16 * 30 / 16 = 6197.175
// Or maybe: 3305.16 = salário / diasMes * 16
// If diasMes = 30: salário = 3305.16 * 30 / 16 = 6197.175

// 1/3 FÉRIAS = R$ 1.722,22
// FÉRIAS PROP = R$ 5.166,67
// 5166.67 / 3 = 1722.22 ✓

// MULTA FGTS = R$ 2.009,00

// OK, the key issues are clear:
// 1. System uses 13 days, should be 15 or 16
// 2. System uses 9 months férias, should be 10
// 3. System uses 1/12 for 13º, should be 3/12
// 4. FGTS is off

console.log("\n=== TRACING THE BUG ===");

// The frontend shows the aviso detail page with previsaoRescisao data
// This data comes from the 'calcular' procedure or from stored previsaoRescisao

// Let me check: when the aviso is CREATED, does it store the previsaoRescisao?
// If so, the stored data might be from an old calculation

console.log("Need to check if the detail page uses stored data or recalculates");
console.log("If stored, the old calculation bugs persist even after code fixes");
