import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

export default function Login() {
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const loginMutation = trpc.userManagement.loginLocal.useMutation({
    onSuccess: (data) => {
      if (data.mustChangePassword) {
        setShowChangePassword(true);
        toast.info("Primeiro acesso! Por favor, altere sua senha.");
      } else {
        toast.success("Login realizado com sucesso!");
        window.location.href = "/";
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const changePwdMutation = trpc.userManagement.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Preencha usuário e senha");
      return;
    }
    setIsLoading(true);
    loginMutation.mutate({ username, password }, {
      onSettled: () => setIsLoading(false),
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (newPwd.length < 4) {
      toast.error("A nova senha deve ter pelo menos 4 caracteres");
      return;
    }
    changePwdMutation.mutate({ currentPassword: password, newPassword: newPwd });
  };

  // Se já está logado, redirecionar
  if (user) {
    window.location.href = "/";
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">ERP RH & DP</h1>
          <p className="text-blue-300 mt-1">FC Engenharia</p>
        </div>

        {!showChangePassword ? (
          <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl">Acesso ao Sistema</CardTitle>
              <CardDescription>Entre com suas credenciais</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Usuário</label>
                  <Input
                    type="text"
                    placeholder="Digite seu usuário"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-11"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Senha</label>
                  <Input
                    type="password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                  {isLoading ? "Entrando..." : "Entrar"}
                </Button>
              </form>

              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-xs text-center text-gray-500 mb-3">Ou acesse com sua conta Manus</p>
                <Button
                  variant="outline"
                  className="w-full h-10"
                  onClick={() => { window.location.href = getLoginUrl(); }}
                >
                  Entrar com Manus OAuth
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl">Alterar Senha</CardTitle>
              <CardDescription>Primeiro acesso - defina uma nova senha</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Nova Senha</label>
                  <Input
                    type="password"
                    placeholder="Digite a nova senha"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    className="h-11"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Confirmar Nova Senha</label>
                  <Input
                    type="password"
                    placeholder="Confirme a nova senha"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700" disabled={changePwdMutation.isPending}>
                  {changePwdMutation.isPending ? "Salvando..." : "Salvar Nova Senha"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-blue-300/60 mt-6">
          Senha padrão inicial: fc2026
        </p>
      </div>
    </div>
  );
}
