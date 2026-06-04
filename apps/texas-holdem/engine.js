const PokerEngine = (() => {
  const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const suits = ["S", "H", "D", "C"];
  const stageLabels = {
    preflop: "翻前",
    flop: "翻牌",
    turn: "转牌",
    river: "河牌",
    showdown: "摊牌",
  };
  const handNames = [
    "高牌",
    "一对",
    "两对",
    "三条",
    "顺子",
    "同花",
    "葫芦",
    "四条",
    "同花顺",
  ];

  function createDeck() {
    return suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
  }

  function shuffle(deck) {
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    return deck;
  }

  function compareScores(a, b) {
    if (a.category !== b.category) {
      return a.category - b.category;
    }

    for (let index = 0; index < Math.max(a.kickers.length, b.kickers.length); index += 1) {
      const diff = (a.kickers[index] || 0) - (b.kickers[index] || 0);

      if (diff !== 0) {
        return diff;
      }
    }

    return 0;
  }

  function uniqueDescending(values) {
    return [...new Set(values)].sort((a, b) => b - a);
  }

  function straightHigh(values) {
    const unique = uniqueDescending(values);

    if (unique.includes(14)) {
      unique.push(1);
    }

    for (let index = 0; index <= unique.length - 5; index += 1) {
      const window = unique.slice(index, index + 5);

      if (window[0] - window[4] === 4) {
        return window[0] === 1 ? 5 : window[0];
      }
    }

    return 0;
  }

  function evaluateFive(cards) {
    const rankValues = cards.map((card) => card.rank).sort((a, b) => b - a);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const straight = straightHigh(rankValues);
    const counts = new Map();

    rankValues.forEach((rank) => counts.set(rank, (counts.get(rank) || 0) + 1));

    const groups = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }

      return b[0] - a[0];
    });

    if (flush && straight) {
      return { category: 8, kickers: [straight], name: handNames[8] };
    }

    if (groups[0][1] === 4) {
      return {
        category: 7,
        kickers: [groups[0][0], groups[1][0]],
        name: handNames[7],
      };
    }

    if (groups[0][1] === 3 && groups[1][1] === 2) {
      return {
        category: 6,
        kickers: [groups[0][0], groups[1][0]],
        name: handNames[6],
      };
    }

    if (flush) {
      return { category: 5, kickers: rankValues, name: handNames[5] };
    }

    if (straight) {
      return { category: 4, kickers: [straight], name: handNames[4] };
    }

    if (groups[0][1] === 3) {
      return {
        category: 3,
        kickers: [groups[0][0], ...groups.slice(1).map(([rank]) => rank)],
        name: handNames[3],
      };
    }

    if (groups[0][1] === 2 && groups[1][1] === 2) {
      return {
        category: 2,
        kickers: [groups[0][0], groups[1][0], groups[2][0]],
        name: handNames[2],
      };
    }

    if (groups[0][1] === 2) {
      return {
        category: 1,
        kickers: [groups[0][0], ...groups.slice(1).map(([rank]) => rank)],
        name: handNames[1],
      };
    }

    return { category: 0, kickers: rankValues, name: handNames[0] };
  }

  function combinations(cards, choose = 5) {
    const result = [];

    function walk(start, combo) {
      if (combo.length === choose) {
        result.push(combo);
        return;
      }

      for (let index = start; index < cards.length; index += 1) {
        walk(index + 1, [...combo, cards[index]]);
      }
    }

    walk(0, []);
    return result;
  }

  function evaluateBestHand(cards) {
    if (cards.length < 5) {
      return { category: 0, kickers: uniqueDescending(cards.map((card) => card.rank)), name: "未成牌" };
    }

    return combinations(cards).reduce((best, combo) => {
      const score = evaluateFive(combo);
      return !best || compareScores(score, best) > 0 ? score : best;
    }, null);
  }

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  class TexasHoldemEngine {
    constructor({ aiProvider, smallBlind = 10, bigBlind = 20 } = {}) {
      this.smallBlind = smallBlind;
      this.bigBlind = bigBlind;
      this.aiProvider = aiProvider;
      this.players = [
        { id: "hero", name: "你", isHuman: true, stack: 1000 },
        { id: "ai-1", name: "稳健 AI", isHuman: false, stack: 1000, style: "tight" },
        { id: "ai-2", name: "激进 AI", isHuman: false, stack: 1000, style: "loose" },
        { id: "ai-3", name: "均衡 AI", isHuman: false, stack: 1000, style: "balanced" },
        { id: "ai-4", name: "谨慎 AI", isHuman: false, stack: 1000, style: "tight" },
        { id: "ai-5", name: "松凶 AI", isHuman: false, stack: 1000, style: "loose" },
      ];
      this.dealerIndex = -1;
      this.logs = [];
      this.startNewHand();
    }

    resetSession() {
      this.players.forEach((player) => {
        player.stack = 1000;
      });
      this.dealerIndex = -1;
      this.logs = [];
      this.startNewHand();
    }

    startNewHand() {
      if (this.players.filter((player) => player.stack > 0).length < 2) {
        this.players.forEach((player) => {
          if (player.stack <= 0) {
            player.stack = 1000;
          }
        });
      }

      this.deck = shuffle(createDeck());
      this.community = [];
      this.stage = "preflop";
      this.currentBet = 0;
      this.handOver = false;
      this.winners = [];
      this.statusText = "新牌局开始";

      this.players.forEach((player) => {
        player.hole = [this.deck.pop(), this.deck.pop()];
        player.folded = player.stack <= 0;
        player.allIn = false;
        player.bet = 0;
        player.committed = 0;
        player.acted = false;
        player.lastAction = "";
        player.bestHand = null;
      });

      this.dealerIndex = this.nextSeat(this.dealerIndex);
      this.postBlinds();
      this.currentPlayerIndex = this.nextActionSeat(this.bigBlindIndex);
      this.log(`按钮在 ${this.players[this.dealerIndex].name}，发出新一局。`);
    }

    postBlinds() {
      this.smallBlindIndex = this.nextSeat(this.dealerIndex);
      this.bigBlindIndex = this.nextSeat(this.smallBlindIndex);
      this.commit(this.players[this.smallBlindIndex], this.smallBlind);
      this.players[this.smallBlindIndex].lastAction = `小盲 ${this.smallBlind}`;
      this.commit(this.players[this.bigBlindIndex], this.bigBlind);
      this.players[this.bigBlindIndex].lastAction = `大盲 ${this.bigBlind}`;
      this.currentBet = Math.max(...this.players.map((player) => player.bet));
    }

    nextSeat(index) {
      let next = index;

      do {
        next = (next + 1) % this.players.length;
      } while (this.players[next].stack <= 0 && next !== index);

      return next;
    }

    nextActionSeat(fromIndex) {
      for (let offset = 1; offset <= this.players.length; offset += 1) {
        const index = (fromIndex + offset) % this.players.length;
        const player = this.players[index];

        if (this.canPlayerAct(player)) {
          return index;
        }
      }

      return -1;
    }

    canPlayerAct(player) {
      return !player.folded && !player.allIn && player.stack > 0 && !this.handOver;
    }

    get pot() {
      return this.players.reduce((total, player) => total + player.committed, 0);
    }

    commit(player, amount) {
      const paid = Math.min(player.stack, Math.max(0, amount));
      player.stack -= paid;
      player.bet += paid;
      player.committed += paid;

      if (player.stack === 0) {
        player.allIn = true;
      }

      return paid;
    }

    getToCall(player) {
      return Math.max(0, this.currentBet - player.bet);
    }

    getLegalActions(playerId = "hero") {
      const player = this.players.find((item) => item.id === playerId);

      if (!player || this.players[this.currentPlayerIndex]?.id !== playerId || this.handOver) {
        return {};
      }

      const toCall = this.getToCall(player);

      return {
        fold: toCall > 0,
        check: toCall === 0,
        call: toCall > 0,
        raise: player.stack > toCall,
        toCall,
        raiseTo: Math.min(this.currentBet + this.bigBlind, player.bet + player.stack),
      };
    }

    playerAction(action) {
      const player = this.players[this.currentPlayerIndex];

      if (!player?.isHuman) {
        return;
      }

      this.applyAction(player, action);
    }

    aiAction() {
      const player = this.players[this.currentPlayerIndex];

      if (!player || player.isHuman || this.handOver) {
        return;
      }

      const action = this.aiProvider?.chooseAction(this.getAiContext(player)) || { type: "check" };
      this.applyAction(player, action);
    }

    applyAction(player, action) {
      const toCall = this.getToCall(player);

      if (action.type === "fold" && toCall > 0) {
        player.folded = true;
        player.acted = true;
        player.lastAction = "弃牌";
        this.log(`${player.name} 弃牌。`);
      } else if (action.type === "raise" && player.stack > toCall) {
        const target = Math.max(this.currentBet + this.bigBlind, action.raiseTo || 0);
        const needed = Math.min(player.stack, target - player.bet);
        this.commit(player, needed);

        if (player.bet > this.currentBet) {
          this.currentBet = player.bet;
          this.players.forEach((item) => {
            if (item.id !== player.id && !item.folded && !item.allIn) {
              item.acted = false;
            }
          });
        }

        player.acted = true;
        player.lastAction = `加注到 ${player.bet}`;
        this.log(`${player.name} 加注到 ${player.bet}。`);
      } else if (toCall > 0) {
        const paid = this.commit(player, toCall);
        player.acted = true;
        player.lastAction = paid < toCall ? `全下 ${paid}` : `跟注 ${paid}`;
        this.log(`${player.name} ${player.lastAction}。`);
      } else {
        player.acted = true;
        player.lastAction = "过牌";
        this.log(`${player.name} 过牌。`);
      }

      this.advance();
    }

    advance() {
      if (this.remainingPlayers().length === 1) {
        this.awardWithoutShowdown();
        return;
      }

      if (this.isBettingRoundComplete()) {
        this.advanceStage();
        return;
      }

      this.currentPlayerIndex = this.nextActionSeat(this.currentPlayerIndex);
    }

    remainingPlayers() {
      return this.players.filter((player) => !player.folded);
    }

    activeActors() {
      return this.players.filter((player) => this.canPlayerAct(player));
    }

    isBettingRoundComplete() {
      const actors = this.activeActors();

      if (actors.length < 2) {
        return true;
      }

      return actors.every((player) => player.acted && player.bet === this.currentBet);
    }

    advanceStage() {
      const order = ["preflop", "flop", "turn", "river"];
      const index = order.indexOf(this.stage);

      if (index === -1 || this.stage === "river") {
        this.showdown();
        return;
      }

      this.stage = order[index + 1];
      this.players.forEach((player) => {
        player.bet = 0;
        player.acted = false;
      });
      this.currentBet = 0;

      if (this.stage === "flop") {
        this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      } else {
        this.community.push(this.deck.pop());
      }

      this.log(`${stageLabels[this.stage]}：公共牌更新。`);

      if (this.activeActors().length < 2) {
        this.advanceStage();
        return;
      }

      this.currentPlayerIndex = this.nextActionSeat(this.dealerIndex);
      this.statusText = `${stageLabels[this.stage]}行动中`;
    }

    awardWithoutShowdown() {
      const winner = this.remainingPlayers()[0];
      const pot = this.pot;
      winner.stack += pot;
      this.handOver = true;
      this.winners = [winner.id];
      this.statusText = `${winner.name} 赢得 ${pot}`;
      this.log(`${winner.name} 赢得底池 ${pot}。`);
    }

    showdown() {
      this.stage = "showdown";
      const contenders = this.remainingPlayers();
      contenders.forEach((player) => {
        player.bestHand = evaluateBestHand([...player.hole, ...this.community]);
      });

      let best = null;
      contenders.forEach((player) => {
        if (!best || compareScores(player.bestHand, best) > 0) {
          best = player.bestHand;
        }
      });

      const winners = contenders.filter((player) => compareScores(player.bestHand, best) === 0);
      const share = Math.floor(this.pot / winners.length);
      winners.forEach((player) => {
        player.stack += share;
      });

      this.handOver = true;
      this.winners = winners.map((player) => player.id);
      this.statusText = `${winners.map((player) => player.name).join("、")} 赢得 ${this.pot}`;
      this.log(`摊牌：${this.statusText}，牌型 ${best.name}。`);
    }

    getAiContext(player) {
      return {
        player: cloneData(player),
        players: cloneData(this.players),
        community: cloneData(this.community),
        stage: this.stage,
        pot: this.pot,
        currentBet: this.currentBet,
        toCall: this.getToCall(player),
        bigBlind: this.bigBlind,
        legalActions: this.getLegalActions(player.id),
        evaluateBestHand,
      };
    }

    getPublicState() {
      return {
        players: this.players.map((player, index) => ({
          ...player,
          seatIndex: index,
          hole:
            player.isHuman || this.handOver
              ? player.hole
              : player.hole.map(() => ({ hidden: true })),
        })),
        community: this.community,
        stage: this.stage,
        stageLabel: stageLabels[this.stage],
        pot: this.pot,
        smallBlind: this.smallBlind,
        bigBlind: this.bigBlind,
        currentPlayerId: this.players[this.currentPlayerIndex]?.id,
        currentBet: this.currentBet,
        handOver: this.handOver,
        winners: this.winners,
        statusText: this.statusText,
        legalActions: this.getLegalActions("hero"),
        logs: this.logs.slice(-8).reverse(),
      };
    }

    log(message) {
      this.logs.push(message);
    }
  }

  return {
    TexasHoldemEngine,
    evaluateBestHand,
    compareScores,
    stageLabels,
  };
})();
