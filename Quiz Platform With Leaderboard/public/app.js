const state = {
  quizzes: [],
  activeQuiz: null,
  currentQuestion: 0,
  answers: [],
  startedAt: null,
  timerId: null,
  playerName: localStorage.getItem("quizforge-player") || ""
};

const dom = {
  quizList: document.querySelector("#quiz-list"),
  quizCount: document.querySelector("#quiz-count"),
  playerForm: document.querySelector("#player-form"),
  playerName: document.querySelector("#player-name"),
  activeKicker: document.querySelector("#active-kicker"),
  activeTitle: document.querySelector("#active-title"),
  questionPanel: document.querySelector("#question-panel"),
  progressBar: document.querySelector("#progress-bar"),
  timerValue: document.querySelector("#timer-value"),
  leaderboardFilter: document.querySelector("#leaderboard-filter"),
  leaderboard: document.querySelector("#leaderboard")
};

const choiceLabels = ["A", "B", "C", "D"];

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 220);
  }, 2600);
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setTimerRunning(isRunning) {
  clearInterval(state.timerId);
  if (!isRunning) return;

  state.timerId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    dom.timerValue.textContent = formatTime(elapsed);
  }, 250);
}

function renderQuizzes() {
  dom.quizCount.textContent = String(state.quizzes.length);
  dom.quizList.innerHTML = state.quizzes.map((quiz) => `
    <button class="quiz-card ${state.activeQuiz?.id === quiz.id ? "active" : ""}" style="--accent:${quiz.accent}" data-quiz-id="${quiz.id}">
      <strong>${quiz.title}</strong>
      <span>${quiz.description}</span>
    </button>
  `).join("");

  dom.leaderboardFilter.innerHTML = `
    <option value="all">All quizzes</option>
    ${state.quizzes.map((quiz) => `<option value="${quiz.id}">${quiz.title}</option>`).join("")}
  `;
}

function startQuiz(quizId) {
  state.activeQuiz = state.quizzes.find((quiz) => quiz.id === quizId);
  state.currentQuestion = 0;
  state.answers = Array(state.activeQuiz.questions.length).fill(null);
  state.startedAt = Date.now();
  document.documentElement.style.setProperty("--active-accent", state.activeQuiz.accent);
  dom.activeKicker.textContent = `${state.activeQuiz.questionCount} questions`;
  dom.activeTitle.textContent = state.activeQuiz.title;
  dom.timerValue.textContent = "00:00";
  setTimerRunning(true);
  renderQuizzes();
  renderQuestion();
}

function renderQuestion() {
  const quiz = state.activeQuiz;
  const question = quiz.questions[state.currentQuestion];
  const answered = state.answers.filter((answer) => answer !== null).length;
  dom.progressBar.style.width = `${(answered / quiz.questions.length) * 100}%`;

  dom.questionPanel.innerHTML = `
    <div class="question-meta">
      <span>Question ${state.currentQuestion + 1} of ${quiz.questions.length}</span>
      <span>${answered}/${quiz.questions.length} answered</span>
    </div>
    <h3 class="question-title">${question.prompt}</h3>
    <div class="choice-grid">
      ${question.choices.map((choice, index) => `
        <button class="choice-button ${state.answers[state.currentQuestion] === index ? "selected" : ""}" data-choice="${index}">
          <span class="choice-index">${choiceLabels[index]}</span>
          <span>${choice}</span>
        </button>
      `).join("")}
    </div>
    <div class="nav-row">
      <button id="prev-question" ${state.currentQuestion === 0 ? "disabled" : ""}>Previous</button>
      <button id="next-question" ${state.currentQuestion === quiz.questions.length - 1 ? "disabled" : ""}>Next</button>
    </div>
    <div class="submit-row">
      <span>${quiz.questions.length - answered} remaining</span>
      <button id="submit-attempt" ${answered !== quiz.questions.length ? "disabled" : ""}>Submit Attempt</button>
    </div>
  `;
}

async function submitAttempt() {
  if (!state.playerName) {
    toast("Set your player name first.");
    dom.playerName.focus();
    return;
  }

  const timeTaken = Math.max(1, Math.floor((Date.now() - state.startedAt) / 1000));
  const data = await api("/api/attempts", {
    method: "POST",
    body: JSON.stringify({
      playerName: state.playerName,
      quizId: state.activeQuiz.id,
      answers: state.answers,
      timeTaken
    })
  });

  setTimerRunning(false);
  dom.progressBar.style.width = "100%";
  renderResult(data.result);
  await loadLeaderboard(state.activeQuiz.id);
  dom.leaderboardFilter.value = state.activeQuiz.id;
}

function renderResult(result) {
  dom.activeKicker.textContent = "Attempt submitted";
  dom.activeTitle.textContent = `${result.playerName}, you scored ${result.correct}/${result.total}`;
  dom.questionPanel.innerHTML = `
    <div class="result-card">
      <div class="score-ring">
        <div>
          <strong>${result.score}%</strong>
          <span>${formatTime(result.timeTaken)}</span>
        </div>
      </div>
      <button class="restart-button" id="restart-quiz">Try Again</button>
    </div>
  `;
}

async function loadLeaderboard(quizId = dom.leaderboardFilter.value || "all") {
  const data = await api(`/api/leaderboard?quizId=${encodeURIComponent(quizId)}`);

  if (!data.entries.length) {
    dom.leaderboard.innerHTML = `<div class="leader-row"><div class="rank">-</div><div class="leader-main"><strong>No attempts yet</strong><span>Be the first to submit</span></div><div class="leader-score"><strong>0</strong><span>pts</span></div></div>`;
    return;
  }

  dom.leaderboard.innerHTML = data.entries.map((entry) => `
    <div class="leader-row">
      <div class="rank">${entry.rank}</div>
      <div class="leader-main">
        <strong>${entry.playerName}</strong>
        <span>${entry.quizTitle} · ${entry.correct}/${entry.total} · ${formatTime(entry.timeTaken)}</span>
      </div>
      <div class="leader-score">
        <strong>${entry.score}</strong>
        <span>pts</span>
      </div>
    </div>
  `).join("");
}

dom.quizList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-quiz-id]");
  if (card) startQuiz(card.dataset.quizId);
});

dom.questionPanel.addEventListener("click", async (event) => {
  const choice = event.target.closest("[data-choice]");
  if (choice) {
    state.answers[state.currentQuestion] = Number(choice.dataset.choice);
    renderQuestion();
    return;
  }

  if (event.target.id === "prev-question") {
    state.currentQuestion -= 1;
    renderQuestion();
    return;
  }

  if (event.target.id === "next-question") {
    state.currentQuestion += 1;
    renderQuestion();
    return;
  }

  if (event.target.id === "submit-attempt") {
    try {
      await submitAttempt();
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  if (event.target.id === "restart-quiz") {
    startQuiz(state.activeQuiz.id);
  }
});

dom.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = dom.playerName.value.trim();
  if (name.length < 2) {
    toast("Use at least 2 characters.");
    return;
  }
  state.playerName = name;
  localStorage.setItem("quizforge-player", name);
  toast(`Player set to ${name}`);
});

dom.leaderboardFilter.addEventListener("change", () => {
  loadLeaderboard(dom.leaderboardFilter.value).catch((error) => toast(error.message));
});

async function init() {
  dom.playerName.value = state.playerName;
  const data = await api("/api/quizzes");
  state.quizzes = data.quizzes;
  renderQuizzes();
  await loadLeaderboard("all");
}

init().catch((error) => {
  dom.questionPanel.innerHTML = `<div class="empty-state"><p>${error.message}</p></div>`;
});
