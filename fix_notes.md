# Queries in getDashFuncionarios that need Desligado/Lista_Negra exclusion

## Already exclude Desligado:
- tenureDist (line 115): `status != 'Desligado'`
- longestTenure (line 157): `status != 'Desligado'`
- shortestTenure (line 163): `status != 'Desligado'`
- estadoDist (line 214): `status IN ('Ativo', 'Ferias')`

## NEED to add exclusion (currently include ALL including Desligado):
- statusDist (line 36): Should keep as-is for the card count but NOT for charts
- sexDist (line 42): MUST exclude Desligado/Lista_Negra
- setorDist (line 48): MUST exclude Desligado/Lista_Negra
- funcaoDist (line 54): MUST exclude Desligado/Lista_Negra
- contratoDist (line 62): MUST exclude Desligado/Lista_Negra
- estadoCivilDist (line 68): MUST exclude Desligado/Lista_Negra
- cidadeDist (line 74): MUST exclude Desligado/Lista_Negra
- ageDist (line 91): MUST exclude Desligado/Lista_Negra
- oldest (line 145): MUST exclude Desligado/Lista_Negra
- youngest (line 151): MUST exclude Desligado/Lista_Negra
- rankingAdvertencias (line 174): MUST exclude Desligado employees
- rankingAtestados (line 187): MUST exclude Desligado employees
- admissoesMensal (line 131): OK - this is historical data about admissions
- demissoesMensal (line 138): OK - this is historical data about terminations
