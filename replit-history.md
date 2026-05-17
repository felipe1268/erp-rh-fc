# Histórico de revisões antigas — ERP RH & DP FC Engenharia

> Este arquivo guarda os one-liners das revisões antigas para manter o `replit.md` enxuto.
> O detalhamento completo (causa-raiz, stack traces, arquivos tocados, comentários longos) de TODAS as revisões — incluindo as listadas abaixo — vive em `shared/changelog.ts`.
> Movido aqui na Rev. 2028 (faxina) — revisões 1903 → 2012.

- ~~Rev. 2036~~ — SST Integração aba Pendentes (Rev. 2034) agora filtra "funcionários fantasma" — exclui soft-delete, lista negra e demitidos com status inconsistente. Ver `shared/changelog.ts`. (movida na Rev. 2051)
- ~~Rev. 2035~~ — SST Integração: pontuação vai pro Raio-X do Funcionário + certificado de aprovação em PDF (público e re-emissão no Raio-X). Ver `shared/changelog.ts`. (movida da Rev. 2050)
- ~~Rev. 2034~~ — SST Integração aba Pendentes: novo bloco "Sem integração válida" listando TODOS CLT/PJ/Terceiros que precisam fazer/renovar (24 meses). Ver `shared/changelog.ts`. (movida da Rev. 2049)
> Atualizado na Rev. 2050 — Rev. 2035 movida pra cá.
> Atualizado em 17/05/2026 (faxina) — revisões 2026 a 2030 movidas pra cá.

## Revisão 2030

- ~~Rev. 2030~~ — DP Fechamento de Ponto: calendário reconhece FÉRIAS em gozo e não conta como "Falta provável" (badge sky). Ver `shared/changelog.ts`.

## Revisão 2029

- ~~Rev. 2029~~ — DP Fechamento de Ponto: modal "Memória de cálculo · Atraso Acumulado" em FULL SCREEN com fontes maiores. Ver `shared/changelog.ts`.

## Revisão 2028

- ~~Rev. 2028~~ — Faxina do `replit.md`: cria `replit-history.md` (one-liners 1903→2012) + nova convenção top-5 + 10 one-liners. Ver `shared/changelog.ts`.

## Revisão 2027

- ~~Rev. 2027~~ — DP Fechamento de Ponto: BUGFIX divergência tabela vs modal — `getAtrasoDetalhe` agora soma `r.atrasos` (motor); garantia `SOMA(dias)===tabela`. Ver `shared/changelog.ts`.

## Revisão 2026

- ~~Rev. 2026~~ — SST Integração: Modal "Iniciar Integração" refeito sob a regra de ouro (header gradient emerald/teal, dropdown com avatares, 2-col Obra/Configuração). Ver `shared/changelog.ts`.

## Revisão 2025

- ~~Rev. 2025~~ — Terceiros aba DDS: READ-ONLY (remove formulário manual; registros vêm só de sessões coletivas via `sessao_id`). Ver `shared/changelog.ts`.

## Revisão 2024

- ~~Rev. 2024~~ — SST DDS: terceiros no detalhe da sessão + "Transferir colaborador" aceita terceiros. Ver `shared/changelog.ts`.

## Revisão 2023

- ~~Rev. 2023~~ — SST Integração: card de vídeo reproduz upload (mp4/mov/webm) inline com player HTML5 nativo, sem download. Ver `shared/changelog.ts`.

## Revisão 2022

- ~~Rev. 2022~~ — Infra: CompanyContext expõe `companyIdNum: number` + faxina do replit.md + auditoria de bug latente. Ver `shared/changelog.ts`.

## Revisão 2021

- ~~Rev. 2021~~ — SST DDS: funcionários TERCEIROS vinculados à obra entram na lista "Equipe da obra" do modal Nova Sessão. Ver `shared/changelog.ts`.

## Revisão 2020

- ~~Rev. 2020~~ — SST Integração: bugfix companyId coercion (Zod number). Ver `shared/changelog.ts`.

## Revisão 2019

- ~~Rev. 2019~~ — DP Fechamento de Ponto: modal "Memória de cálculo · Atraso Acumulado" (header gradient, tabela dia a dia, empty-state). Ver `shared/changelog.ts`.

## Revisões 2013 → 2018

- ~~Rev. 2018~~ — SST Integração: barra lateral (DashboardLayout) restaurada. Ver `shared/changelog.ts`.
- ~~Rev. 2017~~ — Terceiros aba Documentos: nova seção "Documentos Trabalhistas" (Ficha de EPI NR-06, OS de SST NR-01, Registro CLT art. 41). Ver `shared/changelog.ts`.
- ~~Rev. 2016~~ — SST Integração: modal de vídeo destrava criação de Config padrão inline (auto-seleção + empty-state com CTA). Ver `shared/changelog.ts`.
- ~~Rev. 2015~~ — DP Fechamento de Ponto: avatares clicáveis com foto + selo CIPA Ativo/Estabilidade em modais de ranking. Ver `shared/changelog.ts`.
- ~~Rev. 2014~~ — DP Fechamento de Ponto: feriados (federais/estaduais/municipais) deixam de contar como falta + chip âmbar no drill-down. Ver `shared/changelog.ts`.
- ~~Rev. 2013~~ — ver `shared/changelog.ts`.

## Revisões 2000 → 2012

- ~~Rev. 2012~~ — SST Integração: upload de vídeo até 600MB via multer. Ver `shared/changelog.ts`.
- ~~Rev. 2011~~ — ver `shared/changelog.ts`.
- ~~Rev. 2010~~ — ver `shared/changelog.ts`.
- ~~Rev. 2009~~ — SST Integração: modal de vídeo refeito sob a regra de ouro (4 seções numeradas). Ver `shared/changelog.ts`.
- ~~Rev. 2008~~ — ver `shared/changelog.ts`.
- ~~Rev. 2007~~ — ver `shared/changelog.ts`.
- ~~Rev. 2006~~ — ver `shared/changelog.ts`.
- ~~Rev. 2005~~ — ver `shared/changelog.ts`.
- ~~Rev. 2004~~ — ver `shared/changelog.ts`.
- ~~Rev. 2003~~ — ver `shared/changelog.ts`.
- ~~Rev. 2002~~ — ver `shared/changelog.ts`.
- ~~Rev. 2001~~ — ver `shared/changelog.ts`.
- ~~Rev. 2000~~ — ver `shared/changelog.ts`.

## Revisões 1903 → 1999

- ~~Rev. 1999~~ — ver `shared/changelog.ts`.
- ~~Rev. 1998~~ — Terceiros: número interno auto-gerado `[SIGLA]-[SEQ]` + upload de foto na criação. Ver `shared/changelog.ts`.
- ~~Rev. 1997~~ — ver `shared/changelog.ts`.
- ~~Rev. 1996~~ — ver `shared/changelog.ts`.
- ~~Rev. 1995~~ — ver `shared/changelog.ts`.
- ~~Rev. 1994~~ — ver `shared/changelog.ts`.
- ~~Rev. 1993~~ — ver `shared/changelog.ts`.
- ~~Rev. 1992~~ — ver `shared/changelog.ts`.
- ~~Rev. 1991~~ — ver `shared/changelog.ts`.
- ~~Rev. 1990~~ — ver `shared/changelog.ts`.
- ~~Rev. 1989~~ — ver `shared/changelog.ts`.
- ~~Rev. 1988~~ — ver `shared/changelog.ts`.
- ~~Rev. 1987~~ — ver `shared/changelog.ts`.
- ~~Rev. 1986~~ — ver `shared/changelog.ts`.
- ~~Rev. 1985~~ — ver `shared/changelog.ts`.
- ~~Rev. 1984~~ — Faxina do replit.md (1ª onda — convenção top-5 detalhado). Ver `shared/changelog.ts`.
- ~~Rev. 1983~~ — ver `shared/changelog.ts`.
- ~~Rev. 1982~~ — ver `shared/changelog.ts`.
- ~~Rev. 1981~~ — ver `shared/changelog.ts`.
- ~~Rev. 1980~~ — ver `shared/changelog.ts`.
- ~~Rev. 1979~~ — ver `shared/changelog.ts`.
- ~~Rev. 1978~~ — ver `shared/changelog.ts`.
- ~~Rev. 1977~~ — ver `shared/changelog.ts`.
- ~~Rev. 1976~~ — ver `shared/changelog.ts`.
- ~~Rev. 1975~~ — ver `shared/changelog.ts`.
- ~~Rev. 1974~~ — ver `shared/changelog.ts`.
- ~~Rev. 1973~~ — ver `shared/changelog.ts`.
- ~~Rev. 1972~~ — ver `shared/changelog.ts`.
- ~~Rev. 1971~~ — ver `shared/changelog.ts`.
- ~~Rev. 1970~~ — ver `shared/changelog.ts`.
- ~~Rev. 1969~~ — ver `shared/changelog.ts`.
- ~~Rev. 1968~~ — ver `shared/changelog.ts`.
- ~~Rev. 1967~~ — ver `shared/changelog.ts`.
- ~~Rev. 1966~~ — ver `shared/changelog.ts`.
- ~~Rev. 1965~~ — ver `shared/changelog.ts`.
- ~~Rev. 1964~~ — ver `shared/changelog.ts`.
- ~~Rev. 1963~~ — ver `shared/changelog.ts`.
- ~~Rev. 1962~~ — ver `shared/changelog.ts`.
- ~~Rev. 1961~~ — ver `shared/changelog.ts`.
- ~~Rev. 1960~~ — ver `shared/changelog.ts`.
- ~~Rev. 1959~~ — ver `shared/changelog.ts`.
- ~~Rev. 1958~~ — Faxina prévia (banir marcadores HTML do tipo `<!-- DETALHES REVS ANTIGAS -->`). Ver `shared/changelog.ts`.
- ~~Rev. 1957~~ — ver `shared/changelog.ts`.
- ~~Rev. 1956~~ — ver `shared/changelog.ts`.
- ~~Rev. 1955~~ — ver `shared/changelog.ts`.
- ~~Rev. 1954~~ — ver `shared/changelog.ts`.
- ~~Rev. 1953~~ — ver `shared/changelog.ts`.
- ~~Rev. 1952~~ — ver `shared/changelog.ts`.
- ~~Rev. 1951~~ — ver `shared/changelog.ts`.
- ~~Rev. 1950~~ — ver `shared/changelog.ts`.
- ~~Rev. 1949~~ — ver `shared/changelog.ts`.
- ~~Rev. 1948~~ — ver `shared/changelog.ts`.
- ~~Rev. 1947~~ — ver `shared/changelog.ts`.
- ~~Rev. 1946~~ — ver `shared/changelog.ts`.
- ~~Rev. 1945~~ — ver `shared/changelog.ts`.
- ~~Rev. 1944~~ — ver `shared/changelog.ts`.
- ~~Rev. 1943~~ — ver `shared/changelog.ts`.
- ~~Rev. 1942~~ — ver `shared/changelog.ts`.
- ~~Rev. 1941~~ — ver `shared/changelog.ts`.
- ~~Rev. 1940~~ — ver `shared/changelog.ts`.
- ~~Rev. 1939~~ — ver `shared/changelog.ts`.
- ~~Rev. 1938~~ — ver `shared/changelog.ts`.
- ~~Rev. 1937~~ — ver `shared/changelog.ts`.
- ~~Rev. 1936~~ — ver `shared/changelog.ts`.
- ~~Rev. 1935~~ — ver `shared/changelog.ts`.
- ~~Rev. 1934~~ — ver `shared/changelog.ts`.
- ~~Rev. 1933~~ — ver `shared/changelog.ts`.
- ~~Rev. 1932~~ — ver `shared/changelog.ts`.
- ~~Rev. 1931~~ — ver `shared/changelog.ts`.
- ~~Rev. 1930~~ — ver `shared/changelog.ts`.
- ~~Rev. 1929~~ — ver `shared/changelog.ts`.
- ~~Rev. 1928~~ — ver `shared/changelog.ts`.
- ~~Rev. 1927~~ — ver `shared/changelog.ts`.
- ~~Rev. 1926~~ — ver `shared/changelog.ts`.
- ~~Rev. 1925~~ — ver `shared/changelog.ts`.
- ~~Rev. 1924~~ — ver `shared/changelog.ts`.
- ~~Rev. 1923~~ — ver `shared/changelog.ts`.
- ~~Rev. 1922~~ — ver `shared/changelog.ts`.
- ~~Rev. 1921~~ — ver `shared/changelog.ts`.
- ~~Rev. 1920~~ — ver `shared/changelog.ts`.
- ~~Rev. 1919~~ — ver `shared/changelog.ts`.
- ~~Rev. 1918~~ — ver `shared/changelog.ts`.
- ~~Rev. 1917~~ — ver `shared/changelog.ts`.
- ~~Rev. 1916~~ — ver `shared/changelog.ts`.
- ~~Rev. 1915~~ — ver `shared/changelog.ts`.
- ~~Rev. 1914~~ — ver `shared/changelog.ts`.
- ~~Rev. 1913~~ — ver `shared/changelog.ts`.
- ~~Rev. 1912~~ — ver `shared/changelog.ts`.
- ~~Rev. 1911~~ — ver `shared/changelog.ts`.
- ~~Rev. 1910~~ — ver `shared/changelog.ts`.
- ~~Rev. 1909~~ — ver `shared/changelog.ts`.
- ~~Rev. 1908~~ — ver `shared/changelog.ts`.
- ~~Rev. 1907~~ — ver `shared/changelog.ts`.
- ~~Rev. 1906~~ — ver `shared/changelog.ts`.
- ~~Rev. 1905~~ — ver `shared/changelog.ts`.
- ~~Rev. 1904~~ — ver `shared/changelog.ts`.
- ~~Rev. 1903~~ — ver `shared/changelog.ts`.

> Revisões anteriores à 1903: ver `shared/changelog.ts` (histórico completo).
