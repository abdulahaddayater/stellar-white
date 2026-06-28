import {
  getReactionsForHashes as getStoredReactions,
  addReaction as storeReaction,
  ALLOWED_REACTIONS
} from "./reactionStore.js";

export const REACTIONS = [
  { id: "thank_you", emoji: "❤️", label: "Thank You" },
  { id: "celebration", emoji: "🎉", label: "Celebration" },
  { id: "received", emoji: "👍", label: "Received" },
  { id: "awesome", emoji: "🔥", label: "Awesome" },
  { id: "appreciated", emoji: "💯", label: "Appreciated" }
];

export function getReactionMeta(reactionId) {
  return REACTIONS.find((r) => r.id === reactionId);
}

export function formatReaction(reactionId) {
  const meta = getReactionMeta(reactionId);
  if (!meta) return reactionId;
  return `${meta.emoji} ${meta.label}`;
}

export async function fetchReactionsForHashes(hashes) {
  if (!hashes.length) return {};

  const entries = getStoredReactions(hashes);
  const map = {};

  for (const entry of entries) {
    map[entry.transaction_hash] = entry;
  }

  return map;
}

export async function saveReaction(
  transactionHash,
  receiverWallet,
  reactionId,
  { receiverWallet: txReceiver } = {}
) {
  if (!ALLOWED_REACTIONS.includes(reactionId)) {
    throw new Error("Invalid reaction");
  }

  if (txReceiver && txReceiver !== receiverWallet) {
    throw new Error("Only the payment recipient can react to this transaction");
  }

  return storeReaction({
    transaction_hash: transactionHash,
    receiver_wallet: receiverWallet,
    reaction: reactionId
  });
}
