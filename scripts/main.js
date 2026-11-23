import { MODULE_ID, syncCoreDeckCatalog } from "./deck-data.js";
import { AceOfCardsModal } from "./ace-modal.js";

let aceModalInstance = null;

function injectSidebarButton() {
  const layersList = document.querySelector(
    "#scene-controls #scene-controls-layers, #scene-controls ul.flexcol, #scene-controls ol.flexcol, #scene-controls menu.flexcol"
  );
  if (!layersList) return;
  if (layersList.querySelector("[data-control='ace-of-cards']")) return;

  const li = document.createElement("li");
  li.innerHTML = `
    <button type="button"
            class="control ui-control layer icon fu-ace-control-btn"
            role="tab"
            data-control="ace-of-cards"
            data-tooltip="Baralho do Carteador (Ace of Cards)"
            aria-label="Baralho do Carteador">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="11" height="16" rx="2" transform="rotate(-8 8.5 12)"></rect>
        <rect x="9" y="4" width="11" height="16" rx="2" transform="rotate(8 14.5 12)" fill="rgba(28,12,15,0.88)"></rect>
        <path d="M14.5 9.5l1.5 2-1.5 2-1.5-2z" fill="currentColor"></path>
      </svg>
    </button>
  `;

  const btn = li.querySelector("button");
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    aceModalInstance?.toggle();
  });

  layersList.appendChild(li);
}

Hooks.once("init", () => {
  aceModalInstance = new AceOfCardsModal();
  game.aceOfCards = {
    open: () => aceModalInstance.open(),
    close: () => aceModalInstance.close(),
    toggle: () => aceModalInstance.toggle()
  };
});

Hooks.once("ready", async () => {
  await syncCoreDeckCatalog();
  injectSidebarButton();

  game.socket.on(`module.${MODULE_ID}`, payload => {
    if (payload?.type === "refresh" && aceModalInstance?.isOpen) {
      aceModalInstance.render();
    }
  });
});

Hooks.on("renderSceneControls", () => {
  injectSidebarButton();
});

Hooks.on("updateActor", (actor, changed) => {
  if (!aceModalInstance?.isOpen) return;
  const targetActor = aceModalInstance.getAceActor();
  if (targetActor && actor.id === targetActor.id) {
    if (changed.flags?.[MODULE_ID] || changed.system?.resources?.mp || changed.system?.level) {
      aceModalInstance.render();
    }
  }
});
