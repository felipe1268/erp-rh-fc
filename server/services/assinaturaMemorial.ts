import { eq } from "drizzle-orm";
import { employees } from "../../drizzle/schema";

export function compararAssinaturas(memorialB64: string, novaB64: string): number {
  try {
    const extract = (b64: string): Buffer => {
      const raw = b64.includes(",") ? b64.split(",")[1] : b64;
      return Buffer.from(raw, "base64");
    };
    const bufM = extract(memorialB64);
    const bufN = extract(novaB64);

    const sizeM = bufM.length;
    const sizeN = bufN.length;
    const sizeDiff = Math.abs(sizeM - sizeN) / Math.max(sizeM, sizeN, 1);

    const sampleSize = Math.min(sizeM, sizeN, 2000);
    const stepM = Math.max(1, Math.floor(sizeM / sampleSize));
    const stepN = Math.max(1, Math.floor(sizeN / sampleSize));

    let matches = 0;
    let total = 0;
    for (let i = 0; i < sampleSize; i++) {
      const idxM = i * stepM;
      const idxN = i * stepN;
      if (idxM < sizeM && idxN < sizeN) {
        total++;
        if (Math.abs(bufM[idxM] - bufN[idxN]) < 30) matches++;
      }
    }

    const byteSim = total > 0 ? (matches / total) * 100 : 0;
    const sizeSim = (1 - sizeDiff) * 100;
    const combined = byteSim * 0.6 + sizeSim * 0.4;

    return Math.round(Math.max(0, Math.min(100, combined)));
  } catch {
    return 50;
  }
}

export interface VerificacaoResult {
  primeiraAssinatura: boolean;
  assinaturaDivergente: boolean;
  similaridade: number | null;
}

export async function verificarAssinaturaMemorial(
  db: any,
  employeeId: number,
  assinaturaBase64: string,
  limiarDivergencia = 60,
): Promise<VerificacaoResult> {
  const [emp] = await db.select({
    id: employees.id,
    assinaturaMemorial: employees.assinaturaMemorial,
  }).from(employees).where(eq(employees.id, employeeId));

  if (!emp) {
    return { primeiraAssinatura: false, assinaturaDivergente: false, similaridade: null };
  }

  if (!emp.assinaturaMemorial) {
    await db.update(employees)
      .set({ assinaturaMemorial: assinaturaBase64, assinaturaMemorialAt: new Date().toISOString() })
      .where(eq(employees.id, employeeId));
    return { primeiraAssinatura: true, assinaturaDivergente: false, similaridade: null };
  }

  const sim = compararAssinaturas(emp.assinaturaMemorial, assinaturaBase64);
  return {
    primeiraAssinatura: false,
    assinaturaDivergente: sim < limiarDivergencia,
    similaridade: sim,
  };
}
