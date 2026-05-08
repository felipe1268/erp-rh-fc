import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Building2, Lock, LogIn, Eye, EyeOff, FileText, Receipt, ClipboardCheck, ShieldCheck } from "lucide-react";

export default function PortalLoginCliente() {
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
        navigate("/portal/cliente/dashboard");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const formatDoc = (v: string) => {
    const n = v.replace(/\D/g, "").slice(0, 14);
    if (n.length <= 11) {
      if (n.length <= 3) return n;
      if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
      if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
      return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
    }
    return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnpj || !senha) { toast.error("Preencha CNPJ/CPF e senha"); return; }
    loginMut.mutate({ cnpj: cnpj.replace(/\D/g, ""), senha, tipoEsperado: "cliente" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex flex-col lg:flex-row">
      {/* Lado esquerdo: branding/contexto (apenas em telas grandes) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-xs font-semibold uppercase tracking-wider mb-8">
            <ShieldCheck className="w-3.5 h-3.5" /> Portal exclusivo para clientes
          </div>
          <h1 className="text-4xl font-bold leading-tight">
            Acompanhe sua obra
            <br />
            <span className="text-emerald-300">de ponta a ponta.</span>
          </h1>
          <p className="text-blue-100 mt-4 text-base max-w-md">
            Documentos, contratos, medições e a evolução do seu projeto — tudo no mesmo lugar.
          </p>
        </div>

        <div className="relative grid grid-cols-2 gap-3 max-w-md">
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
            <FileText className="w-5 h-5 text-emerald-300 mb-2" />
            <div className="text-sm font-semibold">Documentos</div>
            <div className="text-xs text-blue-200 mt-0.5">Contratos, ARTs, projetos.</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
            <Receipt className="w-5 h-5 text-emerald-300 mb-2" />
            <div className="text-sm font-semibold">Medições</div>
            <div className="text-xs text-blue-200 mt-0.5">Boletins e faturamento.</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
            <ClipboardCheck className="w-5 h-5 text-emerald-300 mb-2" />
            <div className="text-sm font-semibold">RDO</div>
            <div className="text-xs text-blue-200 mt-0.5">Diário da obra atualizado.</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
            <Building2 className="w-5 h-5 text-emerald-300 mb-2" />
            <div className="text-sm font-semibold">Cronograma</div>
            <div className="text-xs text-blue-200 mt-0.5">Andamento físico.</div>
          </div>
        </div>

        <div className="relative text-xs text-blue-200">
          © {new Date().getFullYear()} FC Engenharia · Portal do Cliente
        </div>
      </div>

      {/* Lado direito: formulário */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Header (visível em todas as telas) */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-lg shadow-blue-200 mb-4">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Portal do Cliente</h1>
            <p className="text-sm text-slate-500 mt-1">FC Engenharia — Acompanhe sua obra</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-slate-700 text-sm font-medium">CNPJ ou CPF</Label>
                <div className="relative mt-1.5">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    autoFocus
                    value={cnpj}
                    onChange={(e) => setCnpj(formatDoc(e.target.value))}
                    placeholder="00.000.000/0000-00 ou 000.000.000-00"
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <div>
                <Label className="text-slate-700 text-sm font-medium">Senha</Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type={showSenha ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Digite sua senha"
                    className="pl-10 pr-10 h-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha(!showSenha)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-base font-semibold gap-2 shadow-md shadow-blue-200"
                disabled={loginMut.isPending}
              >
                <LogIn className="w-4 h-4" />
                {loginMut.isPending ? "Entrando..." : "Entrar como cliente"}
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

            <div className="mt-6 pt-4 border-t border-slate-100 text-center space-y-1">
              <p className="text-xs text-slate-400">
                Acesso exclusivo para clientes da FC Engenharia.
              </p>
              <p className="text-xs text-slate-400">
                É terceirizado ou parceiro?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/portal/login")}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Entrar pelo portal externo
                </button>
              </p>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-6 lg:hidden">
            © {new Date().getFullYear()} FC Engenharia · Portal do Cliente
          </p>
        </div>
      </div>
    </div>
  );
}
