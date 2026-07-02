const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "leaderboard.json");

const quizzes = [
  {
    id: "web-fundamentals",
    title: "Web Fundamentals",
    description: "HTML, CSS, JavaScript, HTTP, and accessibility essentials.",
    accent: "#0f766e",
    questions: [
      {
        id: "wf-1",
        prompt: "Which HTTP status code usually means a resource was created successfully?",
        choices: ["200", "201", "301", "404"],
        answer: 1
      },
      {
        id: "wf-2",
        prompt: "What does CSS stand for?",
        choices: ["Computer Style Sheets", "Cascading Style Sheets", "Creative Styling Syntax", "Client Side Scripts"],
        answer: 1
      },
      {
        id: "wf-3",
        prompt: "Which HTML element is best for primary page navigation?",
        choices: ["<section>", "<nav>", "<aside>", "<article>"],
        answer: 1
      },
      {
        id: "wf-4",
        prompt: "Which JavaScript method converts a JSON string into an object?",
        choices: ["JSON.read()", "JSON.parse()", "JSON.object()", "JSON.decode()"],
        answer: 1
      },
      {
        id: "wf-5",
        prompt: "What should every form input have for better accessibility?",
        choices: ["A CSS animation", "A matching label", "A placeholder only", "A hidden border"],
        answer: 1
      }
    ]
  },
  {
    id: "computer-science",
    title: "Computer Science",
    description: "Algorithms, data structures, databases, and software concepts.",
    accent: "#7c3aed",
    questions: [
      {
        id: "cs-1",
        prompt: "Which data structure is first-in, first-out?",
        choices: ["Stack", "Queue", "Heap", "Tree"],
        answer: 1
      },
      {
        id: "cs-2",
        prompt: "What is the average lookup complexity of a hash table?",
        choices: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
        answer: 0
      },
      {
        id: "cs-3",
        prompt: "Which SQL clause filters grouped records?",
        choices: ["WHERE", "HAVING", "ORDER BY", "JOIN"],
        answer: 1
      },
      {
        id: "cs-4",
        prompt: "What does API stand for?",
        choices: ["Application Programming Interface", "Automated Program Index", "Application Process Input", "Applied Protocol Integration"],
        answer: 0
      },
      {
        id: "cs-5",
        prompt: "Which sorting algorithm commonly has O(n log n) average performance?",
        choices: ["Bubble sort", "Selection sort", "Quick sort", "Linear scan"],
        answer: 2
      }
    ]
  },
  {
    id: "general-knowledge",
    title: "General Knowledge",
    description: "A fast mix of geography, science, culture, and logic.",
    accent: "#b45309",
    questions: [
      {
        id: "gk-1",
        prompt: "Which planet is known as the Red Planet?",
        choices: ["Venus", "Mars", "Jupiter", "Mercury"],
        answer: 1
      },
      {
        id: "gk-2",
        prompt: "What is the largest ocean on Earth?",
        choices: ["Atlantic", "Indian", "Pacific", "Arctic"],
        answer: 2
      },
      {
        id: "gk-3",
        prompt: "Which gas do plants absorb during photosynthesis?",
        choices: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"],
        answer: 2
      },
      {
        id: "gk-4",
        prompt: "How many sides does a hexagon have?",
        choices: ["Five", "Six", "Seven", "Eight"],
        answer: 1
      },
      {
        id: "gk-5",
        prompt: "Which instrument is used to measure temperature?",
        choices: ["Barometer", "Thermometer", "Hygrometer", "Altimeter"],
        answer: 1
      }
    ]
  }
];

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ entries: [] }, null, 2));
  }
}

function readLeaderboard() {
  ensureDataFile();
  try {
    const payload = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(payload.entries) ? payload.entries : [];
  } catch {
    return [];
  }
}

function writeLeaderboard(entries) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify({ entries }, null, 2));
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function publicQuiz(quiz) {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    accent: quiz.accent,
    questionCount: quiz.questions.length,
    questions: quiz.questions.map(({ answer, ...question }) => question)
  };
}

function rankedEntries(entries, quizId = "all") {
  return entries
    .filter((entry) => quizId === "all" || entry.quizId === quizId)
    .sort((a, b) => b.score - a.score || a.timeTaken - b.timeTaken || new Date(a.submittedAt) - new Date(b.submittedAt))
    .slice(0, 25)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function scoreAttempt(quiz, answers) {
  const normalized = Array.isArray(answers) ? answers : [];
  const correct = quiz.questions.reduce((total, question, index) => {
    return total + (Number(normalized[index]) === question.answer ? 1 : 0);
  }, 0);

  return {
    correct,
    total: quiz.questions.length,
    score: Math.round((correct / quiz.questions.length) * 100)
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/quizzes") {
    sendJson(res, 200, { quizzes: quizzes.map(publicQuiz) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/leaderboard") {
    const quizId = url.searchParams.get("quizId") || "all";
    sendJson(res, 200, { entries: rankedEntries(readLeaderboard(), quizId) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/attempts") {
    try {
      const body = JSON.parse(await getRequestBody(req));
      const quiz = quizzes.find((item) => item.id === body.quizId);

      if (!quiz) {
        sendJson(res, 404, { error: "Quiz not found" });
        return;
      }

      const playerName = String(body.playerName || "").trim().slice(0, 32);
      if (playerName.length < 2) {
        sendJson(res, 400, { error: "Enter a player name with at least 2 characters." });
        return;
      }

      const result = scoreAttempt(quiz, body.answers);
      const entry = {
        id: crypto.randomUUID(),
        playerName,
        quizId: quiz.id,
        quizTitle: quiz.title,
        correct: result.correct,
        total: result.total,
        score: result.score,
        timeTaken: Math.max(1, Math.min(3600, Number(body.timeTaken) || 1)),
        submittedAt: new Date().toISOString()
      };

      const entries = readLeaderboard();
      entries.push(entry);
      writeLeaderboard(entries.slice(-500));

      sendJson(res, 201, {
        result: entry,
        leaderboard: rankedEntries(entries, quiz.id)
      });
    } catch {
      sendJson(res, 400, { error: "Invalid attempt payload" });
    }
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallbackContent);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml; charset=utf-8"
    };

    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  ensureDataFile();
  console.log(`Quiz platform running at http://localhost:${PORT}`);
});
