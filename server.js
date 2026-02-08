const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let players = {};
let currentDeck = [];
let currentDealer = [];

// Servir archivos estáticos (index.html)
app.use(express.static(__dirname));

// Crear baraja y mezclar
function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  let deck = [];

  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }

  // Mezclar baraja
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// Calcular valor de una mano
function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;

  for (let card of hand) {
    if (["J","Q","K"].includes(card.value)) {
      value += 10;
    } else if (card.value === "A") {
      value += 11;
      aces++;
    } else {
      value += parseInt(card.value);
    }
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

// Repartir cartas iniciales
function dealInitialHands() {
  currentDeck = createDeck();
  currentDealer = [currentDeck.pop(), currentDeck.pop()];

  for (let id in players) {
    players[id].hand = [currentDeck.pop(), currentDeck.pop()];
  }
}

// Turno del dealer
function dealerPlay() {
  while (calculateHandValue(currentDealer) < 17 && currentDeck.length > 0) {
    currentDealer.push(currentDeck.pop());
  }

  io.emit("dealerFinished", {
    dealer: currentDealer,
    value: calculateHandValue(currentDealer)
  });

  // Comparar resultados
  settleBets();
}

// Comparar resultados y ajustar fichas
function settleBets() {
  const dealerValue = calculateHandValue(currentDealer);

  for (let id in players) {
    const player = players[id];
    const playerValue = calculateHandValue(player.hand);
    const bet = player.bets.main || 0;

    let result = "";

    if (playerValue > 21) {
      result = "Perdiste (te pasaste)";
    } else if (dealerValue > 21) {
      player.chips += bet * 2;
      result = "Ganaste (dealer se pasó)";
    } else if (playerValue > dealerValue) {
      player.chips += bet * 2;
      result = "Ganaste";
    } else if (playerValue === dealerValue) {
      player.chips += bet; // empate
      result = "Empate";
    } else {
      result = "Perdiste";
    }

    io.to(id).emit("roundResult", {
      hand: player.hand,
      value: playerValue,
      dealer: currentDealer,
      dealerValue: dealerValue,
      chips: player.chips,
      result
    });

    // Resetear apuestas y manos para la siguiente ronda
    player.bets = {};
    player.hand = [];
  }

  // Reiniciar dealer
  currentDealer = [];
}

io.on("connection", (socket) => {
  console.log("Jugador conectado:", socket.id);

  players[socket.id] = { chips: 1000, hand: [], bets: {} };

  socket.on("placeBet", (amount) => {
    if (players[socket.id].chips >= amount) {
      players[socket.id].chips -= amount;
      players[socket.id].bets.main = amount;
      io.to(socket.id).emit("betPlaced", players[socket.id]);
    }
  });

  // Iniciar ronda
  socket.on("startRound", () => {
    dealInitialHands();

    io.emit("roundStarted", {
      dealer: [currentDealer[0]], // mostrar solo la primera carta del dealer
      players: Object.fromEntries(
        Object.entries(players).map(([id, data]) => [id, data.hand])
      )
    });
  });

  // Acción: pedir carta (Hit)
  socket.on("hit", () => {
    if (currentDeck.length > 0) {
      const card = currentDeck.pop();
      players[socket.id].hand.push(card);
      io.to(socket.id).emit("cardDealt", players[socket.id].hand);
    }
  });

  // Acción: plantarse (Stand)
  socket.on("stand", () => {
    io.to(socket.id).emit("playerStood", players[socket.id].hand);
    dealerPlay();
  });

  // Acción: doblar apuesta (Double)
  socket.on("double", () => {
    let bet = players[socket.id].bets.main || 0;
    if (players[socket.id].chips >= bet) {
      players[socket.id].chips -= bet;
      players[socket.id].bets.main += bet;

      const card = currentDeck.pop();
      players[socket.id].hand.push(card);

      io.to(socket.id).emit("doubleDone", players[socket.id]);

      dealerPlay();
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    console.log("Jugador desconectado:", socket.id);
  });
});

// Usar el puerto de Render o 3000 local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
