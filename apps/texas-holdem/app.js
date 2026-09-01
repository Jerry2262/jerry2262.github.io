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
let aiError = false;

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
  const seats = state.players.map((player) => {
    const seat = document.createElement("article");
    seat.className = `seat seat-${player.seatIndex}`;
    seat.classList.toggle("is-current", state.currentPlayerId === player.id);
    seat.classList.toggle("is-folded", player.folded);
    seat.classList.toggle("is-dealer", state.dealerId === player.id);
    seat.classList.toggle("is-winner", state.winners.includes(player.id));

    const head = document.createElement("div");
    head.className = "seat-head";
    const name = document.createElement("span");
    name.className = "seat-name";
    name.textContent = player.name;
    const dealer = document.createElement("span");
    dealer.className = "dealer";
    dealer.textContent = "D";
    head.append(name, dealer);

    const cards = document.createElement("div");
    cards.className = "cards";
    renderCards(cards, player.hole, 2);

    const meta = document.createElement("div");
    meta.className = "meta";
    const stack = document.createElement("span");
    stack.textContent = `筹码 ${player.stack}`;
    const bet = document.createElement("span");
    bet.textContent = `下注 ${player.bet}`;
    meta.append(stack, bet);

    const lastAction = document.createElement("div");
    lastAction.className = "last-action";
    lastAction.textContent = player.lastAction || "\u00a0";
    seat.append(head, cards, meta, lastAction);
    return seat;
  });

  seatsElement.replaceChildren(...seats);
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
  const isHeroTurn =
    state.currentPlayerId === "hero" && !state.handOver && !aiBusy;
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

  newHandButton.disabled = (!state.handOver && !aiError) || aiBusy;
  resetButton.disabled = (!state.handOver && !aiError) || aiBusy;

  if (aiError) {
    actionHint.textContent = "AI 出错，无法继续本局。可点击「重置筹码」或「下一局」恢复。";
  } else if (state.handOver) {
    actionHint.textContent = "本局结束，可以开始下一局。";
  } else if (state.currentPlayerId === "hero") {
    if (actions.raise) {
      actionHint.textContent =
        toCall > 0
          ? `轮到你行动，需要跟注 ${toCall}。加注范围 ${actions.minRaiseTo}-${actions.maxRaiseTo}。`
          : `轮到你行动，可以过牌或加注。加注范围 ${actions.minRaiseTo}-${actions.maxRaiseTo}。`;
    } else {
      actionHint.textContent =
        toCall > 0
          ? `轮到你行动，需要跟注 ${toCall}。`
          : "轮到你行动，可以过牌。";
    }
  } else {
    const player = state.players.find(
      (item) => item.id === state.currentPlayerId,
    );
    actionHint.textContent = `${player?.name || "AI"} 正在思考。`;
  }
}

function renderLogs(logs) {
  const entries = logs.map((item) => {
    const entry = document.createElement("div");
    entry.textContent = item;
    return entry;
  });
  logPanel.replaceChildren(...entries);
}

function act(type) {
  if (aiBusy) {
    return;
  }

  const legal = engine.getPublicState().legalActions;
  const action =
    type === "raise" ? { type, raiseTo: getRaiseAmount(legal) } : { type };
  engine.playerAction(action);
  render();
  progressAi();
}

function getRaiseAmount(legal) {
  const raw = Number(raiseAmountInput.value);

  if (!Number.isFinite(raw)) {
    return legal.defaultRaiseTo;
  }

  return Math.min(
    legal.maxRaiseTo,
    Math.max(legal.minRaiseTo, Math.floor(raw)),
  );
}

async function progressAi() {
  if (aiBusy) {
    return;
  }

  aiBusy = true;
  render();

  try {
    while (true) {
      const state = engine.getPublicState();
      const player = state.players.find(
        (item) => item.id === state.currentPlayerId,
      );

      if (state.handOver || !player || player.isHuman) {
        break;
      }

      await sleep(520);
      engine.aiAction();
      render();
    }
  } catch (error) {
    aiError = true;
    console.error("AI progression failed.", error);
    render();
  } finally {
    aiBusy = false;
    render();
  }
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
  const state = engine.getPublicState();

  if ((!state.handOver && !aiError) || aiBusy) {
    return;
  }

  aiError = false;
  engine.startNewHand();
  render();
  progressAi();
});
resetButton.addEventListener("click", () => {
  const state = engine.getPublicState();

  if ((!state.handOver && !aiError) || aiBusy) {
    return;
  }

  aiError = false;
  engine.resetSession();
  render();
  progressAi();
});

render();
progressAi();
