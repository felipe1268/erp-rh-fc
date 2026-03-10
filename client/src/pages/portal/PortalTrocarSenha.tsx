import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function PortalTrocarSenha() {
  const [, navigate] = useLocation();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const cnpj = localStorage.getItem("portal_cnpj") || "";
  const nome = localStorage.getItem("portal_nome") || "";

  const trocarMut = trpc.portalExterno.auth.trocarSenha.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      navigate("/portal/dashboard");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    if (novaSenha !== confirmar) { toast.error("As senhas não conferem"); return; }
    trocarMut.mutate({ cnpj, senhaAtual, novaSenha });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mb-4">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Trocar Senha</h1>
          <p className="text-blue-200 mt-1">{nome || "Primeiro acesso"}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
            <p className="text-sm text-amber-800 font-medium">Primeiro acesso detectado</p>
            <p className="text-xs text-amber-600">Por segurança, crie uma nova senha para continuar.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Senha Temporária (atual)</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type={showSenha ? "text" : "password"} value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} placeholder="Senha recebida" className="pl-10 h-11" />
              </div>
            </div>
            <div>
              <Label>Nova Senha</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type={showSenha ? "text" : "password"} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" className="pl-10 h-11" />
              </div>
            </div>
            <div>
              <Label>Confirmar Nova Senha</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type={showSenha ? "text" : "password"} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="Repita a nova senha" className="pl-10 h-11" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <button type="button" onClick={() => setShowSenha(!showSenha)} className="flex items-center gap-1 hover:text-gray-700">
                {showSenha ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showSenha ? "Ocultar senhas" : "Mostrar senhas"}
              </button>
            </div>
            <Button type="submit" className="w-full h-11 bg-amber-500 hover:bg-amber-600 font-semibold" disabled={trocarMut.isPending}>
              {trocarMut.isPending ? "Alterando..." : "Alterar Senha e Continuar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
