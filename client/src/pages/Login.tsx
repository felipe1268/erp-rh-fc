import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import {
  Lock, Mail, User, Eye, EyeOff, ArrowLeft, Loader2,
  Shield, ChevronRight,
} from "lucide-react";

const BG_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/GQvMMwSzLAaNgkun.png";

export default function Login() {
  const hasCookie = typeof document !== "undefined" && document.cookie.includes("app_session_id");
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: hasCookie,
  });
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
    setForgotSent(true);
    toast.success("Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.");
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error("As senhas não coincidem"); return; }
    if (newPwd.length < 4) { toast.error("A nova senha deve ter pelo menos 4 caracteres"); return; }
    changePwdMutation.mutate({ currentPassword: password, newPassword: newPwd });
  };

  return (
    <div className="min-h-screen flex">
      {/* ========== LEFT SIDE - Photo P&B with ERP text overlay ========== */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Photo in grayscale */}
        <img
          src={BG_URL}
          alt=""
          className="absolute inset-0 w-full h-full object-cover grayscale"
        />
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#1B2A4A]/80 via-[#1B2A4A]/60 to-[#1B2A4A]/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A4A]/70 via-transparent to-[#1B2A4A]/30" />

        {/* Text overlay content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Top - subtle badge */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-1.5">
              <span className="text-white/80 text-xs font-semibold tracking-widest uppercase">Plataforma Corporativa</span>
            </div>
          </div>

          {/* Center - Large ERP text */}
          <div className="max-w-lg">
            {/* Giant ERP watermark behind */}
            <div className="absolute left-8 top-1/2 -translate-y-1/2 text-[200px] font-black text-white/[0.04] leading-none tracking-tighter select-none pointer-events-none">
              ERP
            </div>
            <h1 className="text-6xl font-black text-white leading-[1.05] mb-4 tracking-tight relative">
              ERP
              <br />
              <span className="text-[#D4A843]">Gestão</span>
              <br />
              <span className="text-[#D4A843]">Integrada</span>
            </h1>
            <div className="w-20 h-1 bg-[#D4A843] rounded-full mb-6" />
            <p className="text-white/60 text-lg leading-relaxed">
              Potencialize sua gestão com soluções integradas e inteligentes.
            </p>
          </div>

          {/* Bottom - copyright */}
          <p className="text-white/25 text-xs">
            © {new Date().getFullYear()} Todos os direitos reservados.
          </p>
        </div>
      </div>

      {/* ========== RIGHT SIDE - Clean white login form ========== */}
      <div className="w-full lg:w-[45%] flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center px-8 py-8">
          <div className="w-full max-w-[400px]">
            {/* Mobile header (only shown on small screens) */}
            <div className="lg:hidden flex flex-col items-center mb-10">
              <h2 className="text-2xl font-black text-[#1B2A4A]">ERP - Gestão Integrada</h2>
              <div className="w-12 h-0.5 bg-[#D4A843] rounded-full mt-2" />
              <p className="text-gray-400 text-xs mt-2">Plataforma Corporativa</p>
            </div>

            {/* ============ LOGIN VIEW ============ */}
            {view === "login" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#1B2A4A] mb-1">Bem-vindo</h2>
                  <p className="text-gray-400 text-sm">Acesse sua conta para continuar</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-600">Usuário</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                      <Input
                        type="text"
                        placeholder="Digite seu usuário"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-12 pl-10 bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-[#1B2A4A]/40 focus:ring-[#1B2A4A]/10 rounded-xl"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-600">Senha</label>
                      <button
                        type="button"
                        onClick={() => setView("forgot")}
                        className="text-xs text-[#D4A843] hover:text-[#B8922F] font-medium transition-colors"
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Digite sua senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-12 pl-10 pr-10 bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-[#1B2A4A]/40 focus:ring-[#1B2A4A]/10 rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-[#1B2A4A] hover:bg-[#243658] text-white font-bold rounded-xl shadow-lg shadow-[#1B2A4A]/20 transition-all hover:shadow-xl"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Entrando...</>
                    ) : (
                      <>Entrar<ChevronRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </form>

              </div>
            )}

            {/* ============ FORGOT PASSWORD VIEW ============ */}
            {view === "forgot" && (
              <div className="space-y-6">
                <button
                  onClick={() => setView("login")}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar ao login
                </button>

                <div>
                  <h2 className="text-2xl font-bold text-[#1B2A4A] mb-1">Recuperar Senha</h2>
                  <p className="text-gray-400 text-sm">
                    Informe o e-mail cadastrado e enviaremos as instruções para redefinir sua senha.
                  </p>
                </div>

                {!forgotSent ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-600">E-mail</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                        <Input
                          type="email"
                          placeholder="seu.email@empresa.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="h-12 pl-10 bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-[#1B2A4A]/40 focus:ring-[#1B2A4A]/10 rounded-xl"
                          autoFocus
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 bg-[#1B2A4A] hover:bg-[#243658] text-white font-bold rounded-xl shadow-lg shadow-[#1B2A4A]/20"
                    >
                      Enviar Instruções
                    </Button>
                  </form>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full">
                      <Mail className="h-6 w-6 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-emerald-700">E-mail Enviado!</h3>
                    <p className="text-sm text-emerald-600">
                      Se o e-mail <strong>{forgotEmail}</strong> estiver cadastrado no sistema,
                      você receberá as instruções para redefinir sua senha em instantes.
                    </p>
                    <p className="text-xs text-emerald-500">
                      Verifique também sua caixa de spam.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
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
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-50 rounded-full mb-4">
                    <Shield className="h-6 w-6 text-[#D4A843]" />
                  </div>
                  <h2 className="text-2xl font-bold text-[#1B2A4A] mb-1">Defina sua Senha</h2>
                  <p className="text-gray-400 text-sm">
                    Este é seu primeiro acesso. Por segurança, defina uma nova senha pessoal.
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-600">Nova Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                      <Input
                        type="password"
                        placeholder="Mínimo 4 caracteres"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        className="h-12 pl-10 bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-[#1B2A4A]/40 focus:ring-[#1B2A4A]/10 rounded-xl"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-600">Confirmar Nova Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                      <Input
                        type="password"
                        placeholder="Repita a nova senha"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        className="h-12 pl-10 bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-[#1B2A4A]/40 focus:ring-[#1B2A4A]/10 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Password strength indicator */}
                  {newPwd && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 4 ? "bg-emerald-500" : "bg-gray-200"}`} />
                        <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 6 ? "bg-emerald-500" : "bg-gray-200"}`} />
                        <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 8 ? "bg-emerald-500" : "bg-gray-200"}`} />
                        <div className={`h-1 flex-1 rounded-full ${/[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) ? "bg-emerald-500" : "bg-gray-200"}`} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {newPwd.length < 4 ? "Muito curta" : newPwd.length < 6 ? "Razoável" : newPwd.length < 8 ? "Boa" : "Forte"}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 bg-[#1B2A4A] hover:bg-[#243658] text-white font-bold rounded-xl shadow-lg shadow-[#1B2A4A]/20"
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

        {/* Bottom bar - desktop */}
        <div className="px-8 py-4 text-center border-t border-gray-100">
          <p className="text-xs text-gray-300">
            © {new Date().getFullYear()} ERP - Gestão Integrada
          </p>
        </div>
      </div>
    </div>
  );
}
