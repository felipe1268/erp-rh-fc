import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wrench, Plus, Search, Truck, FlameKindling, Droplets, Trash2, AlertTriangle } from "lucide-react";

export default function Ativos() {
  const [companyId] = useState(() => {
    const saved = localStorage.getItem("selectedCompanyId");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [activeTab, setActiveTab] = useState("frota");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Ativos</h1>
          <p className="text-muted-foreground mt-1">Controle de frota, equipamentos, extintores e hidrantes</p>
        </div>

        {companyId === 0 ? (
          <Card className="p-8 text-center">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Selecione uma empresa no Dashboard para acessar o módulo.</p>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 w-full max-w-lg">
              <TabsTrigger value="frota">Frota</TabsTrigger>
              <TabsTrigger value="equipamentos">Equipamentos</TabsTrigger>
              <TabsTrigger value="extintores">Extintores</TabsTrigger>
              <TabsTrigger value="hidrantes">Hidrantes</TabsTrigger>
            </TabsList>
            <TabsContent value="frota"><FrotaTab companyId={companyId} /></TabsContent>
            <TabsContent value="equipamentos"><EquipamentosTab companyId={companyId} /></TabsContent>
            <TabsContent value="extintores"><ExtintoresTab companyId={companyId} /></TabsContent>
            <TabsContent value="hidrantes"><HidrantesTab companyId={companyId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

function FrotaTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: vehicles = [], isLoading } = trpc.assets.vehicles.list.useQuery({ companyId });
  const createMut = trpc.assets.vehicles.create.useMutation({ onSuccess: () => { utils.assets.vehicles.list.invalidate(); setShowForm(false); toast.success("Veículo cadastrado!"); } });
  const deleteMut = trpc.assets.vehicles.delete.useMutation({ onSuccess: () => { utils.assets.vehicles.list.invalidate(); toast.success("Veículo excluído!"); } });
  const [form, setForm] = useState<any>({ placa: "", modelo: "", marca: "", anoFabricacao: "", tipo: "Carro", renavam: "", chassi: "", proximaManutencao: "", status: "Ativo" });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Truck className="h-5 w-5" /> Frota de Veículos</h3>
        <Button onClick={() => { setForm({ placa: "", modelo: "", marca: "", anoFabricacao: "", tipo: "Carro", renavam: "", chassi: "", proximaManutencao: "", status: "Ativo" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Veículo
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Placa</th>
              <th className="text-left p-3 font-medium">Modelo</th>
              <th className="text-left p-3 font-medium">Marca</th>
              <th className="text-left p-3 font-medium">Tipo</th>
              <th className="text-left p-3 font-medium">Ano</th>
              <th className="text-left p-3 font-medium">Próx. Manutenção</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : vehicles.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum veículo cadastrado</td></tr>
              : vehicles.map((v: any) => (
                <tr key={v.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{v.placa}</td>
                  <td className="p-3">{v.modelo}</td>
                  <td className="p-3">{v.marca ?? "-"}</td>
                  <td className="p-3">{v.tipo}</td>
                  <td className="p-3">{v.anoFabricacao ?? "-"}</td>
                  <td className="p-3">{v.proximaManutencao ? new Date(v.proximaManutencao).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${v.status === "Ativo" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{v.status}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: v.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Veículo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Placa</Label><Input value={form.placa} onChange={e => setForm({ ...form, placa: e.target.value })} /></div>
            <div><Label>Modelo</Label><Input value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} /></div>
            <div><Label>Marca</Label><Input value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} /></div>
            <div><Label>Ano Fabricação</Label><Input value={form.anoFabricacao} onChange={e => setForm({ ...form, anoFabricacao: e.target.value })} placeholder="Ex: 2024" /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Carro">Carro</SelectItem>
                  <SelectItem value="Caminhao">Caminhão</SelectItem>
                  <SelectItem value="Van">Van</SelectItem>
                  <SelectItem value="Moto">Moto</SelectItem>
                  <SelectItem value="Maquina_Pesada">Máquina Pesada</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Renavam</Label><Input value={form.renavam} onChange={e => setForm({ ...form, renavam: e.target.value })} /></div>
            <div><Label>Chassi</Label><Input value={form.chassi} onChange={e => setForm({ ...form, chassi: e.target.value })} /></div>
            <div><Label>Próx. Manutenção</Label><Input type="date" value={form.proximaManutencao} onChange={e => setForm({ ...form, proximaManutencao: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Ativo">Ativo</SelectItem><SelectItem value="Inativo">Inativo</SelectItem><SelectItem value="Manutencao">Manutenção</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipamentosTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: equipments = [], isLoading } = trpc.assets.equipment.list.useQuery({ companyId });
  const createMut = trpc.assets.equipment.create.useMutation({ onSuccess: () => { utils.assets.equipment.list.invalidate(); setShowForm(false); toast.success("Equipamento cadastrado!"); } });
  const deleteMut = trpc.assets.equipment.delete.useMutation({ onSuccess: () => { utils.assets.equipment.list.invalidate(); toast.success("Equipamento excluído!"); } });
  const [form, setForm] = useState<any>({ nome: "", patrimonio: "", tipo: "", marca: "", modelo: "", numeroSerie: "", localizacao: "", dataAquisicao: "", proximaManutencao: "", status: "Ativo" });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Wrench className="h-5 w-5" /> Equipamentos</h3>
        <Button onClick={() => { setForm({ nome: "", patrimonio: "", tipo: "", marca: "", modelo: "", numeroSerie: "", localizacao: "", dataAquisicao: "", proximaManutencao: "", status: "Ativo" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Equipamento
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Nome</th>
              <th className="text-left p-3 font-medium">Patrimônio</th>
              <th className="text-left p-3 font-medium">Tipo</th>
              <th className="text-left p-3 font-medium">Marca</th>
              <th className="text-left p-3 font-medium">Próx. Manutenção</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : equipments.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum equipamento cadastrado</td></tr>
              : equipments.map((eq: any) => (
                <tr key={eq.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{eq.nome}</td>
                  <td className="p-3">{eq.patrimonio ?? "-"}</td>
                  <td className="p-3">{eq.tipo ?? "-"}</td>
                  <td className="p-3">{eq.marca ?? "-"}</td>
                  <td className="p-3">{eq.proximaManutencao ? new Date(eq.proximaManutencao).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${eq.status === "Ativo" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{eq.status}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: eq.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Equipamento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Patrimônio</Label><Input value={form.patrimonio} onChange={e => setForm({ ...form, patrimonio: e.target.value })} /></div>
            <div><Label>Tipo</Label><Input value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} /></div>
            <div><Label>Marca</Label><Input value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} /></div>
            <div><Label>Modelo</Label><Input value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} /></div>
            <div><Label>Nº Série</Label><Input value={form.numeroSerie} onChange={e => setForm({ ...form, numeroSerie: e.target.value })} /></div>
            <div><Label>Localização</Label><Input value={form.localizacao} onChange={e => setForm({ ...form, localizacao: e.target.value })} /></div>
            <div><Label>Data Aquisição</Label><Input type="date" value={form.dataAquisicao} onChange={e => setForm({ ...form, dataAquisicao: e.target.value })} /></div>
            <div><Label>Próx. Manutenção</Label><Input type="date" value={form.proximaManutencao} onChange={e => setForm({ ...form, proximaManutencao: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Ativo">Ativo</SelectItem><SelectItem value="Inativo">Inativo</SelectItem><SelectItem value="Manutencao">Manutenção</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExtintoresTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: extinguishers = [], isLoading } = trpc.assets.extinguishers.list.useQuery({ companyId });
  const createMut = trpc.assets.extinguishers.create.useMutation({ onSuccess: () => { utils.assets.extinguishers.list.invalidate(); setShowForm(false); toast.success("Extintor cadastrado!"); } });
  const deleteMut = trpc.assets.extinguishers.delete.useMutation({ onSuccess: () => { utils.assets.extinguishers.list.invalidate(); toast.success("Extintor excluído!"); } });
  const [form, setForm] = useState<any>({ numero: "", tipo: "PQS", capacidade: "", localizacao: "", dataRecarga: "", validadeRecarga: "", dataTesteHidrostatico: "", validadeTesteHidrostatico: "", status: "OK" });
  const isExpired = (d: string) => d && new Date(d) < new Date();

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><FlameKindling className="h-5 w-5" /> Extintores</h3>
        <Button onClick={() => { setForm({ numero: "", tipo: "PQS", capacidade: "", localizacao: "", dataRecarga: "", validadeRecarga: "", dataTesteHidrostatico: "", validadeTesteHidrostatico: "", status: "OK" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Extintor
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Código</th>
              <th className="text-left p-3 font-medium">Tipo</th>
              <th className="text-left p-3 font-medium">Capacidade</th>
              <th className="text-left p-3 font-medium">Localização</th>
              <th className="text-left p-3 font-medium">Próx. Recarga</th>
              <th className="text-left p-3 font-medium">Teste Hidrost.</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : extinguishers.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum extintor cadastrado</td></tr>
              : extinguishers.map((ext: any) => (
                <tr key={ext.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{ext.numero}</td>
                  <td className="p-3">{ext.tipo}</td>
                  <td className="p-3">{ext.capacidade ?? "-"}</td>
                  <td className="p-3">{ext.localizacao ?? "-"}</td>
                  <td className="p-3"><span className={isExpired(ext.validadeRecarga) ? "text-red-600 font-semibold" : ""}>{ext.validadeRecarga ? new Date(ext.validadeRecarga).toLocaleDateString("pt-BR") : "-"}</span>{isExpired(ext.validadeRecarga) && <AlertTriangle className="inline h-3 w-3 ml-1 text-red-600" />}</td>
                  <td className="p-3"><span className={isExpired(ext.validadeTesteHidrostatico) ? "text-red-600 font-semibold" : ""}>{ext.validadeTesteHidrostatico ? new Date(ext.validadeTesteHidrostatico).toLocaleDateString("pt-BR") : "-"}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: ext.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Extintor</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Número</Label><Input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="Ex: EXT-001" /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="PQS">PQS</SelectItem><SelectItem value="CO2">CO2</SelectItem><SelectItem value="AP">Água Pressurizada</SelectItem><SelectItem value="Espuma">Espuma</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Capacidade</Label><Input value={form.capacidade} onChange={e => setForm({ ...form, capacidade: e.target.value })} placeholder="Ex: 6kg" /></div>
            <div><Label>Localização</Label><Input value={form.localizacao} onChange={e => setForm({ ...form, localizacao: e.target.value })} /></div>
            <div><Label>Data Recarga</Label><Input type="date" value={form.dataRecarga} onChange={e => setForm({ ...form, dataRecarga: e.target.value })} /></div>
            <div><Label>Validade Recarga</Label><Input type="date" value={form.validadeRecarga} onChange={e => setForm({ ...form, validadeRecarga: e.target.value })} /></div>
            <div><Label>Teste Hidrostático</Label><Input type="date" value={form.dataTesteHidrostatico} onChange={e => setForm({ ...form, dataTesteHidrostatico: e.target.value })} /></div>
            <div><Label>Validade Teste</Label><Input type="date" value={form.validadeTesteHidrostatico} onChange={e => setForm({ ...form, validadeTesteHidrostatico: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="OK">OK</SelectItem><SelectItem value="Vencido">Vencido</SelectItem><SelectItem value="Manutencao">Manutenção</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HidrantesTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: hydrants = [], isLoading } = trpc.assets.hydrants.list.useQuery({ companyId });
  const createMut = trpc.assets.hydrants.create.useMutation({ onSuccess: () => { utils.assets.hydrants.list.invalidate(); setShowForm(false); toast.success("Hidrante cadastrado!"); } });
  const deleteMut = trpc.assets.hydrants.delete.useMutation({ onSuccess: () => { utils.assets.hydrants.list.invalidate(); toast.success("Hidrante excluído!"); } });
  const [form, setForm] = useState<any>({ numero: "", localizacao: "", tipo: "Coluna", ultimaInspecao: "", proximaInspecao: "", status: "OK" });
  const isExpired = (d: string) => d && new Date(d) < new Date();

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Droplets className="h-5 w-5" /> Hidrantes</h3>
        <Button onClick={() => { setForm({ numero: "", localizacao: "", tipo: "Coluna", ultimaInspecao: "", proximaInspecao: "", status: "OK" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Hidrante
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Código</th>
              <th className="text-left p-3 font-medium">Localização</th>
              <th className="text-left p-3 font-medium">Tipo</th>
              <th className="text-left p-3 font-medium">Última Inspeção</th>
              <th className="text-left p-3 font-medium">Próx. Inspeção</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : hydrants.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum hidrante cadastrado</td></tr>
              : hydrants.map((h: any) => (
                <tr key={h.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{h.numero}</td>
                  <td className="p-3">{h.localizacao ?? "-"}</td>
                  <td className="p-3">{h.tipo}</td>
                  <td className="p-3">{h.ultimaInspecao ? new Date(h.ultimaInspecao).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3"><span className={isExpired(h.proximaInspecao) ? "text-red-600 font-semibold" : ""}>{h.proximaInspecao ? new Date(h.proximaInspecao).toLocaleDateString("pt-BR") : "-"}</span>{isExpired(h.proximaInspecao) && <AlertTriangle className="inline h-3 w-3 ml-1 text-red-600" />}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${h.status === "OK" ? "bg-green-100 text-green-700" : h.status === "Manutencao" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{h.status === "OK" ? "OK" : h.status === "Manutencao" ? "Manutenção" : "Inativo"}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: h.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo Hidrante</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Número</Label><Input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="Ex: HID-001" /></div>
            <div><Label>Localização</Label><Input value={form.localizacao} onChange={e => setForm({ ...form, localizacao: e.target.value })} /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Coluna">Coluna</SelectItem><SelectItem value="Parede">Parede</SelectItem><SelectItem value="Subterraneo">Subterrâneo</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="OK">OK</SelectItem><SelectItem value="Manutencao">Manutenção</SelectItem><SelectItem value="Inativo">Inativo</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Última Inspeção</Label><Input type="date" value={form.ultimaInspecao} onChange={e => setForm({ ...form, ultimaInspecao: e.target.value })} /></div>
            <div><Label>Próx. Inspeção</Label><Input type="date" value={form.proximaInspecao} onChange={e => setForm({ ...form, proximaInspecao: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
