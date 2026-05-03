import { iaModulosRouter } from '../server/routers/iaModulos';

(async () => {
  try {
    const caller = iaModulosRouter.createCaller({
      user: { id: 1, name: 'Felipe', companyId: 1, role: 'admin_master' },
      cookies: {} as any,
      req: {} as any,
      res: {} as any,
    } as any);
    const r = await caller.chat({
      modulo: 'rh',
      messages: [{ role: 'user', content: 'Como devo lançar que o funcionário está afastado?' }],
      companyId: 1,
    });
    console.log('OK:', r.resposta.slice(0, 200));
  } catch (e: any) {
    console.log('NAME:', e?.name);
    console.log('MSG:', e?.message);
    console.log('CAUSE:', e?.cause?.message);
    console.log('STACK:', e?.stack?.split('\n').slice(0, 12).join('\n'));
  }
})();
