import * as React from "react";

// Rev. 1576 — Bump do breakpoint mobile de 768px → 1024px para incluir
// tablets (iPad portrait/landscape, Android tablets). Com isso, em qualquer
// dispositivo de até 1023px de largura a barra lateral do ERP entra em modo
// "drawer" (Sheet), começando FECHADA por padrão e abrindo só quando o
// usuário tocar no ícone de menu no cabeçalho — comportamento solicitado
// para evitar ter que fechar a barra a cada acesso em telefone/tablet.
const MOBILE_BREAKPOINT = 1024;

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
