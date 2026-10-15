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

function isValidDueDate(date) {
  if (typeof date !== "string" || date.length !== 10) {
    return false;
  }

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (year === 0 || month < 1 || month > 12) {
    return false;
  }

  const isLeapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ][month - 1];

  return day >= 1 && day <= daysInMonth;
}

// POST /tasks - "endpoint" que cadastra uma nova tarefa.
app.post("/tasks", (req, res) => {
  const { title, date } = req.body;

  if (!title || !date) {
    return res.status(400).json({ error: "Title and date are required" });
  }

  if (!isValidDueDate(date)) {
    return res.status(400).json({
      error: "Date must be a valid date in dd/mm/yyyy format"
    });
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