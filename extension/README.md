# Extensão Cupom Search

É aqui que o produto deixa de "estimar" e passa a **confirmar**: no carrinho da
loja, a extensão aplica cada código conhecido, lê quanto o total caiu e devolve
o resultado para a API. O próximo usuário já vê "aplicado com sucesso no
checkout há 2 dias" em vez de um palpite.

Roda na sessão do próprio usuário — por isso não esbarra em proteção anti-bot,
que é o que inviabiliza testar cupom a partir do servidor.

## Instalar em modo desenvolvedor

1. `npm start` na raiz do projeto (a extensão fala com `http://localhost:3000`).
2. Chrome/Edge → `chrome://extensions` → ative **Modo do desenvolvedor**.
3. **Carregar sem compactação** → selecione esta pasta `extension/`.
4. Abra o carrinho de uma loja suportada. O painel aparece no canto inferior.
5. Para apontar para outro servidor, use o campo **API** no popup.

## Como ela se comporta

- **Nada roda sozinho.** O teste só começa quando a pessoa clica em "Testar N
  cupons" — a ideia é ajudar quem já está comprando, não gerar tráfego para a loja.
- **Nunca finaliza a compra.** A extensão só preenche o campo de cupom e lê o
  total. Não clica em "finalizar pedido", não mexe em pagamento.
- **Deixa aplicado o melhor código** encontrado ao fim do teste.
- Envia para a API apenas `storeId`, código, se funcionou, o desconto e o total
  do carrinho. Nada de dados pessoais, itens ou meios de pagamento.

## Sobre os seletores (leia antes de reclamar que não achou o campo)

`stores.js` tem um seletor por loja. Eles são o caminho rápido, **não** a
garantia: loja muda layout toda hora. Quando o seletor falha, `content.js` cai
numa heurística que acha o campo pelo `name`, `id`, `placeholder`, `aria-label`
ou texto do rótulo (`/cupom|coupon|voucher|desconto|promo/i`), e o botão de
aplicar pelo texto. Por isso a extensão sobrevive a um redesign.

Os seletores atuais foram escritos a partir dos padrões comuns dessas
plataformas e **precisam ser conferidos contra cada loja real** — corrigir um
seletor é editar uma linha em `stores.js`.
