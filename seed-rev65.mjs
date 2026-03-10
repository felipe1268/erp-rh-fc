import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const revisions = [
  {
    version: 65,
    titulo: "Correção definitiva desconsolidação + Layout responsivo Revisões",
    descricao: `Correções e melhorias:
- Correção DEFINITIVA do bug de desconsolidação: verificação de role agora usa .includes('admin') para aceitar qualquer variação (admin, admin_master)
- Fallback de segurança: owner do projeto sempre pode desconsolidar
- Layout responsivo na página Controle de Revisões: cards de estatísticas em grid 3x2 mobile / 6 colunas desktop
- Header da página de Revisões responsivo com empilhamento vertical em telas pequenas
- Log detalhado no backend para debug de permissões
- Atualização do número da revisão para Rev. 65`,
    tipo: "bugfix",
    modulos: "Fechamento de Ponto, Revisões do Sistema",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-23 22:30:00",
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
