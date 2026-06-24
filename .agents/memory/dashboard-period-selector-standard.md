---
name: Dashboard period selector — padrão do sistema
description: Seletor de mês/ano nos dashboards financeiros deve usar o padrão white-card, NÃO gradient DashHeader. Regra de ouro gravada pelo usuário.
---

# Regra de Ouro — Seletor de Período nos Dashboards

## A regra

Todo dashboard financeiro que permite selecionar mês/ano deve usar o **padrão white-card** (mesmo layout do PanoramaFiscal), **nunca** o componente `DashHeader` com gradiente colorido.

## Como fica o padrão (estrutura HTML)

```tsx
<div className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
  {/* Linha 1: < ano > + "Ano todo" chip + flex-1 spacer + legend dots + Atualizar */}
  <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
    <div className="flex items-center gap-1">
      <button onClick={() => setAno(a => a - 1)}><ChevronLeft /></button>
      <span className="text-base font-bold min-w-[3.5rem] text-center">{ano}</span>
      <button onClick={() => setAno(a => a + 1)}><ChevronRight /></button>
      <button onClick={() => setMes(m => m === 0 ? today.month : 0)}
        className={`ml-1 px-3 py-1 rounded-lg border text-xs font-semibold
          ${mes === 0 ? "border-<accent>-500 bg-<accent>-50 text-<accent>-700" : "border-gray-200 bg-white text-gray-600"}`}
      >Ano todo</button>
    </div>
    <div className="flex-1" />
    {/* Legend dots */}
    <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
      <span><dot bg-emerald-500 /> Com dados</span>
      <span><dot bg-amber-400 /> Parcial</span>   {/* opcional */}
      <span><dot bg-gray-300 /> Sem dados</span>
    </div>
    {/* Botões de ação: Atualizar + quaisquer exports */}
    <button onClick={refetch}><RefreshCw /> Atualizar</button>
  </div>

  {/* Linha 2: 12 chips de mês com dot de status embaixo */}
  <div className="px-4 py-3 grid grid-cols-6 sm:grid-cols-12 gap-1.5">
    {MESES_ABREV.map((m, i) => (
      <button key={m} onClick={() => setMes(i + 1)}
        className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium
          ${mes === i+1 ? "border-<accent>-500 bg-<accent>-50 text-<accent>-700" : "border-gray-200 bg-white text-gray-500"}`}
      >
        <span>{m}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${hasDados ? "bg-emerald-500" : "bg-gray-300"}`} />
      </button>
    ))}
  </div>
</div>
```

## Referências no codebase

- Origem canônica: `client/src/pages/financeiro/PanoramaFiscal.tsx` (linhas 347–443)
- Implementado também em: `client/src/pages/financeiro/dashboards/DashNotasFiscais.tsx`

## Por que NÃO usar DashHeader (gradiente)

`DashHeader` em `_kit.tsx` renderiza um banner com gradiente colorido + nav de ano no canto direito. O usuário pediu explicitamente para manter o padrão white-card (board reference: IMG_2684 vs IMG_2727 — o primeiro é o padrão correto).

**Why:** O gradiente não é consistente com o restante da tela de Configurações/Panorama. O white-card integra melhor, é mais legível e mantém hierarquia visual consistente com os outros módulos financeiros.

**How to apply:** Ao criar qualquer novo dashboard financeiro com seletor de mês, copie o bloco do PanoramaFiscal. O `DashHeader` fica reservado para telas que NÃO têm seletor de período (se existirem).
