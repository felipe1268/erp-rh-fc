import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
// useAuth removido - usar trpc.auth.me.useQuery direto para evitar erro global
import { getLoginUrl } from "@/const";
import {
  Lock, Mail, User, Eye, EyeOff, ArrowLeft, Loader2,
  Shield, Building2, Users, Clock, ChevronRight,
} from "lucide-react";

export default function Login() {
  // Não usar useAuth() aqui para evitar query auth.me que gera erro na página de login
  // Verificar usuário logado via query direta com retry desabilitado
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const user = meQuery.data ?? null;
  const [view, setView] = useState<"login" | "forgot" | "changePassword">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const loginMutation = trpc.userManagement.loginLocal.useMutation({
    onSuccess: (data) => {
      if (data.mustChangePassword) {
        setView("changePassword");
        toast.info("Primeiro acesso! Por favor, defina uma nova senha.");
      } else {
        toast.success("Login realizado com sucesso!");
        window.location.href = "/";
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const changePwdMutation = trpc.userManagement.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      window.location.href = "/";
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { toast.error("Preencha usuário e senha"); return; }
    setIsLoading(true);
    loginMutation.mutate({ username, password }, { onSettled: () => setIsLoading(false) });
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) { toast.error("Informe seu e-mail"); return; }
    // Simula envio — será implementado com backend real
    setForgotSent(true);
    toast.success("Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.");
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error("As senhas não coincidem"); return; }
    if (newPwd.length < 4) { toast.error("A nova senha deve ter pelo menos 4 caracteres"); return; }
    changePwdMutation.mutate({ currentPassword: password, newPassword: newPwd });
  };

  // Se já logado, não redirecionar - a tela de login serve também como apresentação
  // O usuário pode acessar /login para ver a tela mesmo logado

  return (
    <div className="min-h-screen flex">
      {/* LEFT SIDE - Branding / Hero */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Background image with overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/bQPpwabkjbJSGceG.jpg)` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1B2A4A]/90 via-[#1B2A4A]/80 to-[#0F1D36]/95" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <img
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png"
              alt="FC Engenharia"
              className="h-14 object-contain"
            />
          </div>

          {/* Main text */}
          <div className="max-w-lg">
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Sistema de Gestão
              <br />
              <span className="text-[#D4A843]">RH & Departamento Pessoal</span>
            </h1>
            <p className="text-blue-200/80 text-lg leading-relaxed mb-8">
              Controle completo de colaboradores, folha de pagamento, ponto eletrônico,
              EPIs e processos trabalhistas em uma única plataforma.
            </p>

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-4">
              <FeatureItem icon={Users} text="Gestão de Colaboradores" />
              <FeatureItem icon={Clock} text="Controle de Ponto" />
              <FeatureItem icon={Building2} text="Rateio por Obra" />
              <FeatureItem icon={Shield} text="Segurança do Trabalho" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <p className="text-blue-300/40 text-xs">
              © {new Date().getFullYear()} FC Engenharia. Todos os direitos reservados.
            </p>
            <p className="text-blue-300/40 text-xs">
              v4.0 — ERP RH & DP
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE - Login Form */}
      <div className="w-full lg:w-[45%] flex flex-col bg-gradient-to-b from-[#F8FAFC] to-[#EFF3F8]">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center justify-center pt-8 pb-4">
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png"
            alt="FC Engenharia"
            className="h-12 object-contain"
          />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="w-full max-w-[420px]">

            {/* ============ LOGIN VIEW ============ */}
            {view === "login" && (
              <div className="space-y-6">
                <div className="text-center lg:text-left">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Bem-vindo de volta</h2>
                  <p className="text-gray-500 text-sm">Acesse sua conta para continuar</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Usuário</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Digite seu usuário"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-12 pl-10 bg-white border-gray-200 focus:border-[#1B2A4A] focus:ring-[#1B2A4A]/20 rounded-xl"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Senha</label>
                      <button
                        type="button"
                        onClick={() => setView("forgot")}
                        className="text-xs text-[#1B2A4A] hover:text-[#D4A843] font-medium transition-colors"
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Digite sua senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-12 pl-10 pr-10 bg-white border-gray-200 focus:border-[#1B2A4A] focus:ring-[#1B2A4A]/20 rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-[#1B2A4A] hover:bg-[#152238] text-white font-semibold rounded-xl shadow-lg shadow-[#1B2A4A]/20 transition-all hover:shadow-xl"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Entrando...</>
                    ) : (
                      <>Entrar<ChevronRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </form>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[#F8FAFC] px-3 text-gray-400">ou</span>
                  </div>
                </div>

                {/* OAuth */}
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
                  onClick={() => { window.location.href = getLoginUrl(); }}
                >
                  <svg className="h-4 w-4 mr-2 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                  Entrar com Manus OAuth
                </Button>

                <p className="text-center text-xs text-gray-400 pt-2">
                  Senha padrão para primeiro acesso: <span className="font-mono font-medium text-gray-500">asdf1020</span>
                </p>
              </div>
            )}

            {/* ============ FORGOT PASSWORD VIEW ============ */}
            {view === "forgot" && (
              <div className="space-y-6">
                <button
                  onClick={() => { setView("login"); setForgotSent(false); setForgotEmail(""); }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar ao login
                </button>

                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Recuperar Senha</h2>
                  <p className="text-gray-500 text-sm">
                    Informe o e-mail cadastrado e enviaremos as instruções para redefinir sua senha.
                  </p>
                </div>

                {!forgotSent ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">E-mail</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          type="email"
                          placeholder="seu.email@empresa.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="h-12 pl-10 bg-white border-gray-200 focus:border-[#1B2A4A] focus:ring-[#1B2A4A]/20 rounded-xl"
                          autoFocus
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 bg-[#1B2A4A] hover:bg-[#152238] text-white font-semibold rounded-xl shadow-lg shadow-[#1B2A4A]/20"
                    >
                      Enviar Instruções
                    </Button>
                  </form>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full">
                      <Mail className="h-6 w-6 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-green-800">E-mail Enviado!</h3>
                    <p className="text-sm text-green-700">
                      Se o e-mail <strong>{forgotEmail}</strong> estiver cadastrado no sistema,
                      você receberá as instruções para redefinir sua senha em instantes.
                    </p>
                    <p className="text-xs text-green-600">
                      Verifique também sua caixa de spam.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-2"
                      onClick={() => { setView("login"); setForgotSent(false); setForgotEmail(""); }}
                    >
                      Voltar ao Login
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ============ CHANGE PASSWORD VIEW ============ */}
            {view === "changePassword" && (
              <div className="space-y-6">
                <div>
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full mb-4">
                    <Shield className="h-6 w-6 text-amber-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Defina sua Senha</h2>
                  <p className="text-gray-500 text-sm">
                    Este é seu primeiro acesso. Por segurança, defina uma nova senha pessoal.
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Nova Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="password"
                        placeholder="Mínimo 4 caracteres"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        className="h-12 pl-10 bg-white border-gray-200 focus:border-[#1B2A4A] focus:ring-[#1B2A4A]/20 rounded-xl"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Confirmar Nova Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="password"
                        placeholder="Repita a nova senha"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        className="h-12 pl-10 bg-white border-gray-200 focus:border-[#1B2A4A] focus:ring-[#1B2A4A]/20 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Password strength indicator */}
                  {newPwd && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 4 ? "bg-green-500" : "bg-gray-200"}`} />
                        <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 6 ? "bg-green-500" : "bg-gray-200"}`} />
                        <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 8 ? "bg-green-500" : "bg-gray-200"}`} />
                        <div className={`h-1 flex-1 rounded-full ${/[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) ? "bg-green-500" : "bg-gray-200"}`} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {newPwd.length < 4 ? "Muito curta" : newPwd.length < 6 ? "Razoável" : newPwd.length < 8 ? "Boa" : "Forte"}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 bg-[#1B2A4A] hover:bg-[#152238] text-white font-semibold rounded-xl shadow-lg shadow-[#1B2A4A]/20"
                    disabled={changePwdMutation.isPending}
                  >
                    {changePwdMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</>
                    ) : (
                      "Salvar Nova Senha"
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="px-6 py-4 text-center lg:hidden">
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} FC Engenharia — ERP RH & DP
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/5 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/10">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#D4A843]/20 flex items-center justify-center">
        <Icon className="h-4 w-4 text-[#D4A843]" />
      </div>
      <span className="text-sm text-blue-100/90 font-medium">{text}</span>
    </div>
  );
}
