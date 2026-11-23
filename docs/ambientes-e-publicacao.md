# Ambientes, testes e publicação

| Ambiente | Finalidade |
| --- | --- |
| **Desenvolvimento local** | Rodar o aplicativo no computador usando banco de desenvolvimento. |
| **Prévia local** | Revisar uma compilação local com dados fictícios em banco separado. A prévia usada neste projeto pode rodar na porta 3013. |
| **Testes automatizados** | O Playwright inicia o aplicativo na porta 3031 e usa um PostgreSQL separado. |
| **Produção** | Aplicativo publicado no Vercel com banco PostgreSQL hospedado no Neon. |

## Rodar no computador

Use Node.js 24, npm e PostgreSQL. O [arquivo do Docker Compose](../compose.yaml) fornece um banco local. Copie o [modelo de variáveis](../.env.example) para `.env`, configure a conexão e preencha o nome, o e-mail e a senha do primeiro administrador.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Preencha o arquivo .env antes de seguir.
npm.cmd ci
docker compose up -d --wait postgres
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Abra `http://localhost:3000/login`. O seed cria TSA, TSA Lynx e um administrador vinculado às duas. Depois do seed, retire as variáveis de credenciais iniciais do arquivo. Se já tiver um PostgreSQL local, use a URL desse banco em `DATABASE_URL` e pule o comando do Docker. O seed inicial é executado uma vez por ambiente.

Para testar uma compilação local, aponte `DATABASE_URL` para o banco da prévia, já migrado, e execute os seguintes comandos no PowerShell.

```powershell
$env:EPI_UX_PREVIEW = 'true'
$env:LOCAL_HTTP = 'true'
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3013
```

`EPI_UX_PREVIEW` seleciona o diretório de compilação `.next-ux-preview`. A separação dos dados depende da `DATABASE_URL` informada. `LOCAL_HTTP` permite o cookie de sessão em HTTP na máquina local.

## Testes

Crie um banco exclusivo e configure `TEST_DATABASE_URL`. Se estiver usando o Docker Compose do projeto, pode criá-lo com `docker compose exec postgres createdb -U epi epi_test`. Rode no diretório do projeto.

```powershell
npx.cmd playwright install chromium
npm.cmd run build
npm.cmd run test:e2e
```

Para usar o Chrome instalado, defina `$env:PLAYWRIGHT_CHANNEL = 'chrome'`. A suíte aplica as migrações e cria dados fictícios no banco de teste. Cobre permissões, fluxo de pedidos, concorrência na baixa, confirmação de recebimento, anexos privados, sessão, navegação por teclado e cadastro de encarregado terceirizado. Alguns testes reativam a aprovação apenas no banco isolado para validar a função preservada. Consulte [quality.spec.ts](../tests/quality.spec.ts) para ver os casos.

## Publicar no Vercel

1. Use o repositório GitHub do projeto e a branch `main`. No Vercel, selecione **Next.js** e a raiz `./`. O build padrão usa `npm run build`.
2. Conecte o PostgreSQL do Neon ao projeto. Confirme que `DATABASE_URL` está disponível como segredo no ambiente **Production**. Deixe `LOCAL_HTTP` sem configuração em produção. Use banco separado para testar antes de liberar uma alteração.
3. Antes de publicar código que depende de uma nova migração, execute `npm run db:migrate` no banco de destino, a partir de um ambiente autorizado com acesso ao segredo. Se o provedor fornecer uma URL direta para migração, use-a somente no processo de migração e mantenha a conexão configurada para o aplicativo no Vercel.
4. Em um banco novo, execute `npm run db:seed` uma vez com `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` disponíveis somente ao processo de inicialização. Com a integração do Neon, os segredos do Vercel podem estar disponíveis durante o deploy e protegidos contra cópia pelo CLI. Nesse caso, faça a inicialização em um ambiente seguro que já receba esses segredos.
5. Publique ou faça **Redeploy** após configurar as variáveis. Abra `/login` no domínio final e confira o acesso, a seleção de empresa e a **Visão geral**.

Consulte os guias de [deploy pelo GitHub](https://vercel.com/docs/git), [PostgreSQL no Vercel](https://vercel.com/docs/postgres) e [migrações com Prisma](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/deploy-database-changes-with-prisma-migrate).

## Diagnóstico rápido

| Sintoma | O que conferir |
| --- | --- |
| O deploy abre, mas o login falha para todos | Confira a conexão de produção, as migrações e a criação do administrador. Após alterar a variável no Vercel, faça um novo deploy. |
| O login local vai e volta para a tela de entrada | Confira se o app foi iniciado em modo de produção por HTTP local. Nesse caso use `LOCAL_HTTP=true` no processo local. |
| Conta entra mas não tem acesso à empresa | Confira o vínculo ativo em **Acessos e perfis**. Colaborador e encarregado também precisam ter cadastro pessoal ativo. |
| Entrega não lista almoxarifado ou lote | Confira a unidade do destinatário e o saldo completo em lote elegível, além da validade, do bloqueio e dos indicadores do item. |
| Banco e aplicativo parecem ter versões diferentes | Confira a versão publicada e as migrações aplicadas no mesmo ambiente antes de repetir o deploy. |

O PostgreSQL guarda cadastros, saldos, movimentos, sessões e anexos. Inclua-o no backup e valide a restauração em um ambiente separado.

[Voltar ao índice](README.md)
