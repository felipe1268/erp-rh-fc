import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import {
  Lock, Mail, User, Eye, EyeOff, ArrowLeft, Loader2,
  Shield, Building2, Users, Clock, ChevronRight, HardHat, Gavel,
} from "lucide-react";

const BG_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/sAcAfLCNMSdhyqJT.jpg";
const LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png";

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
    <div className="min-h-screen flex relative">
      {/* Full-screen cinematic background */}
      <div className="absolute inset-0">
        <img
          src={BG_URL}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A1628]/95 via-[#0F1D36]/85 to-[#0A1628]/70" />
      </div>

      {/* LEFT SIDE - Branding / Hero */}
      <div className="hidden lg:flex lg:w-[55%] relative z-10 overflow-hidden">
        <div className="relative flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <img
              src={LOGO_URL}
              alt="FC Engenharia"
              className="h-16 object-contain drop-shadow-2xl"
            />
          </div>

          {/* Main text */}
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-2 bg-[#D4A843]/15 backdrop-blur-sm border border-[#D4A843]/30 rounded-full px-4 py-1.5 mb-6">
              <HardHat className="h-4 w-4 text-[#D4A843]" />
              <span className="text-[#D4A843] text-xs font-semibold tracking-wide">PLATAFORMA ERP CORPORATIVA</span>
            </div>
            <h1 className="text-5xl font-black text-white leading-[1.1] mb-4 tracking-tight">
              FC Gestão
              <br />
              <span className="bg-gradient-to-r from-[#D4A843] via-[#E8C76A] to-[#D4A843] bg-clip-text text-transparent">
                Integrada
              </span>
            </h1>
            <p className="text-blue-200/70 text-lg leading-relaxed mb-10">
              Plataforma unificada de gestão empresarial para engenharia civil.
              Controle completo de RH, Segurança do Trabalho, Jurídico e muito mais.
            </p>

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-3">
              <FeatureItem icon={Users} text="RH & Departamento Pessoal" />
              <FeatureItem icon={Shield} text="Segurança do Trabalho" />
              <FeatureItem icon={Gavel} text="Gestão Jurídica" />
              <FeatureItem icon={Building2} text="Gestão de Obras" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <p className="text-blue-300/30 text-xs">
              © {new Date().getFullYear()} FC Engenharia Projetos e Obras. Todos os direitos reservados.
            </p>
            <p className="text-blue-300/30 text-xs font-mono">
              ERP v5.0
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE - Login Form */}
      <div className="w-full lg:w-[45%] flex flex-col relative z-10">
        {/* Glass card container */}
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="w-full max-w-[420px]">
            {/* Mobile logo */}
            <div className="lg:hidden flex flex-col items-center mb-8">
              <img
                src={LOGO_URL}
                alt="FC Engenharia"
                className="h-14 object-contain mb-3"
              />
              <h2 className="text-xl font-bold text-white">FC Gestão Integrada</h2>
              <p className="text-blue-200/50 text-xs mt-1">Plataforma ERP Corporativa</p>
            </div>

            {/* Glass form card */}
            <div className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/30">

              {/* ============ LOGIN VIEW ============ */}
              {view === "login" && (
                <div className="space-y-6">
                  <div className="text-center lg:text-left">
                    <h2 className="text-2xl font-bold text-white mb-1">Bem-vindo de volta</h2>
                    <p className="text-blue-200/50 text-sm">Acesse sua conta para continuar</p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-blue-100/70">Usuário</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/40" />
                        <Input
                          type="text"
                          placeholder="Digite seu usuário"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="h-12 pl-10 bg-white/[0.06] border-white/10 text-white placeholder:text-blue-200/30 focus:border-[#D4A843]/50 focus:ring-[#D4A843]/20 rounded-xl"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-blue-100/70">Senha</label>
                        <button
                          type="button"
                          onClick={() => setView("forgot")}
                          className="text-xs text-[#D4A843]/80 hover:text-[#D4A843] font-medium transition-colors"
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/40" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Digite sua senha"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-12 pl-10 pr-10 bg-white/[0.06] border-white/10 text-white placeholder:text-blue-200/30 focus:border-[#D4A843]/50 focus:ring-[#D4A843]/20 rounded-xl"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300/40 hover:text-blue-200/60"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 bg-gradient-to-r from-[#D4A843] to-[#B8922F] hover:from-[#E0B64E] hover:to-[#C9A03A] text-[#0F1729] font-bold rounded-xl shadow-lg shadow-[#D4A843]/20 transition-all hover:shadow-xl hover:shadow-[#D4A843]/30"
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
                      <div className="w-full border-t border-white/10" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-transparent px-3 text-blue-200/30">ou</span>
                    </div>
                  </div>

                  {/* OAuth */}
                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-xl border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-blue-100/70 font-medium"
                    onClick={() => { window.location.href = getLoginUrl(); }}
                  >
                    <svg className="h-4 w-4 mr-2 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                    Entrar com Manus OAuth
                  </Button>

                  <p className="text-center text-xs text-blue-200/30 pt-2">
                    Senha padrão para primeiro acesso: <span className="font-mono font-medium text-blue-200/50">asdf1020</span>
                  </p>
                </div>
              )}

              {/* ============ FORGOT PASSWORD VIEW ============ */}
              {view === "forgot" && (
                <div className="space-y-6">
                  <button
                    onClick={() => setView("login")}
                    className="flex items-center gap-1.5 text-sm text-blue-200/50 hover:text-blue-200/70 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Voltar ao login
                  </button>

                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Recuperar Senha</h2>
                    <p className="text-blue-200/50 text-sm">
                      Informe o e-mail cadastrado e enviaremos as instruções para redefinir sua senha.
                    </p>
                  </div>

                  {!forgotSent ? (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-blue-100/70">E-mail</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/40" />
                          <Input
                            type="email"
                            placeholder="seu.email@empresa.com"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            className="h-12 pl-10 bg-white/[0.06] border-white/10 text-white placeholder:text-blue-200/30 focus:border-[#D4A843]/50 focus:ring-[#D4A843]/20 rounded-xl"
                            autoFocus
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-12 bg-gradient-to-r from-[#D4A843] to-[#B8922F] hover:from-[#E0B64E] hover:to-[#C9A03A] text-[#0F1729] font-bold rounded-xl shadow-lg shadow-[#D4A843]/20"
                      >
                        Enviar Instruções
                      </Button>
                    </form>
                  ) : (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center space-y-3">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500/20 rounded-full">
                        <Mail className="h-6 w-6 text-emerald-400" />
                      </div>
                      <h3 className="font-semibold text-emerald-300">E-mail Enviado!</h3>
                      <p className="text-sm text-emerald-200/70">
                        Se o e-mail <strong className="text-emerald-300">{forgotEmail}</strong> estiver cadastrado no sistema,
                        você receberá as instruções para redefinir sua senha em instantes.
                      </p>
                      <p className="text-xs text-emerald-200/50">
                        Verifique também sua caixa de spam.
                      </p>
                      <Button
                        variant="outline"
                        className="mt-2 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
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
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500/20 rounded-full mb-4">
                      <Shield className="h-6 w-6 text-[#D4A843]" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">Defina sua Senha</h2>
                    <p className="text-blue-200/50 text-sm">
                      Este é seu primeiro acesso. Por segurança, defina uma nova senha pessoal.
                    </p>
                  </div>

                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-blue-100/70">Nova Senha</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/40" />
                        <Input
                          type="password"
                          placeholder="Mínimo 4 caracteres"
                          value={newPwd}
                          onChange={(e) => setNewPwd(e.target.value)}
                          className="h-12 pl-10 bg-white/[0.06] border-white/10 text-white placeholder:text-blue-200/30 focus:border-[#D4A843]/50 focus:ring-[#D4A843]/20 rounded-xl"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-blue-100/70">Confirmar Nova Senha</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/40" />
                        <Input
                          type="password"
                          placeholder="Repita a nova senha"
                          value={confirmPwd}
                          onChange={(e) => setConfirmPwd(e.target.value)}
                          className="h-12 pl-10 bg-white/[0.06] border-white/10 text-white placeholder:text-blue-200/30 focus:border-[#D4A843]/50 focus:ring-[#D4A843]/20 rounded-xl"
                        />
                      </div>
                    </div>

                    {/* Password strength indicator */}
                    {newPwd && (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 4 ? "bg-emerald-500" : "bg-white/10"}`} />
                          <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 6 ? "bg-emerald-500" : "bg-white/10"}`} />
                          <div className={`h-1 flex-1 rounded-full ${newPwd.length >= 8 ? "bg-emerald-500" : "bg-white/10"}`} />
                          <div className={`h-1 flex-1 rounded-full ${/[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) ? "bg-emerald-500" : "bg-white/10"}`} />
                        </div>
                        <p className="text-xs text-blue-200/40">
                          {newPwd.length < 4 ? "Muito curta" : newPwd.length < 6 ? "Razoável" : newPwd.length < 8 ? "Boa" : "Forte"}
                        </p>
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full h-12 bg-gradient-to-r from-[#D4A843] to-[#B8922F] hover:from-[#E0B64E] hover:to-[#C9A03A] text-[#0F1729] font-bold rounded-xl shadow-lg shadow-[#D4A843]/20"
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
        </div>

        {/* Bottom bar */}
        <div className="px-6 py-4 text-center lg:hidden">
          <p className="text-xs text-blue-200/30">
            © {new Date().getFullYear()} FC Engenharia — FC Gestão Integrada
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/[0.04] backdrop-blur-sm rounded-xl px-4 py-3 border border-white/[0.06] hover:bg-white/[0.08] transition-colors">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-[#D4A843]/20 to-[#D4A843]/5 flex items-center justify-center">
        <Icon className="h-4 w-4 text-[#D4A843]" />
      </div>
      <span className="text-sm text-blue-100/80 font-medium">{text}</span>
    </div>
  );
}
