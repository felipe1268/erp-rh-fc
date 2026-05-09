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
      } else if (data.tipo === "cliente") {
        navigate("/portal/cliente/dashboard");
      } else {
        navigate("/portal/dashboard");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const formatDoc = (v: string) => {
    // Se contiver @ ou letra (não dígito/pontuação), trata como e-mail e não formata
    if (/[@a-zA-Z]/.test(v)) return v.trim();
    const n = v.replace(/\D/g, "").slice(0, 14);
    if (n.length <= 11) {
      if (n.length <= 3) return n;
      if (n.length <= 6) return `${n.slice(0,3)}.${n.slice(3)}`;
      if (n.length <= 9) return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6)}`;
      return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`;
    }
    return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnpj || !senha) { toast.error("Preencha CNPJ/CPF/e-mail e senha"); return; }
    const isEmail = cnpj.includes("@");
    const ident = isEmail ? cnpj.trim() : cnpj.replace(/\D/g, "");
    loginMut.mutate({ cnpj: ident, senha });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Portal Externo</h1>
          <p className="text-blue-200 mt-1">FC Engenharia — Acesso de terceiros, parceiros e clientes</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="text-gray-700 font-medium">CNPJ, CPF ou E-mail</Label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={cnpj} onChange={(e) => setCnpj(formatDoc(e.target.value))} placeholder="CNPJ, CPF ou seu e-mail cadastrado" className="pl-10 h-12 text-lg" autoComplete="username" />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Você pode entrar com seu CNPJ/CPF ou com o e-mail cadastrado pelo administrador.</p>
            </div>
            <div>
              <Label className="text-gray-700 font-medium">Senha</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type={showSenha ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Digite sua senha" className="pl-10 pr-12 h-12" autoComplete="current-password" />
                {/* Rev. 1567 — botão olho com tap area maior (p-2), z-20
                    e onPointerDown p/ funcionar bem no iPad/iOS Safari
                    (clique antes era engolido pelo input/AutoFill). */}
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); setShowSenha((v) => !v); }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 z-20 p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
                  aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                  tabIndex={-1}
                >
                  {showSenha ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-lg font-semibold" disabled={loginMut.isPending}>
              {loginMut.isPending ? "Entrando..." : <span className="flex items-center gap-2"><LogIn className="w-5 h-5" /> Entrar</span>}
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/portal/esqueci-senha")}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
          </form>
          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-xs text-gray-400">Acesso exclusivo para empresas terceirizadas, parceiros e clientes cadastrados pela FC Engenharia.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
