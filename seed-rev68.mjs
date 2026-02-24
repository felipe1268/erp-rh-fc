import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const revisions = [
  {
    version: 68,
    titulo: "Detecção Inteligente de Transferência de Obra nos Conflitos",
    descricao: `Melhoria significativa na análise de conflitos de obra no Fechamento de Ponto:
- O sistema agora distingue entre SOBREPOSIÇÃO REAL (mesmo horário, impossível) e TRANSFERÊNCIA DE OBRA (horários diferentes, provável remanejamento)
- Quando detecta transferência: exibe análise visual com obra de origem → obra de destino, gap de tempo entre batidas, e sugestão de horário de saída na obra anterior
- Badge "Transferência" (azul) diferencia visualmente das sobreposições (vermelho) e deslocamentos válidos (verde)
- Sugestão automática: "Registre uma saída às HH:MM na obra X para fechar as horas corretamente"
- Alerta principal atualizado com contagem separada de sobreposições, transferências e deslocamentos válidos
- Lógica aplicada tanto na aba de Conflitos quanto na visão de Detalhe do Colaborador
- Backend enriquecido com campo transferAnalysis contendo fromObra, toObra, gapMinutes e suggestedExit`,
    tipo: "melhoria",
    modulos: "Fechamento de Ponto",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-24 00:00:00",
  },
];

for (const rev of revisions) {
  await conn.execute(
    "INSERT INTO system_revisions (version, titulo, descricao, tipo, modulos, criadoPor, dataPublicacao) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [rev.version, rev.titulo, rev.descricao, rev.tipo, rev.modulos, rev.criadoPor, rev.dataPublicacao]
  );
  console.log(`Inserted Rev. ${rev.version}`);
}

await conn.end();
console.log("Done!");
