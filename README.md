# Fabula Ultima — Ace of Cards (`fu-ace-of-cards`)

Módulo customizado para **Foundry VTT v13** + **Project FU** que automatiza o baralho de 30 cartas, detecção de conjuntos, cálculo de dano por nível, desconto automático de PM e sincronização pública em tempo real para a classe **Carteador / Ace of Cards**.

## Instalação via GitHub
1. Suba esta pasta para um repositório público no GitHub (ex.: `https://github.com/seu-usuario/fu-ace-of-cards`).
2. No Foundry VTT, acesse **Add-on Modules -> Install Module** e cole a URL do `module.json` (`https://raw.githubusercontent.com/seu-usuario/fu-ace-of-cards/main/module.json`).

## Imagens Customizadas das Cartas (`assets/cards/`)
Coloque suas imagens `.png` dentro de `assets/cards/` com os seguintes nomes exatos:

- **Verso do Baralho:** `back.png`
- **Curingas (2):** `joker-1.png`, `joker-2.png`
- **Ouros / Ar (7):** `diamonds-1.png` até `diamonds-7.png`
- **Copas / Fogo (7):** `hearts-1.png` até `hearts-7.png`
- **Espadas / Gelo (7):** `spades-1.png` até `spades-7.png`
- **Paus / Terra (7):** `clubs-1.png` até `clubs-7.png`

## Installation

1. Open **Foundry VTT** and navigate to the **Add-on Modules** tab.
2. Click **Install Module** at the bottom of the window.
3. Paste the following URL into the **Manifest URL** field:
   ```text
   https://raw.githubusercontent.com/GabriellSilveira/fu-ace-of-cards/main/module.json
