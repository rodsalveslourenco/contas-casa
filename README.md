# Contas da Casa

Sistema para controle mensal de contas domésticas com backend Node.js e banco PostgreSQL.

## Recursos

- Cadastro de receita mensal.
- Cadastro de contas com vencimento, valor, modalidade e pessoa responsável.
- Abatimento parcial ou total das contas.
- Registro de gastos diários.
- Resumo de sobra de receita e diferença do mês.
- Gráficos por mês, modalidade e pessoa.
- Exportação CSV e JSON, com importação de backup.
- Persistência em banco PostgreSQL no Render.

## Como abrir localmente

Instale as dependências e rode o servidor:

```bash
npm install
npm start
```

Depois acesse:

```text
http://127.0.0.1:3000
```

Sem `DATABASE_URL`, o servidor usa um arquivo local em `data/state.json`. No Render, o `render.yaml` cria o banco PostgreSQL e injeta a variável automaticamente.

## Deploy no Render

O arquivo `render.yaml` configura um Web Service Node.js e um PostgreSQL vinculados por `DATABASE_URL`.
