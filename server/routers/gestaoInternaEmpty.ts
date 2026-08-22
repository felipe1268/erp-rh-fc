export type GestaoInternaPeriod = {
  today: string;
  weekStart: string;
  weekEnd: string;
  previousWeekStart: string;
  previousWeekEnd: string;
  monthStart: string;
  yearStart: string;
};

export function emptyGestaoInternaDashboard(period: GestaoInternaPeriod) {
  const zeroProd = { total: 0, validados: 0, pendentes: 0, glosados: 0 };
  return {
    generatedAt: new Date().toISOString(),
    period,
    obras: [],
    headline: {
      obrasAtivas: 0,
      obrasAtrasadas: 0,
      colaboradoresAtivos: 0,
      alocadosHoje: 0,
      presentesDdsHoje: 0,
      possiveisAusenciasDdsHoje: 0,
      faltasHoje: 0,
      comprasPendentes: 0,
      entregasAtrasadas: 0,
    },
    pessoas: {
      semana: {
        faltas: 0,
        atestados: 0,
        advertencias: 0,
        acidentes: 0,
        acidentesGraves: 0,
        admissoes: 0,
        demissoes: 0,
        movimentacoes: 0,
      },
      saude: {
        atestados: { semana: 0, mes: 0, ano: 0 },
        acidentes: { semana: 0, mes: 0, ano: 0 },
      },
      porObra: [],
    },
    producao: {
      hoje: { ...zeroProd },
      semanaAnterior: { ...zeroProd },
      semanaAtual: { ...zeroProd },
      mesAtual: { ...zeroProd },
      porObra: [],
    },
    planejamento: {
      obrasComPlanejamento: 0,
      atividadesAtrasadas: 0,
      atividadesEmRisco: 0,
      porObra: [],
    },
    compras: {
      solicitacoesAbertas: 0,
      cotacoesAbertas: 0,
      ordensAbertas: 0,
      entregasAtrasadas: 0,
      leadTime: {
        scCotacaoHoras: null,
        cotacaoOcHoras: null,
        scOcHoras: null,
        amostra: 0,
      },
      porObra: [],
    },
    radar: [],
    qualidade: [
      { fonte: "obras", status: "sem_dados" as const, mensagem: "Nenhuma obra ativa no escopo autorizado." },
      { fonte: "apontamentos_producao", status: "sem_dados" as const, mensagem: "Nenhuma obra ativa no escopo autorizado." },
      { fonte: "planejamento_projetos", status: "sem_dados" as const, mensagem: "Nenhuma obra ativa no escopo autorizado." },
      { fonte: "compras_solicitacoes", status: "sem_dados" as const, mensagem: "Nenhuma obra ativa no escopo autorizado." },
    ],
  };
}