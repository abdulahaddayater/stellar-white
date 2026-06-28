const STORAGE_KEY = "stellar_transaction_reactions";

export const ALLOWED_REACTIONS = [
  "thank_you",
  "celebration",
  "received",
  "awesome",
  "appreciated"
];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { reactions: [] };
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.reactions) ? parsed : { reactions: [] };
  } catch {
    return { reactions: [] };
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
