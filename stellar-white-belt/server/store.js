import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "reactions.json");

export const ALLOWED_REACTIONS = [
  "thank_you",
  "celebration",
  "received",
  "awesome",
  "appreciated"
];

function load() {
  if (!existsSync(DB_PATH)) {
    return { reactions: [] };
  }
  return JSON.parse(readFileSync(DB_PATH, "utf8"));
}

function save(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function getReactionsForHashes(hashes) {
  if (!hashes?.length) return [];
  const data = load();
  return data.reactions.filter((r) => hashes.includes(r.transaction_hash));
}

export function addReaction({ transaction_hash, receiver_wallet, reaction }) {
  const data = load();
  const exists = data.reactions.some(
    (r) => r.transaction_hash === transaction_hash
  );
  if (exists) {
    throw new Error("Reaction already exists for this transaction");
  }

  const entry = {
    id: data.reactions.length + 1,
    transaction_hash,
    receiver_wallet,
    reaction,
    created_at: new Date().toISOString()
  };

  data.reactions.push(entry);
  save(data);
  return entry;
}
