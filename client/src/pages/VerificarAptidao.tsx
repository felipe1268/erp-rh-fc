import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useRoute } from "wouter";
import {
  CheckCircle, XCircle, AlertTriangle, User, Building2, HardHat,
  Shield, FileCheck, BookOpen, FileText, Clock, CalendarDays
} from "lucide-react";

// Rev. 4638 — tempo de empresa vem PRONTO do servidor (tempoEmpresa): a data
// exata de admissão não trafega na rota pública (minimização LGPD)

export default function VerificarAptidao() {
  const [, paramsClt] = useRoute("/verificar/clt/:id");
  const [, paramsPj] = useRoute("/verificar/pj/:id");
  const [, paramsTerceiro] = useRoute("/verificar/terceiro/:id");

  const tipo = paramsClt ? "clt" : paramsPj ? "pj" : paramsTerceiro ? "terceiro" : null;
  const id = paramsClt?.id || paramsPj?.id || paramsTerceiro?.id;
  const numericId = id ? parseInt(id) : 0;

  // Query for CLT/PJ
  const { data: funcData, isLoading: loadingFunc } = trpc.portalExterno.verificar.funcionario.useQuery(
    { id: numericId, tipo: (tipo === "clt" || tipo === "pj") ? tipo : "clt" },
    { enabled: !!numericId && (tipo === "clt" || tipo === "pj") }
  );

  // Query for terceiro
  const { data: tercData, isLoading: loadingTerc } = trpc.portalExterno.verificar.terceiro.useQuery(
    { id: numericId },
    { enabled: !!numericId && tipo === "terceiro" }
  );

  const data = tipo === "terceiro" ? tercData : funcData;
  const isLoading = tipo === "terceiro" ? loadingTerc : loadingFunc;

  if (!tipo || !id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Inválido</h1>
          <p className="text-gray-500">Este QR Code não é válido ou expirou.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Verificando aptidão...</p>
        </div>
      </div>
    );
  }

  if (!data || !data.found) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Não Encontrado</h1>
          <p className="text-gray-500">Funcionário não encontrado na base de dados.</p>
        </div>
      </div>
    );
  }

  const aptidao = (data as any).aptidao || "pendente";
  const isApto = aptidao === "apto";
  const isInapto = aptidao === "inapto";
  const isPendente = aptidao === "pendente";

  const statusColor = isApto ? "green" : isInapto ? "red" : "amber";
  const StatusIcon = isApto ? CheckCircle : isInapto ? XCircle : AlertTriangle;
  const statusLabel = isApto ? "APTO" : isInapto ? "INAPTO" : "PENDENTE";
  const statusBg = isApto ? "bg-green-50" : isInapto ? "bg-red-50" : "bg-amber-50";
  const statusBorder = isApto ? "border-green-200" : isInapto ? "border-red-200" : "border-amber-200";
  const statusText = isApto ? "text-green-700" : isInapto ? "text-red-700" : "text-amber-700";

  const tipoLabel = (data as any).tipo || tipo?.toUpperCase();
  const tipoBg = tipoLabel === "CLT" ? "bg-blue-100 text-blue-700" : tipoLabel === "PJ" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700";

  // Rev. 4635 — identidade visual da marca (navy #0A1E3C + laranja #EE9803, a
  // mesma paleta do crachá): header navy com listras diagonais laranja, logo em
  // pill branca, status em selo colorido, foto sobreposta com anel laranja.
  // Sem CPF (pedido do usuário) — identificação pelo Nº interno.
  const logoEmpresa = (data as any).logoEmpresa as string | undefined;
  const numeroInterno = (data as any).numeroInterno as string | undefined;
  const NAVY = "#0A1E3C";
  const ORANGE = "#EE9803";
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-gray-50 to-slate-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header navy com listras diagonais da marca (eco do crachá) */}
        <div className="px-6 pt-6 pb-14 text-center text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #13294F 100%)` }}>
          {/* Listras diagonais decorativas */}
          <svg className="absolute inset-y-0 left-0 h-full w-[90px] opacity-90" viewBox="0 0 90 260" preserveAspectRatio="none" aria-hidden>
            <path d="M-30,260 L45,0 L60,0 L-15,260 Z" fill={ORANGE} />
            <path d="M-8,260 L67,0 L74,0 L-1,260 Z" fill="rgba(255,255,255,0.14)" />
          </svg>
          {/* Logo da empresa em pill branca (fallback: escudo + nome do sistema) */}
          <div className="relative inline-flex items-center justify-center bg-white rounded-2xl px-4 py-2 shadow-md mb-4 max-w-[240px]">
            {logoEmpresa ? (
              <img src={logoEmpresa} alt={(data as any).empresa || ""} className="h-9 max-w-[200px] object-contain" />
            ) : (
              <span className="flex items-center gap-2 text-gray-800">
                <Shield className="w-4 h-4" />
                <span className="text-xs font-bold tracking-wide truncate">{(data as any).empresa || "FC Gestão Integrada"}</span>
              </span>
            )}
          </div>
          {/* Selo de status (única área com cor de status) */}
          <div className="relative flex items-center justify-center">
            <span className={`inline-flex items-center gap-2.5 rounded-full pl-2.5 pr-5 py-2 shadow-lg ${isApto ? "bg-emerald-500" : isInapto ? "bg-red-600" : "bg-amber-500"}`}>
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/20 ring-1 ring-white/50">
                <StatusIcon className="w-6 h-6" />
              </span>
              <span className="text-left">
                <span className="block text-2xl font-extrabold tracking-widest leading-none">{statusLabel}</span>
                <span className="block text-white/85 text-[9px] uppercase tracking-[0.18em] mt-0.5">Verificação de Aptidão</span>
              </span>
            </span>
          </div>
        </div>

        {/* Foto sobreposta ao header — anel laranja da marca */}
        <div className="-mt-10 flex justify-center relative z-10">
          <div className="w-24 h-24 rounded-full bg-gray-100 ring-4 ring-white shadow-lg flex items-center justify-center overflow-hidden" style={{ outline: `3px solid ${ORANGE}` }}>
            {(data as any).foto ? (
              <img src={(data as any).foto} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-gray-400" />
            )}
          </div>
        </div>

        {/* Dados do funcionário */}
        <div className="px-6 pb-6 pt-3 space-y-4">
          {/* Nome centralizado + Nº interno (sem CPF — rota pública) */}
          <div className="text-center">
            <h2 className="text-lg font-extrabold leading-snug break-words" style={{ color: NAVY }}>{(data as any).nome}</h2>
            <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${tipoBg}`}>{tipoLabel}</span>
              {numeroInterno && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "#FDF3E0", color: "#B37403" }}>
                  Nº {numeroInterno}
                </span>
              )}
            </div>
          </div>

          {/* Info Tiles */}
          <div className="grid grid-cols-2 gap-2">
            <InfoItem icon={<HardHat className="w-4 h-4" />} label="Função" value={(data as any).funcao || "N/A"} />
            <InfoItem icon={<Building2 className="w-4 h-4" />} label="Empresa" value={(data as any).empresa || "N/A"} />
            {(data as any).empresaTerceira && (
              <InfoItem icon={<Building2 className="w-4 h-4" />} label="Terceira" value={(data as any).empresaTerceira} />
            )}
            {(data as any).setor && (
              <InfoItem icon={<User className="w-4 h-4" />} label="Setor" value={(data as any).setor} />
            )}
            {(data as any).tempoEmpresa && (
              <InfoItem icon={<CalendarDays className="w-4 h-4" />} label="Tempo de Empresa" value={(data as any).tempoEmpresa} />
            )}
          </div>

          {/* Rev. 4609 — restrição de atividade (aviso genérico, LGPD-safe) */}
          {(data as any).restricaoAtividade && (
            <div className="bg-red-600 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Shield className="w-5 h-5 text-white shrink-0" />
                <span className="text-white text-sm font-extrabold tracking-wide">⚠ RESTRIÇÃO DE ATIVIDADE</span>
              </div>
              {/* Rev. 4620 — instruções de segurança (operacionais; nunca o motivo médico) */}
              {Array.isArray((data as any).restricoesOperacionais) && (data as any).restricoesOperacionais.length > 0 && (
                <ul className="bg-red-700/60 rounded-lg px-3 py-2 space-y-1">
                  {(data as any).restricoesOperacionais.map((r: string, i: number) => (
                    <li key={i} className="text-white text-xs font-semibold leading-snug flex items-start gap-1.5">
                      <span className="shrink-0">•</span>
                      <span className="break-words">{r}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Status de aptidão detalhado (CLT/PJ) */}
          {tipo !== "terceiro" && (
            <div className={`${statusBg} ${statusBorder} border rounded-xl p-4 space-y-2`}>
              <h3 className={`font-semibold text-sm ${statusText} flex items-center gap-2`}>
                <Shield className="w-4 h-4" /> Detalhes da Aptidão
              </h3>
              <div className="space-y-1.5">
                <CheckItem label="ASO Vigente" ok={(data as any).asoVigente} />
                <CheckItem label="Treinamentos Obrigatórios" ok={(data as any).treinamentosOk} />
                <CheckItem label="Documentos Pessoais" ok={(data as any).documentosOk} />
                <CheckItem label="NRs Obrigatórias" ok={(data as any).nrOk} />
              </div>
              {(data as any).motivoInapto && (
                <div className="mt-2 pt-2 border-t border-red-200">
                  <p className="text-xs text-red-600"><strong>Motivo:</strong> {(data as any).motivoInapto}</p>
                </div>
              )}
            </div>
          )}

          {/* Status de aptidão (Terceiro) */}
          {tipo === "terceiro" && (
            <div className={`${statusBg} ${statusBorder} border rounded-xl p-4`}>
              <h3 className={`font-semibold text-sm ${statusText} flex items-center gap-2`}>
                <Shield className="w-4 h-4" /> Status de Aptidão
              </h3>
              <p className={`text-lg font-bold mt-1 ${statusText}`}>{statusLabel}</p>
              {(data as any).motivoInapto && (
                <p className="text-xs text-red-600 mt-1"><strong>Motivo:</strong> {(data as any).motivoInapto}</p>
              )}
            </div>
          )}

          {/* Documentos pertinentes (LGPD-safe): ASO + Treinamentos/NRs */}
          {(data as any).aso && (
            <div className="border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2 mb-2">
                <FileCheck className="w-4 h-4" /> ASO
              </h3>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{(data as any).aso.tipo}</span>
                <span className={`font-semibold ${(data as any).aso.vigente ? "text-green-600" : "text-red-500"}`}>
                  {(data as any).aso.vigente ? "Vigente" : "Vencido"} · válido até {(data as any).aso.dataValidade ? new Date((data as any).aso.dataValidade + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
            </div>
          )}
          {Array.isArray((data as any).treinamentos) && (data as any).treinamentos.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4" /> Treinamentos ({(data as any).treinamentos.length})
              </h3>
              <div className="space-y-1.5">
                {(data as any).treinamentos.map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-600 truncate">
                      {t.norma ? <strong className="text-gray-700">{t.norma}</strong> : null}{t.norma ? " · " : ""}{t.nome}
                    </span>
                    <span className={`shrink-0 font-semibold ${t.vigente ? "text-green-600" : "text-red-500"}`}>
                      {t.vigente ? "Vigente" : "Vencido"}{t.dataValidade ? ` · ${new Date(t.dataValidade + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rev. 4637 — Integrações de cliente (ex.: Santuário): realização + vencimento */}
          {Array.isArray((data as any).integracoes) && (data as any).integracoes.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4" /> Integrações ({(data as any).integracoes.length})
              </h3>
              <div className="space-y-2">
                {(data as any).integracoes.map((it: any, i: number) => (
                  <div key={i} className={`rounded-lg px-3 py-2 ${it.vigente ? "bg-gray-50" : "bg-red-50 border border-red-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-700 break-words leading-snug">{it.cliente}</span>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${it.vigente ? "bg-emerald-100 text-emerald-700" : "bg-red-600 text-white"}`}>
                        {it.vigente ? "Vigente" : "VENCIDA"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 mt-1">
                      <span>Realizada: {it.dataRealizacao ? new Date(String(it.dataRealizacao).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                      <span className={it.vigente ? "" : "text-red-600 font-semibold"}>
                        {it.dataVencimento ? `Vence: ${new Date(String(it.dataVencimento).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR")}` : "Sem vencimento"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Última verificação */}
          {(data as any).ultimaVerificacao && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Última verificação: {new Date((data as any).ultimaVerificacao).toLocaleDateString("pt-BR")}</span>
            </div>
          )}

          {/* Footer */}
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
              <Shield className="w-3 h-3" /> Verificação em tempo real — FC Gestão Integrada
            </p>
            <p className="text-[10px] text-gray-400">Data: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  // Rev. 4634 — tile suave (bg-gray-50) no lugar de texto solto
  return (
    <div className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
      <div className="text-gray-400 mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-gray-700 break-words leading-snug">{value}</p>
      </div>
    </div>
  );
}

function CheckItem({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
      )}
      <span className={`text-xs ${ok ? "text-green-700" : "text-red-600"}`}>{label}</span>
    </div>
  );
}
