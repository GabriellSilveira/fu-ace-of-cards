import {
  MODULE_ID,
  SUITS,
  SKILL_DEFAULT_ICONS,
  createFullDeck,
  getCardBackUrl,
  getCardImageUrl,
  getOfficialElementIconHtml,
  buildFallbackCardSvg,
  detectCombinations
} from "./deck-data.js";

const STORAGE_POS_KEY = `${MODULE_ID}.modalPosition`;
const STORAGE_MIN_KEY = `${MODULE_ID}.modalMinimized`;

export class AceOfCardsModal {
  constructor() {
    this.element = null;
    this.isOpen = false;
    this.isMinimized = localStorage.getItem(STORAGE_MIN_KEY) === "true";
    this.showTrapSuitPicker = false;
    this.selectedHandIds = new Set();
    this.chosenElement = null;
    this.chosenConditions = new Set(["shaken", "slow"]);
    this.spendMpAuto = true;
    this.showDiscardViewer = false;
    this.pendingDrawAnim = null;
  }

  hasAceClass(actor) {
    return Boolean(
      actor?.items?.some(i => i.type === "class" && i.system?.fuid === "ace-of-cards")
    );
  }

  getAceActor() {
    if (this.hasAceClass(game.user?.character)) {
      return game.user.character;
    }

    const playerLinkedActor = game.users.find(
      u => !u.isGM && this.hasAceClass(u.character)
    )?.character;
    if (playerLinkedActor) return playerLinkedActor;

    const varian = game.actors.find(
      a => a.name.toLowerCase().includes("varian") && this.hasAceClass(a)
    );
    if (varian) return varian;

    const aceActors = game.actors
      .filter(a => this.hasAceClass(a))
      .sort((a, b) => (b.system?.level?.value || 0) - (a.system?.level?.value || 0));

    return aceActors[0] || game.actors.find(a => a.name.toLowerCase().includes("varian")) || null;
  }

  canInteract() {
    if (game.user.isGM) return true;
    const actor = this.getAceActor();
    if (!actor) return false;
    return actor.testUserPermission(game.user, "OWNER");
  }

  getSkillNP(actor, fuid, fallback = 1) {
    const item = actor?.items?.find(i => i.system?.fuid === fuid);
    return Number(item?.system?.level?.value ?? fallback);
  }

  getSkillIcon(actor, fuid) {
    const item = actor?.items?.find(i => i.system?.fuid === fuid);
    return item?.img || SKILL_DEFAULT_ICONS[fuid] || "icons/sundries/gaming/playing-cards.webp";
  }

  getState() {
    const actor = this.getAceActor();
    const saved = actor?.getFlag(MODULE_ID, "deckState");
    if (saved && Array.isArray(saved.deck) && Array.isArray(saved.hand) && Array.isArray(saved.discard)) {
      return foundry.utils.deepClone(saved);
    }
    return {
      deck: this.shuffleArray(createFullDeck()),
      hand: [],
      discard: [],
      vanguard: [],
      inConflict: false
    };
  }

  async saveState(newState) {
    if (!this.canInteract()) {
      ui.notifications.warn("Apenas o Mestre ou o jogador do Carteador pode manipular o baralho.");
      return;
    }
    const actor = this.getAceActor();
    if (!actor) return;

    await actor.setFlag(MODULE_ID, "deckState", newState);
    game.socket.emit(`module.${MODULE_ID}`, { type: "refresh" });
    this.render();
  }

  shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * Compra cartas e as insere na ponta esquerda da mão (índice 0),
   * empurrando as cartas anteriores para a direita.
   */
  drawFromDeck(state, count, insertLeft = true) {
    let reshuffled = false;
    const drawnCards = [];
    for (let i = 0; i < count; i++) {
      if (state.deck.length === 0) {
        if (state.discard.length === 0) break;
        state.deck = this.shuffleArray(state.discard);
        state.discard = [];
        reshuffled = true;
      }
      const card = state.deck.shift();
      if (card) {
        if (insertLeft) {
          state.hand.unshift(card);
        } else {
          state.hand.push(card);
        }
        drawnCards.push(card);
      }
    }
    return { reshuffled, drawnCards };
  }

  captureCardPositions() {
    const rects = new Map();
    if (!this.element) return rects;
    this.element.querySelectorAll(".fu-ace-card[data-card-id]").forEach(el => {
      rects.set(el.dataset.cardId, el.getBoundingClientRect());
    });
    return rects;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    localStorage.setItem(STORAGE_MIN_KEY, String(this.isMinimized));
    this.render();
  }

  open() {
    this.isOpen = true;
    if (!this.element) {
      this.createContainer();
    }
    this.element.style.display = "flex";
    this.render();
  }

  close() {
    this.isOpen = false;
    this.showTrapSuitPicker = false;
    if (this.element) {
      this.element.style.display = "none";
    }
  }

  createContainer() {
    const div = document.createElement("div");
    div.id = "fu-ace-modal";
    div.className = "fu-ace-modal";

    const savedPos = JSON.parse(localStorage.getItem(STORAGE_POS_KEY) || "null");
    if (savedPos && typeof savedPos.left === "number" && typeof savedPos.top === "number") {
      div.style.left = `${Math.max(10, Math.min(window.innerWidth - 260, savedPos.left))}px`;
      div.style.top = `${Math.max(10, Math.min(window.innerHeight - 80, savedPos.top))}px`;
    } else {
      div.style.left = "90px";
      div.style.top = "95px";
    }

    document.body.appendChild(div);
    this.element = div;
  }

  bindDrag(handleEl) {
    if (!handleEl || !this.element) return;
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handleEl.addEventListener("pointerdown", e => {
      if (e.target.closest("button, input, select, label")) return;
      isDragging = true;
      const rect = this.element.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      handleEl.setPointerCapture(e.pointerId);
    });

    handleEl.addEventListener("pointermove", e => {
      if (!isDragging) return;
      const left = Math.max(0, Math.min(window.innerWidth - 160, e.clientX - offsetX));
      const top = Math.max(0, Math.min(window.innerHeight - 44, e.clientY - offsetY));
      this.element.style.left = `${left}px`;
      this.element.style.top = `${top}px`;
    });

    handleEl.addEventListener("pointerup", e => {
      if (!isDragging) return;
      isDragging = false;
      handleEl.releasePointerCapture(e.pointerId);
      const rect = this.element.getBoundingClientRect();
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
    });

    handleEl.addEventListener("dblclick", e => {
      if (e.target.closest("button, input, select, label")) return;
      e.preventDefault();
      this.toggleMinimize();
    });
  }

  formatCardPillHtml(card) {
    if (card.isJoker) {
      return `<span class="fu-ace-chat-pill is-joker">★ ${card.name}</span>`;
    }
    const suit = SUITS[card.suit];
    const numLabel = card.value === 1 ? "Ás" : card.value;
    return `
      <span class="fu-ace-chat-pill" style="border-color:${suit.color}">
        ${numLabel} de ${suit.name} @ICON[${suit.fuSuitIcon}] (@ICON[${suit.element}] ${suit.elementLabel})
      </span>
    `;
  }

  async postChatCard({ title, subtitle, bodyHtml, cards = [], footerHtml = "" }) {
    const actor = this.getAceActor();
    const cardsHtml = cards.length
      ? `<div class="fu-ace-chat-cards">${cards.map(c => this.formatCardPillHtml(c)).join("")}</div>`
      : "";

    const content = `
      <div class="fu-ace-chat-card">
        <div class="fu-ace-chat-header">
          <div class="fu-ace-chat-title">${title}</div>
          ${subtitle ? `<div class="fu-ace-chat-sub">${subtitle}</div>` : ""}
        </div>
        ${cardsHtml}
        <div class="fu-ace-chat-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="fu-ace-chat-footer">${footerHtml}</div>` : ""}
      </div>
    `;

    await ChatMessage.create({
      speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
      content
    });
  }

  // ==================== AÇÕES DO BARALHO E HABILIDADES ====================

  async actionStartConflict() {
    const state = {
      deck: this.shuffleArray(createFullDeck()),
      hand: [],
      discard: [],
      vanguard: [],
      inConflict: true
    };
    this.selectedHandIds.clear();
    const { drawnCards } = this.drawFromDeck(state, 5, false);

    this.pendingDrawAnim = {
      newCardIds: new Set(drawnCards.map(c => c.id)),
      prevRects: new Map()
    };

    await this.saveState(state);

    await this.postChatCard({
      title: "Início de Conflito — Baralho Embaralhado",
      subtitle: "30 cartas embaralhadas • 5 cartas compradas para a mão inicial",
      bodyHtml: `<p>O baralho do destino foi embaralhado e <strong>5 cartas</strong> foram puxadas.</p>`
    });
  }

  async actionEndConflict() {
    const state = {
      deck: this.shuffleArray(createFullDeck()),
      hand: [],
      discard: [],
      vanguard: [],
      inConflict: false
    };
    this.selectedHandIds.clear();
    await this.saveState(state);

    await this.postChatCard({
      title: "Fim de Conflito — Baralho Recolhido",
      subtitle: "Mão, descarte e vanguarda devolvidos ao baralho (30 cartas)",
      bodyHtml: `<p>Todas as 30 cartas foram embaralhadas de volta ao baralho.</p>`
    });
  }

  async actionDraw(count = 1) {
    const prevRects = this.captureCardPositions();
    const state = this.getState();
    const { reshuffled, drawnCards } = this.drawFromDeck(state, count, true);
    const drawn = drawnCards.length;

    if (drawn > 0) {
      this.pendingDrawAnim = {
        newCardIds: new Set(drawnCards.map(c => c.id)),
        prevRects
      };
    }

    await this.saveState(state);

    await this.postChatCard({
      title: `Comprou ${drawn} Carta${drawn > 1 ? "s" : ""}`,
      subtitle: `Baralho: ${state.deck.length} | Mão: ${state.hand.length} | Descarte: ${state.discard.length}`,
      bodyHtml: reshuffled
        ? `<p>A pilha de descarte foi reembaralhada para formar um novo baralho antes de completar a compra.</p>`
        : `<p>Comprou <strong>${drawn}</strong> carta(s) do topo do baralho.</p>`
    });
  }

  async actionShuffleDeckOnly() {
    const state = this.getState();
    state.deck = this.shuffleArray(state.deck);
    await this.saveState(state);

    await this.postChatCard({
      title: "Baralho Embaralhado",
      subtitle: `${state.deck.length} cartas restantes no baralho`,
      bodyHtml: `<p>As cartas restantes no baralho foram embaralhadas.</p>`
    });
  }

  async actionDiscardSelected(reason = "Descarte Manual") {
    const state = this.getState();
    const selected = state.hand.filter(c => this.selectedHandIds.has(c.id));
    if (!selected.length) {
      ui.notifications.warn("Selecione ao menos uma carta na mão.");
      return;
    }

    state.hand = state.hand.filter(c => !this.selectedHandIds.has(c.id));
    state.discard.push(...selected);
    this.selectedHandIds.clear();
    await this.saveState(state);

    await this.postChatCard({
      title: reason,
      subtitle: `${selected.length} carta(s) enviada(s) para a pilha de descarte`,
      cards: selected,
      bodyHtml: `<p>Cartas colocadas com a face para cima no topo da pilha de descarte.</p>`
    });
  }

  async actionMoveSelectedToDeck(position = "bottom") {
    const state = this.getState();
    const selected = state.hand.filter(c => this.selectedHandIds.has(c.id));
    if (!selected.length) {
      ui.notifications.warn("Selecione ao menos uma carta na mão.");
      return;
    }

    state.hand = state.hand.filter(c => !this.selectedHandIds.has(c.id));
    if (position === "top") {
      state.deck.unshift(...selected);
    } else {
      state.deck.push(...selected);
    }
    this.selectedHandIds.clear();
    await this.saveState(state);

    const posLabel = position === "top" ? "topo" : "fundo";
    await this.postChatCard({
      title: `Cartas Movidas para o ${posLabel.toUpperCase()} do Baralho`,
      subtitle: `${selected.length} carta(s) devolvida(s) com face para baixo`,
      bodyHtml: `<p><strong>${selected.length}</strong> carta(s) da mão foram colocadas no <strong>${posLabel}</strong> do baralho.</p>`
    });
  }

  async actionResolveMagicCards(combo) {
    const actor = this.getAceActor();
    const state = this.getState();
    const selected = state.hand.filter(c => this.selectedHandIds.has(c.id));

    if (selected.length < 2) {
      ui.notifications.warn("Selecione de 2 a 5 cartas para formar um conjunto.");
      return;
    }

    const magicCardsNP = this.getSkillNP(actor, "magic-cards", 3);
    const maxMpAllowed = 10 + magicCardsNP * 5;
    const mpCost = selected.length * 5;

    if (mpCost > maxMpAllowed) {
      ui.notifications.warn(`Cartas Mágicas (NP ${magicCardsNP}) permite gastar no máximo ${maxMpAllowed} PM.`);
      return;
    }

    if (this.spendMpAuto && actor) {
      const currentMp = Number(actor.system?.resources?.mp?.value ?? 0);
      if (currentMp < mpCost) {
        ui.notifications.warn(`PM insuficiente na ficha de ${actor.name} (${currentMp}/${mpCost} PM).`);
        return;
      }
      await actor.update({ "system.resources.mp.value": currentMp - mpCost });
    }

    const highLowNP = this.getSkillNP(actor, "high-or-low", 1);
    const hasJoker = selected.some(c => c.isJoker);
    const hasSeven = selected.some(c => !c.isJoker && c.value === 7);
    const hasOne = selected.some(c => !c.isJoker && c.value === 1);

    const highLowNotes = [];
    if (hasJoker || hasSeven) {
      highLowNotes.push(`<strong>Altos e Baixos (+${highLowNP} dano):</strong> causa <strong>${highLowNP}</strong> de dano extra até o início do próximo turno.`);
    }
    if (hasJoker || hasOne) {
      highLowNotes.push(`<strong>Altos e Baixos (-${highLowNP} dano sofrido):</strong> reduz todo dano sofrido em <strong>${highLowNP}</strong> até o início do próximo turno.`);
    }
    if (!hasJoker && !hasSeven && !hasOne) {
      const healHp = highLowNP * 2;
      highLowNotes.push(`<strong>Altos e Baixos:</strong> recupera @HEAL[${healHp} hp] (nenhum Curinga, 1 ou 7 usado).`);
    }

    state.hand = state.hand.filter(c => !this.selectedHandIds.has(c.id));
    state.discard.push(...selected);
    this.selectedHandIds.clear();
    await this.saveState(state);

    let effectBlock = `<p><strong>Sem conjunto válido:</strong> cartas resolvidas individualmente.</p>`;
    if (combo) {
      const chosenSuitKey =
        this.chosenElement && combo.uniqueSuits.includes(this.chosenElement)
          ? this.chosenElement
          : combo.uniqueSuits[0];
      const chosenSuit = SUITS[chosenSuitKey] || SUITS.diamonds;

      if (combo.id === "magic-pair") {
        effectBlock = `
          <p><strong>${combo.name}:</strong> Realize um <strong>ataque livre</strong> com uma arma equipada. Todo o dano causado torna-se do tipo @ICON[${chosenSuit.element}] <strong>${chosenSuit.elementLabel}</strong> (@ICON[${chosenSuit.fuSuitIcon}] ${chosenSuit.name}).</p>
        `;
      } else if (combo.id === "double-trouble") {
        effectBlock = `
          <p><strong>${combo.name}:</strong> Escolha <strong>1 ou 2 inimigos</strong> presentes na cena (@ICON[${chosenSuit.fuSuitIcon}] ${chosenSuit.name}): @DMG[${combo.damage} ${chosenSuit.element}]</p>
        `;
      } else if (combo.id === "magic-flush") {
        effectBlock = `
          <p><strong>${combo.name}:</strong> Cada inimigo presente na cena sofre: @DMG[${combo.damage} ${combo.damageType}]</p>
        `;
      } else if (combo.id === "blinding-flush") {
        effectBlock = `
          <p><strong>${combo.name}:</strong> Cada inimigo presente na cena sofre: @DMG[${combo.damage} ${combo.damageType}]</p>
        `;
      } else if (combo.id === "support-triple") {
        effectBlock = `
          <p><strong>${combo.name}:</strong> Você e todos os aliados presentes na cena recuperam @HEAL[${combo.heal} hp] e @HEAL[${combo.heal} mp].</p>
        `;
      } else if (combo.id === "jackpot") {
        effectBlock = `
          <p><strong>${combo.name}:</strong> Você e todos os aliados presentes na cena recuperam @HEAL[777 hp] e @HEAL[777 mp], e PJs rendidos recuperam a consciência!</p>
        `;
      } else if (combo.id === "full-status") {
        const condList = Array.from(this.chosenConditions);
        const condTags = condList.map(c => `@EFFECT[${c}]`).join(" e ");
        const targetText = combo.isHighestEven
          ? `Você e todos os aliados na cena <strong>se recuperam</strong> de: ${condTags}`
          : `Cada inimigo na cena <strong>sofre</strong>: ${condTags}`;
        effectBlock = `<p><strong>${combo.name}:</strong> ${targetText}</p>`;
      }
    }

    await this.postChatCard({
      title: `Cartas Mágicas — ${combo ? combo.name : "Conjunto Livre"}`,
      subtitle: `Custo: ${mpCost} PM • ${selected.length} carta(s) descartada(s)`,
      cards: selected,
      bodyHtml: `
        ${effectBlock}
        <div class="fu-ace-chat-subblock">${highLowNotes.join("<br>")}</div>
      `,
      footerHtml: `@LOSS[${mpCost} mp]`
    });
  }

  async actionMulligan() {
    const actor = this.getAceActor();
    const state = this.getState();
    const selected = state.hand.filter(c => this.selectedHandIds.has(c.id));

    if (!selected.length) {
      ui.notifications.warn("Selecione as cartas da mão que deseja descartar no Mulligan.");
      return;
    }

    const mulliganNP = this.getSkillNP(actor, "mulligan", 1);
    state.hand = state.hand.filter(c => !this.selectedHandIds.has(c.id));
    state.discard.push(...selected);
    this.selectedHandIds.clear();
    await this.saveState(state);

    await this.postChatCard({
      title: `Mulligan (NP ${mulliganNP})`,
      subtitle: `Descartou ${selected.length} carta(s) da mão`,
      cards: selected,
      bodyHtml: `<p>Descartou <strong>${selected.length}</strong> carta(s) da mão (compre ${selected.length} carta(s) usando <strong>Comprar 1</strong>).</p>`
    });
  }

  async actionTrapCardBottomReveal(declaredSuitKey) {
    this.showTrapSuitPicker = false;
    const actor = this.getAceActor();
    const state = this.getState();
    const trapNP = this.getSkillNP(actor, "trap-card", 4);
    const maxSpellMp = trapNP * 5;

    if (state.deck.length === 0) {
      if (state.discard.length === 0) return;
      state.deck = this.shuffleArray(state.discard);
      state.discard = [];
    }

    const bottomCard = state.deck.pop();
    state.discard.push(bottomCard);
    await this.saveState(state);

    const declaredSuit = SUITS[declaredSuitKey];
    const success = bottomCard.isJoker || bottomCard.suit === declaredSuitKey;

    await this.postChatCard({
      title: `Carta Armadilha — Fundo do Baralho`,
      subtitle: `Naipe declarado: ${declaredSuit.name} @ICON[${declaredSuit.fuSuitIcon}] (@ICON[${declaredSuit.element}] ${declaredSuit.elementLabel})`,
      cards: [bottomCard],
      bodyHtml: success
        ? `<p><strong>SUCESSO!</strong> A carta do fundo era <strong>${bottomCard.name}</strong>. Você pode lançar um <strong>Feitiço</strong> de graça com custo até <strong>${maxSpellMp} PM</strong>!</p>`
        : `<p><strong>Falhou:</strong> A carta do fundo era <strong>${bottomCard.name}</strong> (não corresponde a ${declaredSuit.name} @ICON[${declaredSuit.fuSuitIcon}]).</p>`
    });
  }

  async actionHighOrLowSwap() {
    const state = this.getState();
    const selected = state.hand.filter(c => this.selectedHandIds.has(c.id));
    if (selected.length !== 1) {
      ui.notifications.warn("Selecione exatamente 1 carta na mão para descartar ao usar Altos e Baixos.");
      return;
    }

    state.hand = state.hand.filter(c => c.id !== selected[0].id);
    state.discard.push(selected[0]);
    this.selectedHandIds.clear();
    await this.saveState(state);

    await this.postChatCard({
      title: "Altos e Baixos — Descarte Crítico",
      subtitle: "Descartou 1 carta da mão",
      cards: selected,
      bodyHtml: `<p>Descartou <strong>${selected[0].name}</strong> da mão por <strong>Altos e Baixos</strong> (use <strong>Comprar 1</strong> para puxar sua carta).</p>`
    });
  }

  async actionDoubleOrNothing() {
    await this.postChatCard({
      title: "Dobro ou Nada!",
      subtitle: "Declaração antes do Teste",
      bodyHtml: `<p>O Carteador declarou <strong>Dobro ou Nada</strong> antes da rolagem! Dados com resultado <strong>par</strong> têm seu valor dobrado; dados <strong>ímpares</strong> contam como <strong>1</strong>.</p>`
    });
  }

  async actionPlaceVanguard() {
    const state = this.getState();
    if (state.vanguard.length >= 2) {
      ui.notifications.warn("Você já possui o máximo de 2 cartas de vanguarda em jogo.");
      return;
    }
    const selected = state.hand.filter(c => this.selectedHandIds.has(c.id));
    if (selected.length !== 1) {
      ui.notifications.warn("Selecione exatamente 1 carta da mão para baixar como Carta de Vanguarda.");
      return;
    }

    state.hand = state.hand.filter(c => c.id !== selected[0].id);
    state.vanguard.push(selected[0]);
    this.selectedHandIds.clear();
    await this.saveState(state);

    await this.postChatCard({
      title: "Vanguarda de Cartas",
      subtitle: `Baixou 1 carta virada para baixo (${state.vanguard.length}/2 em jogo)`,
      bodyHtml: `<p>Uma carta foi posicionada com a face para baixo na <strong>Vanguarda</strong> (use <strong>Comprar 1</strong> para puxar 1 carta).</p>`
    });
  }

  async actionRevealVanguard(index) {
    const state = this.getState();
    const card = state.vanguard[index];
    if (!card) return;

    state.vanguard.splice(index, 1);
    state.discard.push(card);
    await this.saveState(state);

    const elemText = card.isJoker
      ? "<strong>Curinga (absorve qualquer tipo de dano!)</strong>"
      : `naipe de <strong>${SUITS[card.suit].name}</strong> @ICON[${SUITS[card.suit].fuSuitIcon}] (@ICON[${SUITS[card.suit].element}] ${SUITS[card.suit].elementLabel})`;

    await this.postChatCard({
      title: "Vanguarda de Cartas Revelada!",
      subtitle: "Carta enviada ao topo da pilha de descarte",
      cards: [card],
      bodyHtml: `<p>Revelou <strong>${card.name}</strong> (${elemText}). Se corresponder ao tipo de dano sofrido, você <strong>não sofre o dano</strong> e recupera essa mesma quantidade em <strong>PM</strong>!</p>`
    });
  }

  // ==================== ANIMAÇÃO DE COMPRA (FLIP + EMPURRAR) ====================

  runDrawAnimations(animPayload) {
    if (!animPayload || !this.element) return;
    const { newCardIds, prevRects } = animPayload;
    const cardEls = Array.from(this.element.querySelectorAll(".fu-ace-card[data-card-id]"));
    if (!cardEls.length) return;

    const transitionsToRestore = [];

    // 1. FLIP nas cartas antigas para deslizarem suavemente para a direita
    for (const el of cardEls) {
      const id = el.dataset.cardId;
      if (newCardIds.has(id)) continue;
      const oldRect = prevRects.get(id);
      if (!oldRect) continue;

      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        const targetTransform = el.style.transform || "";
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px) ${targetTransform}`;
        transitionsToRestore.push({ el, targetTransform });
      }
    }

    // 2. Cartas recém-compradas: começam viradas (verso) à esquerda e giram para a frente
    const drawnEls = cardEls.filter(el => newCardIds.has(el.dataset.cardId));
    for (const el of drawnEls) {
      const targetTransform = el.style.transform || "";
      el.style.transition = "none";
      el.style.transform = `translate(-48px, -10px) rotateY(180deg) scale(0.92)`;
      transitionsToRestore.push({ el, targetTransform, isDrawn: true });
    }

    if (!transitionsToRestore.length) return;

    // Força reflow e dispara a transição suave
    void this.element.offsetWidth;

    requestAnimationFrame(() => {
      for (const item of transitionsToRestore) {
        item.el.style.transition = item.isDrawn
          ? "transform 0.58s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s ease"
          : "transform 0.46s cubic-bezier(0.22, 1, 0.36, 1)";
        item.el.style.transform = item.targetTransform;
      }

      setTimeout(() => {
        for (const item of transitionsToRestore) {
          if (!item.el.isConnected) continue;
          item.el.style.transition = "";
          item.el.classList.remove("is-newly-drawn");
          item.el.querySelector(".fu-ace-card-flip-back")?.remove();
        }
      }, 620);
    });
  }

  // ==================== RENDERIZAÇÃO DA INTERFACE ====================

  render() {
    if (!this.element || !this.isOpen) return;

    const animPayload = this.pendingDrawAnim;
    this.pendingDrawAnim = null;

    const actor = this.getAceActor();
    const canEdit = this.canInteract();
    const state = this.getState();
    const actorLevel = Number(actor?.system?.level?.value ?? 21);
    const mpCurrent = Number(actor?.system?.resources?.mp?.value ?? 0);
    const mpMax = Number(actor?.system?.resources?.mp?.max ?? 0);

    this.element.classList.toggle("is-minimized", this.isMinimized);

    // MODO MINIMIZADO
    if (this.isMinimized) {
      const handSummary = state.hand.length
        ? state.hand
            .map(c => {
              const cls = c.isJoker ? "is-joker" : `suit-${c.suit}`;
              return `<span class="fu-ace-mini-pill ${cls}">${c.shortLabel}</span>`;
            })
            .join("")
        : `<span class="fu-ace-muted">Mão vazia</span>`;

      this.element.innerHTML = `
        <header class="fu-ace-header" title="Duplo clique para expandir">
          <div class="fu-ace-title">
            <i class="fa-solid fa-wand-sparkles"></i>
            <span><strong>${actor?.name || "Varian"}</strong> (Nv.${actorLevel})</span>
            <span class="fu-ace-mp-badge">PM: ${mpCurrent}/${mpMax}</span>
          </div>
          <div class="fu-ace-win-btns">
            <button type="button" data-action="toggle-min" title="Expandir"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
            <button type="button" data-action="close" title="Fechar"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </header>
        <div class="fu-ace-minimized-body">
          <div class="fu-ace-min-stats">
            <span title="Cartas no Baralho"><i class="fa-solid fa-layer-group"></i> ${state.deck.length}</span>
            <span title="Cartas na Mão"><i class="fa-solid fa-hand"></i> ${state.hand.length}</span>
            <span title="Cartas no Descarte"><i class="fa-solid fa-trash-can"></i> ${state.discard.length}</span>
            ${
              canEdit
                ? `<button type="button" class="fu-ace-min-draw" data-action="draw-1" title="Comprar 1 carta">+1 Carta</button>`
                : ""
            }
          </div>
          <div class="fu-ace-min-hand">${handSummary}</div>
        </div>
      `;

      this.bindDrag(this.element.querySelector(".fu-ace-header"));
      this.element.querySelector("[data-action='toggle-min']")?.addEventListener("click", () => this.toggleMinimize());
      this.element.querySelector("[data-action='close']")?.addEventListener("click", () => this.close());
      this.element.querySelector("[data-action='draw-1']")?.addEventListener("click", () => this.actionDraw(1));
      return;
    }

    // Limpa seleções inválidas
    const handIds = new Set(state.hand.map(c => c.id));
    for (const id of Array.from(this.selectedHandIds)) {
      if (!handIds.has(id)) this.selectedHandIds.delete(id);
    }

    const selectedCards = state.hand.filter(c => this.selectedHandIds.has(c.id));
    const combos = detectCombinations(selectedCards, actorLevel);
    const activeCombo = combos[0] || null;

    const topDiscard = state.discard.length ? state.discard[state.discard.length - 1] : null;
    const backImg = getCardBackUrl();
    const backFallback = buildFallbackCardSvg(null);

    const totalHand = state.hand.length;
    const handHtml = totalHand
      ? state.hand
          .map((card, index) => {
            const isSelected = this.selectedHandIds.has(card.id);
            const isNewlyDrawn = animPayload?.newCardIds?.has(card.id);
            const mid = (totalHand - 1) / 2;
            const offset = index - mid;
            const angle = offset * 4.5;
            const translateY = Math.abs(offset) * 3.5;
            const fallback = buildFallbackCardSvg(card);
            const suitObj = card.isJoker ? null : SUITS[card.suit];
            const suitClass = card.isJoker ? "is-joker" : `suit-${card.suit}`;

            const elemBadgeHtml = card.isJoker
              ? `<span class="fu-ace-card-elem is-joker" title="Coringa (Qualquer Elemento)"><i class="fa-solid fa-crown"></i></span>`
              : `<span class="fu-ace-card-elem" title="Elemento: ${suitObj.elementLabel}">
                   ${getOfficialElementIconHtml(card.suit)}
                 </span>`;

            const flipBackHtml = isNewlyDrawn
              ? `<div class="fu-ace-card-flip-back">
                   <img src="${backImg}" data-fallback="${backFallback}" onerror="this.onerror=null; this.src=this.dataset.fallback;" alt="Verso" />
                 </div>`
              : "";

            return `
              <div class="fu-ace-card ${isSelected ? "is-selected" : ""} ${card.isJoker ? "is-joker-card" : ""} ${isNewlyDrawn ? "is-newly-drawn" : ""}"
                   data-card-id="${card.id}"
                   title="${card.name}"
                   style="transform: translateY(${translateY}px) rotate(${angle}deg); z-index:${isSelected ? 50 + index : 10 + index};">
                <div class="fu-ace-card-face">
                  <img src="${getCardImageUrl(card)}" data-fallback="${fallback}" onerror="this.onerror=null; this.src=this.dataset.fallback;" alt="${card.name}" />
                  <div class="fu-ace-card-corner">
                    <span class="fu-ace-card-tag ${suitClass}">${card.shortLabel}</span>
                    ${elemBadgeHtml}
                  </div>
                </div>
                ${flipBackHtml}
              </div>
            `;
          })
          .join("")
      : `<div class="fu-ace-empty-hand">Mão vazia — clique em <strong>Iniciar Conflito</strong> ou <strong>Comprar 1</strong></div>`;

    const vanguardHtml = [0, 1]
      .map(slotIdx => {
        const vCard = state.vanguard[slotIdx];
        if (!vCard) {
          return `<div class="fu-ace-vanguard-slot is-empty" title="Slot Vanguarda ${slotIdx + 1}">Vanguarda ${slotIdx + 1}</div>`;
        }
        return `
          <div class="fu-ace-vanguard-slot has-card" data-vanguard-idx="${slotIdx}" title="Clique para revelar Carta de Vanguarda">
            <img src="${backImg}" data-fallback="${backFallback}" onerror="this.onerror=null; this.src=this.dataset.fallback;" alt="Vanguarda" />
            <span>Revelar #${slotIdx + 1}</span>
          </div>
        `;
      })
      .join("");

    // Ícones oficiais da ficha do Varian
    const iconMagicCards = this.getSkillIcon(actor, "magic-cards");
    const iconMulligan = this.getSkillIcon(actor, "mulligan");
    const iconTrapCard = this.getSkillIcon(actor, "trap-card");
    const iconHighLow = this.getSkillIcon(actor, "high-or-low");
    const iconDoubleNothing = this.getSkillIcon(actor, "double-or-nothing");
    const iconVanguard = this.getSkillIcon(actor, "card-vanguard");

    let comboExtraHtml = "";
    if (activeCombo && canEdit) {
      if (activeCombo.id === "magic-pair" || activeCombo.id === "double-trouble") {
        const suitOptions = activeCombo.uniqueSuits
          .map(sKey => {
            const s = SUITS[sKey];
            const active = (this.chosenElement || activeCombo.uniqueSuits[0]) === sKey;
            const officialIcon = getOfficialElementIconHtml(sKey);
            return `<button type="button" class="fu-ace-chip ${active ? "is-active" : ""}" data-choose-suit="${sKey}">
              <span class="fu-ace-chip-icon">${officialIcon}</span>
              <span>${s.elementLabel}</span>
            </button>`;
          })
          .join("");
        comboExtraHtml = `<div class="fu-ace-combo-opts"><span>Elemento:</span> ${suitOptions}</div>`;
      } else if (activeCombo.id === "full-status") {
        const conds = [
          { id: "shaken", label: "Abalado" },
          { id: "dazed", label: "Atordoado" },
          { id: "weak", label: "Fraco" },
          { id: "slow", label: "Lento" }
        ];
        comboExtraHtml = `<div class="fu-ace-combo-opts"><span>2 Condições:</span> ${conds
          .map(
            c =>
              `<button type="button" class="fu-ace-chip ${this.chosenConditions.has(c.id) ? "is-active" : ""}" data-toggle-cond="${c.id}">${c.label}</button>`
          )
          .join("")}</div>`;
      }
    }

    const trapPickerOverlayHtml =
      this.showTrapSuitPicker && canEdit
        ? `
        <div class="fu-ace-submodal-backdrop">
          <div class="fu-ace-submodal">
            <div class="fu-ace-submodal-head">
              <span><img src="${iconTrapCard}" class="fu-ace-btn-icon" /> Carta Armadilha — Declarar Naipe</span>
              <button type="button" data-action="close-trap-picker"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p class="fu-ace-submodal-text">Escolha o naipe que deseja declarar antes de revelar a carta do fundo do baralho:</p>
            <div class="fu-ace-suit-grid">
              ${Object.values(SUITS)
                .map(
                  s => `
                <button type="button" class="fu-ace-suit-choice" data-declare-suit="${s.id}">
                  <span class="fu-ace-suit-sym" style="color:${s.color}">${s.symbol}</span>
                  <span class="fu-ace-suit-name">${s.name}</span>
                  <span class="fu-ace-suit-elem">${getOfficialElementIconHtml(s.id)} ${s.elementLabel}</span>
                </button>
              `
                )
                .join("")}
            </div>
          </div>
        </div>
      `
        : "";

    const discardViewerHtml = this.showDiscardViewer
      ? `
        <div class="fu-ace-discard-drawer">
          <div class="fu-ace-drawer-head">
            <strong>Pilha de Descarte (${state.discard.length} — ordem fixa, topo à direita)</strong>
            <button type="button" data-action="toggle-discard-view"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="fu-ace-drawer-list">
            ${
              state.discard.length
                ? state.discard
                    .map(
                      c => `<div class="fu-ace-mini-card" title="${c.name}">
                        <img src="${getCardImageUrl(c)}" data-fallback="${buildFallbackCardSvg(c)}" onerror="this.onerror=null; this.src=this.dataset.fallback;" />
                        <span>${c.shortLabel}</span>
                      </div>`
                    )
                    .join("")
                : `<span class="fu-ace-muted">Nenhuma carta descartada ainda.</span>`
            }
          </div>
        </div>
      `
      : "";

    this.element.innerHTML = `
      <header class="fu-ace-header" title="Arraste para mover • Duplo clique para minimizar">
        <div class="fu-ace-title">
          <i class="fa-solid fa-wand-sparkles"></i>
          <span>Baralho do Carteador — <strong>${actor?.name || "Varian"}</strong> (Nv.${actorLevel})</span>
          <span class="fu-ace-mp-badge">PM: ${mpCurrent}/${mpMax}</span>
          ${!canEdit ? `<span class="fu-ace-readonly-badge">Modo Espectador</span>` : ""}
        </div>
        <div class="fu-ace-win-btns">
          <button type="button" data-action="toggle-min" title="Minimizar"><i class="fa-solid fa-window-minimize"></i></button>
          <button type="button" data-action="close" title="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </header>

      <div class="fu-ace-body">
        <!-- COLUNA ESQUERDA: BARALHO E DESCARTE -->
        <div class="fu-ace-piles-col">
          <div class="fu-ace-pile-box" title="Baralho (${state.deck.length}/30 cartas)">
            <div class="fu-ace-pile-card">
              ${
                state.deck.length > 0
                  ? `<img src="${backImg}" data-fallback="${backFallback}" onerror="this.onerror=null; this.src=this.dataset.fallback;" alt="Baralho" />`
                  : `<div class="fu-ace-pile-empty">Vazio</div>`
              }
              <span class="fu-ace-pile-count">${state.deck.length}</span>
            </div>
            <span class="fu-ace-pile-label">Baralho</span>
          </div>

          <div class="fu-ace-pile-box" title="Clique para ver a pilha de descarte">
            <div class="fu-ace-pile-card is-clickable" data-action="toggle-discard-view">
              ${
                topDiscard
                  ? `<img src="${getCardImageUrl(topDiscard)}" data-fallback="${buildFallbackCardSvg(topDiscard)}" onerror="this.onerror=null; this.src=this.dataset.fallback;" alt="${topDiscard.name}" />`
                  : `<div class="fu-ace-pile-empty">Descarte</div>`
              }
              <span class="fu-ace-pile-count">${state.discard.length}</span>
            </div>
            <span class="fu-ace-pile-label">Descarte</span>
          </div>
        </div>

        <!-- ÁREA DIREITA: MÃO EM LEQUE + CONTROLES -->
        <div class="fu-ace-main-col">
          <div class="fu-ace-hand-row">
            <div class="fu-ace-hand-fan">
              ${handHtml}
            </div>
            <div class="fu-ace-vanguard-col">
              ${vanguardHtml}
            </div>
          </div>

          <!-- PAINEL DE DETECÇÃO DE CONJUNTO -->
          <div class="fu-ace-combo-banner ${activeCombo ? "has-combo" : ""}">
            ${
              selectedCards.length === 0
                ? `<span>Selecione cartas na mão para montar um conjunto ou descartar.</span>`
                : activeCombo
                ? `<div class="fu-ace-combo-info">
                     <div class="fu-ace-combo-top">
                       <strong>✨ ${activeCombo.name}</strong>
                       <span>(${selectedCards.length} cartas • ${selectedCards.length * 5} PM)</span>
                     </div>
                     <div class="fu-ace-combo-desc">${activeCombo.summary}</div>
                     ${comboExtraHtml}
                   </div>`
                : `<span><strong>${selectedCards.length} carta(s) selecionada(s)</strong> (${selectedCards.length * 5} PM) — nenhum conjunto especial formado.</span>`
            }
          </div>

          <!-- BOTÕES DE AÇÃO NA ORDEM EXATA (3 POR LINHA) -->
          ${
            canEdit
              ? `
            <div class="fu-ace-actions-grid">
              <!-- Linha 1: Iniciar Conflito, Embaralhar, Comprar 1 -->
              <button type="button" class="fu-ace-btn is-primary" data-action="start-conflict" title="Embaralha as 30 cartas e compra 5">
                <i class="fa-solid fa-play"></i> Iniciar Conflito
              </button>

              <button type="button" class="fu-ace-btn" data-action="shuffle-deck" title="Embaralha as cartas restantes no baralho">
                <i class="fa-solid fa-shuffle"></i> Embaralhar
              </button>

              <button type="button" class="fu-ace-btn" data-action="draw-1" title="Compra 1 carta do topo do baralho">
                <i class="fa-solid fa-plus"></i> Comprar 1
              </button>

              <!-- Linha 2: Descartar, Topo do Baralho, Fundo do Baralho -->
              <button type="button" class="fu-ace-btn" data-action="discard-selected" ${selectedCards.length === 0 ? "disabled" : ""}>
                <i class="fa-solid fa-trash-can"></i> Descartar (${selectedCards.length})
              </button>

              <button type="button" class="fu-ace-btn" data-action="to-top" ${selectedCards.length === 0 ? "disabled" : ""}>
                <i class="fa-solid fa-arrow-up"></i> Topo do Baralho
              </button>

              <button type="button" class="fu-ace-btn" data-action="to-bottom" ${selectedCards.length === 0 ? "disabled" : ""}>
                <i class="fa-solid fa-arrow-down"></i> Fundo do Baralho
              </button>

              <!-- Linha 3: Cartas Mágicas, Mulligan, Armadilha -->
              <button type="button" class="fu-ace-btn is-accent" data-action="resolve-magic" ${selectedCards.length < 2 ? "disabled" : ""} title="Gasta 5 PM por carta, resolve o conjunto e descarta">
                <img src="${iconMagicCards}" class="fu-ace-btn-icon" alt="" /> Cartas Mágicas (${selectedCards.length * 5} PM)
              </button>

              <button type="button" class="fu-ace-btn" data-action="mulligan" ${selectedCards.length === 0 ? "disabled" : ""}>
                <img src="${iconMulligan}" class="fu-ace-btn-icon" alt="" /> Mulligan (${selectedCards.length})
              </button>

              <button type="button" class="fu-ace-btn" data-action="trap-bottom" title="Declara um naipe e revela/descarta a carta do fundo do baralho">
                <img src="${iconTrapCard}" class="fu-ace-btn-icon" alt="" /> Armadilha
              </button>

              <!-- Linha 4: Altos e Baixos, Dobro ou Nada, Vanguarda -->
              <button type="button" class="fu-ace-btn" data-action="high-low" ${selectedCards.length !== 1 ? "disabled" : ""} title="Descarta 1 carta selecionada da mão">
                <img src="${iconHighLow}" class="fu-ace-btn-icon" alt="" /> Altos e Baixos
              </button>

              <button type="button" class="fu-ace-btn" data-action="double-nothing">
                <img src="${iconDoubleNothing}" class="fu-ace-btn-icon" alt="" /> Dobro ou Nada
              </button>

              <button type="button" class="fu-ace-btn" data-action="place-vanguard" ${selectedCards.length !== 1 || state.vanguard.length >= 2 ? "disabled" : ""}>
                <img src="${iconVanguard}" class="fu-ace-btn-icon" alt="" /> Vanguarda
              </button>

              <!-- Linha 5: Fim do Conflito -->
              <button type="button" class="fu-ace-btn is-danger" data-action="end-conflict">
                <i class="fa-solid fa-stop"></i> Fim do Conflito
              </button>
            </div>

            <div class="fu-ace-footer-bar">
              <label class="fu-ace-checkbox">
                <input type="checkbox" data-action="toggle-mp-auto" ${this.spendMpAuto ? "checked" : ""} />
                <span>Descontar PM da ficha de <strong>${actor?.name || "Varian"}</strong> automaticamente</span>
              </label>
            </div>
          `
              : `<div class="fu-ace-spectator-note">Visualização pública sincronizada em tempo real.</div>`
          }
        </div>
      </div>

      ${discardViewerHtml}
      ${trapPickerOverlayHtml}
    `;

    this.bindEvents(activeCombo, canEdit);

    if (animPayload) {
      this.runDrawAnimations(animPayload);
    }
  }

  bindEvents(activeCombo, canEdit) {
    this.bindDrag(this.element.querySelector(".fu-ace-header"));

    this.element.querySelectorAll("[data-action='close']").forEach(btn =>
      btn.addEventListener("click", () => this.close())
    );

    this.element.querySelectorAll("[data-action='toggle-min']").forEach(btn =>
      btn.addEventListener("click", () => this.toggleMinimize())
    );

    this.element.querySelectorAll("[data-action='toggle-discard-view']").forEach(el =>
      el.addEventListener("click", () => {
        this.showDiscardViewer = !this.showDiscardViewer;
        this.render();
      })
    );

    if (!canEdit) return;

    this.element.querySelectorAll(".fu-ace-card[data-card-id]").forEach(cardEl => {
      cardEl.addEventListener("click", () => {
        const id = cardEl.dataset.cardId;
        if (this.selectedHandIds.has(id)) {
          this.selectedHandIds.delete(id);
        } else {
          if (this.selectedHandIds.size >= 5) {
            ui.notifications.warn("Você pode selecionar no máximo 5 cartas por vez.");
            return;
          }
          this.selectedHandIds.add(id);
        }
        this.render();
      });
    });

    this.element.querySelectorAll(".fu-ace-vanguard-slot[data-vanguard-idx]").forEach(slotEl => {
      slotEl.addEventListener("click", () => {
        this.actionRevealVanguard(Number(slotEl.dataset.vanguardIdx));
      });
    });

    this.element.querySelectorAll("[data-choose-suit]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.chosenElement = btn.dataset.chooseSuit;
        this.render();
      });
    });

    this.element.querySelectorAll("[data-toggle-cond]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cond = btn.dataset.toggleCond;
        if (this.chosenConditions.has(cond)) {
          this.chosenConditions.delete(cond);
        } else if (this.chosenConditions.size < 2) {
          this.chosenConditions.add(cond);
        }
        this.render();
      });
    });

    const mpCheckbox = this.element.querySelector("[data-action='toggle-mp-auto']");
    if (mpCheckbox) {
      mpCheckbox.addEventListener("change", e => {
        this.spendMpAuto = e.target.checked;
      });
    }

    const bindAction = (action, fn) => {
      this.element.querySelectorAll(`[data-action='${action}']`).forEach(el =>
        el.addEventListener("click", fn)
      );
    };

    bindAction("start-conflict", () => this.actionStartConflict());
    bindAction("end-conflict", () => this.actionEndConflict());
    bindAction("draw-1", () => this.actionDraw(1));
    bindAction("shuffle-deck", () => this.actionShuffleDeckOnly());
    bindAction("discard-selected", () => this.actionDiscardSelected("Cartas Descartadas"));
    bindAction("to-top", () => this.actionMoveSelectedToDeck("top"));
    bindAction("to-bottom", () => this.actionMoveSelectedToDeck("bottom"));
    bindAction("resolve-magic", () => this.actionResolveMagicCards(activeCombo));
    bindAction("mulligan", () => this.actionMulligan());
    bindAction("high-low", () => this.actionHighOrLowSwap());
    bindAction("double-nothing", () => this.actionDoubleOrNothing());
    bindAction("place-vanguard", () => this.actionPlaceVanguard());

    bindAction("trap-bottom", () => {
      this.showTrapSuitPicker = true;
      this.render();
    });

    bindAction("close-trap-picker", () => {
      this.showTrapSuitPicker = false;
      this.render();
    });

    this.element.querySelectorAll("[data-declare-suit]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.actionTrapCardBottomReveal(btn.dataset.declareSuit);
      });
    });
  }
}
