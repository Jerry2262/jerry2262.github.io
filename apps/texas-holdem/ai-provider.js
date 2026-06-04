const PokerAi = (() => {
  function createSimpleAiProvider() {
    return {
      chooseAction(context) {
        const strength = estimateStrength(context);
        const pressure = context.toCall / Math.max(context.pot + context.toCall, 1);
        const style = context.player.style || "balanced";
        const looseness = style === "loose" ? 0.1 : style === "tight" ? -0.08 : 0;
        const noise = (Math.random() - 0.5) * 0.12;
        const adjusted = strength + looseness + noise;

        if (context.toCall === 0) {
          if (context.legalActions.raise && adjusted > 0.66) {
            return { type: "raise", raiseTo: context.currentBet + context.bigBlind };
          }

          return { type: "check" };
        }

        if (context.legalActions.raise && adjusted > 0.78 && pressure < 0.32) {
          return { type: "raise", raiseTo: context.currentBet + context.bigBlind };
        }

        if (adjusted > 0.42 || pressure < adjusted * 0.36) {
          return { type: "call" };
        }

        return { type: "fold" };
      },
    };
  }

  function createWasmAiProvider(wasmModule) {
    return {
      chooseAction(context) {
        const payload = JSON.stringify(toWasmPayload(context));
        const decision = wasmModule.recommend_action(payload);
        return typeof decision === "string" ? JSON.parse(decision) : decision;
      },
    };
  }

  function toWasmPayload(context) {
    return {
      player: context.player,
      players: context.players,
      community: context.community,
      stage: context.stage,
      pot: context.pot,
      currentBet: context.currentBet,
      toCall: context.toCall,
      bigBlind: context.bigBlind,
      legalActions: context.legalActions,
    };
  }

  function estimateStrength(context) {
    if (context.community.length >= 3) {
      const hand = context.evaluateBestHand([...context.player.hole, ...context.community]);
      return Math.min(0.98, 0.18 + hand.category * 0.1 + highCardBonus(context.player.hole));
    }

    const [first, second] = context.player.hole;
    const high = Math.max(first.rank, second.rank);
    const low = Math.min(first.rank, second.rank);
    const pair = first.rank === second.rank ? 0.34 : 0;
    const suited = first.suit === second.suit ? 0.08 : 0;
    const connected = Math.abs(first.rank - second.rank) <= 1 ? 0.06 : 0;
    const broadway = high >= 11 && low >= 10 ? 0.12 : 0;

    return Math.min(0.95, 0.18 + high / 28 + low / 42 + pair + suited + connected + broadway);
  }

  function highCardBonus(cards) {
    return cards.reduce((total, card) => total + Math.max(0, card.rank - 10) * 0.012, 0);
  }

  return { createSimpleAiProvider, createWasmAiProvider };
})();
