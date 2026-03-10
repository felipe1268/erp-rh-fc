# Análise dos Arquivos DIXI - Cartão de Ponto

## Estrutura do Arquivo XLS
Colunas: ID | Nome | Hora | Modo de verificação | Inout | Event | Note | Sn

- **ID**: Código interno do funcionário no relógio DIXI
- **Nome**: Nome do funcionário (pode ter variações de caixa/acentos)
- **Hora**: Data/hora da batida (formato DD/MM/YYYY HH:MM:SS ou YYYY/MM/DD HH:MM:SS)
- **Modo de verificação**: F (Fingerprint) ou Face
- **Inout**: 0 (sempre 0, não diferencia entrada/saída)
- **Event**: 0 (sempre 0)
- **Note**: vazio
- **Sn**: Número de série do relógio (identifica a obra)

## Dados dos 4 Arquivos Reais

| Arquivo | SN | Funcionários | Período | Registros | Inconsistências |
|---------|-----|-------------|---------|-----------|-----------------|
| LUCIANA | AYSJ14003241 | 12 | 22/12/2025 - 05/01/2026 | 556 | 24.2% |
| PEQUENO | AYSI07100529 | 10 | 15/12/2025 - 22/12/2025 | 107 | 30.3% |
| QIU | AYSJ31011442 | 71 | 30/12/2025 - 02/01/2026 | 2912 | 18.8% |
| UTC | AYSJ14003243 | 53 | 15/12/2025 - 15/01/2026 | 1973 | 28.3% |

## Regras de Negócio Identificadas

1. **Inout = 0 sempre**: O relógio NÃO diferencia entrada/saída. Precisamos inferir pela ordem cronológica:
   - 1ª batida = Entrada
   - 2ª batida = Saída intervalo
   - 3ª batida = Retorno intervalo
   - 4ª batida = Saída
   
2. **Batidas ímpares = inconsistência**: Se o funcionário tem número ímpar de batidas no dia, faltou uma batida.

3. **Batidas extras (5, 6, 7)**: Podem indicar saída/retorno extra ou batida duplicada.

4. **SN identifica a obra**: Cada relógio tem um SN único vinculado a uma obra.

5. **Formato de data varia**: Alguns arquivos usam DD/MM/YYYY, outros YYYY/MM/DD.

6. **Nomes podem não bater exatamente**: Nomes no relógio podem ter variações de caixa, acentos, abreviações.
