# 💑 Nosso Bolso — Controle de gastos do casal

Plataforma web simples para o casal controlar receitas, despesas e a divisão dos gastos,
com separação entre **custos fixos** e **gastos variáveis**.

## Dois modos de uso

| | **Modo local** (padrão) | **Modo casal na nuvem** |
|---|---|---|
| Onde ficam os dados | Só no navegador deste aparelho | No Supabase (banco na nuvem, gratuito) |
| Login | Não tem | E-mail e senha, cada um com a sua conta |
| Vários aparelhos | Só via exportar/importar backup | Sim: o que um lança aparece na hora para o outro |
| Configuração | Nenhuma, basta abrir o `index.html` | Uns 10 minutos, uma única vez (passo a passo abaixo) |

Para experimentar, abra o `index.html` e vá em **Configurações → Carregar dados de exemplo**.

## Como ativar o modo casal na nuvem

### 1. Criar o banco de dados (Supabase, gratuito)

1. Crie uma conta em <https://supabase.com> e clique em **New project**.
   Dê um nome (ex.: `nosso-bolso`), defina uma senha para o banco e escolha a região
   **South America (São Paulo)**.
2. Com o projeto criado, abra **SQL Editor → New query**, cole todo o conteúdo do arquivo
   [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria as tabelas,
   as regras de segurança e a atualização em tempo real.
3. Clique em **Connect** (no topo do painel) ou vá em **Project Settings → API Keys** e copie:
   - a **Project URL** (algo como `https://abcdefghijkl.supabase.co`);
   - a chave **publishable** (`sb_publishable_...`) ou, em projetos antigos, a chave **anon**.

   ⚠️ Nunca use a chave **secret** / **service_role** no app.

### 2. Ligar o app ao banco

Edite o arquivo [`js/config.js`](js/config.js) e preencha os dois valores:

```js
window.NOSSO_BOLSO_CONFIG = {
  SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
  SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxx',
};
```

A chave publishable é feita para ficar no navegador: quem protege os dados são as regras de
segurança do banco, que só deixam cada casal ver e alterar os próprios lançamentos.

### 3. Publicar o site

Para os dois acessarem pelo celular, publique a pasta do projeto em uma hospedagem de site
estático. Opções gratuitas:

- **GitHub Pages**: no repositório, *Settings → Pages → Deploy from a branch* (no plano gratuito
  o repositório precisa ser público; os dados continuam protegidos no Supabase).
- **Netlify** ou **Cloudflare Pages**: arraste a pasta do projeto para o painel.

Depois, no Supabase, abra **Authentication → URL Configuration** e coloque o endereço do site
em **Site URL** (ex.: `https://seu-usuario.github.io/Igor/`). Assim os links de confirmação de
e-mail e de “esqueci minha senha” levam de volta ao app.

> Dica: se preferir não confirmar o e-mail no cadastro, desative **Confirm email** em
> *Authentication → Sign In / Providers → Email*.

### 4. Começar a usar

1. A primeira pessoa cria a conta e toca em **Criar nosso espaço**. Se já houver lançamentos
   salvos no modo local daquele aparelho, o app oferece levá-los para a nuvem.
2. Em **Configurações → Conta e sincronização** aparece o **código de convite** (6 letras).
3. A segunda pessoa cria a própria conta e entra com esse código.

Pronto: tudo o que um lançar aparece automaticamente na tela do outro. Cada espaço aceita
no máximo duas pessoas.

No celular, use “Adicionar à tela inicial” no navegador para abrir como se fosse um app.

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

- **Modo local**: no `localStorage` do navegador. Cada aparelho tem seus próprios dados.
- **Modo nuvem**: no banco Postgres do seu projeto Supabase, protegido por regras de segurança
  (Row Level Security). Os dados locais do aparelho não são apagados ao entrar na nuvem.

Nos dois modos dá para exportar um backup JSON e importá-lo depois.

## Estrutura

```
index.html             Estrutura da interface
css/styles.css         Estilos (tema claro/escuro, responsivo)
js/app.js              Lógica: dados, cálculos, gráficos, login e eventos
js/cloud.js            Comunicação com o Supabase (conta, dados, tempo real)
js/config.js           Endereço e chave pública do Supabase (vazio = modo local)
js/vendor/supabase.js  Biblioteca oficial supabase-js v2.117.3 (MIT)
supabase/schema.sql    Tabelas, regras de segurança e funções do banco
```
