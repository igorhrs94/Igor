# 💑 Nosso Bolso — Controle de gastos do casal

Plataforma web simples para o casal controlar receitas, despesas e a divisão dos gastos,
com separação entre **custos fixos** e **gastos variáveis**.

## Como usar

Abra o arquivo `index.html` no navegador (computador ou celular). Não precisa instalar nada.
Para experimentar, vá em **Configurações → Carregar dados de exemplo**.

Para usar no celular e no computador com a mesma URL, publique a pasta em qualquer
hospedagem estática (ex.: GitHub Pages: *Settings → Pages → Deploy from branch*).

## Funcionalidades

- **Painel do mês**: receitas, despesas, saldo e quanto do orçamento já foi usado.
- **Custos fixos × gastos variáveis**: quanto cada grupo pesa nas despesas e na renda.
- **Despesas por categoria** (gráfico de rosca) e **evolução dos últimos 6 meses**.
- **Acerto de contas**: mostra quem pagou o quê, a parte justa de cada um e quem deve
  quanto para quem. Um clique registra o acerto.
- **Divisão das despesas compartilhadas**: meio a meio, proporcional à renda ou percentual
  personalizado. Cada despesa pode ser do casal ou de só uma pessoa.
- **Lançamentos** com busca e filtros (tipo, fixo/variável, categoria, pessoa), agrupados por dia.
- **Copiar custos fixos do mês anterior** com um clique.
- **Orçamento por categoria**, com alerta em 80% e ao ultrapassar o limite.
- **Categorias personalizáveis** (ícone, cor, tipo e limite mensal).
- **Backup** em JSON (exportar/importar) e exportação em **CSV** compatível com Excel.
- Tema claro/escuro automático e layout adaptado ao celular.

## Onde ficam os dados

Tudo é salvo no `localStorage` do navegador, sem servidor. Cada aparelho tem seus próprios
dados — use exportar/importar backup para transferir entre aparelhos.

## Estrutura

```
index.html       Estrutura da interface
css/styles.css   Estilos (tema claro/escuro, responsivo)
js/app.js        Lógica: dados, cálculos, gráficos e eventos
```
