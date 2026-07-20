import * as React from "react";

// Rev. 4446 — Ajustado de 480 para 768: tablets (iPad portrait, ~768px) agora
// usam o sidebar como Sheet overlay ao invés de barra fixa com ícones. Isso
// libera toda a largura horizontal para o conteúdo no tablet, resolvendo
// textos cortados e layout comprimido. Acima de 768px (tablet landscape,
// notebooks) o sidebar continua fixo e colapsável.
const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
