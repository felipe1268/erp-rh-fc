import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { employeeFaceDescriptors, epiDeliveries, employees, epis, obras } from "../../drizzle/schema";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { storagePut } from "../storage";

export const faceRecognitionRouter = router({

  getEnrolledEmployees: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds?.length ? input.companyIds : [input.companyId];

      const rows = await db.execute(sql`
        SELECT
          e.id,
          e."nomeCompleto",
          e."numeroInterno",
          e."cargo",
          e."fotoUrl",
          e."status",
          efd.id AS "faceId",
          efd.enrolled_at AS "enrolledAt",
          efd.enrolled_by AS "enrolledBy"
        FROM employees e
        LEFT JOIN employee_face_descriptors efd ON efd.employee_id = e.id
        WHERE e."companyId" = ANY(${ids}::int[])
          AND e."deletedAt" IS NULL
          AND e.status NOT IN ('Desligado','Lista_Negra','Recluso')
        ORDER BY e."nomeCompleto"
      `);

      return (rows as any).rows || [];
    }),

  getFaceDescriptors: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds?.length ? input.companyIds : [input.companyId];

      const rows = await db.execute(sql`
        SELECT
          efd.employee_id AS "employeeId",
          efd.descriptor,
          e."nomeCompleto",
          e."numeroInterno",
          e."fotoUrl",
          e."cargo"
        FROM employee_face_descriptors efd
        JOIN employees e ON e.id = efd.employee_id
        WHERE efd.company_id = ANY(${ids}::int[])
          AND e."deletedAt" IS NULL
      `);

      return (rows as any).rows || [];
    }),

  enrollFace: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      descriptor: z.array(z.number()),
      fotoBase64: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const descriptorJson = JSON.stringify(input.descriptor);
      const userName = ctx.user?.name || 'Sistema';
      const userId = ctx.user?.id ?? null;

      let fotoUrl: string | null = null;
      if (input.fotoBase64) {
        const base64Data = input.fotoBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const key = `face-enrollment/${input.companyId}/${input.employeeId}-${Date.now()}.jpg`;
        const result = await storagePut(key, buffer, 'image/jpeg');
        fotoUrl = result.url;
      }

      await db.execute(sql`
        INSERT INTO employee_face_descriptors
          (company_id, employee_id, descriptor, foto_capturada_url, enrolled_at, enrolled_by, enrolled_by_user_id, updated_at)
        VALUES
          (${input.companyId}, ${input.employeeId}, ${descriptorJson}, ${fotoUrl}, now(), ${userName}, ${userId}, now())
        ON CONFLICT (employee_id)
        DO UPDATE SET
          descriptor = EXCLUDED.descriptor,
          foto_capturada_url = EXCLUDED.foto_capturada_url,
          enrolled_by = EXCLUDED.enrolled_by,
          enrolled_by_user_id = EXCLUDED.enrolled_by_user_id,
          updated_at = now()
      `);

      if (fotoUrl) {
        await db.execute(sql`
          UPDATE employees SET "fotoUrl" = ${fotoUrl} WHERE id = ${input.employeeId} AND ("fotoUrl" IS NULL OR "fotoUrl" = '')
        `);
      }

      return { ok: true, fotoUrl };
    }),

  deleteEnrollment: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.execute(sql`
        DELETE FROM employee_face_descriptors WHERE employee_id = ${input.employeeId}
      `);
      return { ok: true };
    }),

  createDeliveryWithFace: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      obraId: z.number().optional(),
      itens: z.array(z.object({
        epiId: z.number(),
        quantidade: z.number(),
        dataValidade: z.string().optional(),
        motivo: z.string().optional(),
      })),
      modoIdentificacao: z.enum(['facial', 'qrcode', 'numero', 'manual']),
      biometriaFotoBase64: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const hoje = new Date().toISOString().split('T')[0];
      const agora = new Date().toISOString();

      let biometriaFacialUrl: string | null = null;
      if (input.biometriaFotoBase64 && input.modoIdentificacao === 'facial') {
        const base64Data = input.biometriaFotoBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const key = `face-delivery/${input.companyId}/${input.employeeId}-${Date.now()}.jpg`;
        const result = await storagePut(key, buffer, 'image/jpeg');
        biometriaFacialUrl = result.url;
      }

      const ids: number[] = [];
      for (const item of input.itens) {
        const [row] = await db.insert(epiDeliveries).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          epiId: item.epiId,
          quantidade: item.quantidade,
          dataEntrega: hoje,
          motivo: item.motivo || 'Entrega',
          observacoes: input.observacoes || null,
          obraId: input.obraId || null,
          origemEntrega: input.obraId ? 'obra' : 'central',
          dataValidade: item.dataValidade || null,
          biometriaFacialUrl,
          biometriaCapturadaEm: biometriaFacialUrl ? agora : null,
          modoIdentificacao: input.modoIdentificacao,
        } as any).returning({ id: epiDeliveries.id });
        ids.push((row as any).id);
      }

      return { ok: true, deliveryIds: ids };
    }),

  getDeliveriesForEmployee: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.execute(sql`
        SELECT
          ed.id,
          ed."epiId",
          ep.nome AS "epiNome",
          ep.ca,
          ed.quantidade,
          ed."dataEntrega",
          ed."dataValidade",
          ed."modoIdentificacao",
          ed."biometriaFacialUrl",
          ed."biometriaCapturadaEm",
          ed."obraId",
          o.nome AS "obraNome",
          ed."deletedAt"
        FROM epi_deliveries ed
        JOIN epis ep ON ep.id = ed."epiId"
        LEFT JOIN obras o ON o.id = ed."obraId"
        WHERE ed."employeeId" = ${input.employeeId}
          AND ed."companyId" = ${input.companyId}
          AND ed."deletedAt" IS NULL
        ORDER BY ed."dataEntrega" DESC
        LIMIT ${input.limit}
      `);
      return (rows as any).rows || [];
    }),
});
