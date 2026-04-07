import { eq, sql } from "drizzle-orm";
import { employees, employeeStatusLog } from "../../drizzle/schema";

interface StatusChangeParams {
  db: any;
  employeeId: number;
  companyId: number;
  novoStatus: string;
  alteradoPor: string;
  alteradoPorUserId?: number | null;
  motivo?: string;
  origemModulo: string;
}

export async function updateEmployeeStatus(params: StatusChangeParams) {
  const { db, employeeId, companyId, novoStatus, alteradoPor, alteradoPorUserId, motivo, origemModulo } = params;

  const [emp] = await db.select({
    id: employees.id,
    nomeCompleto: employees.nomeCompleto,
    status: employees.status,
    companyId: employees.companyId,
  }).from(employees).where(eq(employees.id, employeeId));

  if (!emp) return null;

  const statusAnterior = emp.status || 'Desconhecido';

  if (statusAnterior === novoStatus) return { unchanged: true, status: novoStatus };

  await db.update(employees)
    .set({ status: novoStatus } as any)
    .where(eq(employees.id, employeeId));

  await db.insert(employeeStatusLog).values({
    companyId: companyId || emp.companyId,
    employeeId,
    nomeCompleto: emp.nomeCompleto,
    statusAnterior,
    statusNovo: novoStatus,
    alteradoPor: alteradoPor || 'Sistema',
    alteradoPorUserId: alteradoPorUserId || null,
    motivo: motivo || null,
    origemModulo,
  });

  return { changed: true, statusAnterior, statusNovo: novoStatus };
}

export async function logStatusChange(params: {
  db: any;
  companyId: number;
  employeeId: number;
  nomeCompleto?: string;
  statusAnterior: string;
  statusNovo: string;
  alteradoPor: string;
  alteradoPorUserId?: number | null;
  motivo?: string;
  origemModulo: string;
}) {
  const { db, ...values } = params;
  await db.insert(employeeStatusLog).values({
    ...values,
    alteradoPorUserId: values.alteradoPorUserId || null,
    motivo: values.motivo || null,
  });
}
