import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface FornecedorForm {
  nome: string;
  cnpj: string;
  contato: string;
  telefone: string;
  email: string;
  endereco: string;
  observacoes: string;
}

interface CnpjResult {
  success?: boolean;
  razaoSocial?: string;
  nomeFantasia?: string;
  error?: string;
}

interface FornecedorDialogProps {
  fornecedorForm: FornecedorForm;
  setFornecedorForm: React.Dispatch<React.SetStateAction<FornecedorForm>>;
  cnpjLoading: boolean;
  setCnpjLoading: React.Dispatch<React.SetStateAction<boolean>>;
  cnpjResult: CnpjResult | null;
  setCnpjResult: React.Dispatch<React.SetStateAction<CnpjResult | null>>;
  editingFornecedor: any;
  onClose: () => void;
  onSave: (cleanCnpj: string) => void;
  isPending: boolean;
}

export default function FornecedorDialog({
  fornecedorForm, setFornecedorForm,
  cnpjLoading, setCnpjLoading,
  cnpjResult, setCnpjResult,
  editingFornecedor,
  onClose, onSave, isPending,
}: FornecedorDialogProps) {

  const buscarCnpj = (cnpjDigits: string) => {
    if (cnpjDigits.length !== 14) return;
    setCnpjLoading(true);
    setCnpjResult(null);
    fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`)
      .then(r => r.ok ? r.json() : Promise.reject('not found'))
      .then(data => {
        const nome = data.nome_fantasia || data.razao_social || "";
        const tel = data.ddd_telefone_1 ? `(${data.ddd_telefone_1.substring(0, 2)}) ${data.ddd_telefone_1.substring(2)}` : "";
        const end = [data.logradouro, data.numero, data.complemento, data.bairro, data.municipio, data.uf].filter(Boolean).join(", ");
        setFornecedorForm(f => ({
          ...f,
          nome: f.nome || nome,
          contato: f.contato || data.razao_social || "",
          telefone: f.telefone || tel,
          email: f.email || (data.email || ""),
          endereco: f.endereco || end,
        }));
        setCnpjResult({ success: true, razaoSocial: data.razao_social, nomeFantasia: data.nome_fantasia });
        toast.success(`Dados de "${nome}" preenchidos automaticamente!`);
      })
      .catch(() => setCnpjResult({ error: "CNPJ não encontrado" }))
      .finally(() => setCnpjLoading(false));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="text-lg font-bold text-[#1B3A5C]">
          {editingFornecedor ? "Editar Fornecedor" : "Cadastrar Novo Fornecedor"}
        </h3>
        <div className="space-y-3">
          {/* CNPJ com autocompletar */}
          <div>
            <Label className="text-xs font-semibold">CNPJ</Label>
            <div className="flex gap-1">
              <Input value={fornecedorForm.cnpj} onChange={e => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 14);
                const formatted = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
                setFornecedorForm(f => ({ ...f, cnpj: formatted }));
                if (v.length === 14) {
                  buscarCnpj(v);
                }
              }} placeholder="00.000.000/0000-00" className="flex-1" />
              <Button type="button" size="sm" variant="outline"
                disabled={cnpjLoading || fornecedorForm.cnpj.replace(/\D/g, "").length !== 14}
                onClick={() => buscarCnpj(fornecedorForm.cnpj.replace(/\D/g, ""))}>
                {cnpjLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {cnpjResult?.success && <p className="text-xs text-green-700 mt-1">✓ {cnpjResult.razaoSocial} {cnpjResult.nomeFantasia ? `(${cnpjResult.nomeFantasia})` : ''}</p>}
            {cnpjResult?.error && <p className="text-xs text-red-600 mt-1">✗ {cnpjResult.error}</p>}
          </div>
          <div>
            <Label>Nome do Fornecedor *</Label>
            <Input value={fornecedorForm.nome} onChange={e => setFornecedorForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Razão social ou nome fantasia" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contato</Label>
              <Input value={fornecedorForm.contato} onChange={e => setFornecedorForm(f => ({ ...f, contato: e.target.value }))}
                placeholder="Nome do contato" />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={fornecedorForm.telefone} onChange={e => setFornecedorForm(f => ({ ...f, telefone: e.target.value }))}
                placeholder="(00) 0000-0000" />
            </div>
          </div>
          <div>
            <Label className="text-xs">E-mail</Label>
            <Input value={fornecedorForm.email} onChange={e => setFornecedorForm(f => ({ ...f, email: e.target.value }))}
              placeholder="contato@fornecedor.com" />
          </div>
          <div>
            <Label className="text-xs">Endereço</Label>
            <Input value={fornecedorForm.endereco} onChange={e => setFornecedorForm(f => ({ ...f, endereco: e.target.value }))}
              placeholder="Endereço completo" />
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Input value={fornecedorForm.observacoes} onChange={e => setFornecedorForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Observações adicionais" />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-[#1B3A5C]" disabled={!fornecedorForm.nome || isPending}
            onClick={() => {
              const cleanCnpj = fornecedorForm.cnpj.replace(/\D/g, "");
              onSave(cleanCnpj);
            }}>
            {isPending ? "Salvando..." : editingFornecedor ? "Atualizar" : "Cadastrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
