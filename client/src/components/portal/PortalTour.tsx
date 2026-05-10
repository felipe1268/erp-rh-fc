import { useEffect, useState } from "react";
import { Joyride, STATUS, type CallBackProps, type Step } from "react-joyride";
import { PORTAL_CLIENTE_TOUR } from "@shared/help/portalClienteHelp";

const TOUR_STORAGE_KEY = "portal_cliente_tour_v1";

const steps: Step[] = PORTAL_CLIENTE_TOUR.map((s) => ({
  target: s.target,
  title: s.title,
  content: s.content,
  disableBeacon: true,
  placement: "auto" as const,
}));

export function PortalTour({ forceStart = false, onClose }: { forceStart?: boolean; onClose?: () => void }) {
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (forceStart) {
      setRun(true);
      return;
    }
    let done = false;
    try {
      done = typeof window !== "undefined" && localStorage.getItem(TOUR_STORAGE_KEY) === "1";
    } catch {
      /* ignore — modo privado etc. */
    }
    if (!done) {
      // Espera as animações de fade-up do Hub terminarem (max 0.7s + delay 0.3s)
      const t = setTimeout(() => setRun(true), 1200);
      return () => clearTimeout(t);
    }
  }, [forceStart]);

  const handleCallback = (data: CallBackProps) => {
    const { status } = data;
    const finished: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finished.includes(status)) {
      try { localStorage.setItem(TOUR_STORAGE_KEY, "1"); } catch { /* ignore */ }
      setRun(false);
      onClose?.();
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableScrolling={false}
      disableOverlayClose
      hideCloseButton={false}
      callback={handleCallback}
      locale={{
        back: "Voltar",
        close: "Fechar",
        last: "Concluir",
        next: "Próximo",
        skip: "Pular",
      }}
      styles={{
        options: {
          primaryColor: "#2563eb",
          zIndex: 10000,
          arrowColor: "#ffffff",
          backgroundColor: "#ffffff",
          textColor: "#1e293b",
        },
        buttonNext: {
          backgroundColor: "#2563eb",
          borderRadius: 8,
          padding: "8px 14px",
          fontWeight: 600,
        },
        buttonBack: {
          color: "#475569",
          marginRight: 6,
        },
        buttonSkip: {
          color: "#94a3b8",
        },
        tooltip: {
          borderRadius: 12,
          padding: 16,
          fontSize: 14,
          maxWidth: 360,
        },
        tooltipTitle: {
          fontSize: 15,
          fontWeight: 700,
          marginBottom: 6,
        },
      }}
    />
  );
}

export function resetPortalTour() {
  try { localStorage.removeItem(TOUR_STORAGE_KEY); } catch { /* ignore */ }
}
