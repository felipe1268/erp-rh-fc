const XLSX = require("xlsx");
const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
function tabs(wb){return wb.SheetNames.filter(n=>MESES.some(m=>n.toUpperCase().startsWith(m)));}
function analyze(f){
  console.log("\n################ "+f.split("/").pop());
  const wb=XLSX.readFile(f);
  const statusGlobal={}, dateFmt={us:0,br:0,other:0,empty:0};
  let totalRows=0, totalVal=0, semCheque=0, semForn=0;
  const contasGlobal={};
  for(const t of tabs(wb)){
    const ws=wb.Sheets[t];
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""});
    // data starts row 3 (0-idx)
    let rows=0;
    const contas={};
    for(let i=3;i<aoa.length;i++){
      const r=aoa[i];
      const cheque=String(r[6]||"").trim();
      const valRaw=String(r[8]||"").trim();
      if(!cheque && !valRaw) continue; // skip blanks
      rows++; totalRows++;
      if(!cheque) semCheque++;
      const forn=String(r[1]||"").trim();
      if(!forn) semForn++;
      const obs=String(r[11]||"").trim().toLowerCase();
      statusGlobal[obs]=(statusGlobal[obs]||0)+1;
      const cc=String(r[5]||"").trim();
      contas[cc]=(contas[cc]||0)+1; contasGlobal[cc]=(contasGlobal[cc]||0)+1;
      // value parse US: remove R$, commas as thousand
      const num=parseFloat(valRaw.replace(/[R$\s]/g,"").replace(/,/g,""));
      if(!isNaN(num)) totalVal+=num;
      // date format of venc (col9)
      const d=String(r[9]||"").trim();
      if(!d) dateFmt.empty++;
      else if(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(d)){ // ambiguous - check if day>12 to detect BR
        const p=d.split("/"); if(parseInt(p[0])>12) dateFmt.br++; else dateFmt.us++;
      } else dateFmt.other++;
    }
    console.log(`  ${t.padEnd(9)} linhas=${String(rows).padStart(3)}  contas=${Object.keys(contas).join(",")}`);
  }
  console.log("  --- TOTAIS:", "linhas="+totalRows, "valor=R$"+totalVal.toLocaleString("pt-BR",{minimumFractionDigits:2}), "semCheque="+semCheque, "semForn="+semForn);
  console.log("  --- STATUS (Observação):", JSON.stringify(statusGlobal,null,0));
  console.log("  --- DATA Venc fmt:", JSON.stringify(dateFmt));
  console.log("  --- CONTAS:", JSON.stringify(contasGlobal));
}
analyze("attached_assets/CONTROLE_DE_CHEQUES_2026_REV03_1781693996807.xlsx");
analyze("attached_assets/CONTROLE_DE_CHEQUES_2025_REV07_1781694117581.xlsx");
