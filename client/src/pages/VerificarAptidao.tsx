import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useRoute } from "wouter";
import {
  CheckCircle, XCircle, AlertTriangle, User, Building2, HardHat,
  Shield, FileCheck, BookOpen, FileText, Clock
} from "lucide-react";

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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header com status */}
        <div className={`${isApto ? "bg-gradient-to-r from-green-600 to-green-500" : isInapto ? "bg-gradient-to-r from-red-600 to-red-500" : "bg-gradient-to-r from-amber-500 to-amber-400"} p-6 text-center text-white`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-5 h-5" />
            <span className="text-sm font-medium tracking-wider uppercase">FC Gestão Integrada</span>
          </div>
          <StatusIcon className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-3xl font-bold tracking-wider">{statusLabel}</h1>
          <p className="text-white/80 text-sm mt-1">Verificação de Aptidão</p>
        </div>

        {/* Dados do funcionário */}
        <div className="p-6 space-y-4">
          {/* Foto + Nome */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
              {(data as any).foto ? (
                <img src={(data as any).foto} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{(data as any).nome}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tipoBg}`}>{tipoLabel}</span>
                {(data as any).cpf && <span className="text-xs text-gray-500">CPF: {(data as any).cpf}</span>}
              </div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoItem icon={<HardHat className="w-4 h-4" />} label="Função" value={(data as any).funcao || "N/A"} />
            <InfoItem icon={<Building2 className="w-4 h-4" />} label="Empresa" value={(data as any).empresa || "N/A"} />
            {(data as any).empresaTerceira && (
              <InfoItem icon={<Building2 className="w-4 h-4" />} label="Terceira" value={(data as any).empresaTerceira} />
            )}
            {(data as any).setor && (
              <InfoItem icon={<User className="w-4 h-4" />} label="Setor" value={(data as any).setor} />
            )}
          </div>

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

          {/* Última verificação */}
          {(data as any).ultimaVerificacao && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Última verificação: {new Date((data as any).ultimaVerificacao).toLocaleDateString("pt-BR")}</span>
            </div>
          )}

          {/* Footer */}
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">Verificação em tempo real — FC Gestão Integrada</p>
            <p className="text-[10px] text-gray-400">Data: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-gray-700">{value}</p>
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
