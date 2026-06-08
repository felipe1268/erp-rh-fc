import { useState, useEffect } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";

const DISMISS_KEY = "pwa-install-dismissed";

/** iOS/iPadOS. iPadOS 13+ se identifica como "MacIntel" → detecta por toque. */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadDesktopUA = navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
  return iDevice || iPadDesktopUA;
}

/** Safari no iOS — o ÚNICO navegador iOS onde "Adicionar à Tela de Início" existe.
 *  Chrome/Firefox/Edge no iOS (CriOS/FxiOS/EdgiOS/OPiOS) não têm esse atalho. */
function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const naoSafari = /CriOS|FxiOS|EdgiOS|OPiOS|mercury|GSA/i.test(ua);
  return isIOS() && /Safari/i.test(ua) && !naoSafari;
}

/** Já está aberto como app instalado (tela inicial)? Aí não mostra nada. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as any).standalone === true;
  return !!mql || iosStandalone;
}

export function PwaInstallBanner() {
  const [prompt, setPrompt] = useState<any>(null);
  const [iosVisible, setIosVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Rev. 2905 — Toggle global por empresa: esconde o banner quando desligado.
  // Default ativo (true) preserva o comportamento da Rev. 2904 enquanto carrega.
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const pwaCfg = trpc.companies.getPwaBannerConfig.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const bannerAtivo = pwaCfg.data ? pwaCfg.data.ativo : true;

  useEffect(() => {
    // Já instalado, ou já dispensou nesta sessão → não mostra.
    if (isStandalone()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {}

    // Android / Chrome: usa o evento nativo de instalação.
    const handler = (e: any) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS/iPadOS: o evento acima NUNCA dispara — mostra instrução manual.
    if (isIOS()) setIosVisible(true);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const fecharTudo = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
  };

  if (dismissed) return null;
  if (!bannerAtivo) return null;

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") fecharTudo();
  };

  // ── iOS/iPadOS: instalação é manual (a Apple não permite via botão) ──
  if (!prompt && iosVisible) {
    const safari = isIOSSafari();
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 bg-[#0A192F] text-white rounded-xl p-4 shadow-2xl flex items-start gap-3 md:max-w-sm md:left-auto md:right-4">
        <div className="flex-1">
          <p className="font-bold text-sm">📱 Instalar no iPad / iPhone</p>
          {safari ? (
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">
              Toque em{" "}
              <Share size={13} className="inline align-text-bottom mx-0.5" />{" "}
              <span className="font-semibold">Compartilhar</span> e depois em{" "}
              <Plus size={13} className="inline align-text-bottom mx-0.5" />{" "}
              <span className="font-semibold">"Adicionar à Tela de Início"</span>.
            </p>
          ) : (
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">
              Abra este endereço no <span className="font-semibold">Safari</span> e use{" "}
              <Share size={13} className="inline align-text-bottom mx-0.5" />{" "}
              <span className="font-semibold">Compartilhar → "Adicionar à Tela de Início"</span>{" "}
              (só o Safari permite instalar no iPhone/iPad).
            </p>
          )}
        </div>
        <button onClick={fecharTudo} className="text-gray-400 hover:text-white p-1 shrink-0">
          <X size={18} />
        </button>
      </div>
    );
  }

  // ── Android / Chrome: botão de instalação nativo ──
  if (!prompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-[#0A192F] text-white rounded-xl p-4 shadow-2xl flex items-center gap-3 md:max-w-sm md:left-auto md:right-4">
      <div className="flex-1">
        <p className="font-bold text-sm">📱 Instalar no celular</p>
        <p className="text-xs text-gray-300 mt-0.5">Acesse mais rápido pela tela inicial</p>
      </div>
      <button
        onClick={handleInstall}
        className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1"
      >
        <Download size={14} /> Instalar
      </button>
      <button onClick={fecharTudo} className="text-gray-400 hover:text-white p-1">
        <X size={18} />
      </button>
    </div>
  );
}
