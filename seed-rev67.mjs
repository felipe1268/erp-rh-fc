import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const revisions = [
  {
    version: 67,
    titulo: "Correção do fluxo de Advertência nas Inconsistências de Ponto",
    descricao: `Correção crítica no fluxo de advertência do módulo Fechamento de Ponto:
- Botão de Advertência nas inconsistências agora navega para o Controle de Documentos (aba Advertências) com formulário completo pré-preenchido
- O formulário abre com colaborador, data e motivo pré-preenchidos, mas o usuário DEVE escolher o tipo (Verbal, Escrita, Suspensão, etc.)
- A inconsistência NÃO é mais resolvida automaticamente ao gerar advertência — permanece pendente até ser tratada separadamente
- O dialog de "Resolver Inconsistência" agora só oferece "Justificar" e "Marcar como Ajustado" (advertência é ação separada)
- Fluxo completo: usuário define tipo, preenche testemunhas, revisa motivo e confirma no formulário padrão do Controle de Documentos
- Integração via sessionStorage para transferência segura de dados entre módulos`,
    tipo: "bugfix",
    modulos: "Fechamento de Ponto, Controle de Documentos",
    criadoPor: "Sistema",
    dataPublicacao: "2026-02-23 23:45:00",
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
