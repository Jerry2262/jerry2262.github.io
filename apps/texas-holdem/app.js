const aiProvider = PokerAi.createSimpleAiProvider();
const engine = new PokerEngine.TexasHoldemEngine({ aiProvider });

const seatsElement = document.querySelector("#seats");
const communityElement = document.querySelector("#communityCards");
const potElement = document.querySelector("#potValue");
const blindElement = document.querySelector("#blindValue");
const stageElement = document.querySelector("#stageLabel");
const statusElement = document.querySelector("#statusText");
const actionHint = document.querySelector("#actionHint");
const logPanel = document.querySelector("#logPanel");
const foldButton = document.querySelector("#foldButton");
const checkButton = document.querySelector("#checkButton");
const callButton = document.querySelector("#callButton");
const raiseButton = document.querySelector("#raiseButton");
const raiseAmountInput = document.querySelector("#raiseAmount");
const newHandButton = document.querySelector("#newHandButton");
const resetButton = document.querySelector("#resetButton");

let aiBusy = false;

function render() {
  const state = engine.getPublicState();
  potElement.textContent = String(state.pot);
  blindElement.textContent = `${state.smallBlind}/${state.bigBlind}`;
  stageElement.textContent = state.stageLabel;
  statusElement.textContent = state.statusText;

  renderCards(communityElement, state.community, 5);
  renderSeats(state);
  renderActions(state);
  renderLogs(state.logs);
}

function renderSeats(state) {
  seatsElement.innerHTML = "";

  state.players.forEach((player) => {
    const seat = document.createElement("article");
    seat.className = `seat seat-${player.seatIndex}`;

    if (state.currentPlayerId === player.id) {
      seat.classList.add("is-current");
    }

    if (player.folded) {
      seat.classList.add("is-folded");
    }

    if (player.seatIndex === getDealerIndex(state.players)) {
      seat.classList.add("is-dealer");
    }

    if (state.winners.includes(player.id)) {
      seat.classList.add("is-winner");
    }

    seat.innerHTML = `
      <div class="seat-head">
        <span class="seat-name">${player.name}</span>
        <span class="dealer">D</span>
      </div>
      <div class="cards"></div>
      <div class="meta">
        <span>筹码 ${player.stack}</span>
        <span>下注 ${player.bet}</span>
      </div>
      <div class="last-action">${player.lastAction || "&nbsp;"}</div>
    `;

    renderCards(seat.querySelector(".cards"), player.hole, 2);
    seatsElement.append(seat);
  });
}

function getDealerIndex(players) {
  const dealer = engine.players[engine.dealerIndex];
  return players.find((player) => player.id === dealer?.id)?.seatIndex ?? 0;
}

function renderCards(container, cards, targetCount) {
  container.innerHTML = "";
  const padded = [...cards];

  while (padded.length < targetCount) {
    padded.push(null);
  }

  padded.forEach((card) => {
    const node = document.createElement("div");
    node.className = "card";

    if (!card || card.hidden) {
      node.classList.add("is-back");
      node.textContent = card?.hidden ? "?" : "";
    } else {
      if (card.suit === "H" || card.suit === "D") {
        node.classList.add("is-red");
      }

      node.textContent = `${rankText(card.rank)}${suitText(card.suit)}`;
    }

    container.append(node);
  });
}

function rankText(rank) {
  return { 11: "J", 12: "Q", 13: "K", 14: "A" }[rank] || String(rank);
}

function suitText(suit) {
  return { S: "♠", H: "♥", D: "♦", C: "♣" }[suit];
}

function renderActions(state) {
  const actions = state.legalActions;
  const isHeroTurn = state.currentPlayerId === "hero" && !state.handOver && !aiBusy;
  const toCall = actions.toCall || 0;

  foldButton.disabled = !isHeroTurn || !actions.fold;
  checkButton.disabled = !isHeroTurn || !actions.check;
  callButton.disabled = !isHeroTurn || !actions.call;
  raiseButton.disabled = !isHeroTurn || !actions.raise;
  raiseAmountInput.disabled = !isHeroTurn || !actions.raise;
  callButton.textContent = toCall > 0 ? `跟注 ${toCall}` : "跟注";
  raiseButton.textContent = "加注";

  if (actions.raise) {
    const min = actions.minRaiseTo;
    const max = actions.maxRaiseTo;
    raiseAmountInput.min = String(min);
    raiseAmountInput.max = String(max);
    raiseAmountInput.step = String(state.bigBlind);

    const current = Number(raiseAmountInput.value);
    if (!Number.isFinite(current) || current < min || current > max) {
      raiseAmountInput.value = String(actions.defaultRaiseTo);
    }
  } else {
    raiseAmountInput.value = "";
    raiseAmountInput.removeAttribute("min");
    raiseAmountInput.removeAttribute("max");
  }

  if (state.handOver) {
    actionHint.textContent = "本局结束，可以开始下一局。";
  } else if (state.currentPlayerId === "hero") {
    if (actions.raise) {
      actionHint.textContent =
        toCall > 0
          ? `轮到你行动，需要跟注 ${toCall}。加注范围 ${actions.minRaiseTo}-${actions.maxRaiseTo}。`
          : `轮到你行动，可以过牌或加注。加注范围 ${actions.minRaiseTo}-${actions.maxRaiseTo}。`;
    } else {
      actionHint.textContent = toCall > 0 ? `轮到你行动，需要跟注 ${toCall}。` : "轮到你行动，可以过牌。";
    }
  } else {
    const player = state.players.find((item) => item.id === state.currentPlayerId);
    actionHint.textContent = `${player?.name || "AI"} 正在思考。`;
  }
}

function renderLogs(logs) {
  logPanel.innerHTML = logs.map((item) => `<div>${item}</div>`).join("");
}

function act(type) {
  if (aiBusy) {
    return;
  }

  const legal = engine.getPublicState().legalActions;
  const action = type === "raise" ? { type, raiseTo: getRaiseAmount(legal) } : { type };
  engine.playerAction(action);
  render();
  progressAi();
}

function getRaiseAmount(legal) {
  const raw = Number(raiseAmountInput.value);

  if (!Number.isFinite(raw)) {
    return legal.defaultRaiseTo;
  }

  return Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.floor(raw)));
}

async function progressAi() {
  if (aiBusy) {
    return;
  }

  aiBusy = true;

  while (!engine.handOver) {
    const player = engine.players[engine.currentPlayerIndex];

    if (!player || player.isHuman) {
      break;
    }

    await sleep(520);
    engine.aiAction();
    render();
  }

  aiBusy = false;
  render();
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

foldButton.addEventListener("click", () => act("fold"));
checkButton.addEventListener("click", () => act("check"));
callButton.addEventListener("click", () => act("call"));
raiseButton.addEventListener("click", () => act("raise"));
newHandButton.addEventListener("click", () => {
  engine.startNewHand();
  render();
  progressAi();
});
resetButton.addEventListener("click", () => {
  engine.resetSession();
  render();
  progressAi();
});

render();
progressAi();
