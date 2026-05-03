// ⚠️  BANCO DE DADOS: este projeto usa EXCLUSIVAMENTE o Neon (NEON_DATABASE_URL).
//     O banco local do Replit (DATABASE_URL) NUNCA deve ser usado.
const neonUrl = process.env.NEON_DATABASE_URL ?? "";
if (!neonUrl && process.env.NODE_ENV !== "test") {
  console.error("[ENV] CRÍTICO: NEON_DATABASE_URL não está definido! O sistema não terá acesso ao banco de dados.");
}
if (!neonUrl && process.env.DATABASE_URL) {
  console.error("[ENV] BLOQUEADO: Tentativa de usar DATABASE_URL (banco local Replit) foi impedida. Configure NEON_DATABASE_URL.");
}

export const ENV = {
  appId: process.env.VITE_APP_ID || "erp-rh-fc",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: neonUrl,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? process.env.FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.FORGE_API_KEY ?? "",
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "465", 10),
  smtpEmail: process.env.SMTP_EMAIL ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
};
