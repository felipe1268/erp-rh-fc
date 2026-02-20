import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, date, boolean, json } from "drizzle-orm/mysql-core";

// ============================================================
// AUTH & USERS
// ============================================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// MULTI-TENANT: EMPRESAS
// ============================================================

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  cnpj: varchar("cnpj", { length: 18 }).notNull().unique(),
  razaoSocial: varchar("razaoSocial", { length: 255 }).notNull(),
  nomeFantasia: varchar("nomeFantasia", { length: 255 }),
  endereco: text("endereco"),
  cidade: varchar("cidade", { length: 100 }),
  estado: varchar("estado", { length: 2 }),
  cep: varchar("cep", { length: 10 }),
  telefone: varchar("telefone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ============================================================
// PERFIS E PERMISSÕES
// ============================================================

export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  companyId: int("companyId").notNull(),
  profileType: mysqlEnum("profileType", [
    "adm_master",
    "adm",
    "operacional",
    "avaliador",
    "consulta",
  ]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  canView: boolean("canView").default(false).notNull(),
  canCreate: boolean("canCreate").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = typeof permissions.$inferInsert;

// ============================================================
// CORE RH: COLABORADORES
// ============================================================

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  matricula: varchar("matricula", { length: 20 }),

  // Dados Pessoais
  nomeCompleto: varchar("nomeCompleto", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 14 }).notNull(),
  rg: varchar("rg", { length: 20 }),
  orgaoEmissor: varchar("orgaoEmissor", { length: 20 }),
  dataNascimento: date("dataNascimento"),
  sexo: mysqlEnum("sexo", ["M", "F", "Outro"]),
  estadoCivil: mysqlEnum("estadoCivil", ["Solteiro", "Casado", "Divorciado", "Viuvo", "Uniao_Estavel"]),
  nacionalidade: varchar("nacionalidade", { length: 50 }),
  naturalidade: varchar("naturalidade", { length: 100 }),
  nomeMae: varchar("nomeMae", { length: 255 }),
  nomePai: varchar("nomePai", { length: 255 }),

  // Documentos
  ctps: varchar("ctps", { length: 20 }),
  serieCTPS: varchar("serieCTPS", { length: 10 }),
  pis: varchar("pis", { length: 20 }),
  tituloEleitor: varchar("tituloEleitor", { length: 20 }),
  certificadoReservista: varchar("certificadoReservista", { length: 20 }),
  cnh: varchar("cnh", { length: 20 }),
  categoriaCNH: varchar("categoriaCNH", { length: 5 }),
  validadeCNH: date("validadeCNH"),

  // Endereço
  logradouro: varchar("logradouro", { length: 255 }),
  numero: varchar("numero", { length: 20 }),
  complemento: varchar("complemento", { length: 100 }),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }),
  estado: varchar("estado", { length: 2 }),
  cep: varchar("cep", { length: 10 }),

  // Contato
  telefone: varchar("telefone", { length: 20 }),
  celular: varchar("celular", { length: 20 }),
  email: varchar("email", { length: 320 }),
  contatoEmergencia: varchar("contatoEmergencia", { length: 255 }),
  telefoneEmergencia: varchar("telefoneEmergencia", { length: 20 }),

  // Dados Profissionais
  cargo: varchar("cargo", { length: 100 }),
  funcao: varchar("funcao", { length: 100 }),
  setor: varchar("setor", { length: 100 }),
  dataAdmissao: date("dataAdmissao"),
  dataDemissao: date("dataDemissao"),
  salarioBase: varchar("salarioBase", { length: 20 }),
  horasMensais: varchar("horasMensais", { length: 10 }),
  tipoContrato: mysqlEnum("tipoContrato", ["CLT", "PJ", "Temporario", "Estagio", "Aprendiz"]),
  jornadaTrabalho: varchar("jornadaTrabalho", { length: 50 }),

  // Dados Bancários
  banco: varchar("banco", { length: 100 }),
  agencia: varchar("agencia", { length: 20 }),
  conta: varchar("conta", { length: 30 }),
  tipoConta: mysqlEnum("tipoConta", ["Corrente", "Poupanca"]),
  chavePix: varchar("chavePix", { length: 100 }),

  // Status
  status: mysqlEnum("status", [
    "Ativo",
    "Ferias",
    "Afastado",
    "Licenca",
    "Desligado",
    "Recluso",
  ]).default("Ativo").notNull(),

  // Foto
  fotoUrl: text("fotoUrl"),

  // Observações
  observacoes: text("observacoes"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// ============================================================
// HISTÓRICO FUNCIONAL
// ============================================================

export const employeeHistory = mysqlTable("employee_history", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  companyId: int("companyId").notNull(),
  tipo: mysqlEnum("tipo", [
    "Admissao",
    "Promocao",
    "Transferencia",
    "Mudanca_Funcao",
    "Mudanca_Setor",
    "Mudanca_Salario",
    "Afastamento",
    "Retorno",
    "Ferias",
    "Desligamento",
    "Outros",
  ]).notNull(),
  descricao: text("descricao"),
  valorAnterior: text("valorAnterior"),
  valorNovo: text("valorNovo"),
  dataEvento: date("dataEvento").notNull(),
  registradoPor: int("registradoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmployeeHistory = typeof employeeHistory.$inferSelect;
export type InsertEmployeeHistory = typeof employeeHistory.$inferInsert;

// ============================================================
// AUDITORIA DE SISTEMA
// ============================================================

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  companyId: int("companyId"),
  action: varchar("action", { length: 50 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  entityType: varchar("entityType", { length: 50 }),
  entityId: int("entityId"),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
