export const MODULE_ID = "fu-ace-of-cards";
export const CORE_DECK_PATH = "cards/light-soft";

const resolvedFilesCache = {
  back: "cards/backs/light-soft.webp",
  joker1: `${CORE_DECK_PATH}/black-joker.webp`,
  joker2: `${CORE_DECK_PATH}/red-joker.webp`,
  aces: {
    diamonds: `${CORE_DECK_PATH}/diamonds-ace.webp`,
    hearts: `${CORE_DECK_PATH}/hearts-ace.webp`,
    spades: `${CORE_DECK_PATH}/spades-ace.webp`,
    clubs: `${CORE_DECK_PATH}/clubs-ace.webp`
  }
};

export const ELEMENT_ICON_CACHE = {
  diamonds: "",
  hearts: "",
  spades: "",
  clubs: ""
};

export const SUITS = {
  diamonds: {
    id: "diamonds",
    name: "Ouros",
    symbol: "♦",
    fuSuitIcon: "diamond",
    element: "air",
    elementLabel: "Ar",
    fuElementClass: "fu-wind",
    color: "#f59e0b",
    trapTrigger: "Feitiço"
  },
  hearts: {
    id: "hearts",
    name: "Copas",
    symbol: "♥",
    fuSuitIcon: "heart",
    element: "fire",
    elementLabel: "Fogo",
    fuElementClass: "fu-fire",
    color: "#ef4444",
    trapTrigger: "Objetivo"
  },
  spades: {
    id: "spades",
    name: "Espadas",
    symbol: "♠",
    fuSuitIcon: "spade",
    element: "ice",
    elementLabel: "Gelo",
    fuElementClass: "fu-ice",
    color: "#e2e8f0",
    trapTrigger: "Ataque"
  },
  clubs: {
    id: "clubs",
    name: "Paus",
    symbol: "♣",
    fuSuitIcon: "club",
    element: "earth",
    elementLabel: "Terra",
    fuElementClass: "fu-earth",
    color: "#eab308",
    trapTrigger: "Poder"
  }
};

export const SKILL_DEFAULT_ICONS = {
  "magic-cards": "systems/projectfu/styles/static/compendium/classes/ace-card/magic_cards.png",
  "mulligan": "systems/projectfu/styles/static/compendium/classes/ace-card/mulligan.png",
  "trap-card": "systems/projectfu/styles/static/compendium/classes/ace-card/trap_card.png",
  "high-or-low": "systems/projectfu/styles/static/compendium/classes/ace-card/high_or_low.png",
  "double-or-nothing": "systems/projectfu/styles/static/compendium/classes/ace-card/double_or_nothing.png",
  "card-vanguard": "icons/sundries/gaming/playing-cards-grey.webp"
};

export function getOfficialElementIconHtml(suitKey) {
  const suit = SUITS[suitKey];
  if (!suit) return "";
  if (ELEMENT_ICON_CACHE[suitKey]) {
    return ELEMENT_ICON_CACHE[suitKey];
  }
  return `<i class="fu-icon ${suit.fuElementClass}" aria-label="${suit.elementLabel}"></i>`;
}

export async function syncCoreDeckCatalog() {
  try {
    const enricher = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    for (const [suitKey, suitObj] of Object.entries(SUITS)) {
      const enriched = await enricher.enrichHTML(`@ICON[${suitObj.element}]`, { async: true });
      if (enriched && !enriched.includes("@ICON[")) {
        ELEMENT_ICON_CACHE[suitKey] = enriched;
      }
    }
  } catch (err) {
    console.warn(`[${MODULE_ID}] Fallback para classes CSS fu-icon:`, err);
  }

  try {
    const picker = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    const result = await picker.browse("public", CORE_DECK_PATH);
    const files = result?.files || [];
    if (!files.length) return;

    const blackJoker = files.find(f => /\/black-joker\.webp$/i.test(f));
    const redJoker = files.find(f => /\/red-joker\.webp$/i.test(f));
    const anyJokers = files.filter(f => /joker[^/]*\.webp$/i.test(f)).sort();

    resolvedFilesCache.joker1 = blackJoker || anyJokers[0] || resolvedFilesCache.joker1;
    resolvedFilesCache.joker2 = redJoker || anyJokers[1] || anyJokers[0] || resolvedFilesCache.joker2;

    for (const suitKey of Object.keys(SUITS)) {
      const aceFile = files.find(
        f => f.endsWith(`/${suitKey}-ace.webp`) || f.endsWith(`/${suitKey}-01.webp`)
      );
      if (aceFile) resolvedFilesCache.aces[suitKey] = aceFile;
    }
  } catch (err) {
    console.warn(`[${MODULE_ID}] Usando caminhos padrão de ${CORE_DECK_PATH}:`, err);
  }
}

export function getCardBackUrl() {
  return resolvedFilesCache.back;
}

export function getCardImageUrl(card) {
  if (!card) return getCardBackUrl();
  if (card.id === "joker-1") return resolvedFilesCache.joker1;
  if (card.id === "joker-2") return resolvedFilesCache.joker2;

  if (card.value === 1) {
    return resolvedFilesCache.aces[card.suit] || `${CORE_DECK_PATH}/${card.suit}-ace.webp`;
  }

  const padded = String(card.value).padStart(2, "0");
  return `${CORE_DECK_PATH}/${card.suit}-${padded}.webp`;
}

export function createFullDeck() {
  const cards = [];

  for (const suitKey of Object.keys(SUITS)) {
    const suit = SUITS[suitKey];
    for (let value = 1; value <= 7; value++) {
      const id = `${suitKey}-${value}`;
      const card = {
        id,
        suit: suitKey,
        value,
        isJoker: false,
        name: `${value === 1 ? "Ás" : value} de ${suit.name} (${suit.elementLabel})`,
        shortLabel: `${value === 1 ? "A" : value}${suit.symbol}`
      };
      card.image = getCardImageUrl(card);
      cards.push(card);
    }
  }

  const joker1 = {
    id: "joker-1",
    suit: "joker",
    value: 0,
    isJoker: true,
    name: "Curinga Negro",
    shortLabel: "★"
  };
  joker1.image = getCardImageUrl(joker1);

  const joker2 = {
    id: "joker-2",
    suit: "joker",
    value: 0,
    isJoker: true,
    name: "Curinga Rubro",
    shortLabel: "★"
  };
  joker2.image = getCardImageUrl(joker2);

  cards.push(joker1, joker2);
  return cards;
}

export function buildFallbackCardSvg(card) {
  if (!card) {
    const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="320" viewBox="0 0 220 320">
      <rect x="4" y="4" width="212" height="312" rx="16" fill="#240b0e" stroke="#d4af37" stroke-width="3"/>
      <circle cx="110" cy="160" r="52" fill="none" stroke="#d4af37" stroke-width="2"/>
      <text x="110" y="275" text-anchor="middle" fill="#d4af37" font-family="serif" font-size="13" letter-spacing="3">ARCANA</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(backSvg)}`;
  }

  if (card.isJoker) {
    const jokerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="320" viewBox="0 0 220 320">
      <rect x="4" y="4" width="212" height="312" rx="16" fill="#2b0d12" stroke="#f59e0b" stroke-width="3"/>
      <text x="110" y="164" text-anchor="middle" fill="#fbbf24" font-family="serif" font-weight="bold" font-size="46">★</text>
      <text x="110" y="242" text-anchor="middle" fill="#fde68a" font-family="sans-serif" font-weight="bold" font-size="16" letter-spacing="2">CURINGA</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(jokerSvg)}`;
  }

  const suit = SUITS[card.suit];
  const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="320" viewBox="0 0 220 320">
    <rect x="4" y="4" width="212" height="312" rx="16" fill="#f8fafc" stroke="#b91c1c" stroke-width="3"/>
    <text x="26" y="48" fill="#991b1b" font-family="serif" font-weight="bold" font-size="28">${card.value}</text>
    <text x="110" y="172" text-anchor="middle" fill="#991b1b" font-family="serif" font-size="56">${suit.symbol}</text>
    <text x="110" y="242" text-anchor="middle" fill="#1e293b" font-family="sans-serif" font-weight="bold" font-size="14" letter-spacing="2">${suit.elementLabel.toUpperCase()}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(cardSvg)}`;
}

function evaluateConcreteCards(resolvedCards, originalCards, actorLevel = 1) {
  const count = resolvedCards.length;
  const hasJoker = originalCards.some(c => c.isJoker);
  const tierBonus = actorLevel >= 40 ? 20 : (actorLevel >= 20 ? 10 : 0);

  const values = resolvedCards.map(c => c.value).sort((a, b) => a - b);
  const suits = resolvedCards.map(c => c.suit);
  const uniqueSuits = [...new Set(suits)];
  const totalValue = values.reduce((acc, v) => acc + v, 0);
  const highestValue = Math.max(...values);
  const isHighestEven = highestValue % 2 === 0;

  const countsByValue = {};
  for (const v of values) countsByValue[v] = (countsByValue[v] || 0) + 1;
  const freq = Object.values(countsByValue).sort((a, b) => b - a);

  const isSequential = values.every((v, idx) => idx === 0 || v === values[idx - 1] + 1);
  const sameSuit = uniqueSuits.length === 1;

  const matches = [];

  if (count === 4 && !hasJoker && freq[0] === 4) {
    matches.push({
      id: "jackpot",
      name: "Grande Prêmio",
      priority: 100,
      mpCost: 20,
      requirement: "4 cartas do mesmo valor e nenhum coringa",
      resolvedCards,
      uniqueSuits,
      highestValue,
      totalValue,
      summary: "Você e todos os aliados na cena recuperam 777 PV e 777 PM (e PJs rendidos recuperam a consciência)."
    });
  }

  if (count === 4 && sameSuit && isSequential) {
    const damage = 25 + totalValue + tierBonus;
    const suitKey = uniqueSuits[0];
    const suitObj = SUITS[suitKey];
    const elemIcon = getOfficialElementIconHtml(suitKey);
    matches.push({
      id: "magic-flush",
      name: "Flush Mágico",
      priority: 90,
      mpCost: 20,
      requirement: "4 cartas do mesmo naipe em sequência",
      resolvedCards,
      uniqueSuits,
      highestValue,
      totalValue,
      damage,
      damageType: suitObj.element,
      damageTypeLabel: suitObj.elementLabel,
      summary: `Causa ${damage} de dano de <span class="fu-ace-inline-icon">${elemIcon}</span> <strong>${suitObj.elementLabel}</strong> em cada inimigo presente na cena.`
    });
  }

  if (count === 4 && isSequential) {
    const damage = 15 + totalValue + tierBonus;
    const dmgType = isHighestEven ? "light" : "dark";
    const dmgLabel = isHighestEven ? "Luz" : "Trevas";
    const dmgClass = isHighestEven ? "fu-light" : "fu-dark";
    matches.push({
      id: "blinding-flush",
      name: "Flush Ofuscante",
      priority: 80,
      mpCost: 20,
      requirement: "4 cartas com valores em sequência",
      resolvedCards,
      uniqueSuits,
      highestValue,
      totalValue,
      damage,
      damageType: dmgType,
      damageTypeLabel: dmgLabel,
      summary: `Causa ${damage} de dano de <span class="fu-ace-inline-icon"><i class="fu-icon ${dmgClass}"></i></span> <strong>${dmgLabel}</strong> (maior valor ${highestValue} é ${isHighestEven ? "par" : "ímpar"}) em cada inimigo na cena.`
    });
  }

  if (count === 5 && freq[0] === 3 && freq[1] === 2) {
    const mode = isHighestEven ? "aliados se recuperam" : "inimigos sofrem";
    matches.push({
      id: "full-status",
      name: "Full Status",
      priority: 85,
      mpCost: 25,
      requirement: "3 cartas do mesmo valor + 2 cartas do mesmo valor",
      resolvedCards,
      uniqueSuits,
      highestValue,
      totalValue,
      isHighestEven,
      summary: `Escolha 2 condições entre Abalado, Atordoado, Fraco e Lento: ${mode} (maior valor ${highestValue} é ${isHighestEven ? "par" : "ímpar"}).`
    });
  }

  if (count === 4 && freq[0] === 2 && freq[1] === 2) {
    const damage = 10 + highestValue + tierBonus;
    matches.push({
      id: "double-trouble",
      name: "Encrenta em Dobro",
      priority: 70,
      mpCost: 20,
      requirement: "2 cartas do mesmo valor + 2 cartas do mesmo valor",
      resolvedCards,
      uniqueSuits,
      highestValue,
      totalValue,
      damage,
      summary: `Causa ${damage} de dano (escolha o elemento entre os naipes usados) em 1 ou 2 inimigos na cena.`
    });
  }

  if (count === 3 && freq[0] === 3) {
    const heal = 3 * totalValue;
    matches.push({
      id: "support-triple",
      name: "Trinca de Suporte",
      priority: 60,
      mpCost: 15,
      requirement: "3 cartas do mesmo valor",
      resolvedCards,
      uniqueSuits,
      highestValue,
      totalValue,
      heal,
      summary: `Você e todos os aliados na cena recuperam ${heal} PV e ${heal} PM.`
    });
  }

  if (count === 2 && freq[0] === 2) {
    matches.push({
      id: "magic-pair",
      name: "Par Mágico",
      priority: 50,
      mpCost: 10,
      requirement: "2 cartas do mesmo valor",
      resolvedCards,
      uniqueSuits,
      highestValue,
      totalValue,
      summary: "Faça um ataque livre com uma arma equipada; o dano torna-se do elemento de um dos naipes usados."
    });
  }

  return matches;
}

export function detectCombinations(selectedCards, actorLevel = 1) {
  if (!selectedCards || selectedCards.length < 2 || selectedCards.length > 5) return [];

  const jokerIndices = selectedCards
    .map((c, idx) => (c.isJoker ? idx : -1))
    .filter(idx => idx !== -1);

  const allSuitKeys = Object.keys(SUITS);
  const candidates = [];

  if (jokerIndices.length === 0) {
    candidates.push(...evaluateConcreteCards(selectedCards, selectedCards, actorLevel));
  } else if (jokerIndices.length === 1) {
    for (const s1 of allSuitKeys) {
      for (let v1 = 1; v1 <= 7; v1++) {
        const clone = selectedCards.map((c, idx) =>
          idx === jokerIndices[0] ? { ...c, suit: s1, value: v1 } : c
        );
        candidates.push(...evaluateConcreteCards(clone, selectedCards, actorLevel));
      }
    }
  } else if (jokerIndices.length === 2) {
    for (const s1 of allSuitKeys) {
      for (let v1 = 1; v1 <= 7; v1++) {
        for (const s2 of allSuitKeys) {
          for (let v2 = 1; v2 <= 7; v2++) {
            const clone = selectedCards.map((c, idx) => {
              if (idx === jokerIndices[0]) return { ...c, suit: s1, value: v1 };
              if (idx === jokerIndices[1]) return { ...c, suit: s2, value: v2 };
              return c;
            });
            candidates.push(...evaluateConcreteCards(clone, selectedCards, actorLevel));
          }
        }
      }
    }
  }

  const bestByComboId = new Map();
  for (const match of candidates) {
    const score = (match.damage || 0) + (match.heal || 0) + match.highestValue;
    const existing = bestByComboId.get(match.id);
    if (!existing || score > existing._score) {
      match._score = score;
      bestByComboId.set(match.id, match);
    }
  }

  return Array.from(bestByComboId.values()).sort((a, b) => b.priority - a.priority);
}
