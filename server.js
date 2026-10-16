// Configurações do servidor HTTP (usando o framework Express.js)
const express = require("express");

const app = express();
const PORT = 3000;

app.use(express.json());
app.set("json spaces", 2);

const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger-output.json");

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const db = require("./db");

// Formata uma data no padrão dd/mm/aaaa usado pelas tarefas.
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

// GET /tasks - "endpoint" que recupera todas as tarefas.
app.get("/tasks", (req, res) => {
  const { status, title } = req.query;
  let filteredTasks = db.listaTarefas();

  if (status !== undefined) {
    if (status !== "pendente" && status !== "concluida") {
      return res.status(400).json({
        error: "Invalid status. Use 'pendente' or 'concluida'"
      });
    }

    const completed = status === "concluida";
    filteredTasks = filteredTasks.filter(task => task.completed === completed);
  }

  if (typeof title === "string") {
    const searchTerm = title.toLowerCase();
    filteredTasks = filteredTasks.filter(task => task.title.toLowerCase().includes(searchTerm));
  }

  res.json(filteredTasks);
});

// GET /tasks/summary - retorna uma contagem atual das tarefas.
app.get("/tasks/summary", (req, res) => {
  const allTasks = db.listaTarefas();
  const completedTasks = allTasks.filter(task => task.completed).length;

  res.json({
    totalTasks: allTasks.length,
    pendingTasks: allTasks.length - completedTasks,
    completedTasks
  });
});

// GET /tasks/:id - "endpoint" que recupera uma tarefa específica pelo ID.
app.get("/tasks/:id", (req, res) => {
  const task = db.consultaPorId(Number(req.params.id));

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.json(task);
});

// PATCH /tasks/:id - "endpoint" que altera o título de uma tarefa.
app.patch("/tasks/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!db.consultaPorId(id)) {
    return res.status(404).json({ error: "Task not found" });
  }

  const { title } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }

  res.json(db.atualizaTarefa(id, { title }));
});

// DELETE /tasks/:id - "endpoint" que remove uma tarefa pendente.
app.delete("/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const task = db.consultaPorId(id);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  if (task.completed) {
    return res.status(400).json({ error: "Cannot delete a completed task" });
  }

  db.removeTarefa(id);
  res.status(200).end();
});

// PATCH /tasks/:id/reopen - "endpoint" que reabre uma tarefa concluída.
app.patch("/tasks/:id/reopen", (req, res) => {
  const id = Number(req.params.id);

  if (!db.consultaPorId(id)) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.json(db.atualizaTarefa(id, { completed: false, completionDate: null }));
});

// PATCH /tasks/:id/complete - "endpoint" que encerra uma tarefa pendente,
// registrando a data atual (dd/mm/aaaa) como data de conclusão.
app.patch("/tasks/:id/complete", (req, res) => {
  const id = Number(req.params.id);
  const task = db.consultaPorId(id);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  if (task.completed) {
    return res.status(409).json({ error: "Task already completed" });
  }

  res.json(db.atualizaTarefa(id, { completed: true, completionDate: formatDate(new Date()) }));
});

// POST /tasks - "endpoint" que cadastra uma nova tarefa.
app.post("/tasks", (req, res) => {
  const { title, date } = req.body;

  if (!title || !date) {
    return res.status(400).json({ error: "Title and date are required" });
  }

  res.status(201).json(db.cadastraTarefa({ title, date }));
});

// Start the server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}


module.exports = app;