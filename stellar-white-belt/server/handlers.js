import * as StellarSdk from "stellar-sdk";
import { getReactionsForHashes, addReaction, ALLOWED_REACTIONS } from "./store.js";

const horizon = new StellarSdk.Horizon.Server(
  "https://horizon-testnet.stellar.org"
);

export async function verifyReceiver(transactionHash, receiverWallet) {
  const operations = await horizon
    .operations()
    .forTransaction(transactionHash)
    .call();

  const paymentOp = operations.records.find(
    (op) => op.type === "payment" || op.type === "create_account"
  );

  if (!paymentOp) return false;

  if (paymentOp.type === "payment") {
    return paymentOp.to === receiverWallet;
  }

  if (paymentOp.type === "create_account") {
    return paymentOp.account === receiverWallet;
  }

  return false;
}

export function handleGetReactions(query = {}) {
  const hashes = query.hashes
    ? String(query.hashes).split(",").filter(Boolean)
    : [];

  return getReactionsForHashes(hashes);
}

export async function handlePostReaction(body) {
  const { transaction_hash, receiver_wallet, reaction } = body || {};

  if (!transaction_hash || !receiver_wallet || !reaction) {
    throw { status: 400, message: "Missing required fields" };
  }

  if (!ALLOWED_REACTIONS.includes(reaction)) {
    throw { status: 400, message: "Invalid reaction" };
  }

  const isReceiver = await verifyReceiver(transaction_hash, receiver_wallet);
  if (!isReceiver) {
    throw {
      status: 403,
      message: "Only the payment recipient can react to this transaction"
    };
  }

  try {
    return addReaction({
      transaction_hash,
      receiver_wallet,
      reaction
    });
  } catch (error) {
    if (error.message?.includes("already exists")) {
      throw { status: 409, message: error.message };
    }
    throw error;
  }
}
