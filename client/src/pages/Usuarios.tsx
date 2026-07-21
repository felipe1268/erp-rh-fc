import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Shield, Search, X, UserPlus, Users, Building2, Lock, Eye, EyeOff,
  ChevronDown, Save, Trash2, RefreshCw, User, Mail, KeyRound,
  Settings2, AlertTriangle, CheckSquare, Square, ArrowLeft,
  Layers, Plus, UserCheck, Edit2, Check, Palette, UsersRound,
  ShieldCheck, ShieldAlert, Crown, Info, ChevronRight, HardHat, Warehouse,
  Link, Unlink2,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { removeAccents } from "@/lib/searchUtils";
import {
  MODULE_PAGE_CONFIG, normalizeModulePerm, defaultPagesForLevel,
  type ModulePerm, type ModuleLevel, type PageAction, type PagePerms,
} from "../../../shared/modulePages";

// ─────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────
const ALL_MODULES = [
  { id: "rh-dp",        label: "RH / DP",        dot: "bg-blue-500",    tag: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "sst",          label: "SST",             dot: "bg-green-500",   tag: "bg-green-100 text-green-700 border-green-200" },
  { id: "juridico",     label: "Jurídico",         dot: "bg-amber-500",   tag: "bg-amber-100 text-amber-700 border-amber-200" },
  { id: "avaliacao",    label: "Avaliação",        dot: "bg-purple-500",  tag: "bg-purple-100 text-purple-700 border-purple-200" },
  { id: "terceiros",    label: "Terceiros",        dot: "bg-orange-500",  tag: "bg-orange-100 text-orange-700 border-orange-200" },
  { id: "parceiros",    label: "Parceiros",        dot: "bg-teal-500",    tag: "bg-teal-100 text-teal-700 border-teal-200" },
  { id: "orcamento",    label: "Orçamento",        dot: "bg-indigo-500",  tag: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { id: "planejamento", label: "Planejamento",     dot: "bg-violet-500",  tag: "bg-violet-100 text-violet-700 border-violet-200" },
  { id: "cadastro",     label: "Cadastro",         dot: "bg-slate-500",   tag: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "compras",      label: "Compras",          dot: "bg-rose-500",    tag: "bg-rose-100 text-rose-700 border-rose-200" },
  { id: "almoxarifado", label: "Almoxarifado",     dot: "bg-lime-600",    tag: "bg-lime-100 text-lime-700 border-lime-200" },
  { id: "financeiro",   label: "Financeiro",       dot: "bg-emerald-500", tag: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { id: "operacional",  label: "Operacional",      dot: "bg-cyan-500",    tag: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { id: "gestao-documentos", label: "Proj./Doc. Técnicos", dot: "bg-sky-500", tag: "bg-sky-100 text-sky-700 border-sky-200" },
  { id: "frotas",          label: "Frotas",            dot: "bg-cyan-600",   tag: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { id: "medicao",        label: "Medição",           dot: "bg-teal-500",   tag: "bg-teal-100 text-teal-700 border-teal-200" },
  { id: "portal-cliente", label: "Portal do Cliente", dot: "bg-blue-600",   tag: "bg-blue-100 text-blue-700 border-blue-200" },
];

const GROUP_COLORS = [
  "#6b7280","#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#ec4899","#06b6d4","#84cc16","#f97316",
];

// Rev. 2919 — serializa o estado salvável de um grupo (nome/descrição/cor + módulos
// não-nulos, na MESMA forma que vai pro backend) p/ detectar "alterações não salvas"
// e confirmar o que foi persistido sem depender de refetch fora de ordem.
function serializeGroupState(
  nome: string,
  descricao: string,
  cor: string,
  moduleAccess: Record<string, ModulePerm | null>,
): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(moduleAccess)) { if (v != null) clean[k] = v; }
  return JSON.stringify({ nome: nome || "", descricao: descricao || "", cor: cor || "#6b7280", moduleAccess: clean });
}

const ROLE_LABELS: Record<string, string> = { admin_master: "Admin Master", admin: "Admin", adm_cliente: "Adm Cliente", user: "Usuário" };
const ROLE_BADGE: Record<string, string> = {
  admin_master: "bg-purple-100 text-purple-700 border-purple-200",
  admin:        "bg-blue-100 text-blue-700 border-blue-200",
  adm_cliente:  "bg-teal-100 text-teal-700 border-teal-200",
  user:         "bg-gray-100 text-gray-600 border-gray-200",
};
const ACTION_LABELS: Record<PageAction, string> = { view: "Ver", create: "Criar", edit: "Editar", delete: "Excluir" };

// ─────────────────────────────────────────────────
// Componente de permissões de módulo (reutilizável)
// ─────────────────────────────────────────────────
interface ModulePermsEditorProps {
  moduleAccess: Record<string, ModulePerm | null>;
  onChange: (next: Record<string, ModulePerm | null>) => void;
}
function ModulePermsEditor({ moduleAccess, onChange }: ModulePermsEditorProps) {
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const toggleModule = (id: string, on: boolean) => {
    onChange({ ...moduleAccess, [id]: on ? { level: "admin", pages: defaultPagesForLevel(id, "admin"), sensitiveHidden: [] } : null });
  };
  const setLevel = (id: string, level: ModuleLevel) => {
    const cur = moduleAccess[id];
    if (!cur) return;
    onChange({ ...moduleAccess, [id]: { ...cur, level, pages: level !== "custom" ? defaultPagesForLevel(id, level as "admin" | "viewer") : cur.pages } });
  };
  const togglePage = (modId: string, pageId: string, act: PageAction, val: boolean) => {
    const cur = moduleAccess[modId];
    if (!cur) return;
    const pages = { ...cur.pages, [pageId]: { ...cur.pages?.[pageId] ?? { view:false,create:false,edit:false,delete:false }, [act]: val } };
    onChange({ ...moduleAccess, [modId]: { ...cur, pages } });
  };
  const toggleAllAction = (modId: string, act: PageAction, val: boolean) => {
    const cur = moduleAccess[modId];
    if (!cur) return;
    const config = MODULE_PAGE_CONFIG[modId];
    if (!config) return;
    const pages = { ...cur.pages };
    for (const p of config.pages) {
      if (p.actions.includes(act)) pages[p.id] = { ...pages[p.id] ?? { view:false,create:false,edit:false,delete:false }, [act]: val };
    }
    onChange({ ...moduleAccess, [modId]: { ...cur, pages } });
  };
  const toggleSensitive = (modId: string, flagId: string, hidden: boolean) => {
    const cur = moduleAccess[modId];
    if (!cur) return;
    const sh = cur.sensitiveHidden ?? [];
    onChange({ ...moduleAccess, [modId]: { ...cur, sensitiveHidden: hidden ? [...sh.filter(x=>x!==flagId), flagId] : sh.filter(x=>x!==flagId) } });
  };
  const toggleExtra = (modId: string, key: string, val: boolean) => {
    const cur = moduleAccess[modId];
    if (!cur) return;
    const extras = { ...(cur.extras ?? {}), [key]: val };
    onChange({ ...moduleAccess, [modId]: { ...cur, extras } });
  };
  const setAll = (level: "admin" | null) => {
    if (level === null) { onChange(Object.fromEntries(ALL_MODULES.map(m => [m.id, null]))); return; }
    const next: Record<string, ModulePerm | null> = {};
    for (const m of ALL_MODULES) next[m.id] = { level, pages: defaultPagesForLevel(m.id, level), sensitiveHidden: [] };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> Acesso a Módulos
        </p>
        <div className="flex gap-2">
          <button className="text-xs text-blue-600 hover:underline" onClick={() => setAll("admin")}>Todos admin</button>
          <span className="text-muted-foreground text-xs">·</span>
          <button className="text-xs text-muted-foreground hover:underline" onClick={() => setAll(null)}>Limpar tudo</button>
        </div>
      </div>
      {ALL_MODULES.map(mod => {
        const perm = moduleAccess[mod.id] ?? null;
        const isOn = perm != null;
        const isExpanded = expandedModule === mod.id && isOn;
        const config = MODULE_PAGE_CONFIG[mod.id];
        const enabledCount = isOn && perm?.level === "custom"
          ? Object.values(perm.pages ?? {}).filter(p => p.view).length : 0;
        return (
          <div key={mod.id} className={`rounded-xl border transition-all ${isOn ? "border-border bg-card shadow-sm" : "border-dashed border-border/50 bg-secondary/5"}`}>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${isOn ? mod.dot : "bg-gray-300"}`} />
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${!isOn ? "text-muted-foreground" : ""}`}>{mod.label}</span>
                {isOn && perm && (
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                    perm.level === "admin"  ? "bg-blue-50 text-blue-700 border-blue-200" :
                    perm.level === "viewer" ? "bg-gray-50 text-gray-600 border-gray-200" :
                                             "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {perm.level === "admin" ? "Administrador" : perm.level === "viewer" ? "Somente ver" : `Personalizado${enabledCount > 0 ? ` · ${enabledCount} pág.` : ""}`}
                  </span>
                )}
              </div>
              {isOn && (
                <button onClick={() => setExpandedModule(isExpanded ? null : mod.id)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Configurar permissões detalhadas">
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              )}
              <Switch checked={isOn} onCheckedChange={v => toggleModule(mod.id, v)} className="shrink-0" />
            </div>

            {isExpanded && perm && config && (
              <div className="border-t bg-slate-50/50 rounded-b-xl px-4 py-4 space-y-5">
                {/* Nível */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Nível de acesso</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["admin","viewer","custom"] as ModuleLevel[]).map(lvl => (
                      <button key={lvl} onClick={() => setLevel(mod.id, lvl)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          perm.level === lvl
                            ? lvl==="admin"  ? "bg-blue-600 text-white border-blue-600"
                            : lvl==="viewer" ? "bg-gray-600 text-white border-gray-600"
                            :                  "bg-amber-500 text-white border-amber-500"
                            : "bg-white border-border text-muted-foreground hover:border-gray-400"}`}>
                        {lvl==="admin"  ? <Lock className="h-3 w-3" /> :
                         lvl==="viewer" ? <Eye className="h-3 w-3" /> :
                                          <Settings2 className="h-3 w-3" />}
                        {lvl==="admin" ? "Administrador" : lvl==="viewer" ? "Somente visualização" : "Personalizado"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabela de páginas (custom) */}
                {perm.level === "custom" && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Páginas e ações permitidas</p>
                    <div className="rounded-xl border bg-white overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-100 border-b">
                            <th className="text-left px-3 py-2.5 font-semibold text-slate-600">Página / Tela</th>
                            {(["view","create","edit","delete"] as PageAction[]).map(act => (
                              <th key={act} className="text-center px-2 py-2.5 w-14 font-semibold text-slate-600">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-[10px]">{ACTION_LABELS[act]}</span>
                                  {config.pages.some(p => p.actions.includes(act)) && (
                                    <button className="text-[9px] text-blue-500 hover:underline" onClick={() => {
                                      const all = config.pages.filter(p=>p.actions.includes(act)).every(p=>perm.pages?.[p.id]?.[act]);
                                      toggleAllAction(mod.id, act, !all);
                                    }}>
                                      {config.pages.filter(p=>p.actions.includes(act)).every(p=>perm.pages?.[p.id]?.[act]) ? "des." : "tudo"}
                                    </button>
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {config.pages.map((page, i) => {
                            const pp: PagePerms = perm.pages?.[page.id] ?? { view:false,create:false,edit:false,delete:false };
                            return (
                              <tr key={page.id} className={`border-b last:border-0 ${i%2===0?"bg-white":"bg-slate-50/40"}`}>
                                <td className="px-3 py-2 text-slate-700 font-medium">{page.label}</td>
                                {(["view","create","edit","delete"] as PageAction[]).map(act => (
                                  <td key={act} className="text-center px-2 py-2">
                                    {page.actions.includes(act) ? (
                                      <button onClick={() => togglePage(mod.id, page.id, act, !pp[act])}
                                        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${pp[act] ? "text-blue-600 hover:text-blue-700" : "text-slate-300 hover:text-slate-400"}`}>
                                        {pp[act] ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                      </button>
                                    ) : <span className="text-slate-200 text-sm">—</span>}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dados sensíveis LGPD */}
                {config.sensitiveFlags && config.sensitiveFlags.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-amber-500" /> Dados Sensíveis / LGPD
                    </p>
                    <div className="space-y-1.5">
                      {config.sensitiveFlags.map(flag => {
                        const hidden = perm.sensitiveHidden?.includes(flag.id) ?? false;
                        return (
                          <label key={flag.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs transition-all ${
                            hidden ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-border text-slate-600 hover:bg-slate-50"}`}>
                            <input type="checkbox" checked={hidden} onChange={e => toggleSensitive(mod.id, flag.id, e.target.checked)} className="rounded" />
                            <EyeOff className={`h-3.5 w-3.5 shrink-0 ${hidden?"text-red-500":"text-slate-300"}`} />
                            <span className="font-medium">Ocultar: {flag.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Permissões Especiais — SST */}
                {mod.id === "sst" && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Settings2 className="h-3 w-3 text-emerald-600" /> Permissões Especiais
                    </p>
                    <div className="space-y-1.5">
                      {(() => {
                        const val = !!(perm.extras?.['canEditEpiCentral']);
                        return (
                          <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs transition-all ${
                            val ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-border text-slate-600 hover:bg-slate-50"}`}>
                            <input type="checkbox" checked={val} onChange={e => toggleExtra(mod.id, 'canEditEpiCentral', e.target.checked)} className="rounded" />
                            <Warehouse className={`h-3.5 w-3.5 shrink-0 ${val ? "text-emerald-600" : "text-slate-300"}`} />
                            <div>
                              <span className="font-semibold">Editar estoque central de EPIs</span>
                              <span className="block text-[10px] text-muted-foreground mt-0.5">Permite ajustar a quantidade no Almoxarifado Central sem ser administrador.</span>
                            </div>
                          </label>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────────
export default function Usuarios() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const isAdmin  = user?.role === "admin" || isMaster;
  // Rev. 4041 — "Adm Cliente": admin restrito às SUAS empresas vinculadas,
  // não gerencia perfis/módulos, só usuários "user" no próprio escopo.
  const isAdmCliente = user?.role === "adm_cliente";
  const canManageUsers = isAdmin || isAdmCliente;

  const [activeTab, setActiveTab] = useState<"usuarios" | "grupos">("usuarios");

  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  // ── Dados base ──
  const usersQuery        = trpc.userManagement.listUsers.useQuery();
  const allCompaniesQuery = trpc.companies.list.useQuery();
  const groupsQuery       = trpc.userGroups.list.useQuery();
  const allMembersQuery   = trpc.userGroups.listAllMembers.useQuery();
  const obrasAtivasQuery  = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const obrasAtivas       = obrasAtivasQuery.data ?? [];
  const utils             = trpc.useUtils();

  const allUsers   = usersQuery.data ?? [];
  const allGroups  = groupsQuery.data ?? [];

  // Mapa userId → groupId (fonte única de verdade sobre memberships)
  const userGroupIdMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const row of (allMembersQuery.data ?? [])) {
      map[(row as any).userId] = (row as any).groupId;
    }
    return map;
  }, [allMembersQuery.data]);

  // ──────────────────────────────────────────────
  // TAB USUÁRIOS — estado
  // ──────────────────────────────────────────────
  const [uPanel, setUPanel]             = useState<"list"|"detail"|"new">("list");
  const [uSearch, setUSearch]           = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const linkedEmployeeQ = trpc.employees.getLinkedEmployee.useQuery({ userId: selectedUser?.id ?? 0 }, { enabled: !!selectedUser?.id });

  // Formulário edição
  const [editName, setEditName]       = useState("");
  const [editEmail, setEditEmail]     = useState("");
  const [editUser, setEditUser]       = useState("");
  const [editPwd, setEditPwd]         = useState("");
  const [showPwd, setShowPwd]         = useState(false);
  const [editRole, setEditRole]       = useState("user");
  const [editCos, setEditCos]         = useState<number[]>([]);
  const [editGroupIds, setEditGroupIds] = useState<number[]>([]);
  const [editObras, setEditObras]     = useState<number[]>([]);

  // Vinculação manual colaborador ↔ usuário (Rev. 4481)
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [linkEmpSearch, setLinkEmpSearch] = useState("");
  const empLinkListQ = trpc.employees.list.useQuery(
    { companyId: editCos[0] ?? 0, companyIds: editCos },
    { enabled: showLinkSearch && editCos.length > 0 }
  );
  const linkEmpMut = trpc.employees.linkUser.useMutation({
    onSuccess: () => {
      linkedEmployeeQ.refetch();
      setShowLinkSearch(false);
      setLinkEmpSearch("");
      toast.success("Colaborador vinculado!");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  // Formulário novo usuário
  const [newUser, setNewUser]   = useState({ username:"", name:"", email:"", role:"user" as any, password:"", companyIds:[] as number[], groupIds:[] as number[] });

  // Mutations usuários
  const updateUserMut = trpc.userManagement.updateUser.useMutation({
    onSuccess: () => { toast.success("Usuário atualizado"); utils.userManagement.listUsers.invalidate(); },
    onError:   e => toast.error(e.message),
  });
  const setStatusMut = trpc.userManagement.setUserStatus.useMutation({
    onSuccess: (_d, vars) => { usersQuery.refetch(); setSelectedUser((p:any)=> p && p.id===vars.userId ? {...p, status: vars.status} : p); toast.success(vars.status==="desligado" ? "Acesso desativado" : "Acesso reativado"); },
    onError: (e:any) => toast.error(e?.message || "Não foi possível alterar o acesso"),
  });
  const deleteUserMut = trpc.userManagement.deleteUser.useMutation({
    onSuccess: () => { toast.success("Usuário excluído"); setSelectedUser(null); setUPanel("list"); utils.userManagement.listUsers.invalidate(); },
    onError:   e => toast.error(e.message),
  });
  const resetPwdMut = trpc.userManagement.resetPassword.useMutation({
    onSuccess: d => toast.success(`Nova senha: ${d.newPassword}`),
    onError:   e => toast.error(e.message),
  });
  const createUserMut = trpc.userManagement.createLocalUser.useMutation({
    onSuccess: async (d) => {
      toast.success(`Usuário "${d.username}" criado! Senha: ${d.defaultPassword}`);
      if (!isAdmCliente && newUser.groupIds.length > 0) {
        await setGroupsMut.mutateAsync({ userId: d.id, groupIds: newUser.groupIds });
      }
      if (newUser.companyIds.length > 0) {
        await setCosMut.mutateAsync({ userId: d.id, companyIds: newUser.companyIds });
      }
      setNewUser({ username:"", name:"", email:"", role:"user", password:"", companyIds:[], groupIds:[] });
      setUPanel("list");
      utils.userManagement.listUsers.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const setCosMut = trpc.userManagement.setUserCompanies.useMutation({
    onSuccess: () => utils.userManagement.listUsers.invalidate(),
  });
  const setGroupsMut = trpc.userGroups.setUserGroups.useMutation({
    onSuccess: () => {
      utils.userManagement.listUsers.invalidate();
      utils.userGroups.listAllMembers.invalidate();
      // Rev. 2211 — invalida getMembers de TODOS os grupos pq não sabemos
      // de qual grupo o usuário saiu (setUserGroups faz DELETE + INSERT).
      // Sem isso, o painel direito do grupo antigo continua mostrando o
      // usuário (cache stale) — bug reportado pela Lilian (Ana Beatriz
      // movida pra TST mas continuava aparecendo em RH e DP).
      utils.userGroups.getMembers.invalidate();
      utils.userGroups.list.invalidate();
    },
  });
  const setObrasMut = trpc.userManagement.setUserObras.useMutation({
    onSuccess: () => utils.userManagement.listUsers.invalidate(),
  });

  const openUser = (u: any) => {
    setSelectedUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditUser(u.username || "");
    setEditPwd("");
    setEditRole(u.role || "user");
    setEditCos(u.companyIds || []);
    setEditObras(u.allowedObraIds || []);
    const gid = userGroupIdMap[u.id];
    setEditGroupIds(gid ? [gid] : []);
    setUPanel("detail");
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    await updateUserMut.mutateAsync({ userId: selectedUser.id, name: editName, email: editEmail||undefined, username: editUser, role: (isAdmCliente ? "user" : editRole) as any, password: editPwd||undefined });
    await setCosMut.mutateAsync({ userId: selectedUser.id, companyIds: editCos });
    // Rev. 4041 — Adm Cliente não gerencia grupos de permissão (escopo de acesso amplo demais).
    if (!isAdmCliente) {
      await setGroupsMut.mutateAsync({ userId: selectedUser.id, groupIds: editGroupIds });
    }
    await setObrasMut.mutateAsync({ userId: selectedUser.id, obraIds: editObras });
    utils.userGroups.list.invalidate();
  };

  // Rev. 2209 — auto-save de grupo de acesso ao clicar no radio.
  // Lilian: "clicando no grupo já deveria fazer a mudança automaticamente".
  // Rev. 2212 — força refetch (não só invalidate) das queries que pintam
  // a contagem "N membros" nos cards laterais e o painel "Membros do
  // Grupo", garantindo que tudo atualiza ANTES do toast aparecer.
  const handleQuickSetGroup = async (groupIds: number[]) => {
    if (!selectedUser) return;
    setEditGroupIds(groupIds);
    try {
      await setGroupsMut.mutateAsync({ userId: selectedUser.id, groupIds });
      await Promise.all([
        utils.userGroups.list.refetch(),
        utils.userGroups.listAllMembers.refetch(),
        utils.userGroups.getMembers.invalidate(),
      ]);
      toast.success(groupIds.length === 0 ? "Grupo removido" : "Grupo alterado");
    } catch (e: any) {
      toast.error("Falha ao alterar grupo: " + (e?.message || ""));
    }
  };

  const filteredUsers = useMemo(() => {
    const q = removeAccents(uSearch.toLowerCase());
    return allUsers.filter((u: any) => {
      if (!q) return true;
      return removeAccents((u.name||"").toLowerCase()).includes(q) ||
             removeAccents((u.username||"").toLowerCase()).includes(q) ||
             removeAccents((u.email||"").toLowerCase()).includes(q);
    });
  }, [allUsers, uSearch]);

  // Grupo do usuário (display) — lê de userGroupIdMap (fonte única: listAllMembers)
  const getUserGroupLabel = (u: any) => {
    const gid = userGroupIdMap[u.id];
    if (!gid) return null;
    return (allGroups as any[]).find(g => g.id === gid)?.nome ?? null;
  };

  // ──────────────────────────────────────────────
  // TAB GRUPOS — estado
  // ──────────────────────────────────────────────
  const [gPanel, setGPanel]               = useState<"list"|"detail"|"new">("list");
  const [gSearch, setGSearch]             = useState("");
  const [selectedGroup, setSelectedGroup] = useState<any>(null);

  // Formulário grupo
  const [gName, setGName]     = useState("");
  const [gDesc, setGDesc]     = useState("");
  const [gColor, setGColor]   = useState("#6b7280");
  const [gModuleAccess, setGModuleAccess] = useState<Record<string, ModulePerm | null>>({});
  const [gBaseline, setGBaseline] = useState<string>(""); // Rev. 2919 — snapshot do estado salvo (detecta alterações não salvas)
  const [gMembers, setGMembers] = useState<number[]>([]);
  const [addMemberUserId, setAddMemberUserId] = useState<string>("");

  // Mutations grupos
  const createGroupMut = trpc.userGroups.create.useMutation({
    onSuccess: (d) => {
      toast.success(`Grupo "${gName}" criado!`);
      utils.userGroups.list.invalidate();
      setGPanel("list");
      setGName(""); setGDesc(""); setGColor("#6b7280"); setGModuleAccess({});
    },
    onError: e => toast.error(e.message),
  });
  // Rev. 2919 — sem toasts próprios: o feedback (sucesso/erro) é centralizado em handleSaveGroup
  // (único chamador) p/ não emitir mensagens conflitantes em falha parcial.
  const updateGroupMut = trpc.userGroups.update.useMutation();
  const deleteGroupMut = trpc.userGroups.delete.useMutation({
    onSuccess: () => { toast.success("Grupo excluído"); setSelectedGroup(null); setGPanel("list"); utils.userGroups.list.invalidate(); },
    onError:   e => toast.error(e.message),
  });
  const setGroupModAccessMut = trpc.userGroups.setGroupModuleAccess.useMutation(); // Rev. 2919 — feedback centralizado em handleSaveGroup
  const addMemberMut = trpc.userGroups.addMember.useMutation({
    onSuccess: () => {
      utils.userGroups.list.invalidate();
      utils.userGroups.listAllMembers.invalidate();
      if (selectedGroup) utils.userGroups.getMembers.invalidate({ groupId: selectedGroup.id });
    },
    onError: e => toast.error(e.message),
  });
  const removeMemberMut = trpc.userGroups.removeMember.useMutation({
    onSuccess: () => {
      utils.userGroups.list.invalidate();
      utils.userGroups.listAllMembers.invalidate();
      if (selectedGroup) utils.userGroups.getMembers.invalidate({ groupId: selectedGroup.id });
    },
    onError: e => toast.error(e.message),
  });

  // Query membros do grupo selecionado
  const groupMembersQuery = trpc.userGroups.getMembers.useQuery(
    { groupId: selectedGroup?.id ?? 0 },
    { enabled: !!selectedGroup }
  );
  const groupMemberIds = (groupMembersQuery.data ?? []).map((m: any) => m.userId);

  const openGroup = (g: any) => {
    setSelectedGroup(g);
    setGName(g.nome || "");
    setGDesc(g.descricao || "");
    setGColor(g.cor || "#6b7280");
    const ma: Record<string, ModulePerm | null> = {};
    if (g.moduleAccess && typeof g.moduleAccess === "object") {
      for (const [k, v] of Object.entries(g.moduleAccess)) {
        ma[k] = normalizeModulePerm(k, v);
      }
    }
    setGModuleAccess(ma);
    setGBaseline(serializeGroupState(g.nome || "", g.descricao || "", g.cor || "#6b7280", ma)); // Rev. 2919
    setGPanel("detail");
  };

  const handleSaveGroup = async () => {
    if (!selectedGroup) { toast.error("Nenhum grupo selecionado — reabra o grupo e tente novamente."); return; }
    const groupId = selectedGroup.id;
    const clean: Record<string, ModulePerm> = {};
    for (const [k, v] of Object.entries(gModuleAccess)) { if (v != null) clean[k] = v; }
    try {
      // Rev. 2919 — módulos PRIMEIRO (o que mais importa), depois metadados; try/catch p/ falha LOUD.
      await setGroupModAccessMut.mutateAsync({ groupId, moduleAccess: clean });
      await updateGroupMut.mutateAsync({ id: groupId, nome: gName, descricao: gDesc, cor: gColor });
      // Confirma o estado persistido na própria UI (não depende de refetch fora de ordem que poderia
      // reexibir o estado ANTIGO e dar a impressão de "reverteu").
      const saved = serializeGroupState(gName, gDesc, gColor, gModuleAccess);
      setGBaseline(saved);
      setSelectedGroup((prev: any) => (prev && prev.id === groupId ? { ...prev, nome: gName, descricao: gDesc, cor: gColor, moduleAccess: clean } : prev));
      toast.success(`Grupo salvo — ${Object.keys(clean).length} módulo(s) liberado(s).`);
      utils.userGroups.list.invalidate();
    } catch (e: any) {
      utils.userGroups.list.invalidate(); // recarrega do servidor p/ refletir o que (eventualmente) foi gravado
      toast.error(e?.message || "Falha ao salvar o grupo. Verifique e tente novamente.");
    }
  };

  // Rev. 2919 — "alterações não salvas": compara o estado salvável atual com o snapshot do último save/open.
  const gDirty = useMemo(
    () => gPanel === "detail" && !!selectedGroup && serializeGroupState(gName, gDesc, gColor, gModuleAccess) !== gBaseline,
    [gPanel, selectedGroup, gName, gDesc, gColor, gModuleAccess, gBaseline],
  );

  const handleCreateGroup = () => {
    if (!gName.trim()) { toast.error("Informe o nome do grupo"); return; }
    createGroupMut.mutate({ nome: gName, descricao: gDesc||undefined, cor: gColor });
  };

  const filteredGroups = useMemo(() => {
    const q = removeAccents(gSearch.toLowerCase());
    return (allGroups as any[]).filter(g => !q || removeAccents((g.nome||"").toLowerCase()).includes(q));
  }, [allGroups, gSearch]);

  // Rev. 2210 — UX: ao entrar na aba "Grupos de Acesso" sem nada selecionado,
  // abre automaticamente o 1º grupo da lista pra não dar sensação de tela vazia.
  useEffect(() => {
    if (activeTab !== "grupos") return;
    if (gPanel !== "list") return;
    if (selectedGroup) return;
    if (filteredGroups.length === 0) return;
    openGroup(filteredGroups[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filteredGroups.length]);

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Header com Tabs ── */}
        <div className="shrink-0 border-b bg-background px-4 pt-4 pb-0">
          <div className="flex items-end gap-0">
            <button
              onClick={() => setActiveTab("usuarios")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "usuarios"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Users className="h-4 w-4" /> Usuários
              <span className="ml-1 text-xs bg-slate-100 border px-1.5 py-0.5 rounded-full text-slate-500">{allUsers.length}</span>
            </button>
            <button
              onClick={() => setActiveTab("grupos")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "grupos"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <ShieldCheck className="h-4 w-4" /> Grupos de Acesso
              <span className="ml-1 text-xs bg-slate-100 border px-1.5 py-0.5 rounded-full text-slate-500">{allGroups.length}</span>
            </button>
          </div>
        </div>

        {/* ── Conteúdo ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ═══════════════════════════════════════════
              TAB: USUÁRIOS
          ═══════════════════════════════════════════ */}
          {activeTab === "usuarios" && (
            <>
              {/* Sidebar lista */}
              <div className={`${uPanel !== "list" ? "hidden lg:flex" : "flex"} w-72 shrink-0 flex-col border-r bg-background`}>
                <div className="p-3 border-b space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-blue-600" /> Usuários</span>
                    {canManageUsers && (
                      <Button size="sm" className="h-7 gap-1 bg-green-600 hover:bg-green-700 text-xs"
                        onClick={() => { setSelectedUser(null); setUPanel("new"); }}>
                        <UserPlus className="h-3 w-3" /> Novo
                      </Button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Buscar..." value={uSearch} onChange={e=>setUSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                    {uSearch && <button onClick={()=>setUSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground" /></button>}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredUsers.map((u: any) => {
                    const grpLabel = getUserGroupLabel(u);
                    const isSel = selectedUser?.id === u.id && uPanel === "detail";
                    return (
                      <button key={u.id} onClick={() => openUser(u)}
                        className={`w-full text-left px-3 py-2.5 border-b transition-colors flex items-center gap-2.5 hover:bg-muted/50 ${isSel ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                          u.role==="admin_master" ? "bg-purple-600" : u.role==="admin" ? "bg-blue-600" : "bg-gray-400"}`}>
                          {(u.name||u.username||"?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-medium truncate ${u.status==="desligado" ? "text-muted-foreground line-through" : ""}`}>{u.name||u.username}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${ROLE_BADGE[u.role]}`}>{ROLE_LABELS[u.role]||u.role}</span>
                            {u.status==="desligado" && <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0 bg-red-50 text-red-600 border-red-200">Inativo</span>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {grpLabel
                              ? <span className="flex items-center gap-1"><ShieldCheck className="h-2.5 w-2.5 text-green-500" />{grpLabel}</span>
                              : <span className="text-orange-500 flex items-center gap-1"><ShieldAlert className="h-2.5 w-2.5" />Sem grupo</span>}
                          </div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                  {filteredUsers.length === 0 && !usersQuery.isLoading && (
                    <div className="p-6 text-center text-xs text-muted-foreground">Nenhum usuário encontrado</div>
                  )}
                </div>
              </div>

              {/* Painel direito: Novo / Detalhe */}
              <div className={`${uPanel === "list" ? "hidden lg:flex" : "flex"} flex-1 flex-col overflow-hidden`}>

                {/* NOVO USUÁRIO */}
                {uPanel === "new" && (
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-lg mx-auto space-y-6">
                      <div className="flex items-center gap-3">
                        <button className="lg:hidden" onClick={() => setUPanel("list")}><ArrowLeft className="h-4 w-4" /></button>
                        <div>
                          <h2 className="text-lg font-bold flex items-center gap-2"><UserPlus className="h-5 w-5 text-green-600" /> Novo Usuário</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Crie o acesso e atribua um grupo de permissões</p>
                        </div>
                      </div>
                      {/* Passo 1: Dados básicos */}
                      <div className="rounded-xl border p-4 space-y-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Dados Básicos</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="text-xs text-muted-foreground">Username *</label>
                            <Input value={newUser.username} onChange={e=>setNewUser(p=>({...p,username:e.target.value}))} placeholder="joao.silva" className="h-9 mt-1" /></div>
                          <div><label className="text-xs text-muted-foreground">Nome *</label>
                            <Input value={newUser.name} onChange={e=>setNewUser(p=>({...p,name:e.target.value}))} placeholder="Nome completo" className="h-9 mt-1" /></div>
                        </div>
                        <div><label className="text-xs text-muted-foreground">E-mail</label>
                          <Input value={newUser.email} onChange={e=>setNewUser(p=>({...p,email:e.target.value}))} placeholder="email@empresa.com" type="email" className="h-9 mt-1" /></div>
                        <div className="grid grid-cols-2 gap-3">
                          {isAdmCliente ? null : (
                          <div><label className="text-xs text-muted-foreground">Perfil</label>
                            <Select value={newUser.role} onValueChange={v=>setNewUser(p=>({...p,role:v}))}>
                              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">Usuário</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="adm_cliente">Adm Cliente</SelectItem>
                                {isMaster && <SelectItem value="admin_master">Admin Master</SelectItem>}
                              </SelectContent>
                            </Select></div>
                          )}
                          <div><label className="text-xs text-muted-foreground">Senha (opcional)</label>
                            <Input value={newUser.password} onChange={e=>setNewUser(p=>({...p,password:e.target.value}))} placeholder="Padrão: asdf1020" type="password" className="h-9 mt-1" /></div>
                        </div>
                      </div>
                      {/* Passo 2: Empresas */}
                      {allCompaniesQuery.data && allCompaniesQuery.data.length > 0 && newUser.role !== "admin_master" && (
                        <div className="rounded-xl border p-4 space-y-2">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Empresas com Acesso</h3>
                          <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
                            {allCompaniesQuery.data.map((c: any) => (
                              <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${newUser.companyIds.includes(c.id)?"bg-blue-50 border-blue-300":"bg-secondary/10 border-border hover:bg-secondary/30"}`}>
                                <input type="checkbox" className="rounded" checked={newUser.companyIds.includes(c.id)}
                                  onChange={e=>setNewUser(p=>({...p,companyIds:e.target.checked?[...p.companyIds,c.id]:p.companyIds.filter(id=>id!==c.id)}))} />
                                {c.nomeFantasia||c.razaoSocial}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Passo 3: Grupo de Acesso */}
                      <div className="rounded-xl border p-4 space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Grupo de Acesso</h3>
                        {allGroups.length === 0 ? (
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>Nenhum grupo criado ainda. Crie grupos na aba "Grupos de Acesso" e depois atribua ao usuário.</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {(allGroups as any[]).map(g => (
                              <label key={g.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-sm transition-colors ${newUser.groupIds.includes(g.id)?"bg-blue-50 border-blue-300":"bg-secondary/10 border-border hover:bg-secondary/30"}`}>
                                <input type="checkbox" className="rounded" checked={newUser.groupIds.includes(g.id)}
                                  onChange={e=>setNewUser(p=>({...p,groupIds:e.target.checked?[...p.groupIds,g.id]:p.groupIds.filter(id=>id!==g.id)}))} />
                                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{background:g.cor||"#6b7280"}} />
                                <span className="font-medium">{g.nome}</span>
                                {g.descricao && <span className="text-muted-foreground text-xs">— {g.descricao}</span>}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <Button onClick={() => {
                          if (!newUser.username||!newUser.name) { toast.error("Preencha usuário e nome"); return; }
                          createUserMut.mutate({ username:newUser.username, name:newUser.name, email:newUser.email||undefined, role:newUser.role, password:newUser.password||undefined, companyIds:newUser.companyIds.length>0?newUser.companyIds:undefined });
                        }} disabled={createUserMut.isPending} className="gap-1.5 bg-green-600 hover:bg-green-700">
                          <UserPlus className="h-4 w-4" />{createUserMut.isPending?"Criando...":"Criar Usuário"}
                        </Button>
                        <Button variant="outline" onClick={()=>setUPanel("list")}>Cancelar</Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* DETALHE DO USUÁRIO */}
                {uPanel === "detail" && selectedUser && (
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-2xl mx-auto space-y-5">
                      <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-background p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-4 min-w-0">
                            <button className="lg:hidden shrink-0" onClick={()=>setUPanel("list")}><ArrowLeft className="h-4 w-4" /></button>
                            <div className={`h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-sm ${selectedUser.role==="admin_master"?"bg-purple-600":selectedUser.role==="admin"?"bg-blue-600":"bg-gray-400"}`}>
                              {(selectedUser.name||selectedUser.username||"?").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h2 className="text-xl font-bold leading-tight">{selectedUser.name||selectedUser.username}</h2>
                              <div className="flex items-center flex-wrap gap-2 mt-1.5">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${ROLE_BADGE[selectedUser.role]}`}>{ROLE_LABELS[selectedUser.role]||selectedUser.role}</span>
                                <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${selectedUser.status==="desligado" ? "bg-red-50 text-red-600 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${selectedUser.status==="desligado" ? "bg-red-500" : "bg-green-500"}`} />
                                  {selectedUser.status==="desligado" ? "Inativo" : "Ativo"}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 truncate">{selectedUser.email||selectedUser.username}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-stretch gap-2 shrink-0 w-full sm:w-auto">
                            {canManageUsers && selectedUser.id !== user?.id && (
                              <div className={`flex items-center justify-between gap-3 h-9 px-3 rounded-lg border ${selectedUser.status==="desligado" ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                                <span className="flex items-center gap-1.5">
                                  <Lock className={`h-3.5 w-3.5 ${selectedUser.status==="desligado" ? "text-red-600" : "text-green-600"}`} />
                                  <span className={`text-xs font-medium ${selectedUser.status==="desligado" ? "text-red-600" : "text-green-700"}`}>{selectedUser.status==="desligado" ? "Acesso inativo" : "Acesso ativo"}</span>
                                </span>
                                <Switch
                                  checked={selectedUser.status!=="desligado"}
                                  disabled={setStatusMut.isPending}
                                  onCheckedChange={(v)=>{
                                    const novo = v ? "ativo" : "desligado";
                                    if (novo==="desligado" && !confirm(`Inativar o acesso de ${selectedUser.name||selectedUser.username}? A pessoa não conseguirá mais entrar no sistema (o cadastro é mantido).`)) return;
                                    setStatusMut.mutate({ userId: selectedUser.id, status: novo });
                                  }} />
                              </div>
                            )}
                            <div className="flex gap-2">
                              {canManageUsers && selectedUser.id !== user?.id && (
                                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs flex-1"
                                  onClick={()=>{ if(confirm(`Resetar senha de ${selectedUser.name}?`)) resetPwdMut.mutate({userId:selectedUser.id}); }}>
                                  <RefreshCw className="h-3 w-3" /> Resetar senha
                                </Button>
                              )}
                              {isMaster && selectedUser.id !== user?.id && (
                                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs flex-1 text-red-600 hover:text-red-700 hover:border-red-300"
                                  onClick={()=>{ if(confirm(`Excluir "${selectedUser.name}"?`)) deleteUserMut.mutate({userId:selectedUser.id}); }}>
                                  <Trash2 className="h-3 w-3" /> Excluir
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Colaborador Vinculado (Rev. 4481) */}
                      <div className="rounded-xl border p-4 space-y-2 border-violet-200 bg-violet-50/30">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <UserCheck className="h-3.5 w-3.5 text-violet-500" /> Colaborador Vinculado
                          </h3>
                          {linkedEmployeeQ.data ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-violet-600 hover:text-violet-800"
                                onClick={() => { setShowLinkSearch(v => !v); setLinkEmpSearch(""); }}>
                                <Link className="h-3 w-3 mr-1" /> Trocar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-red-500 hover:text-red-700"
                                disabled={linkEmpMut.isPending}
                                onClick={() => {
                                  if (!confirm("Desvincular este colaborador do usuário?")) return;
                                  linkEmpMut.mutate({ employeeId: linkedEmployeeQ.data!.id, companyId: linkedEmployeeQ.data!.companyId, userId: null });
                                }}>
                                <Unlink2 className="h-3 w-3 mr-1" /> Desvincular
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-violet-600 hover:text-violet-800"
                              onClick={() => { setShowLinkSearch(v => !v); setLinkEmpSearch(""); }}>
                              <Link className="h-3 w-3 mr-1" /> Vincular
                            </Button>
                          )}
                        </div>

                        {linkedEmployeeQ.data && !showLinkSearch && (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-white border border-violet-100">
                            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-violet-700">{(linkedEmployeeQ.data.nomeCompleto || "?").charAt(0)}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate">{linkedEmployeeQ.data.nomeCompleto}</p>
                              <p className="text-xs text-muted-foreground truncate">{linkedEmployeeQ.data.cargo || linkedEmployeeQ.data.funcao || "—"} · {linkedEmployeeQ.data.empresaNome}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                              linkedEmployeeQ.data.status === "Ativo" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>{linkedEmployeeQ.data.status}</span>
                          </div>
                        )}

                        {!linkedEmployeeQ.data && !showLinkSearch && (
                          <p className="text-[11px] text-muted-foreground italic">Nenhum colaborador vinculado. Clique em "Vincular" para associar.</p>
                        )}

                        {showLinkSearch && (
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                              <input
                                autoFocus
                                className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                                placeholder="Buscar colaborador pelo nome..."
                                value={linkEmpSearch}
                                onChange={e => setLinkEmpSearch(e.target.value)}
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {empLinkListQ.isLoading && <p className="text-xs text-muted-foreground text-center py-3">Carregando...</p>}
                              {!empLinkListQ.isLoading && editCos.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-3">Este usuário não tem empresas associadas.</p>
                              )}
                              {(empLinkListQ.data ?? [])
                                .filter((e: any) => !linkEmpSearch || e.nomeCompleto?.toLowerCase().includes(linkEmpSearch.toLowerCase()))
                                .filter((e: any) => e.status !== "Desligado" && e.status !== "Inativo" && e.status !== "Lista_Negra")
                                .slice(0, 30)
                                .map((e: any) => (
                                  <button key={e.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-border hover:border-violet-300 hover:bg-violet-50/50 text-left transition-colors"
                                    disabled={linkEmpMut.isPending}
                                    onClick={() => linkEmpMut.mutate({ employeeId: e.id, companyId: e.companyId, userId: selectedUser!.id })}
                                  >
                                    <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-xs font-bold text-violet-700">
                                      {(e.nomeCompleto || "?").charAt(0)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold truncate">{e.nomeCompleto}</p>
                                      <p className="text-[10px] text-muted-foreground truncate">{e.cargo || e.funcao || "—"}</p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground shrink-0">{e.tipoContrato}</span>
                                  </button>
                                ))}
                              {empLinkListQ.data && (empLinkListQ.data as any[]).filter((e: any) => !linkEmpSearch || e.nomeCompleto?.toLowerCase().includes(linkEmpSearch.toLowerCase())).filter((e: any) => e.status !== "Desligado" && e.status !== "Inativo" && e.status !== "Lista_Negra").length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-3">Nenhum colaborador encontrado.</p>
                              )}
                            </div>
                            <Button size="sm" variant="ghost" className="w-full h-7 text-xs text-muted-foreground" onClick={() => { setShowLinkSearch(false); setLinkEmpSearch(""); }}>
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Dados básicos */}
                      <div className="rounded-xl border p-4 space-y-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Dados do Usuário</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="text-xs text-muted-foreground">Nome</label><Input value={editName} onChange={e=>setEditName(e.target.value)} className="h-9 mt-1" /></div>
                          <div><label className="text-xs text-muted-foreground">E-mail</label><Input value={editEmail} onChange={e=>setEditEmail(e.target.value)} className="h-9 mt-1" type="email" /></div>
                          <div><label className="text-xs text-muted-foreground">Username</label><Input value={editUser} onChange={e=>setEditUser(e.target.value)} className="h-9 mt-1" /></div>
                          {isAdmin && selectedUser.id !== user?.id && (
                            <div><label className="text-xs text-muted-foreground">Perfil</label>
                              <Select value={editRole} onValueChange={setEditRole}>
                                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="user">Usuário</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="adm_cliente">Adm Cliente</SelectItem>
                                  {isMaster && <SelectItem value="admin_master">Admin Master</SelectItem>}
                                </SelectContent>
                              </Select></div>
                          )}
                        </div>
                        <div><label className="text-xs text-muted-foreground">Nova senha (deixe em branco para manter)</label>
                          <div className="relative max-w-xs">
                            <Input value={editPwd} onChange={e=>setEditPwd(e.target.value)} type={showPwd?"text":"password"} placeholder="Nova senha..." className="pr-9 h-9 mt-1" />
                            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={()=>setShowPwd(!showPwd)}>
                              {showPwd?<EyeOff className="h-3.5 w-3.5"/>:<Eye className="h-3.5 w-3.5"/>}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Empresas */}
                      {editRole !== "admin_master" && allCompaniesQuery.data && allCompaniesQuery.data.length > 0 && (
                        <div className="rounded-xl border p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Empresas com Acesso</h3>
                            <div className="flex gap-2">
                              <button className="text-xs text-blue-600 hover:underline" onClick={()=>setEditCos(allCompaniesQuery.data!.map((c:any)=>c.id))}>Todas</button>
                              <span className="text-muted-foreground text-xs">·</span>
                              <button className="text-xs text-muted-foreground hover:underline" onClick={()=>setEditCos([])}>Limpar</button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                            {allCompaniesQuery.data.map((c:any) => (
                              <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${editCos.includes(c.id)?"bg-blue-50 border-blue-300":"bg-secondary/10 border-border hover:bg-secondary/30"}`}>
                                <input type="checkbox" className="rounded" checked={editCos.includes(c.id)}
                                  onChange={e=>setEditCos(e.target.checked?[...editCos,c.id]:editCos.filter(id=>id!==c.id))} />
                                <span className="truncate">{c.nomeFantasia||c.razaoSocial}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Obras com Acesso */}
                      {editRole !== "admin_master" && editRole !== "admin" && obrasAtivas.length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                              <HardHat className="h-3.5 w-3.5" /> Obras com Acesso
                              <span className="text-[10px] font-normal text-amber-500 ml-1">({editObras.length} de {obrasAtivas.length})</span>
                            </h3>
                            <div className="flex gap-2">
                              <button className="text-xs text-amber-600 hover:underline" onClick={()=>setEditObras(obrasAtivas.map((o:any) => o.id ?? o.obraIds?.[0]))}>Todas</button>
                              <span className="text-amber-300 text-xs">·</span>
                              <button className="text-xs text-muted-foreground hover:underline" onClick={()=>setEditObras([])}>Limpar</button>
                            </div>
                          </div>
                          {editObras.length === 0 && (
                            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-100/50 border border-amber-200 text-xs text-amber-700">
                              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span>Sem obras selecionadas — acesso será determinado pela alocação do funcionário (obra_funcionarios).</span>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                            {obrasAtivas.map((o: any) => {
                              const oid = o.id ?? o.obraIds?.[0];
                              const checked = editObras.includes(oid);
                              return (
                                <label key={oid} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition-all ${checked ? "bg-amber-50 border-amber-400 shadow-sm" : "bg-white border-border hover:bg-slate-50"}`}>
                                  <input type="checkbox" className="rounded accent-amber-500" checked={checked}
                                    onChange={e => setEditObras(e.target.checked ? [...editObras, oid] : editObras.filter(id => id !== oid))} />
                                  <HardHat className={`h-3 w-3 shrink-0 ${checked ? "text-amber-600" : "text-slate-300"}`} />
                                  <span className={`truncate ${checked ? "font-medium text-amber-800" : "text-slate-600"}`}>{o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Grupo de Acesso */}
                      <div className="rounded-xl border p-4 space-y-3">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5" /> Grupo de Acesso
                            <span className="text-[10px] font-normal text-slate-400 ml-1">(apenas 1 por usuário)</span>
                          </h3>
                          {allGroups.length === 0 ? (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span>Crie grupos em Grupos de Acesso e atribua aqui.</span>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {/* Opção "Sem grupo" */}
                              <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${editGroupIds.length === 0 ? "bg-slate-50 border-slate-300 ring-1 ring-slate-200" : "bg-secondary/5 border-border hover:bg-secondary/20"} ${setGroupsMut.isPending ? "opacity-60 pointer-events-none" : ""}`}>
                                <input type="radio" name="editGroup" checked={editGroupIds.length === 0}
                                  onChange={() => handleQuickSetGroup([])} />
                                <ShieldAlert className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                                <span className="text-sm text-slate-500">Nenhum grupo</span>
                              </label>
                              {(allGroups as any[]).map(g => (
                                <label key={g.id} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${editGroupIds.includes(g.id)?"bg-blue-50 border-blue-400 ring-1 ring-blue-200":"bg-secondary/5 border-border hover:bg-secondary/20"} ${setGroupsMut.isPending ? "opacity-60 pointer-events-none" : ""}`}>
                                  <input type="radio" name="editGroup" checked={editGroupIds.includes(g.id)}
                                    onChange={() => handleQuickSetGroup([g.id])} />
                                  <div className="h-3 w-3 rounded-full shrink-0" style={{background:g.cor||"#6b7280"}} />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium">{g.nome}</span>
                                    {g.descricao && <span className="text-xs text-muted-foreground ml-2">{g.descricao}</span>}
                                  </div>
                                  {editGroupIds.includes(g.id) && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                      <div className="flex gap-3 pt-2 border-t">
                        <Button onClick={handleSaveUser} disabled={updateUserMut.isPending||setGroupsMut.isPending} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                          <Save className="h-4 w-4" />{(updateUserMut.isPending||setGroupsMut.isPending)?"Salvando...":"Salvar Alterações"}
                        </Button>
                        <Button variant="outline" onClick={()=>setUPanel("list")} className="lg:hidden">Voltar</Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Placeholder */}
                {uPanel === "list" && (
                  <div className="flex-1 hidden lg:flex items-center justify-center text-center p-8">
                    <div>
                      <Users className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Selecione um usuário</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════
              TAB: GRUPOS DE ACESSO
          ═══════════════════════════════════════════ */}
          {activeTab === "grupos" && (
            <>
              {/* Sidebar grupos */}
              <div className={`${gPanel !== "list" ? "hidden lg:flex" : "flex"} w-72 shrink-0 flex-col border-r bg-background`}>
                <div className="p-3 border-b space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-blue-600" /> Grupos</span>
                    {isAdmin && (
                      <Button size="sm" className="h-7 gap-1 bg-green-600 hover:bg-green-700 text-xs"
                        onClick={() => { setSelectedGroup(null); setGName(""); setGDesc(""); setGColor("#6b7280"); setGModuleAccess({}); setGPanel("new"); }}>
                        <Plus className="h-3 w-3" /> Novo
                      </Button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Buscar grupo..." value={gSearch} onChange={e=>setGSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                    {gSearch && <button onClick={()=>setGSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground" /></button>}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredGroups.length === 0 && (
                    <div className="p-6 text-center">
                      <ShieldCheck className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Nenhum grupo criado ainda</p>
                      {isAdmin && <button onClick={()=>setGPanel("new")} className="mt-2 text-xs text-blue-600 hover:underline">Criar primeiro grupo</button>}
                    </div>
                  )}
                  {filteredGroups.map((g: any) => {
                    const memberCount = g.memberCount ?? 0;
                    const modCount = Object.keys(g.moduleAccess||{}).length;
                    const isSel = selectedGroup?.id === g.id && gPanel === "detail";
                    return (
                      <button key={g.id} onClick={() => openGroup(g)}
                        className={`w-full text-left px-3 py-2.5 border-b transition-colors flex items-center gap-2.5 hover:bg-muted/50 ${isSel ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
                        <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{background:(g.cor||"#6b7280")+"22"}}>
                          <ShieldCheck className="h-4 w-4" style={{color:g.cor||"#6b7280"}} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{g.nome}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> {memberCount} membro{memberCount!==1?"s":""}</span>
                            {modCount > 0 && <span className="flex items-center gap-0.5"><Layers className="h-2.5 w-2.5" /> {modCount} módulo{modCount!==1?"s":""}</span>}
                          </div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Painel direito grupos */}
              <div className={`${gPanel === "list" ? "hidden lg:flex" : "flex"} flex-1 flex-col overflow-hidden`}>

                {/* NOVO GRUPO */}
                {gPanel === "new" && (
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-lg mx-auto space-y-5">
                      <div className="flex items-center gap-3">
                        <button className="lg:hidden" onClick={()=>setGPanel("list")}><ArrowLeft className="h-4 w-4"/></button>
                        <h2 className="text-lg font-bold flex items-center gap-2"><Plus className="h-5 w-5 text-green-600"/>Novo Grupo de Acesso</h2>
                      </div>
                      <div className="rounded-xl border p-4 space-y-3">
                        <div><label className="text-xs text-muted-foreground">Nome do grupo *</label>
                          <Input value={gName} onChange={e=>setGName(e.target.value)} placeholder="Ex: Operação de Campo, Diretoria, RH..." className="h-9 mt-1" /></div>
                        <div><label className="text-xs text-muted-foreground">Descrição</label>
                          <Input value={gDesc} onChange={e=>setGDesc(e.target.value)} placeholder="Descreva o perfil deste grupo..." className="h-9 mt-1" /></div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1.5">Cor de identificação</label>
                          <div className="flex gap-2 flex-wrap">
                            {GROUP_COLORS.map(c => (
                              <button key={c} onClick={()=>setGColor(c)}
                                className={`h-7 w-7 rounded-full border-2 transition-all ${gColor===c?"border-foreground scale-110":"border-transparent"}`}
                                style={{background:c}} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Button onClick={handleCreateGroup} disabled={createGroupMut.isPending} className="gap-1.5 bg-green-600 hover:bg-green-700">
                          <Plus className="h-4 w-4"/>{createGroupMut.isPending?"Criando...":"Criar Grupo"}
                        </Button>
                        <Button variant="outline" onClick={()=>setGPanel("list")}>Cancelar</Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* DETALHE DO GRUPO */}
                {gPanel === "detail" && selectedGroup && (
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-2xl mx-auto space-y-5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <button className="lg:hidden" onClick={()=>setGPanel("list")}><ArrowLeft className="h-4 w-4"/></button>
                          <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{background:(gColor||"#6b7280")+"22"}}>
                            <ShieldCheck className="h-6 w-6" style={{color:gColor||"#6b7280"}} />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold">{selectedGroup.nome}</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{groupMemberIds.length} membro{groupMemberIds.length!==1?"s":""}</span>
                              {selectedGroup.descricao && <span className="text-xs text-muted-foreground">— {selectedGroup.descricao}</span>}
                            </div>
                          </div>
                        </div>
                        {isMaster && (
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700 hover:border-red-300"
                            onClick={()=>{if(confirm(`Excluir o grupo "${selectedGroup.nome}"?`)) deleteGroupMut.mutate({id:selectedGroup.id});}}>
                            <Trash2 className="h-3 w-3"/>Excluir
                          </Button>
                        )}
                      </div>

                      {/* Info do grupo */}
                      <div className="rounded-xl border p-4 space-y-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Edit2 className="h-3.5 w-3.5"/>Identificação</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="text-xs text-muted-foreground">Nome</label><Input value={gName} onChange={e=>setGName(e.target.value)} className="h-9 mt-1"/></div>
                          <div><label className="text-xs text-muted-foreground">Descrição</label><Input value={gDesc} onChange={e=>setGDesc(e.target.value)} className="h-9 mt-1"/></div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1.5">Cor</label>
                          <div className="flex gap-2 flex-wrap">
                            {GROUP_COLORS.map(c => (
                              <button key={c} onClick={()=>setGColor(c)}
                                className={`h-6 w-6 rounded-full border-2 transition-all ${gColor===c?"border-foreground scale-110":"border-transparent"}`}
                                style={{background:c}} />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Membros */}
                      <div className="rounded-xl border p-4 space-y-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5"/>Membros do Grupo</h3>
                        {groupMemberIds.length === 0 && <p className="text-xs text-muted-foreground">Nenhum membro ainda. Adicione usuários aqui ou na aba Usuários.</p>}
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {groupMemberIds.map(uid => {
                            const u = allUsers.find((x:any)=>x.id===uid);
                            if (!u) return null;
                            return (
                              <div key={uid} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/10 border">
                                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${(u as any).role==="admin"?"bg-blue-600":"bg-gray-400"}`}>
                                  {((u as any).name||(u as any).username||"?").charAt(0).toUpperCase()}
                                </div>
                                <span className="flex-1 text-sm">{(u as any).name||(u as any).username}</span>
                                <button onClick={()=>removeMemberMut.mutate({groupId:selectedGroup.id,userId:uid})} className="text-muted-foreground hover:text-red-600 transition-colors"><X className="h-3.5 w-3.5"/></button>
                              </div>
                            );
                          })}
                        </div>
                        {/* Adicionar membro */}
                        <div className="flex gap-2">
                          <Select value={addMemberUserId} onValueChange={setAddMemberUserId}>
                            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Adicionar usuário..." /></SelectTrigger>
                            <SelectContent>
                              {(() => {
                                // Excluir apenas quem já é membro DESTE grupo.
                                // Usuários que já estão em outro grupo aparecem com aviso —
                                // ao adicionar, o backend move automaticamente (1 grupo por usuário).
                                const memberSet = new Set(groupMemberIds);
                                const candidatos = allUsers.filter((u: any) => !memberSet.has(u.id));
                                if (candidatos.length === 0) {
                                  return (
                                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                      Todos os usuários já são membros deste grupo.
                                    </div>
                                  );
                                }
                                // Ordena: livres primeiro, depois os que estão em outro grupo
                                const ordenados = [...candidatos].sort((a: any, b: any) => {
                                  const aGid = userGroupIdMap[a.id] ? 1 : 0;
                                  const bGid = userGroupIdMap[b.id] ? 1 : 0;
                                  if (aGid !== bGid) return aGid - bGid;
                                  return (a.name || a.username || "").localeCompare(b.name || b.username || "");
                                });
                                return ordenados.map((u: any) => {
                                  const grupoAtualId = userGroupIdMap[u.id];
                                  const grupoAtualNome = grupoAtualId
                                    ? (allGroups as any[]).find((g) => g.id === grupoAtualId)?.nome
                                    : null;
                                  return (
                                    <SelectItem key={u.id} value={String(u.id)}>
                                      <span className="flex items-center gap-2">
                                        <span>{u.name || u.username}</span>
                                        {grupoAtualNome && (
                                          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                            está em {grupoAtualNome} — será movido
                                          </span>
                                        )}
                                      </span>
                                    </SelectItem>
                                  );
                                });
                              })()}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-8 gap-1 text-xs" variant="outline"
                            onClick={()=>{
                              if(!addMemberUserId) return;
                              addMemberMut.mutate({groupId:selectedGroup.id, userId:Number(addMemberUserId)});
                              setAddMemberUserId("");
                            }}>
                            <UserPlus className="h-3 w-3"/>Add
                          </Button>
                        </div>
                      </div>

                      {/* Módulos e permissões */}
                      <div className="rounded-xl border p-4 space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1"><Lock className="h-3.5 w-3.5"/>Permissões de Acesso</h3>
                        <p className="text-xs text-muted-foreground mb-3">Configure quais módulos e telas os membros deste grupo podem acessar.</p>
                        <ModulePermsEditor moduleAccess={gModuleAccess} onChange={setGModuleAccess} />
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                        <Button onClick={handleSaveGroup} disabled={updateGroupMut.isPending||setGroupModAccessMut.isPending}
                          className={`gap-1.5 ${gDirty ? "bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-300 animate-pulse" : "bg-blue-600 hover:bg-blue-700"}`}>
                          <Save className="h-4 w-4"/>{(updateGroupMut.isPending||setGroupModAccessMut.isPending)?"Salvando...":(gDirty?"Salvar alterações":"Salvar Grupo")}
                        </Button>
                        {gDirty && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"/>
                            Alterações não salvas — clique em "Salvar alterações" para aplicar.
                          </span>
                        )}
                        <Button variant="outline" onClick={()=>setGPanel("list")} className="lg:hidden">Voltar</Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Placeholder */}
                {gPanel === "list" && (
                  <div className="flex-1 hidden lg:flex items-center justify-center text-center p-8">
                    <div>
                      <ShieldCheck className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3"/>
                      <p className="text-sm font-medium text-muted-foreground">Selecione um grupo para configurar</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">Grupos definem os acessos — configure módulos e telas, depois atribua usuários.</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
