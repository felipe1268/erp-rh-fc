import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const revisions = [
  {
    version: 70,
    titulo: "Salário/Hora Bidirecional + Código Interno em Destaque",
    descricao: `Melhorias no cadastro de colaboradores para funcionários horistas:
- Campo "Valor da Hora" agora é editável e bidirecional: digitar o valor da hora calcula o salário automaticamente, e vice-versa
- Valor da Hora destacado como "Dado Mestre" com borda azul e estrela — é a base real para cálculo da folha de pagamento
- Salário Base marcado como "Referência mensal (varia conforme dias úteis)" para deixar claro que é variável
- Ao alterar Horas Mensais, o salário é recalculado a partir do valor da hora (não o contrário)
- Código Interno (ex: JFC161) exibido em destaque grande no lado direito do header do colaborador
- Estrutura preparada para horistas: valor da hora fixo, salário varia conforme dias úteis do mês`,
    tipo: "melhoria",
    modulos: "Colaboradores",
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
