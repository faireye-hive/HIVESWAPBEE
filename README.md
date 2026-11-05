# HiveSwapBee

Interface para trocar tokens da Hive-Engine, acompanhar pools de liquidez e operar o livro de ordens. A carteira fica na extensão [Hive Keychain](https://hive-keychain.com/). O site não recebe a senha nem as chaves.

Site publicado: [https://faireye-hive.github.io/HIVESWAPBEE/](https://faireye-hive.github.io/HIVESWAPBEE/)

## O que dá para fazer

- **Pools.** Ver as pools de liquidez, volume, preço e incentivos ativos. Abrir uma pool para adicionar ou remover liquidez.
- **Swap.** Pesquisar as pools e trocar um token por outro. Os pares dos tokens que você já tem aparecem primeiro. Se não existe par direto, a rota passa por SWAP.HIVE ou BEE numa transação só. A cotação inclui a taxa de 0,25% da pool e a precisão de cada token.
- **Trade.** Livro de ordens contra SWAP.HIVE: compra e venda limit ou a mercado, negócios recentes e cancelamento das suas ordens. O painel **Pool bot** fica desligado até você apertar Start. No modo Take ele compra uma oferta quando a pool paga mais, ou vende num lance quando a pool está mais barata. No modo Make ele coloca um lance abaixo da pool e uma oferta acima, um lado por vez. Só sai uma transação por bloco da Hive. Cada envio abre a Keychain.
- **Tokens.** Lista dos mercados, com preço, variação de 24h, volume, bid e ask.
- **Wallet.** Saldos, stake, unstake, delegação e posições de liquidez da conta conectada. Dá para consultar outra conta pelo nome.
- **Tribes.** Posts das tribes da Hive-Engine.
- **HIVE ↔ SWAP.HIVE.** Na Wallet, depositar HIVE em `@honey-swap` ou sacar SWAP.HIVE de volta. A ponte cobra 1%, com mínimo de 0,001 HIVE. O saque mínimo é 0,002 SWAP.HIVE.

Login usa a chave **Posting**. Swap, trade, liquidez, stake e delegação pedem a chave **Active** na Keychain. A assinatura acontece na extensão.

## Requisitos

- Node.js 20 ou mais recente
- npm
- Um navegador com a extensão Hive Keychain, para entrar e assinar
- Uma conta na Hive

Sem a Keychain ainda dá para ver pools, preços, livro de ordens e posts.

## Instalar e rodar

```bash
git clone https://github.com/faireye-hive/HIVESWAPBEE.git
cd HIVESWAPBEE
npm install
npm run dev
```

Abre em [http://localhost:5173](http://localhost:5173).

Para gerar a pasta `dist` e servir o build local:

```bash
npm run build
npm run preview
```

O preview usa a raiz `/`. O build do GitHub Pages usa o subcaminho do repositório e é feito pelo workflow, não por esses comandos.

## Como usar

1. Instale a Hive Keychain e entre na sua conta nela.
2. No site, clique em **Connect Wallet**, digite o nome de usuário da Hive e confirme o login na extensão.
3. O saldo de HIVE e de SWAP.HIVE aparece na barra.
4. Em **Swap**, pesquise o par na lista ao lado. Os pares dos tokens que você tem ficam no topo. Depois digite o valor e confirme. Os botões 25%, 50%, 75% e Max usam o saldo. O slippage padrão é 1%.
5. Em **Trade**, escolha o token, o lado Buy ou Sell, e Limit ou Market. Clicar num preço do livro preenche a ordem limit. O preço da pool aparece no topo. Uma ordem manual também espera o bloco seguinte, para não dividir o bloco com o bot.
6. O **Pool bot**, abaixo do formulário, mostra o que faria com o livro atual antes de ligar. Take usa o lucro mínimo e o teto de SWAP.HIVE. Make usa o spread, sempre mais largo que a taxa de 0,25% da pool. Se você cancelar a assinatura, o bot pausa. Desligar não cancela as ordens que ele já colocou.
7. Em **Pools**, clique numa pool para ver a liquidez e a sua posição.
8. O botão **RPC** na barra abre a lista de nós. **Check nodes** testa cada um uma vez e mostra se respondeu, se está lento ou se caiu. A escolha fica no navegador. Nada é consultado de novo até você clicar outra vez.

Livro, saldos e pools ficam em cache por alguns segundos, e um pedido igual que ainda está no ar é aproveitado. O botão **Refresh** pede dados novos. O app não fica lendo o bloco da Hive o tempo todo: só lê quando vai enviar uma transação.

As pools negociam tokens da sidechain. HIVE da camada 1 precisa virar SWAP.HIVE antes de entrar numa pool. Use o cartão **HIVE ↔ SWAP.HIVE** na Wallet.

## Publicar no GitHub Pages

O arquivo `.github/workflows/pages.yml` publica o site a cada push na branch `main`. Também dá para disparar na mão em **Actions → Deploy GitHub Pages → Run workflow**.

Na primeira vez, no repositório:

1. **Settings → Pages → Build and deployment → Source:** escolha **GitHub Actions**.
2. Envie a branch `main`, ou rode o workflow manualmente.
3. Quando o job **deploy** ficar verde, o endereço aparece no ambiente `github-pages`. Para este repositório é [https://faireye-hive.github.io/HIVESWAPBEE/](https://faireye-hive.github.io/HIVESWAPBEE/).

O build define `VITE_BASE_PATH` com o nome do repositório, então os arquivos saem em `/HIVESWAPBEE/`. O React Router usa esse prefixo. O `public/404.html` devolve rotas diretas, inclusive símbolos com ponto como `/trade/SWAP.BTC`, para o app. Esse arquivo assume um site de projeto, com um segmento no caminho (`/<repo>/`). Um site na raiz de `*.github.io` precisaria de `pathSegmentsToKeep = 0` nesse arquivo.

## Nós e contratos

| Rede | Padrão | Uso |
| --- | --- | --- |
| Hive | `https://api.deathwing.me` | Saldo de HIVE e posts |
| Hive-Engine | `https://api.hive-engine.com/rpc` | Tokens, pools, mercado |

Se o nó principal falha, o app tenta outros nós da Hive-Engine. Operações de escrita vão para os contratos `marketpools`, `market`, `tokens` e `hivepegged`, no id `ssc-mainnet-hive`.

## Estrutura

```
src/api/         chamadas à Hive e à Hive-Engine
src/lib/         cotação do swap, cache de leitura e o plano do bot
src/pages/       Pools, Swap, Trade, Tokens, Wallet, Tribes
src/components/  formulários, navbar, modais
src/hooks/       Keychain, pools, saldos, wallet
public/          favicon e o 404 usado pelo GitHub Pages
.github/workflows/pages.yml
```

## Problemas comuns

- **A Keychain não abre.** A extensão precisa estar instalada e desbloqueada no mesmo navegador.
- **A troca não confirma.** Confira o saldo, o slippage e se o valor respeita as casas do token. Um impacto de preço acima de 30% é bloqueado.
- **O saque para HIVE falha.** O valor precisa ter no máximo 3 casas decimais e ser pelo menos 0,002.
- **A página publica abre, mas um link direto dá 404.** Confira se o Source do Pages é GitHub Actions e se o último deploy passou. O `404.html` precisa estar no artefato.
- **Dados vazios ou lentos.** Abra o botão RPC, clique em Check nodes e use um nó que respondeu rápido.
- **O bot não envia.** Ele precisa da carteira, de uma pool com SWAP.HIVE e de lucro acima do mínimo. A segunda transação no mesmo bloco é recusada de propósito. A outra perna pode ser pulada se a pool se mexer, e o token fica na conta.
- **O botão de ordem fica em espera.** Isso evita duas transações da Hive-Engine no mesmo bloco. Espere o texto voltar ao normal.

## Stack

React 18, Vite 6 e React Router 6. Preços e quantidades usam `big.js` para não perder precisão.
