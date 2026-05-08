import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";

export default function PortalRedefinirSenha() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ token: string }>("/portal/redefinir-senha/:token");
  const token = params?.token || "";
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [show, setShow] = useState(false);
  const [ok, setOk] = useState(false);

  const mut = trpc.portalExterno.auth.redefinirSenha.useMutation({
    onSuccess: () => setOk(true),
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    if (senha !== confirma) { toast.error("As senhas não coincidem"); return; }
    mut.mutate({ token, novaSenha: senha });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500 mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Nova Senha</h1>
          <p className="text-blue-200 mt-1">Defina sua nova senha de acesso</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {ok ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <h3 className="text-lg font-semibold text-gray-800">Senha redefinida!</h3>
              <p className="text-sm text-gray-600">Você já pode fazer login com sua nova senha.</p>
              <Button onClick={() => navigate("/portal/login")} className="w-full bg-emerald-600 hover:bg-emerald-700">
                Ir para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <Label className="text-gray-700 font-medium">Nova senha</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input type={show ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" className="pl-10 pr-10 h-12" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-gray-700 font-medium">Confirme a nova senha</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input type={show ? "text" : "password"} value={confirma} onChange={(e) => setConfirma(e.target.value)} className="pl-10 h-12" />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-lg font-semibold" disabled={mut.isPending || !token}>
                {mut.isPending ? "Salvando..." : "Definir nova senha"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
