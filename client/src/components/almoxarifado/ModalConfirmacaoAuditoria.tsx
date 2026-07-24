import { useEffect, useState } from "react";
import { Trash2, ShieldAlert, Loader2 } from "lucide-react";

interface Props {
  aberto: boolean;
  titulo: string;
  subtitulo?: string;
  descricao: React.ReactNode;
  textoBotaoConfirmar: string;
  requerSenha: boolean;
  /** Rev. 2400 — Quando false, o campo justificativa fica opcional/some.
   *  Default true preserva o comportamento da Rev. 2388. */
  requerJustificativa?: boolean;
  carregando?: boolean;
  /** Rev. 4536 — Progresso 0-100 da operação em lote; mostrado no próprio botão. */
  progresso?: number | null;
  /** Erro vindo da última tentativa (ex: "Senha incorreta") — mantém modal aberto pra retry. */
  erroExterno?: string | null;
  onCancelar: () => void;
  onConfirmar: (payload: { senha?: string; justificativa: string }) => void;
}

export function ModalConfirmacaoAuditoria(props: Props) {
  const {
    aberto, titulo, subtitulo, descricao, textoBotaoConfirmar,
    requerSenha, requerJustificativa = true, carregando, progresso, erroExterno, onCancelar, onConfirmar,
  } = props;
  const [senha, setSenha] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) { setSenha(""); setJustificativa(""); setErro(null); }
  }, [aberto]);
  // Reflete erros vindos da mutation (ex: senha incorreta) no modal.
  useEffect(() => { if (erroExterno) setErro(erroExterno); }, [erroExterno]);

  if (!aberto) return null;

  function submeter() {
    const j = justificativa.trim();
    if (requerJustificativa && j.length < 10) {
      setErro("Justifique a operação com ao menos 10 caracteres.");
      return;
    }
    if (requerSenha && !senha) {
      setErro("Senha obrigatória para confirmar esta operação.");
      return;
    }
    setErro(null);
    onConfirmar({ senha: requerSenha ? senha : undefined, justificativa: j });
  }

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
      onClick={() => !carregando && onCancelar()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 pt-6 pb-5 text-white text-center">
          <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3">
            <Trash2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold leading-tight">{titulo}</h3>
          {subtitulo && <p className="text-rose-50 text-sm mt-1 break-words">{subtitulo}</p>}
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
          <div className="leading-relaxed">{descricao}</div>
          {(requerSenha || requerJustificativa) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-amber-900">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <strong>Operação auditada.</strong> Esta ação fica registrada no log e precisa ser validada por um administrador da empresa.
              </div>
            </div>
          )}

          {requerJustificativa && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Justificativa <span className="text-red-500">*</span>
              </label>
              <textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Ex.: Item duplicado no cadastro, registrado por engano em 23/05."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none resize-none"
                autoFocus
                disabled={carregando}
              />
              <p className="text-[11px] text-gray-400 mt-1">Mínimo 10 caracteres. ({justificativa.trim().length}/10)</p>
            </div>
          )}

          {requerSenha && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Sua senha de login <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none"
                disabled={carregando}
                onKeyDown={(e) => { if (e.key === "Enter") submeter(); }}
              />
            </div>
          )}

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>
          )}
        </div>
        <div className="px-5 py-4 bg-gray-50 flex items-center gap-2 border-t border-gray-200">
          <button
            onClick={onCancelar}
            disabled={carregando}
            className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition disabled:opacity-50"
          >Cancelar</button>
          <button
            onClick={submeter}
            disabled={carregando}
            className="relative overflow-hidden flex-1 px-4 py-3 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {/* Rev. 4536 — barra de progresso 0→100% no próprio botão (regra de ouro) */}
            {carregando && typeof progresso === "number" && (
              <span
                className="absolute inset-y-0 left-0 bg-white/15 transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, progresso))}%` }}
              />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {carregando && typeof progresso === "number"
                ? `Removendo… ${Math.min(100, Math.max(0, Math.round(progresso)))}%`
                : textoBotaoConfirmar}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
