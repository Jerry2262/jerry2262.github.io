const size = 4;
const boardElement = document.querySelector("#board");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#bestScore");
const newGameButton = document.querySelector("#newGameButton");
const undoButton = document.querySelector("#undoButton");
const message = document.querySelector("#gameMessage");
const messageTitle = document.querySelector("#messageTitle");
const messageButton = document.querySelector("#messageButton");
const directionButtons = document.querySelectorAll("[data-direction]");
const bestScoreKey = "jerry-2048-best-score";

let board = createEmptyBoard();
let score = 0;
let bestScore = readBestScore();
let previousState = null;
let hasWon = false;
let locked = false;
let touchStart = null;

function createEmptyBoard() {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function readBestScore() {
  try {
    return Number(localStorage.getItem(bestScoreKey)) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    localStorage.setItem(bestScoreKey, String(value));
  } catch {
    bestScore = value;
  }
}

function cloneBoard(source) {
  return source.map((row) => [...row]);
}

function startGame() {
  board = createEmptyBoard();
  score = 0;
  previousState = null;
  hasWon = false;
  locked = false;
  hideMessage();
  addRandomTile();
  addRandomTile();
  render();
}

function addRandomTile() {
  const emptyCells = [];

  board.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value === 0) {
        emptyCells.push([rowIndex, columnIndex]);
      }
    });
  });

  if (emptyCells.length === 0) {
    return;
  }

  const [row, column] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  board[row][column] = Math.random() < 0.9 ? 2 : 4;
}

function render() {
  boardElement.innerHTML = "";

  board.flat().forEach((value) => {
    const cell = document.createElement("div");

    if (value === 0) {
      cell.className = "cell";
    } else {
      cell.className = "tile";
      cell.dataset.value = String(value);
      cell.textContent = String(value);
    }

    boardElement.append(cell);
  });

  scoreElement.textContent = String(score);
  bestScoreElement.textContent = String(bestScore);
  undoButton.disabled = previousState === null;
}

function slideAndMerge(row) {
  const values = row.filter(Boolean);
  const merged = [];
  let points = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) {
      const nextValue = values[index] * 2;
      merged.push(nextValue);
      points += nextValue;
      index += 1;
    } else {
      merged.push(values[index]);
    }
  }

  while (merged.length < size) {
    merged.push(0);
  }

  return { row: merged, points };
}

function transpose(source) {
  return source[0].map((_, columnIndex) => source.map((row) => row[columnIndex]));
}

function move(direction) {
  if (locked) {
    return;
  }

  const before = JSON.stringify(board);
  const stateBeforeMove = {
    board: cloneBoard(board),
    score,
    hasWon,
  };
  let points = 0;
  let workingBoard = cloneBoard(board);

  if (direction === "up" || direction === "down") {
    workingBoard = transpose(workingBoard);
  }

  if (direction === "right" || direction === "down") {
    workingBoard = workingBoard.map((row) => [...row].reverse());
  }

  workingBoard = workingBoard.map((row) => {
    const result = slideAndMerge(row);
    points += result.points;
    return result.row;
  });

  if (direction === "right" || direction === "down") {
    workingBoard = workingBoard.map((row) => [...row].reverse());
  }

  if (direction === "up" || direction === "down") {
    workingBoard = transpose(workingBoard);
  }

  if (before === JSON.stringify(workingBoard)) {
    return;
  }

  previousState = stateBeforeMove;
  board = workingBoard;
  score += points;

  if (score > bestScore) {
    bestScore = score;
    saveBestScore(bestScore);
  }

  addRandomTile();
  render();
  checkGameState();
}

function canMove() {
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const value = board[row][column];

      if (value === 0) {
        return true;
      }

      if (board[row][column + 1] === value || board[row + 1]?.[column] === value) {
        return true;
      }
    }
  }

  return false;
}

function checkGameState() {
  if (!hasWon && board.flat().includes(2048)) {
    hasWon = true;
    locked = true;
    showMessage("达成 2048");
    return;
  }

  if (!canMove()) {
    locked = true;
    showMessage("游戏结束");
  }
}

function showMessage(title) {
  messageTitle.textContent = title;
  message.hidden = false;
}

function hideMessage() {
  message.hidden = true;
}

function undoMove() {
  if (!previousState) {
    return;
  }

  board = cloneBoard(previousState.board);
  score = previousState.score;
  hasWon = previousState.hasWon;
  locked = false;
  previousState = null;
  hideMessage();
  render();
}

function handleKeydown(event) {
  const keys = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };
  const direction = keys[event.key];

  if (!direction) {
    return;
  }

  event.preventDefault();
  move(direction);
}

function handleTouchStart(event) {
  const touch = event.changedTouches[0];
  touchStart = {
    x: touch.clientX,
    y: touch.clientY,
  };
}

function handleTouchEnd(event) {
  if (!touchStart) {
    return;
  }

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchStart.x;
  const deltaY = touch.clientY - touchStart.y;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  touchStart = null;

  if (Math.max(absX, absY) < 28) {
    return;
  }

  if (absX > absY) {
    move(deltaX > 0 ? "right" : "left");
  } else {
    move(deltaY > 0 ? "down" : "up");
  }
}

newGameButton.addEventListener("click", startGame);
messageButton.addEventListener("click", startGame);
undoButton.addEventListener("click", undoMove);
document.addEventListener("keydown", handleKeydown);
boardElement.addEventListener("touchstart", handleTouchStart, { passive: true });
boardElement.addEventListener("touchend", handleTouchEnd, { passive: true });

directionButtons.forEach((button) => {
  button.addEventListener("click", () => move(button.dataset.direction));
});

startGame();
