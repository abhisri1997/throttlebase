import express from "express";

const app = express();

app.get("/health", (req, res) => {
  res.send("ok");
});

app.listen(5001, (err?: any) => {
  if (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
  console.log("Server started on port 5001");
});
