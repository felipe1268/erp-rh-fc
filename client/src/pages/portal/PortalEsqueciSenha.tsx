import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Building2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function PortalEsqueciSenha() {
  const [, navigate] = useLocation();
  const [cnpj, setCnpj] = useState("");
  const [enviado, setEnviado] = useState(false);

  const mut = trpc.portalExterno.auth.solicitarRedefinicao.useMutation({
    onSuccess: () => setEnviado(true),
    onError: (e) => toast.error(e.message),
  });

  const formatDoc = (v: string) => {
    const n = v.replace(/\D/g, "").slice(0, 14);
    if (n.length <= 11) {
      if (n.length <= 3) return n;
      if (n.length <= 6) return `${n.slice(0,3)}.${n.slice(3)}`;
      if (n.length <= 9) return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6)}`;
      return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`;
    }
    return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnpj.replace(/\D/g, "")) { toast.error("Informe seu CNPJ ou CPF"); return; }
    mut.mutate({ cnpj: cnpj.replace(/\D/g, "") });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 mb-4">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Recuperar Senha</h1>
          <p className="text-blue-200 mt-1">Enviaremos um link de redefinição por e-mail</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {enviado ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <h3 className="text-lg font-semibold text-gray-800">Solicitação recebida</h3>
              <p className="text-sm text-gray-600">
                Se houver cadastro vinculado, enviaremos em instantes um e-mail com o link de redefinição válido por 1 hora.
              </p>
              <Button onClick={() => navigate("/portal/login")} className="w-full bg-blue-600 hover:bg-blue-700">
                Voltar ao login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <Label className="text-gray-700 font-medium">CNPJ ou CPF cadastrado</Label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input value={cnpj} onChange={(e) => setCnpj(formatDoc(e.target.value))} placeholder="00.000.000/0000-00 ou 000.000.000-00" className="pl-10 h-12 text-lg" />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-lg font-semibold" disabled={mut.isPending}>
                {mut.isPending ? "Enviando..." : "Enviar link de redefinição"}
              </Button>
              <button type="button" onClick={() => navigate("/portal/login")} className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-800">
                <ArrowLeft className="w-4 h-4" /> Voltar ao login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
