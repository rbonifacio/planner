const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../server");
const db = require("../db");

const NON_EXISTENT_ID = Number.MAX_SAFE_INTEGER;

async function createTask(title = "Tarefa de teste") {
  const response = await request(app).post("/tasks").send({
    title,
    date: "14/10/2026"
  });

  assert.equal(response.status, 201);
  return response.body;
}

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

test("DELETE /tasks/completed removes completed tasks", async () => {
  const completedTask = await createTask("Tarefa concluída removida em lote");
  const anotherCompletedTask = await createTask("Outra tarefa concluída removida em lote");
  markTaskCompleted(completedTask);
  markTaskCompleted(anotherCompletedTask);

  const response = await request(app).delete("/tasks/completed");

  assert.equal(response.status, 200);
  assert.ok(response.body.removedCount >= 2);

  for (const task of [completedTask, anotherCompletedTask]) {
    const deletedTask = await request(app).get(`/tasks/${task.id}`);
    assert.equal(deletedTask.status, 404);
  }
});

test("DELETE /tasks/completed returns zero when there are no completed tasks", async () => {
  await request(app).delete("/tasks/completed");
  const pendingTask = await createTask("Tarefa pendente sem concluídas");

  const response = await request(app).delete("/tasks/completed");
  const pendingAfter = await request(app).get(`/tasks/${pendingTask.id}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { removedCount: 0 });
  assert.equal(pendingAfter.status, 200);
  assert.equal(pendingAfter.body.completed, false);
});

test("DELETE /tasks/completed preserves pending tasks", async () => {
  const pendingTask = await createTask("Tarefa pendente preservada pela limpeza");
  const completedTask = await createTask("Tarefa concluída removida pela limpeza");
  markTaskCompleted(completedTask);

  const response = await request(app).delete("/tasks/completed");
  const pendingAfter = await request(app).get(`/tasks/${pendingTask.id}`);
  const completedAfter = await request(app).get(`/tasks/${completedTask.id}`);

  assert.equal(response.status, 200);
  assert.equal(pendingAfter.status, 200);
  assert.deepEqual(pendingAfter.body, pendingTask);
  assert.equal(completedAfter.status, 404);
});

test("DELETE /tasks/completed reports the exact number of removed tasks", async () => {
  const completedTasks = await Promise.all([
    createTask("Tarefa concluída para contagem 1"),
    createTask("Tarefa concluída para contagem 2"),
    createTask("Tarefa concluída para contagem 3")
  ]);
  completedTasks.forEach(markTaskCompleted);

  const completedBefore = await request(app).get("/tasks?status=concluida");
  const response = await request(app).delete("/tasks/completed");

  assert.equal(response.status, 200);
  assert.equal(response.body.removedCount, completedBefore.body.length);
  assert.ok(completedBefore.body.length >= completedTasks.length);
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
