# Arquitetura, dados e segurança

## Organização do código

O aplicativo usa Next.js com App Router, React e TypeScript. As páginas protegidas consultam PostgreSQL via Prisma e `@prisma/adapter-pg`. Formulários chamam Server Actions. O protótipo em `prototype/` usa HTML, CSS e JavaScript com dados demonstrativos próprios.

| Local | Responsabilidade |
| --- | --- |
| `app/[companyId]/[[...path]]/page.tsx` | Seleciona a seção, valida o escopo e apresenta os cadastros e a operação. |
| `components/workspace.tsx` | Monta navegação, tema, logotipo, seletor de empresa e menu da conta. |
| `components/equipment-pages.tsx` | Apresenta itens, estoque, solicitações, entregas, recebimentos e regras de aprovação. |
| `components/reporting-pages.tsx` | Apresenta painel, alertas e relatórios. |
| `app/auth-actions.ts` e `lib/auth.ts` | Autenticação, troca de senha, sessões e controle de acesso inicial. |
| `app/organization-actions.ts` | Valida e grava cadastros, acessos e configurações. |
| `app/equipment-actions.ts` | Valida e grava estoque, solicitações, entregas, recebimentos e retiradas. |
| `lib/directory.ts` e `lib/equipment-access.ts` | Montam filtros por empresa, unidade, equipe e titular. |
| `lib/stock-availability.ts` e `lib/reporting.ts` | Calculam disponibilidade, estoque baixo, prazos, relatórios e CSV. |
| `prisma/schema.prisma` e `prisma/migrations/` | Definem as entidades e as mudanças versionadas no banco. |

## Rotas principais

| Rota | Tela ou resposta |
| --- | --- |
| `/login` e `/conta/senha` | Entrada e troca de senha. |
| `/{empresa}` | Visão geral. Os identificadores são `tsa` e `lynx`. |
| `/{empresa}/colaboradores`, `/unidades`, `/usuarios`, `/empresa` | Cadastros, equipes e acessos. O prefixo da empresa se aplica a cada seção. |
| `/{empresa}/epis`, `/estoque`, `/entregas`, `/solicitacoes` | Catálogo, inventário, histórico e fila operacional. |
| `/{empresa}/meus-epis` e `/{empresa}/minhas-solicitacoes` | Área pessoal do usuário com vínculo ativo. |
| `/{empresa}/alertas`, `/relatorios`, `/regras-aprovacao` | Acompanhamento e configuração. |
| `/{empresa}/itens-esperados` | Cadastro administrativo de itens esperados por função ou unidade. |
| `/exportar/{empresa}` | CSV com os filtros do relatório. |
| `/comprovantes/{empresa}/{entrega}` | Download privado de comprovante de entrega. |
| `/fotos-de-troca/{empresa}/{pedido}` | Exibição privada da foto de troca. |
| `/teste-codigo-barras` | Página pública de teste. Salva os registros no navegador. |
| `/api/teste-codigo-barras` | Consulta um GTIN válido nas fontes selecionadas. |

## Relações no PostgreSQL

| Entidades | Como se relacionam |
| --- | --- |
| `Company`, `Unit`, `Warehouse` | Uma empresa tem unidades. Uma unidade pode ter vários almoxarifados. |
| `Employee` | Vincula a pessoa à empresa, à unidade e, quando aplicável, a outro colaborador como encarregado. A terceirizada é um campo opcional do cadastro. |
| `User`, `UserScope`, `ScopeUnit` | Um e-mail identifica a conta. O vínculo por empresa define perfil, colaborador associado e unidades autorizadas. |
| `Session`, `LoginAttempt` | Guardam as sessões e as janelas de tentativas de autenticação. |
| `Equipment`, `EquipmentLot`, `Stock` | Entradas de um item são agrupadas internamente por validade. A chave do saldo inclui empresa, almoxarifado e lote interno. A tela soma por almoxarifado e item. |
| `ExpectedItem` | Vincula um item e uma quantidade a uma função, uma unidade ou à combinação dos dois dentro da empresa. |
| `StockMinimum` | Guarda o mínimo por empresa, unidade e item. O padrão é de cinco unidades. |
| `StockMovement`, `Delivery` | Movimentos positivos registram entradas. Uma entrega pelo almoxarifado pode gerar mais de um movimento negativo. A ficha de papel grava o registro com almoxarifado e lote vazios e preserva o estoque. |
| `EquipmentRequest`, `ApprovalRule` | O pedido guarda solicitante, unidade, item ou descrição e situação. As regras guardam exigência de aprovação por unidade e, opcionalmente, por item. |
| `DeliveryReceipt`, `DeliveryRetirement` | Registram a confirmação do destinatário e a retirada de uso com autor e horário. |
| `DeliveryProof`, `ReplacementPhoto` | Guardam bytes, formato e hash dos anexos, vinculados à entrega ou à solicitação. |
| `EquipmentEvent` | Guarda eventos como estados de solicitação, entrega, confirmação e retirada, com autor e horário. |

## Invariantes e segurança

- As ações privadas validam a sessão e a empresa no servidor. As operações transacionais consultam novamente o escopo ativo antes de gravar. O menu reflete o perfil para facilitar a navegação.
- A senha é derivada com scrypt e salt individual. A sessão vence em 12 horas. O banco guarda o hash do token, e o cookie usa `HttpOnly`, `SameSite=Lax` e, em produção, `Secure`.
- O saldo, a entrega, a movimentação e a conclusão do pedido são gravados juntos. Chaves e restrições mantêm a unicidade da entrega por pedido e a de uma troca em aberto por entrega de origem. A transação da confirmação do destinatário grava o recebimento e seu evento.
- Os arquivos ficam no PostgreSQL. As rotas privadas verificam o escopo e a integridade SHA-256 antes de responder. A foto permite exibição no navegador. O comprovante é entregue como arquivo para download.
- Uma troca de empresa muda o tema e o conjunto de dados em uso. O operador acessa apenas os registros autorizados para sua empresa, unidades ou equipe. A área pessoal usa o colaborador ativo da conta.

Na manutenção, verifique o [schema Prisma](../prisma/schema.prisma), os filtros de acesso e os testes do fluxo alterado antes de mudar uma regra.

[Voltar ao índice](README.md)
