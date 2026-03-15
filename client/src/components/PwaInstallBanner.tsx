import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

export function PwaInstallBanner() {
  const [prompt, setPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt || dismissed) return null;

  const handleInstall = async () => {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setDismissed(true);
  };

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
      <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-white p-1">
        <X size={18} />
      </button>
    </div>
  );
}
