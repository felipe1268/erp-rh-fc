import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Database, Download, FileText, Key, Server, Shield, Copy, Check,
  HardDrive, Cloud, Mail, AlertTriangle, ExternalLink, RefreshCw,
  Loader2, ChevronDown, ChevronRight, Package, Lock, Info,
} from "lucide-react";

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(label ? `${label} copiado!` : "Copiado!");
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
      title="Copiar"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function SectionCard({ icon: Icon, title, subtitle, children, color = "blue" }: {
  icon: any; title: string; subtitle?: string; children: React.ReactNode; color?: string;
}) {
  const [open, setOpen] = useState(true);
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 px-5 py-4 ${colorMap[color]} border-b cursor-pointer hover:opacity-90 transition-opacity`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <div className="text-left flex-1">
          <h3 className="font-bold text-sm">{title}</h3>
          {subtitle && <p className="text-xs opacity-70 mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

export default function Portabilidade() {
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";

  const credenciaisQuery = trpc.portabilidade.getCredenciais.useQuery(undefined, {
    enabled: isAdminMaster,
    retry: false,
  });

  const documentosQuery = trpc.portabilidade.listarDocumentos.useQuery(undefined, {
    enabled: !!user && (user.role === "admin" || user.role === "admin_master"),
  });

  const envFileQuery = trpc.portabilidade.gerarEnvFile.useQuery(undefined, {
    enabled: false, // só busca quando clica
  });

  const backupMutation = trpc.backup.executar.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Backup concluído! ${data.tabelasExportadas} tabelas, ${data.registrosExportados.toLocaleString("pt-BR")} registros`);
      } else {
        toast.error(`Erro no backup: ${data.erro}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const backupsQuery = trpc.backup.listar.useQuery({ limit: 10 }, {
    enabled: !!user && (user.role === "admin" || user.role === "admin_master"),
  });

  const handleDownloadEnv = async () => {
    try {
      const result = await envFileQuery.refetch();
      if (result.data?.content) {
        const blob = new Blob([result.data.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = ".env";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Arquivo .env baixado!");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar .env");
    }
  };

  if (!user || (user.role !== "admin" && user.role !== "admin_master")) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-700">Acesso Restrito</h2>
          <p className="text-sm text-gray-500">Apenas administradores podem acessar esta página.</p>
        </div>
      </div>
    );
  }

  const creds = credenciaisQuery.data;
  const docs = documentosQuery.data;
  const backups = backupsQuery.data || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">Portabilidade</h1>
              <p className="text-sm text-gray-500">Backup, credenciais e migração do sistema</p>
            </div>
          </div>
        </div>
      </div>

      {/* Alerta */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-bold mb-1">Informações Sensíveis</p>
          <p>Esta página contém credenciais de acesso ao banco de dados e serviços. Não compartilhe essas informações com pessoas não autorizadas. As senhas são parcialmente mascaradas por segurança.</p>
        </div>
      </div>

      {/* 1. BACKUP DO BANCO */}
      <SectionCard icon={Database} title="Backup do Banco de Dados" subtitle="Exportar todos os dados em JSON comprimido" color="green">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => backupMutation.mutate()}
              disabled={backupMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {backupMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Executando...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" /> Executar Backup Agora</>
              )}
            </Button>
            <span className="text-xs text-gray-500">Backup automático diário às 03:00 (Brasília)</span>
          </div>

          {/* Histórico */}
          {backups.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Data</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Tabelas</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Registros</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Tamanho</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.slice(0, 5).map((b: any) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2 text-gray-700">{b.iniciadoEm ? new Date(b.iniciadoEm).toLocaleString("pt-BR") : "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.tipo === "automatico" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {b.tipo === "automatico" ? "Auto" : "Manual"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{b.tabelasExportadas || 0}</td>
                      <td className="px-3 py-2 text-gray-600">{(b.registrosExportados || 0).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-gray-600">{formatBytes(b.tamanhoBytes || 0)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          b.status === "concluido" ? "bg-green-100 text-green-700" :
                          b.status === "erro" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {b.status === "concluido" ? "OK" : b.status === "erro" ? "Erro" : "..."}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {b.s3Url ? (
                          <a href={b.s3Url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs">
                            <Download className="w-3 h-3" /> Baixar
                          </a>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
            <p><strong>Formato:</strong> JSON comprimido (gzip). Contém todas as tabelas do banco.</p>
            <p><strong>Como restaurar:</strong> Descompacte o arquivo .json.gz e use um script para importar os dados em qualquer banco MySQL compatível.</p>
          </div>
        </div>
      </SectionCard>

      {/* 2. DOCUMENTOS S3 */}
      <SectionCard icon={Cloud} title="Documentos no Storage (S3)" subtitle={`${docs?.total || 0} arquivos encontrados`} color="blue">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Todos os documentos enviados ao sistema (fotos, certificados, assinaturas, etc.) ficam armazenados no S3.
            As URLs públicas continuam funcionando mesmo que você migre o código para outro lugar.
          </p>

          {docs && docs.documentos.length > 0 ? (
            <>
              {/* Resumo por categoria */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(
                  docs.documentos.reduce((acc: Record<string, number>, d: any) => {
                    acc[d.categoria] = (acc[d.categoria] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([cat, count]) => (
                  <div key={cat} className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-blue-700">{count as number}</p>
                    <p className="text-xs text-blue-600">{cat}</p>
                  </div>
                ))}
              </div>

              {/* Lista */}
              <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Nome</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Categoria</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.documentos.slice(0, 100).map((d: any, i: number) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{d.nome}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{d.categoria}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{d.tipo}</td>
                        <td className="px-3 py-2">
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs">
                            <ExternalLink className="w-3 h-3" /> Abrir
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {docs.documentos.length > 100 && (
                <p className="text-xs text-gray-500 text-center">Mostrando 100 de {docs.total} documentos</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum documento encontrado no storage.</p>
          )}
        </div>
      </SectionCard>

      {/* 3. CREDENCIAIS */}
      {isAdminMaster && (
        <SectionCard icon={Key} title="Credenciais de Acesso" subtitle="Informações para conectar ao banco e serviços" color="red">
          {credenciaisQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando credenciais...
            </div>
          ) : creds ? (
            <div className="space-y-5">
              {/* Banco de Dados */}
              <div>
                <h4 className="font-bold text-sm text-gray-700 flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4" /> Banco de Dados (MySQL/TiDB)
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 font-mono text-xs">
                  {creds.banco.host && (
                    <>
                      <div className="flex justify-between items-center">
                        <span><strong>Host:</strong> {creds.banco.host}</span>
                        <CopyButton text={creds.banco.host} label="Host" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span><strong>Porta:</strong> {creds.banco.port}</span>
                        <CopyButton text={creds.banco.port} label="Porta" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span><strong>Database:</strong> {creds.banco.database}</span>
                        <CopyButton text={creds.banco.database} label="Database" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span><strong>Usuário:</strong> {creds.banco.username}</span>
                        <CopyButton text={creds.banco.username} label="Usuário" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span><strong>Senha:</strong> {creds.banco.password}</span>
                        <span className="text-xs text-gray-400">(parcialmente mascarada)</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span><strong>SSL:</strong> {creds.banco.ssl}</span>
                      </div>
                      <div className="pt-2 border-t">
                        <div className="flex justify-between items-center">
                          <span className="break-all"><strong>Connection String:</strong> {creds.banco.connectionString}</span>
                          <CopyButton text={creds.banco.connectionString} label="Connection String" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Storage */}
              <div>
                <h4 className="font-bold text-sm text-gray-700 flex items-center gap-2 mb-2">
                  <Cloud className="w-4 h-4" /> Storage (S3)
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                  <p><strong>Tipo:</strong> {creds.storage.tipo}</p>
                  <p><strong>API URL:</strong> {creds.storage.apiUrl}</p>
                  <p className="text-gray-500 mt-2">{creds.storage.nota}</p>
                </div>
              </div>

              {/* SMTP */}
              <div>
                <h4 className="font-bold text-sm text-gray-700 flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4" /> SMTP (E-mail)
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
                  <p><strong>Host:</strong> {creds.smtp.host} <CopyButton text={creds.smtp.host} /></p>
                  <p><strong>Porta:</strong> {creds.smtp.port} <CopyButton text={String(creds.smtp.port)} /></p>
                  <p><strong>E-mail:</strong> {creds.smtp.email} <CopyButton text={creds.smtp.email} /></p>
                  <p><strong>Senha:</strong> {creds.smtp.password}</p>
                </div>
              </div>

              {/* Auth */}
              <div>
                <h4 className="font-bold text-sm text-gray-700 flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4" /> Autenticação
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                  <p><strong>JWT Secret:</strong> {creds.auth.jwtSecret}</p>
                  <p className="text-gray-500 mt-2">{creds.auth.nota}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-500">Erro ao carregar credenciais.</p>
          )}
        </SectionCard>
      )}

      {/* 4. VARIÁVEIS DE AMBIENTE */}
      {isAdminMaster && creds && (
        <SectionCard icon={FileText} title="Variáveis de Ambiente (.env)" subtitle="Baixe o arquivo .env completo para configurar em outro host" color="purple">
          <div className="space-y-4">
            <Button onClick={handleDownloadEnv} className="bg-purple-600 hover:bg-purple-700">
              <Download className="w-4 h-4 mr-2" /> Baixar arquivo .env
            </Button>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Variável</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Descrição</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">Obrig.</th>
                  </tr>
                </thead>
                <tbody>
                  {creds.variaveis.map((v: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs text-gray-800">{v.nome}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{v.descricao}</td>
                      <td className="px-3 py-2 text-center">
                        {v.obrigatoria ? (
                          <span className="text-red-500 text-xs font-bold">Sim</span>
                        ) : (
                          <span className="text-gray-400 text-xs">Não</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      )}

      {/* 5. GUIA DE MIGRAÇÃO */}
      {creds?.instrucoes && (
        <SectionCard icon={Server} title="Guia de Migração" subtitle="Passo a passo para rodar em outro host" color="amber">
          <div className="space-y-4">
            <div>
              <h4 className="font-bold text-sm text-gray-700 mb-2">{creds.instrucoes.titulo}</h4>
              <ol className="space-y-2">
                {creds.instrucoes.passos.map((p: string, i: number) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="bg-amber-100 text-amber-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                    <span>{p.replace(/^\d+\.\s*/, "")}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-amber-50 rounded-lg p-3">
              <h4 className="font-bold text-sm text-amber-700 flex items-center gap-2 mb-2">
                <Info className="w-4 h-4" /> Observações Importantes
              </h4>
              <ul className="space-y-1.5">
                {creds.instrucoes.avisos.map((a: string, i: number) => (
                  <li key={i} className="text-xs text-amber-800 flex gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Comando de instalação */}
            <div>
              <h4 className="font-bold text-sm text-gray-700 mb-2">Comandos para rodar no Replit</h4>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 space-y-1">
                <p className="text-gray-500"># 1. Instalar dependências</p>
                <p>pnpm install</p>
                <p className="text-gray-500 mt-2"># 2. Aplicar schema no banco</p>
                <p>pnpm db:push</p>
                <p className="text-gray-500 mt-2"># 3. Build para produção</p>
                <p>pnpm build</p>
                <p className="text-gray-500 mt-2"># 4. Iniciar servidor</p>
                <p>pnpm start</p>
              </div>
              <CopyButton text="pnpm install && pnpm db:push && pnpm build && pnpm start" label="Comandos" />
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
