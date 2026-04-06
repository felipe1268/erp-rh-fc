import DashboardLayout from "../../components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical, Construction } from "lucide-react";

export default function Ensaios() {
  return (
    <DashboardLayout title="Ensaios Tecnológicos">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <FlaskConical className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Ensaios Tecnológicos</h1>
        </div>
        <Card className="max-w-lg mx-auto mt-12">
          <CardContent className="p-8 text-center">
            <Construction className="h-12 w-12 text-blue-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Módulo em Desenvolvimento</h2>
            <p className="text-sm text-gray-500">
              O módulo de Ensaios Tecnológicos está sendo desenvolvido e estará disponível em breve.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
