import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const revisions = [
  {
    version: 66,
    titulo: "Navegação de ponto no Fechamento — clique no nome abre detalhe de ponto",
    descricao: `Melhorias na navegação do módulo Fechamento de Ponto:
- Clique no nome do colaborador agora abre a visão detalhada de ponto do mês (em vez de redirecionar para o Raio-X)
- Novo card totalizador no topo da visão de detalhe: Dias Trabalhados, Horas Totais, Horas Extras, Atrasos, Obras, Inconsistências e Conflitos
- Exibição da competência, jornada e badge de múltiplas obras no card totalizador
- Painel de inconsistências pendentes do funcionário exibido diretamente na visão de detalhe com botão Resolver
- Botão "Raio-X Completo" disponível no header da visão de detalhe como opção secundária
- Ícone de Raio-X na coluna de ações das tabelas (substituindo o ícone de olho)
- Comportamento consistente em todas as abas: Resumo por Colaborador, Inconsistências, Conflitos e Rateio por Obra`,
    tipo: "melhoria",
    modulos: "Fechamento de Ponto",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-23 23:25:00",
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
