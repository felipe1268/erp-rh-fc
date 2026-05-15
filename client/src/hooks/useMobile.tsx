import * as React from "react";

// Rev. 1813 — Reduzido de 768 para 480: usuário pediu para MANTER a barra
// lateral fixa em todas as telas (tablets/notebooks/iPad inclusive). Acima
// deste limite o `<Sidebar collapsible="icon"/>` permanece como barra real
// (modo ícone quando colapsada); abaixo continua virando Sheet overlay
// (smartphones, onde não há espaço horizontal pra barra fixa).
const MOBILE_BREAKPOINT = 480;

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
