import { useCompany } from "@/contexts/CompanyContext";
import { nowBrasilia } from "@/lib/dateUtils";

interface PrintHeaderProps {
  title?: string;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  subtitle?: string;
}

/**
 * REGRA DE OURO — Todo PDF / impressão deve incluir:
 *   - Logo e nome da empresa
 *   - Título do relatório
 *   - Nome, cargo e e-mail de quem gerou
 *   - Data e hora de geração (horário de Brasília)
 *
 * Visível apenas na impressão (display:none na tela, block no print).
 */
export default function PrintHeader({ title, userName, userRole, userEmail, subtitle }: PrintHeaderProps) {
  const { selectedCompany } = useCompany();
  const logoUrl   = selectedCompany?.logoUrl;
  const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "Empresa";
  const cnpj      = selectedCompany?.cnpj || "";
  const timestamp = nowBrasilia();

  return (
    <div className="print-header hidden print:block" style={{ borderBottom: "2px solid #1B2A4A", paddingBottom: 12, marginBottom: 16 }}>
      {/* Linha 1: logo + empresa + dados do usuário */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        {/* Esquerda: logo + empresa */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" style={{ height: 44, objectFit: "contain" }} />
          ) : (
            <img
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png"
              alt="Logo da Empresa"
              style={{ height: 44, objectFit: "contain" }}
            />
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1B2A4A" }}>{nomeEmpresa}</div>
            {cnpj && <div style={{ fontSize: 10, color: "#666" }}>CNPJ: {cnpj}</div>}
          </div>
        </div>

        {/* Direita: quem gerou */}
        {(userName || userEmail) && (
          <div style={{ textAlign: "right", fontSize: 10, color: "#555", lineHeight: 1.6, borderLeft: "1px solid #e2e8f0", paddingLeft: 12 }}>
            <div style={{ fontWeight: 700, color: "#1B2A4A", fontSize: 11 }}>Gerado por</div>
            {userName  && <div style={{ fontWeight: 600 }}>{userName}</div>}
            {userRole  && <div>{userRole}</div>}
            {userEmail && <div style={{ color: "#6b7280" }}>{userEmail}</div>}
            <div style={{ marginTop: 2, color: "#9ca3af" }}>{timestamp}</div>
          </div>
        )}
      </div>

      {/* Linha 2: título */}
      {(title || subtitle) && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
          {title && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2A4A" }}>{title}</div>
          )}
          {subtitle && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
      )}

      {/* Linha 3: timestamp (quando não há userName) */}
      {!userName && (
        <div style={{ fontSize: 10, color: "#999", marginTop: 6 }}>
          Impresso em: {timestamp}
        </div>
      )}
    </div>
  );
}
