import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const revisions = [
  {
    version: 69,
    titulo: "Funcionários Não Identificados como Inconsistência Tratável",
    descricao: `Melhoria crítica na importação de arquivos DIXI:
- Funcionários não encontrados no cadastro agora são SALVOS como registros pendentes (antes eram descartados)
- Nova aba "Não Identificados" no Fechamento de Ponto mostra todos os nomes não reconhecidos
- Interface de vinculação: busca colaboradores do cadastro e vincula ao nome do relógio
- Ao vincular, o sistema reprocessa automaticamente os registros (calcula horas, extras, atrasos, inconsistências)
- Opção de descartar registros inválidos com registro de quem descartou
- Agrupamento por nome com contagem de registros e datas
- Badge com contagem de pendentes na aba
- Toast de importação reposicionado para o canto inferior esquerdo (não sobrepõe o botão de importar)
- Nova tabela unmatched_dixi_records para persistir os dados até resolução`,
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
