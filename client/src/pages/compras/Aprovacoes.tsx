import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

// Rev. 2294 — Aprovações automáticas: a existência da Solicitação JÁ É a
// aprovação. O fluxo manual de aprovar/recusar foi descontinuado tanto para
// SC quanto para OC. Esta página foi mantida como informativa só pra não
// quebrar links antigos no menu/bookmarks e redirecionar pra Solicitações.

export default function ComprasAprovacoes() {
  const [, navigate] = useLocation();
  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="border-emerald-200">
          <CardContent className="p-8 text-center space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center ring-4 ring-emerald-50">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">
                Aprovações automáticas
              </h1>
              <p className="text-sm text-gray-600 leading-relaxed">
                A partir desta versão, toda Solicitação de Compra e Ordem de
                Compra é aprovada automaticamente — a existência da SC já é
                a aprovação. Não há mais fila de pendências para liberar.
              </p>
              <p className="text-xs text-gray-500">
                As solicitações abertas anteriormente também foram normalizadas
                e estão prontas para cotação.
              </p>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
              onClick={() => navigate("/compras/solicitacoes")}
            >
              Ir para Solicitações de Compra <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
