---
name: Period selector golden rule
description: Todo seletor de mês/ano da plataforma deve usar PeriodSelectorCard — regra de ouro do usuário.
---

# Seletor de Mês/Ano — Regra de Ouro

**Componente:** `client/src/components/PeriodSelectorCard.tsx`

## A regra

SEMPRE usar `<PeriodSelectorCard>` quando uma tela precisa filtrar por mês e/ou ano.
NUNCA criar um seletor inline customizado (‹/›, dropdown, texto "Jun / 2026", etc.).

## Interface do componente

```tsx
<PeriodSelectorCard
  ano={ano}                    // number
  mes={mes}                    // number | null  (null = "Ano todo")
  onAno={setAno}               // (a: number) => void
  onMes={setMes}               // (m: number) => void
  onAnoTodo={() => setMes(null)} // opcional — habilita botão "Ano todo"
  actions={<ReactNode />}      // opcional — renderizado à direita do cabeçalho
  monthStatus={{               // opcional — pontos coloridos por mês
    1: "data", 2: "none", ...  // "data"=azul, "none"/ausente=cinza
  }}
/>
```

## Layout visual (conforme screenshot aprovado pelo usuário)

- **Cabeçalho**: `< 2026 >` (navegação de ano) + botão "Ano todo" à esquerda
- **Grade de 12 pills**: Jan Fev Mar Abr Mai Jun **Jul** Ago Set Out Nov Dez
  - Mobile: 6 cols × 2 linhas
  - Desktop: 12 cols × 1 linha
- **Pill selecionado**: `border-2 border-slate-800 bg-slate-50 text-slate-800 font-semibold`
- **Pill normal**: `border border-slate-200 bg-white text-slate-500`
- **Ponto colorido** (se `monthStatus` informado): azul=com dados, cinza=sem dados

## Estado padrão

```tsx
const [ano, setAno] = useState(new Date().getFullYear());
const [mes, setMes] = useState<number | null>(new Date().getMonth() + 1);

// Converter para string de filtro:
const mesRef = mes === null ? undefined : `${ano}-${String(mes).padStart(2, "0")}`;
```

## Why

O usuário definiu explicitamente (13/07/2026) que este é o padrão visual único do sistema.
Qualquer seletor de período diferente é inconsistência de UI a ser corrigida.

## How to apply

Ao construir ou corrigir qualquer tela com filtro de mês/ano:
1. Importar: `import PeriodSelectorCard from "@/components/PeriodSelectorCard";`
2. Declarar estado com `number | null`
3. Montar `mesRef` como string `"YYYY-MM"` ou `undefined`
4. Renderizar `<PeriodSelectorCard>` no topo da seção filtrada
