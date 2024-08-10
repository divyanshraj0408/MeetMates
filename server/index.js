const express = require("express");
const { Server } = require("socket.io");

const io = new Server({
  cors: true,
});

const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});
io.on("connection", (socket) => {
  console.log("new connection");
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
io.listen(8001);
