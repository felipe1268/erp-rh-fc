import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Building2, Lock, LogIn, Eye, EyeOff } from "lucide-react";

export default function PortalLogin() {
  const [, navigate] = useLocation();
  const [cnpj, setCnpj] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);

  const loginMut = trpc.portalExterno.auth.login.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("portal_token", data.token);
      localStorage.setItem("portal_tipo", data.tipo);
      localStorage.setItem("portal_nome", data.nomeEmpresa || "");
      localStorage.setItem("portal_cnpj", data.cnpj);
      if (data.primeiroAcesso) {
        navigate("/portal/trocar-senha");
      } else {
        navigate("/portal/dashboard");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const formatCNPJ = (v: string) => {
    const n = v.replace(/\D/g, "").slice(0, 14);
    if (n.length <= 2) return n;
    if (n.length <= 5) return `${n.slice(0,2)}.${n.slice(2)}`;
    if (n.length <= 8) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5)}`;
    if (n.length <= 12) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8)}`;
    return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnpj || !senha) { toast.error("Preencha CNPJ e senha"); return; }
    loginMut.mutate({ cnpj: cnpj.replace(/\D/g, ""), senha });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Portal do Terceiro</h1>
          <p className="text-blue-200 mt-1">FC Gestão Integrada</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="text-gray-700 font-medium">CNPJ</Label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={cnpj} onChange={(e) => setCnpj(formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" className="pl-10 h-12 text-lg" />
              </div>
            </div>
            <div>
              <Label className="text-gray-700 font-medium">Senha</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type={showSenha ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Digite sua senha" className="pl-10 pr-10 h-12" />
                <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-lg font-semibold" disabled={loginMut.isPending}>
              {loginMut.isPending ? "Entrando..." : <span className="flex items-center gap-2"><LogIn className="w-5 h-5" /> Entrar</span>}
            </Button>
          </form>
          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-xs text-gray-400">Acesso exclusivo para empresas terceirizadas e parceiros cadastrados pela FC Engenharia.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
