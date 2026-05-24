const express = require("express");
const methodOverride = require("method-override");

const app = express();

require("./db");

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(8080, () => {
  console.log("Serving on port 8080");
});