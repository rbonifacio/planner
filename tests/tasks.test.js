const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../server");
const db = require("../db");

const NON_EXISTENT_ID = Number.MAX_SAFE_INTEGER;

async function createTask(title = "Tarefa de teste", date = "14/10/2026") {
  const response = await request(app).post("/tasks").send({
    title,
    date
  });

  assert.equal(response.status, 201);
  return response.body;
}

async function assertInvalidDateIsRejected(date) {
  const before = await request(app).get("/tasks");
  const response = await request(app).post("/tasks").send({
    title: "Tarefa com data inválida",
    date
  });
  const after = await request(app).get("/tasks");

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Date must be a valid date in dd/mm/yyyy format"
  });
  assert.deepEqual(
    after.body.map(({ id }) => id),
    before.body.map(({ id }) => id)
  );
}

// Enquanto não existe uma rota para concluir tarefas (issues #2 e #11),
// os testes marcam a tarefa como concluída diretamente no banco de dados.
function markTaskCompleted(task) {
  db.atualizaTarefa(task.id, { completed: true, completionDate: "13/10/2026" });
}

test("GET /tasks returns all tasks", async () => {
  const task = await createTask("Tarefa listada");
  const response = await request(app).get("/tasks");

  assert.equal(response.status, 200);
  assert.ok(response.body.some(({ id }) => id === task.id));
});

test("GET /tasks/:id returns a specific task", async () => {
  const task = await createTask("Tarefa específica");
  const response = await request(app).get(`/tasks/${task.id}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.id, task.id);
  assert.equal(response.body.title, task.title);
});

test("GET /tasks/:id returns 404 for non-existent task", async () => {
  const response = await request(app).get(`/tasks/${NON_EXISTENT_ID}`);

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Task not found" });
});

test("GET /tasks/summary returns live task counts", async () => {
  const before = await request(app).get("/tasks/summary");
  await createTask("Tarefa pendente para o resumo");
  const after = await request(app).get("/tasks/summary");

  assert.equal(before.status, 200);
  assert.deepEqual(Object.keys(before.body).sort(), [
    "completedTasks",
    "pendingTasks",
    "totalTasks"
  ]);
  for (const count of Object.values(before.body)) {
    assert.equal(Number.isInteger(count), true);
  }
  assert.equal(after.status, 200);
  assert.equal(after.body.totalTasks, before.body.totalTasks + 1);
  assert.equal(after.body.pendingTasks, before.body.pendingTasks + 1);
  assert.equal(after.body.completedTasks, before.body.completedTasks);
});

test("GET /tasks filters titles without case sensitivity", async () => {
  const task = await createTask("Prepare the MixedCaseSearchProbe report");
  const response = await request(app).get("/tasks?title=mIXeDcAsEsEaRcHpRoBe");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.map(({ id }) => id), [task.id]);
});

test("GET /tasks returns an empty list when no title matches", async () => {
  const response = await request(app).get("/tasks?title=NoTaskHasThisUniqueTitleTerm");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test("GET /tasks?status=pendente returns only pending tasks", async () => {
  const pendingTask = await createTask("Tarefa pendente para filtro");
  const completedTask = await createTask("Tarefa concluída para filtro");
  markTaskCompleted(completedTask);

  const response = await request(app).get("/tasks?status=pendente");

  assert.equal(response.status, 200);
  assert.ok(response.body.some(({ id }) => id === pendingTask.id));
  assert.ok(!response.body.some(({ id }) => id === completedTask.id));
  assert.ok(response.body.every(task => task.completed === false));
});

test("GET /tasks?status=concluida returns only completed tasks", async () => {
  const pendingTask = await createTask("Tarefa pendente para filtro de concluídas");
  const completedTask = await createTask("Tarefa concluída para filtro de concluídas");
  markTaskCompleted(completedTask);

  const response = await request(app).get("/tasks?status=concluida");

  assert.equal(response.status, 200);
  assert.ok(response.body.some(({ id }) => id === completedTask.id));
  assert.ok(!response.body.some(({ id }) => id === pendingTask.id));
  assert.ok(response.body.every(task => task.completed === true));
});

test("GET /tasks returns tasks in every status when no status is provided", async () => {
  const pendingTask = await createTask("Tarefa pendente sem filtro");
  const completedTask = await createTask("Tarefa concluída sem filtro");
  markTaskCompleted(completedTask);

  const response = await request(app).get("/tasks");

  assert.equal(response.status, 200);
  assert.ok(response.body.some(({ id }) => id === pendingTask.id));
  assert.ok(response.body.some(({ id }) => id === completedTask.id));
});

test("GET /tasks returns 400 for an unsupported status", async () => {
  const response = await request(app).get("/tasks?status=em-andamento");

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Invalid status. Use 'pendente' or 'concluida'"
  });
});

test("GET /tasks combines status and title filters", async () => {
  await createTask("Relatório CombinedFilterProbe pendente");
  const completedTask = await createTask("Relatório CombinedFilterProbe concluído");
  markTaskCompleted(completedTask);

  const response = await request(app).get("/tasks?status=concluida&title=combinedfilterprobe");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.map(({ id }) => id), [completedTask.id]);
});

test("POST /tasks creates a new task", async () => {
  const newTask = {
    title: "Elaborar os projetos de desenvolvimento da turma.",
    date: "14/10/2026"
  };

  const response = await request(app).post("/tasks").send(newTask);

  assert.equal(response.status, 201);
  assert.equal(response.body.title, newTask.title);
  assert.equal(response.body.completed, false);
  assert.equal(response.body.date, newTask.date);
  assert.equal(response.body.completionDate, null);
});

test("POST /tasks accepts valid dates and preserves task behavior", async () => {
  for (const date of ["20/10/2026", "29/02/2024"]) {
    const task = await createTask(`Tarefa para ${date}`, date);

    assert.equal(task.title, `Tarefa para ${date}`);
    assert.equal(task.completed, false);
    assert.equal(task.date, date);
    assert.equal(task.completionDate, null);
  }
});

test("POST /tasks rejects dates that do not match dd/mm/yyyy", async () => {
  for (const date of [
    "2026-10-20",
    "1/10/2026",
    "20/1/2026",
    "20-10-2026",
    "20/10/26",
    "20/10/2026 ",
    "20/10/2026\n",
    20102026
  ]) {
    await assertInvalidDateIsRejected(date);
  }
});

test("POST /tasks rejects dates that do not exist", async () => {
  for (const date of [
    "31/02/2026",
    "15/13/2026",
    "00/10/2026",
    "32/01/2026",
    "15/00/2026",
    "29/02/2025",
    "31/04/2026"
  ]) {
    await assertInvalidDateIsRejected(date);
  }
});

test("DELETE /tasks/:id removes an existing task", async () => {
  const task = await createTask();
  const response = await request(app).delete(`/tasks/${task.id}`);

  assert.equal(response.status, 200);

  const deletedTask = await request(app).get(`/tasks/${task.id}`);
  assert.equal(deletedTask.status, 404);
  assert.deepEqual(deletedTask.body, { error: "Task not found" });
});

test("DELETE /tasks/:id does not remove a completed task", async () => {
  const task = await createTask();
  markTaskCompleted(task);
  const response = await request(app).delete(`/tasks/${task.id}`);

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Cannot delete a completed task" });

  const completedTask = await request(app).get(`/tasks/${task.id}`);
  assert.equal(completedTask.status, 200);
  assert.equal(completedTask.body.completed, true);
  assert.equal(completedTask.body.completionDate, "13/10/2026");
});

test("DELETE /tasks/:id returns 404 for a non-existent task", async () => {
  const response = await request(app).delete(`/tasks/${NON_EXISTENT_ID}`);

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Task not found" });
});

test("PATCH /tasks/:id/reopen reopens a completed task", async () => {
  const task = await createTask();
  markTaskCompleted(task);

  const response = await request(app).patch(`/tasks/${task.id}/reopen`);

  assert.equal(response.status, 200);
  assert.equal(response.body.id, task.id);
  assert.equal(response.body.completed, false);
  assert.equal(response.body.completionDate, null);

  const reopenedTask = await request(app).get(`/tasks/${task.id}`);
  assert.equal(reopenedTask.body.completed, false);
  assert.equal(reopenedTask.body.completionDate, null);
});

test("PATCH /tasks/:id/reopen returns 404 for a non-existent task", async () => {
  const response = await request(app).patch(`/tasks/${NON_EXISTENT_ID}/reopen`);

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Task not found" });
});

test("PATCH /tasks/:id updates a task title", async () => {
  const task = await createTask("Revisar o artigo");
  const response = await request(app)
    .patch(`/tasks/${task.id}`)
    .send({ title: "Revisar o artigo atualizado" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ...task, title: "Revisar o artigo atualizado" });

  const updatedTask = await request(app).get(`/tasks/${task.id}`);
  assert.equal(updatedTask.body.title, "Revisar o artigo atualizado");
});

test("PATCH /tasks/:id returns 400 for a missing or blank title", async () => {
  const task = await createTask("Título que não deve mudar");

  for (const body of [{}, { title: "" }, { title: "   " }, { title: 42 }]) {
    const response = await request(app).patch(`/tasks/${task.id}`).send(body);

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "Title is required" });
  }

  const unchangedTask = await request(app).get(`/tasks/${task.id}`);
  assert.equal(unchangedTask.body.title, "Título que não deve mudar");
});

test("PATCH /tasks/:id returns 400 when no body is sent", async () => {
  const task = await createTask();
  const response = await request(app).patch(`/tasks/${task.id}`);

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Title is required" });
});

test("PATCH /tasks/:id returns 404 for non-existent task", async () => {
  const response = await request(app)
    .patch(`/tasks/${NON_EXISTENT_ID}`)
    .send({ title: "Título atualizado" });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Task not found" });
});
