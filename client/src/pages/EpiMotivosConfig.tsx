import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, EyeOff, Eye, Check, X, ListChecks, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function EpiMotivosConfig() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'admin_master'].includes(user?.role ?? '');

  const motivosQ = trpc.epis.listMotivos.useQuery();
  const createMut = trpc.epis.createMotivo.useMutation({
    onSuccess: () => { motivosQ.refetch(); setNewNome(""); setShowAdd(false); toast.success("Motivo criado!"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.epis.updateMotivo.useMutation({
    onSuccess: () => { motivosQ.refetch(); setEditing(null); toast.success("Motivo atualizado!"); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [editing, setEditing] = useState<{ id: number; nome: string } | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<{ id: number; nome: string; ativo: number } | null>(null);

  const motivos = motivosQ.data ?? [];
  const ativos = motivos.filter(m => m.ativo === 1);
  const inativos = motivos.filter(m => m.ativo === 0);

  return (
    <>
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[#1B2A4A]" />
              Catálogo de Motivos de Entrega
            </CardTitle>
            {isAdmin ? (
              <Button size="sm" variant="outline" onClick={() => { setShowAdd(true); setEditing(null); }} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Novo Motivo
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> Somente leitura
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Apenas administradores podem incluir ou remover motivos. Usuários comuns veem somente a lista abaixo.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {showAdd && isAdmin && (
            <div className="flex gap-2 items-center p-2 bg-muted rounded border">
              <Input
                autoFocus
                value={newNome}
                onChange={e => setNewNome(e.target.value)}
                placeholder="Nome do motivo..."
                className="h-7 text-xs"
                onKeyDown={e => { if (e.key === 'Enter' && newNome.trim()) createMut.mutate({ nome: newNome }); if (e.key === 'Escape') { setShowAdd(false); setNewNome(""); } }}
              />
              <Button size="icon" className="h-7 w-7 shrink-0" onClick={() => createMut.mutate({ nome: newNome })} disabled={!newNome.trim() || createMut.isPending}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setShowAdd(false); setNewNome(""); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {ativos.map((m, idx) => (
            <div key={m.id} className="flex items-center justify-between p-2 border rounded text-sm bg-white">
              {editing?.id === m.id ? (
                <div className="flex gap-2 items-center flex-1">
                  <Input
                    autoFocus
                    value={editing.nome}
                    onChange={e => setEditing(v => v ? { ...v, nome: e.target.value } : v)}
                    className="h-7 text-xs flex-1"
                    onKeyDown={e => { if (e.key === 'Enter' && editing.nome.trim()) updateMut.mutate({ id: m.id, nome: editing.nome }); if (e.key === 'Escape') setEditing(null); }}
                  />
                  <Button size="icon" className="h-7 w-7 shrink-0" onClick={() => updateMut.mutate({ id: m.id, nome: editing.nome })} disabled={!editing.nome.trim() || updateMut.isPending}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditing(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
                    <span>{m.nome}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" title="Renomear" onClick={() => { setEditing({ id: m.id, nome: m.nome }); setShowAdd(false); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" title="Desativar (remove do formulário)" onClick={() => setConfirmToggle(m)}>
                        <EyeOff className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {ativos.length === 0 && !motivosQ.isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum motivo ativo. Adicione um acima.</p>
          )}

          {inativos.length > 0 && isAdmin && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><EyeOff className="h-3 w-3" /> Desativados (não aparecem no formulário)</p>
              {inativos.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded text-sm text-muted-foreground bg-muted/50 mb-1">
                  <span className="line-through text-xs">{m.nome}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Reativar" onClick={() => updateMut.mutate({ id: m.id, ativo: 1 })}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmToggle} onOpenChange={o => !o && setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar motivo</AlertDialogTitle>
            <AlertDialogDescription>
              O motivo <strong>"{confirmToggle?.nome}"</strong> vai deixar de aparecer no formulário de entrega. Entregas já registradas com esse motivo não são afetadas. Você pode reativar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmToggle) { updateMut.mutate({ id: confirmToggle.id, ativo: 0 }); setConfirmToggle(null); } }}>
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
