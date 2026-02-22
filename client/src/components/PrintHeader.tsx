import { useCompany } from "@/contexts/CompanyContext";

/**
 * Cabeçalho de impressão que exibe o logo e dados da empresa selecionada.
 * Visível apenas na impressão (display: none na tela, display: block no print).
 * Deve ser incluído no topo de todas as páginas que geram relatórios/impressões.
 */
export default function PrintHeader({ title }: { title?: string }) {
  const { selectedCompany } = useCompany();
  const logoUrl = selectedCompany?.logoUrl;
  const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "FC Engenharia";
  const cnpj = selectedCompany?.cnpj || "";

  return (
    <div className="print-header hidden print:block">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginBottom: "8px" }}>
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" style={{ height: "48px", objectFit: "contain" }} />
        ) : (
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png"
            alt="FC Engenharia"
            style={{ height: "48px", objectFit: "contain" }}
          />
        )}
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "16px", fontWeight: "bold", color: "#1B2A4A" }}>{nomeEmpresa}</div>
          {cnpj && <div style={{ fontSize: "11px", color: "#666" }}>CNPJ: {cnpj}</div>}
        </div>
      </div>
      {title && (
        <div style={{ fontSize: "14px", fontWeight: "600", color: "#1B2A4A", marginTop: "4px" }}>
          {title}
        </div>
      )}
      <div style={{ fontSize: "10px", color: "#999", marginTop: "4px" }}>
        Impresso em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
