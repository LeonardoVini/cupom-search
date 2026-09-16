# Cupom Search

Cole o link de um produto (ex.: uma mesa na Pichau) e receba os cupons conhecidos
para aquela loja, **filtrados pelas regras que se aplicam àquele produto** e
ordenados por economia estimada e confiança.

```
Mesa Gamer Pichau Kaiju 140cm Preta
Pichau · R$ 1.299,90 · moveis, mesas

✅ DEMO-PERIFERICOS10     64%  -R$ 129,99  → R$ 1.169,91
   + Produto atinge o mínimo de R$ 300,00.
   + Categoria compatível (moveis, escritorio, informatica).
❌ DEMO-HARDWARE15         9%
   - Restrito a placa de video e o produto não parece se encaixar.
```

## É possível? Sim — com um porém importante

Tudo que é mecânico funciona bem: identificar a loja pelo link, ler nome, preço e
categoria da página (a maioria das lojas publica isso em JSON-LD, o mesmo dado que
o Google usa), reunir cupons e cruzar com as regras de cada um.

O difícil não é *achar* cupom, é **garantir que ele está ativo**. Cupom não tem API
pública de validação: só o checkout da loja sabe. Existem três caminhos, e cada um
tem um preço:

| Caminho | Como funciona | Custo |
| --- | --- | --- |
| **Feed de afiliados** (Awin, Lomadee, Rakuten, Admitad) | a própria loja publica código, validade e regras | legítimo e confiável, mas só pega cupom oficial e exige cadastro como afiliado |
| **Comunidade** | usuário relata "funcionou / não funcionou" | barato e honesto, mas precisa de tráfego para o sinal existir |
| **Teste automático no checkout** | um robô aplica o código no carrinho | é o que dá certeza — e é o que trava: proteção anti-bot (Cloudflare), ToS da loja e custo de infra |

A saída que Honey, Cuponomia e Méliuz usam para o terceiro caminho é uma
**extensão de navegador**: o teste roda dentro da sessão do próprio usuário, no
carrinho real dele. Sem bot, sem bloqueio, e ainda descobre o desconto exato.
É o caminho que este projeto deixa preparado (`checkoutCouponField` no catálogo
de lojas), não o que o MVP faz.

Por isso o produto aqui **não promete "cupom ativo"** — ele mostra uma confiança
explicada. Prometer certeza que não se tem é o jeito mais rápido de perder o
usuário na segunda tentativa frustrada.

### Sobre scraping de sites de cupom

Raspar Cuponomia/Pelando/Promobit é tecnicamente trivial e juridicamente ruim:
viola os termos de uso deles, e os dados vêm sujos (muito cupom vencido). O
provider de afiliado (`src/core/providers/affiliate.ts`) é o caminho recomendado e
já está implementado — basta configurar as credenciais.

### O modelo de negócio não é assinatura

Vale dizer em voz alta: cobrar do usuário final por lista de cupom não costuma
funcionar, porque a informação é gratuita em cinco sites concorrentes. Quem ganha
dinheiro nesse mercado ganha **comissão de afiliado** — o usuário clica no seu link,
compra, a loja te paga. Isso muda o produto: o link de saída importa mais que a
busca, e o cadastro nas redes de afiliados é pré-requisito, não detalhe.

Um nicho defensável costuma render mais que competir de frente com o Méliuz. Por
exemplo: hardware/setup (Pichau, KaBuM!, Terabyte), onde o público pesquisa muito
antes de comprar e o ticket é alto.

## Como rodar

Requer Node 22.18+ (o projeto roda TypeScript direto, sem build e sem dependência
em produção).

```bash
npm install     # só as dev deps (typescript)
npm start       # http://localhost:3000
npm test        # 36 testes
node scripts/demo.ts   # demonstração offline, sem rede
```

A instalação já vem com **dados de demonstração** (`data/coupons.seed.json`).
Os códigos marcados como `demo` não são cupons reais — existem para exercitar o
motor de regras. Para dados reais, configure um provider de afiliado:

```bash
AWIN_API_TOKEN=... AWIN_PUBLISHER_ID=... npm start
```

## API

| Método | Rota | O que faz |
| --- | --- | --- |
| `POST` | `/api/search` | `{ "url": "..." }` → produto + cupons ranqueados |
| `GET` | `/api/stores` | lojas suportadas |
| `POST` | `/api/coupons` | envio de cupom pela comunidade |
| `POST` | `/api/feedback` | `{ "couponId": "...", "worked": true }` |
| `GET` | `/healthz` | healthcheck |

## Arquitetura

```
link → identifica a loja → lê a página → reúne cupons → cruza regras → ranqueia
       stores.ts           product.ts    providers/     matching.ts
```

- **`core/stores.ts`** — catálogo de lojas por domínio.
- **`core/fetcher.ts`** — HTTP com timeout, limite de tamanho e bloqueio de
  endereços internos (o usuário cola a URL, então SSRF é risco real).
- **`core/product.ts`** — extrai nome/preço/categoria via JSON-LD → Open Graph →
  heurística, nessa ordem de confiança.
- **`core/providers/`** — fontes de cupom (afiliado, comunidade, seed de demo),
  consultadas em paralelo e deduplicadas pela fonte mais confiável.
- **`core/matching.ts`** — o coração: separa **bloqueio** (valor mínimo não
  atingido, categoria errada, vencido) de **ressalva** (só no app, primeira
  compra, preço não lido) e calcula a confiança com frescor da fonte
  (decaimento exponencial), peso da fonte e limite inferior de Wilson sobre os
  votos da comunidade — para 1 voto positivo não virar "100% garantido".
- **`db/store.ts`** — persistência em JSON; trocar por Postgres é substituir esta
  classe.

## Roadmap

1. **Extensão de navegador** — testa os códigos no checkout do próprio usuário.
   É o diferencial real e o que transforma "confiança estimada" em "desconto
   confirmado de R$ X".
2. **Cadastro nas redes de afiliados** — receita e cupons oficiais no mesmo passo.
3. **Cache + fila de revalidação** — não bater na loja a cada busca.
4. **Alerta de preço** — retém usuário entre compras, que é o problema de todo
   site de cupom.

## Limitações conhecidas

- Lojas com proteção anti-bot (Cloudflare) podem recusar a leitura da página; o
  app degrada para "cupons gerais da loja" em vez de falhar.
- A extração de categoria é heurística; cupons com regras muito específicas podem
  ser classificados como incertos.
- Sem provider de afiliado configurado, os únicos cupons são os de demonstração e
  os enviados pela comunidade.
