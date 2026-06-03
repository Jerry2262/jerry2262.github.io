const levels = {
  easy: { rows: 9, columns: 9, mines: 10, cellSize: 42, cellFont: 20 },
  medium: { rows: 16, columns: 16, mines: 40, cellSize: 34, cellFont: 17 },
  hard: { rows: 16, columns: 30, mines: 99, cellSize: 30, cellFont: 15 },
};

const boardElement = document.querySelector("#board");
const mineCountElement = document.querySelector("#mineCount");
const timerElement = document.querySelector("#timer");
const newGameButton = document.querySelector("#newGameButton");
const levelButtons = document.querySelectorAll("[data-level]");
const modeButton = document.querySelector("#modeButton");
const message = document.querySelector("#gameMessage");
const messageTitle = document.querySelector("#messageTitle");
const messageButton = document.querySelector("#messageButton");

let levelName = "easy";
let config = levels[levelName];
let cells = [];
let started = false;
let gameOver = false;
let flagMode = false;
let flags = 0;
let opened = 0;
let seconds = 0;
let timerId = null;

function createCells() {
  return Array.from({ length: config.rows }, (_, row) =>
    Array.from({ length: config.columns }, (_, column) => ({
      row,
      column,
      isMine: false,
      isOpen: false,
      isFlagged: false,
      adjacent: 0,
    })),
  );
}

function startGame() {
  cells = createCells();
  started = false;
  gameOver = false;
  flags = 0;
  opened = 0;
  seconds = 0;
  stopTimer();
  hideMessage();
  updateStatus();
  render();
}

function startTimer() {
  if (timerId) {
    return;
  }

  timerId = window.setInterval(() => {
    seconds += 1;
    timerElement.textContent = formatSeconds(seconds);
  }, 1000);
}

function stopTimer() {
  window.clearInterval(timerId);
  timerId = null;
}

function formatSeconds(value) {
  return String(Math.min(value, 999)).padStart(3, "0");
}

function placeMines(safeRow, safeColumn) {
  const forbidden = new Set();

  for (let row = safeRow - 1; row <= safeRow + 1; row += 1) {
    for (let column = safeColumn - 1; column <= safeColumn + 1; column += 1) {
      if (isInside(row, column)) {
        forbidden.add(cellKey(row, column));
      }
    }
  }

  const candidates = [];

  cells.flat().forEach((cell) => {
    if (!forbidden.has(cellKey(cell.row, cell.column))) {
      candidates.push(cell);
    }
  });

  shuffle(candidates)
    .slice(0, config.mines)
    .forEach((cell) => {
      cell.isMine = true;
    });

  cells.flat().forEach((cell) => {
    cell.adjacent = neighbors(cell.row, cell.column).filter((item) => item.isMine)
      .length;
  });
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

function cellKey(row, column) {
  return `${row}:${column}`;
}

function isInside(row, column) {
  return row >= 0 && row < config.rows && column >= 0 && column < config.columns;
}

function neighbors(row, column) {
  const result = [];

  for (let nextRow = row - 1; nextRow <= row + 1; nextRow += 1) {
    for (let nextColumn = column - 1; nextColumn <= column + 1; nextColumn += 1) {
      if (
        (nextRow !== row || nextColumn !== column) &&
        isInside(nextRow, nextColumn)
      ) {
        result.push(cells[nextRow][nextColumn]);
      }
    }
  }

  return result;
}

function render() {
  boardElement.innerHTML = "";
  boardElement.style.gridTemplateColumns = `repeat(${config.columns}, var(--cell-size))`;
  boardElement.style.setProperty("--cell-size", `${config.cellSize}px`);
  boardElement.style.setProperty("--cell-font", `${config.cellFont}px`);

  cells.flat().forEach((cell) => {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.dataset.row = String(cell.row);
    button.dataset.column = String(cell.column);
    button.setAttribute("aria-label", cellLabel(cell));

    if (cell.isOpen) {
      button.classList.add("is-open");
      button.disabled = true;

      if (cell.isMine) {
        button.classList.add("is-mine");
        button.textContent = "*";
      } else if (cell.adjacent > 0) {
        button.dataset.adjacent = String(cell.adjacent);
        button.textContent = String(cell.adjacent);
      }
    } else if (cell.isFlagged) {
      button.classList.add("is-flagged");
      button.textContent = "!";
    }

    boardElement.append(button);
  });
}

function cellLabel(cell) {
  if (cell.isOpen && cell.isMine) {
    return "地雷";
  }

  if (cell.isOpen && cell.adjacent > 0) {
    return `已打开，周围有 ${cell.adjacent} 个地雷`;
  }

  if (cell.isOpen) {
    return "已打开的空格";
  }

  if (cell.isFlagged) {
    return "已标记地雷";
  }

  return "未打开格子";
}

function handleCellClick(event) {
  const button = event.target.closest(".cell");

  if (!button || gameOver) {
    return;
  }

  const cell = getCellFromButton(button);

  if (flagMode) {
    toggleFlag(cell);
  } else {
    openCell(cell);
  }
}

function handleContextMenu(event) {
  const button = event.target.closest(".cell");

  if (!button || gameOver) {
    return;
  }

  event.preventDefault();
  toggleFlag(getCellFromButton(button));
}

function getCellFromButton(button) {
  return cells[Number(button.dataset.row)][Number(button.dataset.column)];
}

function toggleFlag(cell) {
  if (cell.isOpen) {
    return;
  }

  cell.isFlagged = !cell.isFlagged;
  flags += cell.isFlagged ? 1 : -1;
  updateStatus();
  render();
}

function openCell(cell) {
  if (cell.isOpen || cell.isFlagged) {
    return;
  }

  if (!started) {
    started = true;
    placeMines(cell.row, cell.column);
    startTimer();
  }

  if (cell.isMine) {
    revealMines(cell);
    finishGame(false);
    return;
  }

  floodOpen(cell);
  render();
  checkWin();
}

function floodOpen(startCell) {
  const queue = [startCell];

  while (queue.length > 0) {
    const cell = queue.shift();

    if (cell.isOpen || cell.isFlagged) {
      continue;
    }

    cell.isOpen = true;
    opened += 1;

    if (cell.adjacent === 0) {
      neighbors(cell.row, cell.column).forEach((neighbor) => {
        if (!neighbor.isOpen && !neighbor.isMine) {
          queue.push(neighbor);
        }
      });
    }
  }
}

function revealMines(hitCell) {
  cells.flat().forEach((cell) => {
    if (cell.isMine) {
      cell.isOpen = true;
    }
  });

  render();
  const hitButton = boardElement.querySelector(
    `[data-row="${hitCell.row}"][data-column="${hitCell.column}"]`,
  );
  hitButton?.classList.add("is-hit");
}

function checkWin() {
  const safeCells = config.rows * config.columns - config.mines;

  if (opened === safeCells) {
    cells.flat().forEach((cell) => {
      if (cell.isMine && !cell.isFlagged) {
        cell.isFlagged = true;
      }
    });
    flags = config.mines;
    updateStatus();
    render();
    finishGame(true);
  }
}

function finishGame(won) {
  gameOver = true;
  stopTimer();
  showMessage(won ? "成功排雷" : "踩到地雷");
}

function updateStatus() {
  mineCountElement.textContent = String(config.mines - flags);
  timerElement.textContent = formatSeconds(seconds);
}

function showMessage(title) {
  messageTitle.textContent = title;
  message.hidden = false;
}

function hideMessage() {
  message.hidden = true;
}

function setLevel(nextLevel) {
  levelName = nextLevel;
  config = levels[levelName];

  levelButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.level === levelName));
  });

  startGame();
}

function toggleMode() {
  flagMode = !flagMode;
  modeButton.textContent = flagMode ? "标旗" : "打开";
  modeButton.setAttribute("aria-pressed", String(flagMode));
}

newGameButton.addEventListener("click", startGame);
messageButton.addEventListener("click", startGame);
modeButton.addEventListener("click", toggleMode);
boardElement.addEventListener("click", handleCellClick);
boardElement.addEventListener("contextmenu", handleContextMenu);

levelButtons.forEach((button) => {
  button.addEventListener("click", () => setLevel(button.dataset.level));
});

startGame();
