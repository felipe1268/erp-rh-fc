import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ClipboardList, Plus, Loader2, CheckCircle, ArrowLeft,
  Sun, CloudRain, CloudSun, Cloud, Trash2, Users, Wrench,
  FileText, Camera, Save, Send, Pencil, RotateCcw, MoreVertical,
  AlertTriangle, MessageSquare, Image, Printer, Building2, Search, Video,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CLIMAS = ["Ensolarado", "Parcialmente Nublado", "Nublado", "Chuvoso", "Tempestade", "Garoa"];

const diasSemana: Record<number, string> = {
  0: "Domingo", 1: "Segunda-Feira", 2: "Terça-Feira", 3: "Quarta-Feira",
  4: "Quinta-Feira", 5: "Sexta-Feira", 6: "Sábado",
};

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="bg-gray-100 border border-gray-300 px-3 py-2 font-semibold text-sm">
      {title}{count != null ? ` (${count})` : ''}
    </div>
  );
}

function TableCell({ children, className = "", header = false }: { children?: React.ReactNode; className?: string; header?: boolean }) {
  const Tag = header ? 'th' : 'td';
  return <Tag className={`border border-gray-300 px-2 py-1.5 text-sm ${header ? 'bg-gray-50 font-semibold text-gray-700' : ''} ${className}`}>{children}</Tag>;
}

function ObraVisaoGeral({ obraId, companyId, setLocation, selectedFonte }: any) {
  const obraData = trpc.operacional.getObraImportada.useQuery(
    { companyId, obraId },
    { enabled: !!companyId && !!obraId && selectedFonte === 'importado' }
  );
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const obra = obraData.data;
  if (obraData.isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  if (!obra) return <div className="text-center py-16 text-gray-400">Dados da obra não disponíveis</div>;

  const s = obra.stats as any;
  const statusLabel = (st: string) => {
    if (st === 'aprovado') return 'Aprovado';
    if (st === 'finalizado') return 'Finalizado';
    if (st === 'revisao' || st === 'revisar') return 'Preenchendo';
    return st || 'Preenchendo';
  };
  const statusBg = (st: string) => {
    if (st === 'aprovado') return 'bg-green-500 text-white';
    if (st === 'finalizado') return 'bg-blue-500 text-white';
    if (st === 'revisao' || st === 'revisar') return 'bg-yellow-400 text-gray-800';
    return 'bg-orange-400 text-white';
  };

  const prazoPercent = obra.prazoContratual && obra.prazoDecorrido != null
    ? Math.min(100, Math.round((Number(obra.prazoDecorrido) / Number(obra.prazoContratual)) * 100))
    : null;

  const fotosApi = (obra.fotosRecentes as any[]) || [];
  const videosApi = (obra.videosRecentes as any[]) || [];
  const formatDate = (d: string) => { try { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR"); } catch { return d; } };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: "Relatórios", value: s.total_relatorios, icon: ClipboardList, color: "text-orange-600" },
          { label: "Atividades", value: s.total_atividades, icon: Wrench, color: "text-orange-600" },
          { label: "Ocorrências", value: s.total_ocorrencias, icon: AlertTriangle, color: "text-orange-600" },
          { label: "Comentários", value: s.total_comentarios, icon: MessageSquare, color: "text-orange-600" },
          { label: "Fotos", value: s.total_fotos, icon: Camera, color: "text-orange-600" },
          { label: "Vídeos", value: s.total_videos ?? 0, icon: Video, color: "text-orange-600" },
        ].map((item) => (
          <div key={item.label} className="border rounded-lg p-3 bg-white">
            <p className={`text-2xl font-bold ${item.color}`}>{Number(item.value) || 0}</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-gray-500">{item.label}</p>
              <item.icon className="w-4 h-4 text-gray-300" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-lg bg-white p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-orange-600">Relatórios recentes</h3>
            <span className="text-xs text-gray-400">Ver tudo</span>
          </div>
          {(obra.relatoriosRecentes as any[])?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 text-xs">
                  <th className="py-1 px-1">Data</th>
                  <th className="py-1 px-1">N°</th>
                  <th className="py-1 px-1">Status</th>
                  <th className="py-1 px-1">Modelo de relatório</th>
                </tr>
              </thead>
              <tbody>
                {(obra.relatoriosRecentes as any[]).map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-gray-50 cursor-pointer"
                    onClick={() => setLocation(`/operacional/rdo?obra=${obraId}&id=${r.id}&fonte=importado`)}>
                    <td className="py-1.5 px-1 text-blue-600 hover:underline text-xs">{formatDate(r.data)}</td>
                    <td className="py-1.5 px-1 text-xs">{r.numero}</td>
                    <td className="py-1.5 px-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${statusBg(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="py-1.5 px-1 text-xs text-gray-400">Relatório Diário de Obra (RDO)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-gray-400">Nenhum relatório</p>}
        </div>

        <div className="border rounded-lg bg-white p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-orange-600">Fotos recentes</h3>
            {fotosApi.length > 0 && <span className="text-xs text-blue-500">Ver tudo</span>}
          </div>
          {fotosApi.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {fotosApi.map((f: any, i: number) => (
                <img key={i} src={f.urlMiniatura || f.url} alt="Foto"
                  loading="lazy"
                  className="w-full h-20 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setLightboxIdx(i)} />
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">Nenhuma foto</p>}
        </div>
      </div>

      {videosApi.length > 0 && (
        <div className="border rounded-lg bg-white p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-orange-600">Vídeos recentes</h3>
            <span className="text-xs text-blue-500">Ver tudo</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {videosApi.map((v: any, i: number) => (
              <div key={i} className="relative min-w-[160px] h-24 rounded overflow-hidden cursor-pointer group"
                onClick={() => v.url && window.open(v.url, '_blank')}>
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  {v.urlMiniatura ? (
                    <img src={v.urlMiniatura} alt="Vídeo" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <FileText className="w-8 h-8 text-gray-500" />
                  )}
                </div>
                {v.duracao && (
                  <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                    ▶ {v.duracao}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded-lg bg-white p-4">
        <h3 className="text-sm font-semibold text-orange-600 mb-3">Informações da obra</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">Status</p>
              <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded">
                {obra.status === 'em_andamento' || obra.status === 'Em_Andamento' ? 'Em andamento' : obra.status || '—'}
              </span>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">N° do contrato</p>
              <p className="font-medium">{obra.numero_contrato || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Prazo decorrido</p>
              {prazoPercent != null ? (
                <div className="w-full bg-gray-200 rounded-full h-5 relative">
                  <div className="bg-blue-500 h-5 rounded-full flex items-center justify-center text-white text-[11px] font-medium"
                    style={{ width: `${Math.max(prazoPercent, 10)}%` }}>
                    {prazoPercent} %
                  </div>
                </div>
              ) : <p>—</p>}
            </div>
          </div>
          <div className="text-sm">
            <p className="text-gray-500 text-xs mb-1">Endereço</p>
            <p>{obra.endereco || '—'}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {obra.prazoContratual != null && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Prazo contratual</p>
                <p className="font-medium">{obra.prazoContratual} dias</p>
              </div>
            )}
            {obra.prazoDecorrido != null && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Prazo decorrido</p>
                <p className="font-medium">{obra.prazoDecorrido} dias</p>
              </div>
            )}
            {obra.prazoVencer != null && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Prazo a vencer</p>
                <p className="font-medium">{obra.prazoVencer} dias</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">Responsável</p>
              <p>{obra.responsavel || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Contratante</p>
              <p>{obra.contratante || 'FC Engenharia'}</p>
            </div>
            {obra.data_inicio && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Data início</p>
                <p>{formatDate(obra.data_inicio)}</p>
              </div>
            )}
            {obra.data_previsao_termino && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Previsão de término</p>
                <p>{formatDate(obra.data_previsao_termino)}</p>
              </div>
            )}
          </div>
          {obra.observacoes && (
            <div className="text-sm">
              <p className="text-gray-500 text-xs mb-1">Observação</p>
              <p>{obra.observacoes}</p>
            </div>
          )}
        </div>
      </div>

      {lightboxIdx !== null && fotosApi.length > 0 && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}>
          <button className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300 z-50"
            onClick={() => setLightboxIdx(null)}>✕</button>
          {lightboxIdx > 0 && (
            <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl font-bold hover:text-gray-300 z-50 bg-black/40 rounded-full w-12 h-12 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}>‹</button>
          )}
          {lightboxIdx < fotosApi.length - 1 && (
            <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl font-bold hover:text-gray-300 z-50 bg-black/40 rounded-full w-12 h-12 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}>›</button>
          )}
          <img src={fotosApi[lightboxIdx]?.url || fotosApi[lightboxIdx]?.urlMiniatura}
            alt={`Foto ${lightboxIdx + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()} />
          <div className="absolute bottom-4 text-white text-sm bg-black/50 px-3 py-1 rounded">
            {lightboxIdx + 1} / {fotosApi.length}
          </div>
        </div>
      )}
    </div>
  );
}

function RDODocumentoImportado({ rdo, obraId, companyId, setLocation }: any) {
  const obraData = trpc.operacional.getObraImportada.useQuery(
    { companyId, obraId: rdo.obra_id || obraId },
    { enabled: !!companyId && !!(rdo.obra_id || obraId) }
  );
  const obra = obraData.data || {} as any;
  const [fotoExpandida, setFotoExpandida] = useState<number | null>(null);

  const dataRel = new Date(rdo.data + "T12:00:00");
  const diaSemana = diasSemana[dataRel.getDay()] || '';

  const materiaisRecebidos = ((rdo.materiais || []) as any[]).filter((m: any) => m.tipo === 'recebido' || m.tipo === 'Recebido');
  const materiaisUtilizados = ((rdo.materiais || []) as any[]).filter((m: any) => m.tipo === 'utilizado' || m.tipo === 'Utilizado' || m.tipo === 'usado');
  const materiaisOutros = ((rdo.materiais || []) as any[]).filter((m: any) =>
    !['recebido','Recebido','utilizado','Utilizado','usado'].includes(m.tipo)
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/operacional/rdo?obra=${obraId}&fonte=importado`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-semibold">
            Visualizar relatório: {dataRel.toLocaleDateString("pt-BR")} n° {rdo.numero}
          </h1>
        </div>
        <div className="flex gap-2">
          {rdo.pdf_url && (
            <a href={rdo.pdf_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><Printer className="w-4 h-4 mr-1" /> Imprimir</Button>
            </a>
          )}
        </div>
      </div>

      <div className="border border-gray-300 bg-white">
        {rdo.status && (
          <div className="px-3 py-1">
            <span className={`text-xs text-white px-2 py-0.5 rounded ${
              rdo.status === 'aprovado' ? 'bg-green-500' :
              rdo.status === 'revisao' || rdo.status === 'revisar' ? 'bg-red-500 border border-red-600' :
              rdo.status === 'finalizado' ? 'bg-blue-500' : 'bg-gray-400'
            }`}>
              {rdo.status === 'aprovado' ? 'Aprovado' :
               rdo.status === 'revisao' || rdo.status === 'revisar' ? 'Revisar Relatório' :
               rdo.status === 'finalizado' ? 'Finalizado' : rdo.status}
            </span>
          </div>
        )}

        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className="border border-gray-300 p-3 text-center align-middle" rowSpan={4} style={{ width: '40%' }}>
                <div className="flex flex-col items-center justify-center">
                  <img src="/logo-fc.jpg" alt="FC Engenharia" className="h-16 object-contain mb-2"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <p className="font-bold text-base mt-2">Relatório Diário de Obra (RDO)</p>
                </div>
              </td>
              <TableCell header className="w-28">Relatório n°</TableCell>
              <TableCell>{rdo.numero}</TableCell>
            </tr>
            <tr>
              <TableCell header>Data</TableCell>
              <TableCell>{dataRel.toLocaleDateString("pt-BR")}</TableCell>
            </tr>
            <tr>
              <TableCell header>Dia da semana</TableCell>
              <TableCell>{diaSemana}</TableCell>
            </tr>
            <tr>
              <TableCell header>N° do contrato</TableCell>
              <TableCell>{obra.numero_contrato || ''}</TableCell>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <TableCell header className="w-28">Obra</TableCell>
              <TableCell>{obra.nome || ''}</TableCell>
              <TableCell header className="w-32">Prazo contratual</TableCell>
              <TableCell className="w-24">{obra.prazoContratual ? `${obra.prazoContratual} dias` : ''}</TableCell>
            </tr>
            <tr>
              <TableCell header>Endereço</TableCell>
              <TableCell>{obra.endereco || ''}</TableCell>
              <TableCell header>Prazo decorrido</TableCell>
              <TableCell>{obra.prazoDecorrido != null ? `${obra.prazoDecorrido} dias` : ''}</TableCell>
            </tr>
            <tr>
              <TableCell header>Contratante</TableCell>
              <TableCell>{obra.contratante || 'FC Engenharia'}</TableCell>
              <TableCell header>Responsável</TableCell>
              <TableCell>{obra.responsavel || rdo.responsavel_nome || ''}</TableCell>
            </tr>
            <tr>
              <td></td><td></td>
              <TableCell header>Prazo a vencer</TableCell>
              <TableCell>{obra.prazoVencer != null ? `${obra.prazoVencer} dias` : ''}</TableCell>
            </tr>
          </tbody>
        </table>

        <div className="mt-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <TableCell header className="w-36">Horário de trabalho</TableCell>
                <TableCell header></TableCell>
                <TableCell header className="text-center">Hs. trabalhadas</TableCell>
                <TableCell header>Clima</TableCell>
                <TableCell header>Tempo</TableCell>
                <TableCell header>Condição</TableCell>
              </tr>
            </thead>
            <tbody>
              <tr>
                <TableCell header>Entrada / Saída</TableCell>
                <TableCell>{rdo.hora_inicio || ''} - {rdo.hora_fim || ''}</TableCell>
                <TableCell className="text-center" rowSpan={2}>{rdo.horas_trabalhadas || ''}</TableCell>
                <TableCell header>Manhã</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1">
                    {rdo.clima_manha === 'Nublado' && <Cloud className="w-3.5 h-3.5 text-gray-500" />}
                    {rdo.clima_manha === 'Chuvoso' && <CloudRain className="w-3.5 h-3.5 text-blue-500" />}
                    {rdo.clima_manha === 'Ensolarado' && <Sun className="w-3.5 h-3.5 text-yellow-500" />}
                    {rdo.clima_manha === 'Parcialmente Nublado' && <CloudSun className="w-3.5 h-3.5 text-gray-400" />}
                    {rdo.clima_manha || ''}
                  </span>
                </TableCell>
                <TableCell>{rdo.condicao_manha || 'Praticável'}</TableCell>
              </tr>
              <tr>
                <TableCell header>Hs. Intervalo</TableCell>
                <TableCell>{rdo.hora_intervalo_inicio || ''} - {rdo.hora_intervalo_fim || ''}</TableCell>
                <TableCell header>Tarde</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1">
                    {rdo.clima_tarde === 'Nublado' && <Cloud className="w-3.5 h-3.5 text-gray-500" />}
                    {rdo.clima_tarde === 'Chuvoso' && <CloudRain className="w-3.5 h-3.5 text-blue-500" />}
                    {rdo.clima_tarde === 'Ensolarado' && <Sun className="w-3.5 h-3.5 text-yellow-500" />}
                    {rdo.clima_tarde === 'Parcialmente Nublado' && <CloudSun className="w-3.5 h-3.5 text-gray-400" />}
                    {rdo.clima_tarde || ''}
                  </span>
                </TableCell>
                <TableCell>{rdo.condicao_tarde || 'Praticável'}</TableCell>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <SectionHeader title="Mão de obra" count={(rdo.maoObra || []).length} />
          {(rdo.maoObra || []).length > 0 ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <TableCell header>Nome</TableCell>
                  <TableCell header>Função</TableCell>
                  <TableCell header>Entrada / Saída</TableCell>
                  <TableCell header>Hs. Intervalo</TableCell>
                  <TableCell header>Hs. trabalhadas</TableCell>
                  <TableCell header></TableCell>
                </tr>
              </thead>
              <tbody>
                {(rdo.maoObra as any[]).map((mo: any) => (
                  <tr key={mo.id}>
                    <TableCell>{mo.nome}</TableCell>
                    <TableCell>{mo.funcao || ''}</TableCell>
                    <TableCell>{mo.hora_inicio || ''} - {mo.hora_fim || ''}</TableCell>
                    <TableCell>{mo.dados_json?.hora_intervalo || '01:00'}</TableCell>
                    <TableCell>{mo.horas_trabalhadas || ''}</TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {mo.categoria === 'Direta' || mo.categoria === 'direta' ? 'Mão de Obra Direta' :
                       mo.categoria === 'Indireta' || mo.categoria === 'indireta' ? 'Mão de Obra Indireta' :
                       mo.categoria || ''}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
          )}
        </div>

        <div className="mt-4">
          <SectionHeader title="Equipamentos" count={(rdo.equipamentos || []).length} />
          {(rdo.equipamentos || []).length > 0 ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <TableCell header></TableCell>
                  <TableCell header className="text-center">Qtd</TableCell>
                  <TableCell header></TableCell>
                  <TableCell header></TableCell>
                  <TableCell header></TableCell>
                  <TableCell header></TableCell>
                  <TableCell header></TableCell>
                </tr>
              </thead>
              <tbody>
                {(rdo.equipamentos as any[]).map((eq: any) => (
                  <tr key={eq.id}>
                    <TableCell>{eq.nome}</TableCell>
                    <TableCell className="text-center font-semibold">{eq.quantidade}</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
          )}
        </div>

        <div className="mt-4">
          <SectionHeader title="Atividades" count={(rdo.atividades || []).length} />
          {(rdo.atividades || []).length > 0 ? (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {(rdo.atividades as any[]).map((at: any) => (
                  <tr key={at.id}>
                    <TableCell className="w-3/4">
                      <span className="font-medium">{at.item ? `${at.item} - ` : ''}{at.descricao}</span>
                      {at.observacao && <p className="text-gray-500 mt-0.5">-{at.observacao}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      {at.etapa || (at.percentual_avanco != null ? `${at.percentual_avanco}%` : 'Em andamento')}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
          )}
        </div>

        <div className="mt-4">
          <SectionHeader title="Ocorrências" count={(rdo.ocorrencias || []).length} />
          {(rdo.ocorrencias || []).length > 0 ? (
            <div className="border border-gray-300 border-t-0 p-3 text-sm space-y-2">
              {(rdo.ocorrencias as any[]).map((oc: any) => (
                <div key={oc.id}>
                  <p>{oc.descricao}</p>
                  {oc.providencia && <p className="text-gray-500 text-xs mt-1">Providência: {oc.providencia}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2">
          <div>
            <SectionHeader title="Materiais recebidos" count={materiaisRecebidos.length + materiaisOutros.length} />
            {(materiaisRecebidos.length + materiaisOutros.length) > 0 ? (
              <div className="border border-gray-300 border-t-0 p-3 text-sm space-y-1">
                {[...materiaisRecebidos, ...materiaisOutros].map((m: any) => (
                  <p key={m.id}>{m.descricao}{m.quantidade ? ` — ${m.quantidade} ${m.unidade || ''}` : ''}</p>
                ))}
              </div>
            ) : (
              <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
            )}
          </div>
          <div>
            <SectionHeader title="Materiais utilizados" count={materiaisUtilizados.length} />
            {materiaisUtilizados.length > 0 ? (
              <div className="border border-gray-300 border-t-0 p-3 text-sm space-y-1">
                {materiaisUtilizados.map((m: any) => (
                  <p key={m.id}>{m.descricao}{m.quantidade ? ` — ${m.quantidade} ${m.unidade || ''}` : ''}</p>
                ))}
              </div>
            ) : (
              <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <SectionHeader title="Comentários" count={(rdo.comentarios || []).length} />
          {(rdo.comentarios || []).length > 0 ? (
            <div className="border border-gray-300 border-t-0 p-3 text-sm space-y-2">
              {(rdo.comentarios as any[]).map((c: any) => (
                <div key={c.id}>
                  <div className="flex justify-between">
                    <span className="font-medium text-xs">{c.autor || 'Anônimo'}</span>
                    {c.data_hora && <span className="text-xs text-gray-400">{new Date(c.data_hora).toLocaleString("pt-BR")}</span>}
                  </div>
                  <p className="mt-0.5">{c.texto}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
          )}
        </div>

        <div className="mt-4">
          <SectionHeader title="Fotos" count={(rdo.fotos || []).length} />
          {(rdo.fotos || []).length > 0 ? (
            <div className="border border-gray-300 border-t-0 p-3">
              <div className="flex flex-wrap gap-2">
                {(rdo.fotos as any[]).map((f: any) => (
                  <img key={f.id} src={`/api/diario-obra/foto/${f.id}`}
                    alt={f.descricao || 'Foto'} loading="lazy"
                    className="h-24 w-32 object-cover border rounded cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setFotoExpandida(f.id)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
          )}
        </div>

        <div className="mt-4">
          <SectionHeader title="Vídeos" count={0} />
          <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
        </div>

        <div className="mt-4">
          <SectionHeader title="Anexos" count={0} />
          <div className="border border-gray-300 border-t-0 p-3 text-sm text-gray-400 text-center">Nenhum registro</div>
        </div>

        {rdo.responsavel_nome && (
          <div className="mt-6 px-4 pb-6">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <div className="border-b border-gray-400 mx-8 mb-1"></div>
                <p className="text-sm text-gray-600">Assinatura</p>
              </div>
              <div className="text-center">
                <div className="border-b border-gray-400 mx-8 mb-1"></div>
                <p className="text-sm text-gray-600">Assinatura</p>
              </div>
            </div>
          </div>
        )}

        {(rdo.responsavel_nome || rdo.importado_em) && (
          <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500 flex justify-between">
            {rdo.responsavel_nome && <span>Criado por: {rdo.responsavel_nome}</span>}
            {rdo.importado_em && <span>Importado em: {new Date(rdo.importado_em).toLocaleString("pt-BR")}</span>}
          </div>
        )}
      </div>

      {fotoExpandida && (
        <Dialog open={!!fotoExpandida} onOpenChange={() => setFotoExpandida(null)}>
          <DialogContent className="max-w-4xl">
            <img src={`/api/diario-obra/foto/${fotoExpandida}`} alt="Foto ampliada"
              className="w-full h-auto max-h-[80vh] object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function RDO() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const obraIdParam = Number(params.get("obra")) || 0;
  const rdoIdParam = Number(params.get("id")) || 0;

  const [filtroStatusObra, setFiltroStatusObra] = useState<string>("Em_Andamento");
  const obrasUnificadas = trpc.operacional.listarObrasUnificadas.useQuery({ companyId }, { enabled: !!companyId });
  const fonteParam = params.get("fonte") || "";

  const todasObrasLista = [
    ...((obrasUnificadas.data as any)?.principais || []).map((o: any) => ({ ...o, fonte: 'principal' })),
    ...((obrasUnificadas.data as any)?.importadas || []).filter((o: any) => Number(o.total_relatorios) > 0).map((o: any) => ({ ...o, fonte: 'importado' })),
  ].filter((o: any) => {
    if (filtroStatusObra === "todas") return true;
    const s = (o.status || "").toLowerCase();
    const f = filtroStatusObra.toLowerCase();
    return s === f || s === f.replace("_", " ");
  });

  const [obraId, setObraId] = useState(obraIdParam);
  const [obraFonte, setObraFonte] = useState<string>(fonteParam || "");

  useEffect(() => {
    if (obraIdParam > 0) setObraId(obraIdParam);
    if (fonteParam) setObraFonte(fonteParam);
  }, [obraIdParam, fonteParam]);

  const hasObraParam = obraIdParam > 0;

  const selectedObraEntry = hasObraParam
    ? (todasObrasLista.find((o: any) => o.id === obraId && o.fonte === obraFonte)
      || todasObrasLista.find((o: any) => o.id === obraId))
    : (obraId > 0
      ? (todasObrasLista.find((o: any) => o.id === obraId && o.fonte === obraFonte)
        || todasObrasLista.find((o: any) => o.id === obraId))
      : null);
  const selectedObraId = selectedObraEntry?.id || 0;
  const selectedFonte = selectedObraEntry?.fonte || 'principal';

  const rdos = trpc.operacional.listarRDOs.useQuery(
    { companyId, obraId: selectedObraId, fonte: selectedFonte as any },
    { enabled: !!companyId && !!selectedObraId },
  );
  const rdoDetalhe = trpc.operacional.getRDO.useQuery(
    { id: rdoIdParam, companyId, fonte: (fonteParam || selectedFonte) as any },
    { enabled: !!rdoIdParam && !!companyId },
  );

  const criarRDO = trpc.operacional.criarRDO.useMutation({
    onSuccess: (data) => {
      toast.success(data.jaExistia ? "RDO já existente" : "RDO criado com sucesso");
      setLocation(`/operacional/rdo?obra=${selectedObraId}&id=${data.id}&fonte=principal`);
      rdos.refetch();
    },
  });
  const atualizarRDO = trpc.operacional.atualizarRDO.useMutation({
    onSuccess: () => { toast.success("RDO salvo"); rdoDetalhe.refetch(); },
  });
  const finalizarRDO = trpc.operacional.finalizarRDO.useMutation({
    onSuccess: () => { toast.success("RDO finalizado!"); rdoDetalhe.refetch(); rdos.refetch(); },
  });

  const addMaoObra = trpc.operacional.adicionarMaoObra.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const remMaoObra = trpc.operacional.removerMaoObra.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const addAtividade = trpc.operacional.adicionarAtividade.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const remAtividade = trpc.operacional.removerAtividade.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const addEquip = trpc.operacional.adicionarEquipamento.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const remEquip = trpc.operacional.removerEquipamento.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const addMaterial = trpc.operacional.adicionarMaterial.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const remMaterial = trpc.operacional.removerMaterial.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const deletarRDO = trpc.operacional.deletarRDO.useMutation({
    onSuccess: () => { toast.success("RDO excluído"); rdos.refetch(); },
  });
  const reabrirRDO = trpc.operacional.reabrirRDO.useMutation({
    onSuccess: () => { toast.success("RDO reaberto como rascunho"); rdos.refetch(); },
  });

  const [form, setForm] = useState<any>({});
  const [addDialog, setAddDialog] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<any>({});
  const [viewMode, setViewMode] = useState<'lista' | 'visao'>('visao');
  const [buscaObra, setBuscaObra] = useState("");

  const rdo = rdoDetalhe.data;

  useEffect(() => {
    if (rdo) {
      setForm({
        climaManha: rdo.clima_manha || "",
        climaTarde: rdo.clima_tarde || "",
        temperaturaMin: rdo.temperatura_min || "",
        temperaturaMax: rdo.temperatura_max || "",
        choveu: rdo.choveu || false,
        horaInicio: rdo.hora_inicio || "07:00",
        horaFim: rdo.hora_fim || "17:00",
        observacoes: rdo.observacoes || "",
        visitantes: rdo.visitantes || "",
        ddsRealizado: rdo.dds_realizado || false,
        ddsTema: rdo.dds_tema || "",
      });
    }
  }, [rdo]);

  const hoje = new Date().toISOString().split("T")[0];

  if (rdoIdParam && rdo && (rdo as any).fonte === 'importado') {
    return <RDODocumentoImportado rdo={rdo} obraId={selectedObraId || obraIdParam} companyId={companyId} setLocation={setLocation} />;
  }

  if (rdoIdParam && rdo) {
    const isFinalizado = rdo.status === "finalizado";
    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/operacional/rdo?obra=${selectedObraId}&fonte=${fonteParam || selectedFonte}`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold">RDO — {new Date(rdo.data + "T12:00:00").toLocaleDateString("pt-BR")}</h1>
          <Badge variant={isFinalizado ? "default" : "secondary"}>
            {isFinalizado ? "Finalizado" : "Rascunho"}
          </Badge>
          {rdo.responsavel_nome && <span className="text-sm text-gray-500">Responsável: {rdo.responsavel_nome}</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Condições Climáticas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Manhã</Label>
                  <Select value={form.climaManha || ""} onValueChange={(v) => setForm({ ...form, climaManha: v })} disabled={isFinalizado}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{CLIMAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Tarde</Label>
                  <Select value={form.climaTarde || ""} onValueChange={(v) => setForm({ ...form, climaTarde: v })} disabled={isFinalizado}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{CLIMAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Temp. Mín. (°C)</Label>
                  <Input type="number" value={form.temperaturaMin || ""} onChange={(e) => setForm({ ...form, temperaturaMin: e.target.value })} disabled={isFinalizado} />
                </div>
                <div>
                  <Label className="text-xs">Temp. Máx. (°C)</Label>
                  <Input type="number" value={form.temperaturaMax || ""} onChange={(e) => setForm({ ...form, temperaturaMax: e.target.value })} disabled={isFinalizado} />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.choveu || false} onChange={(e) => setForm({ ...form, choveu: e.target.checked })} disabled={isFinalizado} />
                <span className="text-sm">Choveu?</span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Horário de Trabalho</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Início</Label>
                  <Input type="time" value={form.horaInicio || ""} onChange={(e) => setForm({ ...form, horaInicio: e.target.value })} disabled={isFinalizado} />
                </div>
                <div>
                  <Label className="text-xs">Fim</Label>
                  <Input type="time" value={form.horaFim || ""} onChange={(e) => setForm({ ...form, horaFim: e.target.value })} disabled={isFinalizado} />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.ddsRealizado || false} onChange={(e) => setForm({ ...form, ddsRealizado: e.target.checked })} disabled={isFinalizado} />
                  <span className="text-sm font-medium">DDS Realizado</span>
                </label>
                {form.ddsRealizado && (
                  <Input className="mt-2" placeholder="Tema do DDS" value={form.ddsTema || ""} onChange={(e) => setForm({ ...form, ddsTema: e.target.value })} disabled={isFinalizado} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Mão de Obra</CardTitle>
            {!isFinalizado && <Button size="sm" variant="outline" onClick={() => { setAddForm({ tipo: "proprio", funcao: "", quantidade: 1 }); setAddDialog("maoObra"); }}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>}
          </CardHeader>
          <CardContent>
            {(rdo.maoObra || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhuma mão de obra registrada</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-1 px-2">Tipo</th><th className="py-1 px-2">Função</th><th className="py-1 px-2">Qtd</th><th className="py-1 px-2">Presente</th>{!isFinalizado && <th className="py-1 px-2 w-10"></th>}</tr></thead>
                <tbody>
                  {(rdo.maoObra as any[]).map((m: any) => (
                    <tr key={m.id} className="border-b">
                      <td className="py-1 px-2"><Badge variant="outline">{m.tipo === "proprio" ? "Próprio" : "Terceiro"}</Badge></td>
                      <td className="py-1 px-2">{m.funcao}{m.empresa_nome ? ` (${m.empresa_nome})` : ""}</td>
                      <td className="py-1 px-2 font-medium">{m.quantidade}</td>
                      <td className="py-1 px-2">{m.presente ? <CheckCircle className="w-4 h-4 text-green-500" /> : "—"}</td>
                      {!isFinalizado && <td className="py-1 px-2"><Button variant="ghost" size="sm" onClick={() => remMaoObra.mutate({ id: m.id, companyId })}><Trash2 className="w-3 h-3 text-red-400" /></Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Atividades</CardTitle>
            {!isFinalizado && <Button size="sm" variant="outline" onClick={() => { setAddForm({ descricao: "", local: "", percentualAvanco: 0 }); setAddDialog("atividade"); }}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>}
          </CardHeader>
          <CardContent>
            {(rdo.atividades || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhuma atividade registrada</p>
            ) : (
              <div className="space-y-2">
                {(rdo.atividades as any[]).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between border rounded p-2">
                    <div>
                      <p className="text-sm font-medium">{a.descricao}</p>
                      {a.local && <p className="text-xs text-gray-500">{a.local}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.percentual_avanco || 0}%</Badge>
                      {!isFinalizado && <Button variant="ghost" size="sm" onClick={() => remAtividade.mutate({ id: a.id, companyId })}><Trash2 className="w-3 h-3 text-red-400" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Equipamentos</CardTitle>
            {!isFinalizado && <Button size="sm" variant="outline" onClick={() => { setAddForm({ nome: "", quantidade: 1 }); setAddDialog("equipamento"); }}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>}
          </CardHeader>
          <CardContent>
            {(rdo.equipamentos || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhum equipamento registrado</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-1 px-2">Nome</th><th className="py-1 px-2 text-center">Qtd</th>{!isFinalizado && <th className="py-1 px-2 w-10"></th>}</tr></thead>
                <tbody>
                  {(rdo.equipamentos as any[]).map((e: any) => (
                    <tr key={e.id} className="border-b">
                      <td className="py-1 px-2">{e.nome}</td>
                      <td className="py-1 px-2 text-center font-medium">{e.quantidade}</td>
                      {!isFinalizado && <td className="py-1 px-2"><Button variant="ghost" size="sm" onClick={() => remEquip.mutate({ id: e.id, companyId })}><Trash2 className="w-3 h-3 text-red-400" /></Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Materiais</CardTitle>
            {!isFinalizado && <Button size="sm" variant="outline" onClick={() => { setAddForm({ tipo: "utilizado", descricao: "", quantidade: 1, unidade: "un" }); setAddDialog("material"); }}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>}
          </CardHeader>
          <CardContent>
            {(rdo.materiais || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhum material registrado</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-1 px-2">Tipo</th><th className="py-1 px-2">Descrição</th><th className="py-1 px-2 text-center">Qtd</th><th className="py-1 px-2">Und</th>{!isFinalizado && <th className="py-1 px-2 w-10"></th>}</tr></thead>
                <tbody>
                  {(rdo.materiais as any[]).map((m: any) => (
                    <tr key={m.id} className="border-b">
                      <td className="py-1 px-2"><Badge variant="outline" className="text-xs">{m.tipo}</Badge></td>
                      <td className="py-1 px-2">{m.descricao}</td>
                      <td className="py-1 px-2 text-center">{m.quantidade || "—"}</td>
                      <td className="py-1 px-2">{m.unidade || "—"}</td>
                      {!isFinalizado && <td className="py-1 px-2"><Button variant="ghost" size="sm" onClick={() => remMaterial.mutate({ id: m.id, companyId })}><Trash2 className="w-3 h-3 text-red-400" /></Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={form.observacoes || ""}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              disabled={isFinalizado}
              placeholder="Observações gerais do dia..."
              rows={3}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Camera className="w-4 h-4" /> Fotos</CardTitle>
          </CardHeader>
          <CardContent>
            {(rdo.fotos || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhuma foto registrada</p>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {(rdo.fotos as any[]).map((f: any) => (
                  <div key={f.id} className="relative">
                    <img src={f.foto_url} alt={f.legenda || ''} className="w-full h-24 object-cover rounded border" />
                    {f.legenda && <p className="text-xs text-gray-500 mt-0.5 truncate">{f.legenda}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          {!isFinalizado && (
            <>
              <Button variant="outline" onClick={() => atualizarRDO.mutate({
                id: rdoIdParam, companyId,
                climaManha: form.climaManha, climaTarde: form.climaTarde,
                temperaturaMin: form.temperaturaMin ? Number(form.temperaturaMin) : undefined,
                temperaturaMax: form.temperaturaMax ? Number(form.temperaturaMax) : undefined,
                choveu: form.choveu, horaInicio: form.horaInicio, horaFim: form.horaFim,
                observacoes: form.observacoes, visitantes: form.visitantes,
                ddsRealizado: form.ddsRealizado, ddsTema: form.ddsTema,
              })} disabled={atualizarRDO.isPending}>
                {atualizarRDO.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar
              </Button>
              <Button onClick={() => {
                if (confirm("Finalizar este RDO? Não será possível editar depois.")) {
                  finalizarRDO.mutate({ id: rdoIdParam, companyId, responsavelNome: user?.nome || user?.email || 'Responsável' });
                }
              }} disabled={finalizarRDO.isPending}>
                {finalizarRDO.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Finalizar
              </Button>
            </>
          )}
        </div>

        <Dialog open={!!addDialog} onOpenChange={() => setAddDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {addDialog === "maoObra" ? "Adicionar Mão de Obra" :
                 addDialog === "atividade" ? "Adicionar Atividade" :
                 addDialog === "equipamento" ? "Adicionar Equipamento" :
                 addDialog === "material" ? "Adicionar Material" : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {addDialog === "maoObra" && (
                <>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={addForm.tipo || "proprio"} onValueChange={(v) => setAddForm({ ...addForm, tipo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proprio">Próprio</SelectItem>
                        <SelectItem value="terceiro">Terceiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Função</Label><Input value={addForm.funcao || ""} onChange={(e) => setAddForm({ ...addForm, funcao: e.target.value })} /></div>
                  <div><Label>Quantidade</Label><Input type="number" value={addForm.quantidade || 1} onChange={(e) => setAddForm({ ...addForm, quantidade: Number(e.target.value) })} /></div>
                  {addForm.tipo === "terceiro" && <div><Label>Empresa</Label><Input value={addForm.empresaNome || ""} onChange={(e) => setAddForm({ ...addForm, empresaNome: e.target.value })} /></div>}
                  <Button className="w-full" onClick={() => { addMaoObra.mutate({ rdoId: rdoIdParam, companyId, tipo: addForm.tipo, funcao: addForm.funcao, quantidade: addForm.quantidade, empresaNome: addForm.empresaNome }); setAddDialog(null); }}>Adicionar</Button>
                </>
              )}
              {addDialog === "atividade" && (
                <>
                  <div><Label>Descrição</Label><Input value={addForm.descricao || ""} onChange={(e) => setAddForm({ ...addForm, descricao: e.target.value })} /></div>
                  <div><Label>Local</Label><Input value={addForm.local || ""} onChange={(e) => setAddForm({ ...addForm, local: e.target.value })} /></div>
                  <div><Label>% Avanço</Label><Input type="number" value={addForm.percentualAvanco || 0} onChange={(e) => setAddForm({ ...addForm, percentualAvanco: Number(e.target.value) })} /></div>
                  <Button className="w-full" onClick={() => { addAtividade.mutate({ rdoId: rdoIdParam, companyId, descricao: addForm.descricao, local: addForm.local, percentualAvanco: addForm.percentualAvanco }); setAddDialog(null); }}>Adicionar</Button>
                </>
              )}
              {addDialog === "equipamento" && (
                <>
                  <div><Label>Nome</Label><Input value={addForm.nome || ""} onChange={(e) => setAddForm({ ...addForm, nome: e.target.value })} /></div>
                  <div><Label>Quantidade</Label><Input type="number" value={addForm.quantidade || 1} onChange={(e) => setAddForm({ ...addForm, quantidade: Number(e.target.value) })} /></div>
                  <Button className="w-full" onClick={() => { addEquip.mutate({ rdoId: rdoIdParam, companyId, nome: addForm.nome, quantidade: addForm.quantidade }); setAddDialog(null); }}>Adicionar</Button>
                </>
              )}
              {addDialog === "material" && (
                <>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={addForm.tipo || "utilizado"} onValueChange={(v) => setAddForm({ ...addForm, tipo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recebido">Recebido</SelectItem>
                        <SelectItem value="utilizado">Utilizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Descrição</Label><Input value={addForm.descricao || ""} onChange={(e) => setAddForm({ ...addForm, descricao: e.target.value })} /></div>
                  <div><Label>Quantidade</Label><Input type="number" value={addForm.quantidade || 1} onChange={(e) => setAddForm({ ...addForm, quantidade: Number(e.target.value) })} /></div>
                  <div><Label>Unidade</Label><Input value={addForm.unidade || "un"} onChange={(e) => setAddForm({ ...addForm, unidade: e.target.value })} /></div>
                  <Button className="w-full" onClick={() => { addMaterial.mutate({ rdoId: rdoIdParam, companyId, tipo: addForm.tipo, descricao: addForm.descricao, quantidade: addForm.quantidade, unidade: addForm.unidade }); setAddDialog(null); }}>Adicionar</Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const obrasFiltradas = todasObrasLista.filter((o: any) =>
    !buscaObra || o.nome?.toLowerCase().includes(buscaObra.toLowerCase())
  );

  const statusLabel = (s: string) => {
    if (s === "Em_Andamento" || s === "em_andamento") return "Em andamento";
    if (s === "Concluida" || s === "concluida") return "Concluída";
    if (s === "Paralisada" || s === "paralisada") return "Paralisada";
    return s || "—";
  };
  const statusColor = (s: string) => {
    if (s === "Em_Andamento" || s === "em_andamento") return "bg-green-500";
    if (s === "Concluida" || s === "concluida") return "bg-gray-500";
    if (s === "Paralisada" || s === "paralisada") return "bg-yellow-500";
    return "bg-blue-500";
  };

  if (!selectedObraEntry) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/operacional")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Obras ({obrasFiltradas.length})</h1>
            <p className="text-sm text-gray-500">Selecione uma obra para ver os relatórios</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Pesquisar obra..."
              value={buscaObra}
              onChange={(e) => setBuscaObra(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filtroStatusObra} onValueChange={(v) => { setFiltroStatusObra(v); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos os status</SelectItem>
              <SelectItem value="Em_Andamento">Em andamento</SelectItem>
              <SelectItem value="Concluida">Concluídas</SelectItem>
              <SelectItem value="Paralisada">Paralisadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {obrasUnificadas.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
        ) : obrasFiltradas.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Building2 className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Nenhuma obra encontrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {obrasFiltradas.map((obra: any) => {
              const nRdos = Number(obra.total_relatorios) || 0;
              const nFotos = Number(obra.total_fotos) || 0;
              return (
                <div
                  key={`${obra.fonte}-${obra.id}`}
                  className="group border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-200 bg-white dark:bg-gray-900 hover:scale-[1.02]"
                  onClick={() => {
                    setObraId(obra.id);
                    setObraFonte(obra.fonte);
                    setViewMode('lista');
                  }}
                >
                  <div className="relative h-32 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                    {obra.logo_url ? (
                      <img src={obra.logo_url} alt={obra.nome} className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-12 h-12 text-gray-500 opacity-50" />
                    )}
                    <span className={`absolute top-2 left-2 text-[10px] text-white font-semibold px-2 py-0.5 rounded ${statusColor(obra.status)}`}>
                      {statusLabel(obra.status)}
                    </span>
                    {obra.fonte === 'importado' && (
                      <span className="absolute top-2 right-2 text-[9px] text-white font-medium px-1.5 py-0.5 rounded bg-blue-600/80">
                        Importado
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-1.5">
                      <span className="flex items-center gap-0.5"><ClipboardList className="w-3 h-3" /> {nRdos}</span>
                      {nFotos > 0 && <span className="flex items-center gap-0.5"><Camera className="w-3 h-3" /> {nFotos}</span>}
                    </div>
                    <p className="text-xs font-bold text-gray-800 dark:text-white leading-tight line-clamp-2 uppercase">
                      {obra.nome}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const rdoStatusLabel = (st: string) => {
    if (st === 'aprovado') return 'Aprovado';
    if (st === 'finalizado') return 'Finalizado';
    if (st === 'revisao' || st === 'revisar') return 'Revisar';
    return 'Rascunho';
  };
  const rdoStatusColor = (st: string) => {
    if (st === 'aprovado') return 'bg-green-100 text-green-700';
    if (st === 'finalizado') return 'bg-blue-100 text-blue-700';
    if (st === 'revisao' || st === 'revisar') return 'bg-yellow-100 text-yellow-700';
    return 'bg-gray-100 text-gray-600';
  };

  const rdoList = (rdos.data as any[]) || [];

  const renderVisaoGeral = () => {
    if (selectedFonte === 'importado') {
      return <ObraVisaoGeral obraId={selectedObraId} companyId={companyId} setLocation={setLocation} selectedFonte={selectedFonte} />;
    }
    const totalRdos = rdoList.length;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Relatórios", value: totalRdos, icon: ClipboardList, color: "text-blue-600 border-blue-200 bg-blue-50" },
            { label: "Rascunho", value: rdoList.filter((r: any) => r.status === "rascunho" || (!r.status)).length, icon: FileText, color: "text-gray-600 border-gray-200 bg-gray-50" },
            { label: "Finalizados", value: rdoList.filter((r: any) => r.status === "finalizado").length, icon: CheckCircle, color: "text-green-600 border-green-200 bg-green-50" },
            { label: "Aprovados", value: rdoList.filter((r: any) => r.status === "aprovado").length, icon: CheckCircle, color: "text-emerald-600 border-emerald-200 bg-emerald-50" },
          ].map((item) => (
            <div key={item.label} className={`border rounded-lg p-4 ${item.color}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs mt-1">{item.label}</p>
                </div>
                <item.icon className="w-5 h-5 opacity-60" />
              </div>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-600">Relatórios recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {rdoList.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500 text-xs">
                    <th className="py-1.5 px-2">Data</th>
                    <th className="py-1.5 px-2">N°</th>
                    <th className="py-1.5 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rdoList.slice(0, 10).map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => setLocation(`/operacional/rdo?obra=${selectedObraId}&id=${r.id}&fonte=${r.fonte || selectedFonte}`)}>
                      <td className="py-1.5 px-2 text-blue-600 hover:underline">
                        {new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-1.5 px-2">{r.numero || '—'}</td>
                      <td className="py-1.5 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${rdoStatusColor(r.status)}`}>
                          {rdoStatusLabel(r.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-gray-400">Nenhum relatório</p>}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderRelatorios = () => {
    if (rdos.isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
    if (rdoList.length === 0) {
      return (
        <div className="text-center py-20 text-gray-400">
          <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Nenhum RDO registrado para esta obra</p>
          {selectedFonte === 'principal' && (
            <Button className="mt-4" onClick={() => criarRDO.mutate({ companyId, obraId: selectedObraId, data: hoje, responsavelNome: user?.nome || user?.email })}>
              <Plus className="w-4 h-4 mr-2" /> Criar Primeiro RDO
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {rdoList.map((r: any) => {
          const dt = new Date(r.data + "T12:00:00");
          return (
            <div key={r.id}
              className="border rounded-lg px-4 py-3 flex items-center justify-between hover:bg-gray-50 group cursor-pointer"
              onClick={() => setLocation(`/operacional/rdo?obra=${selectedObraId}&id=${r.id}&fonte=${r.fonte || selectedFonte}`)}>
              <div className="flex items-center gap-4">
                <div className="min-w-[50px]">
                  <p className="text-xl font-bold leading-tight">{dt.toLocaleDateString("pt-BR", { day: "2-digit" })}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{dt.toLocaleDateString("pt-BR", { month: "short" })} de {dt.getFullYear()}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {r.clima_manha && <span>{r.clima_manha}</span>}
                  {r.numero && <span className="text-gray-400">#{r.numero}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.fonte === 'importado' && <span className="text-[10px] text-gray-400 font-medium">Importado</span>}
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${rdoStatusColor(r.status)}`}>
                  {rdoStatusLabel(r.status)}
                </span>
                {selectedFonte === 'principal' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/operacional/rdo?obra=${selectedObraId}&id=${r.id}&fonte=principal`); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      {r.status === "finalizado" && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); if (confirm("Deseja reabrir este RDO como rascunho?")) reabrirRDO.mutate({ id: r.id, companyId }); }}>
                          <RotateCcw className="h-4 w-4 mr-2" /> Reabrir
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={(e) => { e.stopPropagation(); if (confirm(`Excluir RDO?`)) deletarRDO.mutate({ id: r.id, companyId }); }}>
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`p-6 space-y-4 ${selectedFonte === 'importado' ? 'bg-gray-100 min-h-screen' : ''}`}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => { setObraId(0); setObraFonte(""); setLocation("/operacional/rdo"); }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {selectedObraEntry?.logo_url && (
          <img src={selectedObraEntry.logo_url} alt={selectedObraEntry.nome}
            className={`rounded-lg object-cover border shadow-sm hidden sm:block ${selectedFonte === 'importado' ? 'w-20 h-20' : 'w-16 h-16'}`} />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{selectedObraEntry?.nome || "RDO"}</h1>
          <p className="text-sm text-gray-500">Relatórios diários de obra</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={selectedObraEntry ? `${selectedObraEntry.fonte}:${selectedObraEntry.id}` : ""} onValueChange={(v) => { const [f, id] = v.split(":"); setObraId(Number(id)); setObraFonte(f); setViewMode('visao'); }}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Trocar obra" /></SelectTrigger>
            <SelectContent>
              {todasObrasLista.filter((o: any) => o.fonte === 'principal').length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase">Obras Próprias</div>
                  {todasObrasLista.filter((o: any) => o.fonte === 'principal').map((o: any) => (
                    <SelectItem key={`p-${o.id}`} value={`principal:${o.id}`}>{o.nome}</SelectItem>
                  ))}
                </>
              )}
              {todasObrasLista.filter((o: any) => o.fonte === 'importado').length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase mt-1">Importadas</div>
                  {todasObrasLista.filter((o: any) => o.fonte === 'importado').map((o: any) => (
                    <SelectItem key={`i-${o.id}`} value={`importado:${o.id}`}>{o.nome}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          {selectedFonte === 'principal' && (
            <Button onClick={() => criarRDO.mutate({ companyId, obraId: selectedObraId, data: hoje, responsavelNome: user?.nome || user?.email })} disabled={criarRDO.isPending || !selectedObraId}>
              {criarRDO.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Novo RDO
            </Button>
          )}
        </div>
      </div>

      {selectedFonte === 'importado' ? (
        <ObraVisaoGeral obraId={selectedObraId} companyId={companyId} setLocation={setLocation} selectedFonte={selectedFonte} />
      ) : (
        <>
          <div className="flex gap-2 border-b pb-1">
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${viewMode === 'visao' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setViewMode('visao')}
            >
              Visão geral
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${viewMode === 'lista' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setViewMode('lista')}
            >
              Relatórios {rdoList.length > 0 && <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{rdoList.length}</span>}
            </button>
          </div>
          {viewMode === 'visao' ? renderVisaoGeral() : renderRelatorios()}
        </>
      )}
    </div>
  );
}