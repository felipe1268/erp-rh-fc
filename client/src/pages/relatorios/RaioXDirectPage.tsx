import { useLocation, useParams } from "wouter";
import RaioXFuncionario from "@/components/RaioXFuncionario";

export default function RaioXDirectPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const employeeId = params.id ? parseInt(params.id, 10) : null;

  return (
    <RaioXFuncionario
      employeeId={employeeId}
      open={true}
      onClose={() => navigate("/relatorios/raio-x")}
    />
  );
}
