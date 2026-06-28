import * as StellarSdk from "stellar-sdk";
import {
  requestAccess,
  getNetwork,
  signTransaction
} from "@stellar/freighter-api";

import {
  initializeHistory,
  startHistoryPolling,
  stopHistoryPolling,
  clearHistory
} from "./history.js";

import {
  validateBalanceForPayment,
  hideBalanceWarning
} from "./balance.js";

// ===============================
// STELLAR TESTNET SETUP
// ===============================
const server = new StellarSdk.Horizon.Server(
  "https://horizon-testnet.stellar.org"
);

let publicKey = null;

// ===============================
// STATE MANAGEMENT
// ===============================
const showHeroState = () => {
  document.getElementById("heroState").classList.remove("hidden");
  document.getElementById("actionState").classList.add("hidden");
};

const showActionState = () => {
  document.getElementById("heroState").classList.add("hidden");
  document.getElementById("actionState").classList.remove("hidden");
};

const setButtonLoading = (buttonId, isLoading) => {
  const button = document.getElementById(buttonId);
  if (isLoading) {
    button.classList.add("loading");
    button.disabled = true;
  } else {
    button.classList.remove("loading");
    button.disabled = false;
  }
};

const formatAddressShort = (address) => {
  if (!address) return "—";
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};

const showTransactionResult = (status, message, txHash = null) => {
  const resultElement = document.getElementById("transactionResult");

  resultElement.className = "result-container";
  resultElement.classList.add(status);

  let content = `<div>${message}</div>`;

  if (txHash) {
    content += `<div class="tx-hash">Transaction hash: <code>${txHash}</code></div>`;
    content += `<a href="https://stellar.expert/explorer/testnet/tx/${txHash}" 
         target="_blank" 
         rel="noopener noreferrer"
         class="tx-link">
        View on Stellar Explorer →
      </a>`;
  }

  resultElement.innerHTML = content;

  if (status === "success" || status === "error") {
    setTimeout(() => {
      resultElement.innerHTML = "";
      resultElement.className = "";
    }, 8000);
  }
};

const getErrorMessage = (error) => {
  const message = error?.message || "";

  if (message.includes("Account not found")) {
    return "Your testnet account needs some XLM first. Visit Stellar Laboratory to fund it.";
  }
  if (message.includes("network")) {
    return "Looks like you're on the wrong network. Switch Freighter to Testnet.";
  }
  if (message.includes("Insufficient balance")) {
    return "Not enough XLM to send. Add some funds first.";
  }
  if (message.includes("User declined")) {
    return "No worries. Cancelled.";
  }

  return "Something went wrong. Want to try again?";
};

// ===============================
// TAB SWITCHING
// ===============================
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetTab = button.dataset.tab;

    tabButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    tabContents.forEach((content) => {
      if (content.id === `${targetTab}-content`) {
        content.classList.remove("hidden");
      } else {
        content.classList.add("hidden");
      }
    });

    hideBalanceWarning();
  });
});

// ===============================
// CONNECT WALLET
// ===============================
document.getElementById("connectBtn").addEventListener("click", async () => {
  setButtonLoading("connectBtn", true);

  try {
    console.clear();

    const network = await getNetwork();
    console.log("Freighter network response:", network);

    let isTestnet = false;

    if (typeof network === "string") {
      isTestnet =
        network.toUpperCase() === "TESTNET" || network.toUpperCase() === "TEST";
    } else if (typeof network === "object" && network !== null) {
      const networkValue = network.network?.toUpperCase();
      isTestnet =
        networkValue === "TESTNET" ||
        networkValue === "TEST" ||
        network.networkPassphrase === "Test SDF Network ; September 2015";
    }

    if (!isTestnet) {
      alert("Looks like you're on the wrong network. Switch Freighter to Testnet.");
      setButtonLoading("connectBtn", false);
      return;
    }

    const access = await requestAccess();
    console.log("requestAccess response:", access);

    if (typeof access === "string") {
      publicKey = access;
    } else if (access && access.address) {
      publicKey = access.address;
    } else if (access && access.publicKey) {
      publicKey = access.publicKey;
    } else {
      throw new Error("Could not get wallet address from Freighter");
    }

    console.log("Connected:", publicKey);

    document.getElementById("walletAddressShort").textContent =
      formatAddressShort(publicKey);

    const account = await server.loadAccount(publicKey);
    const balance =
      account.balances.find((b) => b.asset_type === "native")?.balance || "0";

    document.getElementById("balanceDisplay").textContent =
      `${parseFloat(balance).toFixed(2)} XLM`;
    console.log("Balance:", balance);

    initializeHistory(publicKey);
    startHistoryPolling(publicKey, 30);

    showActionState();
  } catch (err) {
    console.error("Connection error:", err);
    const errorMessage = getErrorMessage(err);
    alert(errorMessage);
  } finally {
    setButtonLoading("connectBtn", false);
  }
});

// ===============================
// DISCONNECT WALLET
// ===============================
document.getElementById("disconnectBtn").addEventListener("click", () => {
  publicKey = null;

  document.getElementById("receiver").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("transactionResult").innerHTML = "";

  stopHistoryPolling();
  clearHistory();
  hideBalanceWarning();

  tabButtons.forEach((btn) => btn.classList.remove("active"));
  document.getElementById("tab-payment")?.classList.add("active");
  tabContents.forEach((content) => {
    if (content.id === "payment-content") {
      content.classList.remove("hidden");
    } else {
      content.classList.add("hidden");
    }
  });

  showHeroState();
});

// ===============================
// SEND PAYMENT
// ===============================
document.getElementById("sendBtn").addEventListener("click", async () => {
  if (!publicKey) {
    alert("Connect your wallet first.");
    return;
  }

  const destination = document.getElementById("receiver").value.trim();
  const amount = document.getElementById("amount").value;

  if (!destination || !amount || parseFloat(amount) <= 0) {
    alert("Fill in who you're sending to and how much.");
    return;
  }

  if (destination.length !== 56 || !destination.startsWith("G")) {
    alert("That doesn't look like a valid Stellar address. Double-check it?");
    return;
  }

  const hasBalance = await validateBalanceForPayment(publicKey, amount);
  if (!hasBalance) {
    return;
  }

  setButtonLoading("sendBtn", true);
  showTransactionResult("pending", "Sending...");

  try {
    const sourceAccount = await server.loadAccount(publicKey);
    const fee = await server.fetchBaseFee();

    const transactionBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee,
      networkPassphrase: StellarSdk.Networks.TESTNET
    });

    transactionBuilder.addOperation(
      StellarSdk.Operation.payment({
        destination,
        asset: StellarSdk.Asset.native(),
        amount: amount.toString()
      })
    );

    const transaction = transactionBuilder.setTimeout(30).build();

    console.log("Transaction built:", transaction);

    let signedXDR;
    try {
      signedXDR = await signTransaction(transaction.toXDR(), {
        network: "TESTNET",
        networkPassphrase: StellarSdk.Networks.TESTNET,
        accountToSign: publicKey
      });
    } catch (signError) {
      console.error("Signing error:", signError);
      throw new Error("Failed to sign transaction. Please try again.");
    }

    const signedTx = StellarSdk.TransactionBuilder.fromXDR(
      signedXDR,
      StellarSdk.Networks.TESTNET
    );

    const result = await server.submitTransaction(signedTx);

    showTransactionResult("success", "Sent. Done.", result.hash);

    const updatedAccount = await server.loadAccount(publicKey);
    const updatedBalance =
      updatedAccount.balances.find((b) => b.asset_type === "native")?.balance ||
      "0";

    document.getElementById("balanceDisplay").textContent =
      `${parseFloat(updatedBalance).toFixed(2)} XLM`;

    if (publicKey) {
      initializeHistory(publicKey);
    }

    document.getElementById("receiver").value = "";
    document.getElementById("amount").value = "";
  } catch (err) {
    console.error("Payment error:", err);
    const errorMessage = getErrorMessage(err);
    showTransactionResult("error", errorMessage);
  } finally {
    setButtonLoading("sendBtn", false);
  }
});

// ===============================
// INITIALIZE
// ===============================
showHeroState();
