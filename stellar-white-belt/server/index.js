import express from "express";
import cors from "cors";
import { handleGetReactions, handlePostReaction } from "./handlers.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/reactions", (req, res) => {
  res.json(handleGetReactions(req.query));
});

app.post("/api/reactions", async (req, res) => {
  try {
    const entry = await handlePostReaction(req.body);
    res.status(201).json(entry);
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || "Failed to save reaction";
    console.error("Reaction save error:", error);
    res.status(status).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Reactions API running at http://localhost:${PORT}`);
});
