# planner

## Consultar tarefas por situação

Use o parâmetro `status` em `GET /tasks` para filtrar as tarefas:

- `GET /tasks?status=pendente` retorna somente tarefas pendentes.
- `GET /tasks?status=concluida` retorna somente tarefas concluídas.
- `GET /tasks` retorna todas as tarefas.

Valores de `status` diferentes de `pendente` e `concluida` retornam `400 Bad Request`.

## Remover tarefas concluídas

Use `DELETE /tasks/completed` para remover todas as tarefas concluídas de uma só vez. A resposta informa a quantidade removida:

```json
{
  "removedCount": 3
}
```

As tarefas pendentes permanecem disponíveis.

## Buscar tarefas pelo título

Use o parâmetro `title` em `GET /tasks` para retornar as tarefas cujo título contém o termo informado, sem diferenciar maiúsculas e minúsculas. Os parâmetros podem ser combinados:

- `GET /tasks?title=artigo` retorna as tarefas com "artigo" no título.
- `GET /tasks?status=pendente&title=artigo` retorna apenas as pendentes com "artigo" no título.


## Organização do código

- `db.js` guarda as tarefas em memória e oferece apenas operações genéricas: `listaTarefas`, `consultaPorId`, `cadastraTarefa`, `atualizaTarefa` e `removeTarefa`.
- `server.js` define as rotas da API. Regras de negócio (filtros, validações, ordenações) devem ficar aqui, usando as operações do `db.js`.
- O `db.js` já vem com algumas tarefas cadastradas (pendentes, concluídas, atrasadas e com datas em meses e anos diferentes) para explorar a API manualmente, por exemplo pelo Swagger em `/api-docs`. Os testes não devem depender delas: cada teste deve criar as tarefas de que precisa.
