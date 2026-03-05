import { useAuth } from "@/_core/hooks/useAuth";
import { nowBrasilia } from "@/lib/dateUtils";

/**
 * Rodapé LGPD obrigatório para todas as impressões e PDFs.
 * Exibe: nome do solicitante, data/hora, e aviso de confidencialidade.
 * Visível apenas na impressão (display: none na tela, display: block no print).
 * 
 * Conforme Lei nº 13.709/2018 (LGPD), todo documento que contenha dados pessoais
 * deve registrar quem acessou/gerou o documento para fins de rastreabilidade.
 */
export default function PrintFooterLGPD() {
  const { user } = useAuth();
  const userName = user?.name || user?.username || "Usuário não identificado";
  const dataHora = nowBrasilia();

  return (
    <div className="print-footer-lgpd hidden print:block">
      <div style={{
        marginTop: "30px",
        paddingTop: "10px",
        borderTop: "1px solid #ccc",
        fontSize: "8px",
        color: "#888",
        textAlign: "center",
        lineHeight: "1.6",
      }}>
        <p style={{ margin: 0 }}>
          <strong>Documento gerado por:</strong> {userName} | <strong>Data/Hora:</strong> {dataHora} | <strong>Sistema:</strong> ERP - Gestão Integrada
        </p>
        <p style={{ margin: "2px 0 0 0", fontSize: "7px", color: "#aaa" }}>
          Este documento contém dados pessoais protegidos pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD). 
          É proibida a reprodução, distribuição ou compartilhamento sem autorização. 
          O uso indevido está sujeito às sanções previstas na legislação vigente.
        </p>
      </div>
    </div>
  );
}
