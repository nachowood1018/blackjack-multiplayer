const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let players = {};

app.use(express.static(__dirname));

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

  socket.on("disconnect", () => {
    delete players[socket.id];
    console.log("Jugador desconectado:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});
