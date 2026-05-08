interface PortalPrintHeaderProps {
  obra?: {
    nome?: string | null;
    cliente?: string | null;
    clienteLogoUrl?: string | null;
    gerenciadoraNome?: string | null;
    gerenciadoraLogoUrl?: string | null;
    empresaNome?: string | null;
    empresaLogoUrl?: string | null;
    cidade?: string | null;
    estado?: string | null;
  } | null;
  titulo?: string;
  subtitulo?: string;
}

const Bloco = ({ legenda, logo, nome, align }: { legenda: string; logo?: string | null; nome?: string | null; align: "left" | "center" | "right" }) => {
  const alignItems = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const textAlign = align;
  if (!logo && !nome) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems, gap: 2, minWidth: 0 }}>
        <div style={{ fontSize: 8, color: "#cbd5e1", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{legenda}</div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems, gap: 3, minWidth: 0 }}>
      <div style={{ fontSize: 8, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{legenda}</div>
      {logo ? (
        <img src={logo} alt={legenda} style={{ maxHeight: 48, maxWidth: 170, objectFit: "contain" }} />
      ) : null}
      {nome && (
        <div style={{ fontSize: 9, color: "#475569", fontWeight: 600, lineHeight: 1.2, maxWidth: 200, textAlign }}>{nome}</div>
      )}
    </div>
  );
};

export default function PortalPrintHeader({ obra, titulo, subtitulo }: PortalPrintHeaderProps) {
  const dataHora = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const local = [obra?.cidade, obra?.estado].filter(Boolean).join(" / ");

  return (
    <div
      className="portal-print-header hidden print:block"
      style={{ borderBottom: "2px solid #1B2A4A", paddingBottom: 10, marginBottom: 14 }}
    >
      {/* Linha 1: 3 logos lado a lado */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <Bloco legenda="Executora" logo={obra?.empresaLogoUrl} nome={obra?.empresaNome || "FC Engenharia"} align="left" />
        <Bloco legenda="Cliente" logo={obra?.clienteLogoUrl} nome={obra?.cliente} align="center" />
        <Bloco legenda="Gerenciadora" logo={obra?.gerenciadoraLogoUrl} nome={obra?.gerenciadoraNome} align="right" />
      </div>

      {/* Linha 2: faixa com obra + título */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
        {titulo && (
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>{titulo}</div>
        )}
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginTop: 2 }}>
          {obra?.nome || "—"}
        </div>
        {(subtitulo || local) && (
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
            {[subtitulo, local].filter(Boolean).join(" · ")}
          </div>
        )}
        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>Emitido em {dataHora}</div>
      </div>
    </div>
  );
}
