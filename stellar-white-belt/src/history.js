import * as StellarSdk from "stellar-sdk";
import {
  REACTIONS,
  fetchReactionsForHashes,
  saveReaction,
  formatReaction
} from "./reactions.js";

// ===============================
// TRANSACTION HISTORY MODULE
// ===============================

const server = new StellarSdk.Horizon.Server(
  "https://horizon-testnet.stellar.org"
);

let pollingInterval = null;
let currentPublicKey = null;

/**
 * Fetch transaction history for a given public key
 * Returns only payment-related transactions
 */
export async function fetchTransactionHistory(publicKey) {
  try {
    const transactions = await server
      .transactions()
      .forAccount(publicKey)
      .order("desc")
      .limit(20)
      .call();

    const parsedTransactions = [];

    for (const tx of transactions.records) {
      const operations = await tx.operations();

      const hasPayment = operations.records.some(
        (op) => op.type === "payment" || op.type === "create_account"
      );

      if (hasPayment) {
        const parsed = await parseTransaction(tx, publicKey);
        if (parsed) {
          parsedTransactions.push(parsed);
        }
      }
    }

    return parsedTransactions;
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    throw error;
  }
}

/**
 * Parse a transaction into a human-readable format
 */
async function parseTransaction(tx, userPublicKey) {
  try {
    const operations = await tx.operations();
    const paymentOp = operations.records.find(
      (op) => op.type === "payment" || op.type === "create_account"
    );

    if (!paymentOp) return null;

    let direction;
    let sender;
    let receiver;
    let amount;

    if (paymentOp.type === "payment") {
      sender = paymentOp.from;
      receiver = paymentOp.to;
      amount = paymentOp.amount;

      if (paymentOp.from === userPublicKey) {
        direction = "Sent";
      } else {
        direction = "Received";
      }
    } else if (paymentOp.type === "create_account") {
      sender = paymentOp.funder;
      receiver = paymentOp.account;
      amount = paymentOp.starting_balance;

      if (paymentOp.funder === userPublicKey) {
        direction = "Sent";
      } else {
        direction = "Received";
      }
    }

    return {
      id: tx.id,
      hash: tx.hash,
      timestamp: new Date(tx.created_at),
      amount: parseFloat(amount).toFixed(2),
      direction,
      sender,
      receiver,
      counterparty:
        direction === "Sent" ? receiver : sender,
      status: tx.successful ? "Confirmed" : "Failed",
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${tx.hash}`
    };
  } catch (error) {
    console.error("Error parsing transaction:", error);
    return null;
  }
}

function formatAddressShort(address) {
  if (!address) return "—";
  return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
}

function formatTimestamp(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

function buildReactionPickerHtml(txHash) {
  const chips = REACTIONS.map(
    (r) =>
      `<button type="button" class="reaction-chip" data-hash="${txHash}" data-reaction="${r.id}" aria-label="${r.label}">
        <span class="reaction-chip-emoji">${r.emoji}</span>
        <span class="reaction-chip-label">${r.label}</span>
      </button>`
  ).join("");

  return `<div class="reaction-picker" data-hash="${txHash}">${chips}</div>`;
}

function buildReactionSection(tx, userPublicKey, reactionEntry) {
  const isIncoming = tx.direction === "Received";
  const canReact = isIncoming && tx.receiver === userPublicKey && !reactionEntry;

  if (reactionEntry) {
    return `
      <div class="reaction-display locked">
        <span class="reaction-display-emoji">${formatReaction(reactionEntry.reaction)}</span>
      </div>
    `;
  }

  if (!canReact) {
    return "";
  }

  return `
    <div class="reaction-section" data-hash="${tx.hash}">
      <button type="button" class="react-btn" data-hash="${tx.hash}">React</button>
      ${buildReactionPickerHtml(tx.hash)}
    </div>
  `;
}

/**
 * Render transaction history to the UI
 */
export function renderHistory(
  transactions,
  userPublicKey,
  reactionsMap = {},
  containerId = "history-content"
) {
  const container = document.getElementById(containerId);

  if (!container) {
    console.error("History container not found");
    return;
  }

  container.innerHTML = "";

  if (!transactions || transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No transactions yet.</p>
        <p class="empty-state-hint">Your payment history will appear here.</p>
      </div>
    `;
    return;
  }

  const timeline = document.createElement("div");
  timeline.className = "history-timeline";

  transactions.forEach((tx) => {
    const reactionEntry = reactionsMap[tx.hash];
    const card = document.createElement("div");
    card.className = `history-card ${tx.direction.toLowerCase()}`;
    card.dataset.receiver = tx.receiver;

    const directionIcon = tx.direction === "Sent" ? "↑" : "↓";
    const amountPrefix = tx.direction === "Sent" ? "-" : "+";
    const summaryTarget = formatAddressShort(
      tx.direction === "Sent" ? tx.receiver : tx.sender
    );

    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-direction ${tx.direction.toLowerCase()}">
          <span class="direction-icon">${directionIcon}</span>
          ${tx.direction}
        </span>
        <span class="history-amount ${tx.direction.toLowerCase()}">
          ${amountPrefix}${tx.amount} XLM
        </span>
      </div>
      <div class="history-summary-line">
        <span class="history-summary-text">${tx.amount} XLM → ${summaryTarget}</span>
      </div>
      <div class="history-card-body">
        <div class="history-detail">
          <span class="history-label">Sender:</span>
          <span class="history-value">${formatAddressShort(tx.sender)}</span>
        </div>
        <div class="history-detail">
          <span class="history-label">Receiver:</span>
          <span class="history-value">${formatAddressShort(tx.receiver)}</span>
        </div>
        <div class="history-detail">
          <span class="history-label">Amount:</span>
          <span class="history-value">${tx.amount} XLM</span>
        </div>
        <div class="history-detail">
          <span class="history-label">Timestamp:</span>
          <span class="history-value">${formatTimestamp(tx.timestamp)}</span>
        </div>
      </div>
      ${buildReactionSection(tx, userPublicKey, reactionEntry)}
      <div class="history-card-footer">
        <span class="history-status ${tx.status.toLowerCase()}">${tx.status}</span>
        <a href="${tx.explorerUrl}" target="_blank" rel="noopener noreferrer" class="history-explorer">
          View on Explorer →
        </a>
      </div>
    `;

    timeline.appendChild(card);
  });

  container.appendChild(timeline);
  bindReactionHandlers(container, userPublicKey);
}

function bindReactionHandlers(container, userPublicKey) {
  container.querySelectorAll(".react-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const hash = btn.dataset.hash;
      const section = container.querySelector(
        `.reaction-section[data-hash="${hash}"]`
      );
      const picker = section?.querySelector(".reaction-picker");

      if (!picker) return;

      const isOpen = picker.classList.contains("open");
      container.querySelectorAll(".reaction-picker.open").forEach((el) => {
        el.classList.remove("open");
      });

      if (!isOpen) {
        picker.classList.add("open");
      }
    });
  });

  container.querySelectorAll(".reaction-chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      const hash = chip.dataset.hash;
      const reactionId = chip.dataset.reaction;
      const card = chip.closest(".history-card");
      const txReceiver = card?.dataset.receiver;

      chip.disabled = true;
      container
        .querySelectorAll(`.reaction-chip[data-hash="${hash}"]`)
        .forEach((c) => {
          c.disabled = true;
        });

      try {
        await saveReaction(hash, userPublicKey, reactionId, {
          receiverWallet: txReceiver
        });
        await loadAndRenderHistory(userPublicKey);
      } catch (error) {
        console.error("Reaction error:", error);
        alert(error.message || "Could not save reaction. Try again.");
        chip.disabled = false;
        container
          .querySelectorAll(`.reaction-chip[data-hash="${hash}"]`)
          .forEach((c) => {
            c.disabled = false;
          });
      }
    });
  });
}

export function showHistoryError(containerId = "history-content") {
  const container = document.getElementById(containerId);

  if (!container) return;

  container.innerHTML = `
    <div class="error-state">
      <p>Unable to load transaction history.</p>
      <p class="error-state-hint">Check your connection and try again.</p>
      <button class="retry-button" onclick="window.retryHistory()">Retry</button>
    </div>
  `;
}

export function showHistoryLoading(containerId = "history-content") {
  const container = document.getElementById(containerId);

  if (!container) return;

  container.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading your transactions...</p>
    </div>
  `;
}

export function startHistoryPolling(publicKey, intervalSeconds = 30) {
  stopHistoryPolling();
  currentPublicKey = publicKey;
  loadAndRenderHistory(publicKey);

  pollingInterval = setInterval(() => {
    loadAndRenderHistory(publicKey);
  }, intervalSeconds * 1000);
}

export function stopHistoryPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

async function loadAndRenderHistory(publicKey) {
  try {
    const transactions = await fetchTransactionHistory(publicKey);
    const hashes = transactions.map((tx) => tx.hash);
    const reactionsMap = await fetchReactionsForHashes(hashes);
    renderHistory(transactions, publicKey, reactionsMap);
  } catch (error) {
    console.error("Error loading history:", error);
  }
}

export async function initializeHistory(publicKey) {
  currentPublicKey = publicKey;
  showHistoryLoading();

  try {
    const transactions = await fetchTransactionHistory(publicKey);
    const hashes = transactions.map((tx) => tx.hash);
    const reactionsMap = await fetchReactionsForHashes(hashes);
    renderHistory(transactions, publicKey, reactionsMap);
  } catch (error) {
    console.error("Error initializing history:", error);
    showHistoryError();
  }
}

export function clearHistory(containerId = "history-content") {
  stopHistoryPolling();
  currentPublicKey = null;

  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = "";
  }
}

// Global retry helper for error state button
window.retryHistory = () => {
  if (currentPublicKey) {
    initializeHistory(currentPublicKey);
  }
};
