/**
 * Bridge API Client
 *
 * Handles USDC off-ramps to bank accounts via Bridge (by Stripe)
 * Docs: https://apidocs.bridge.xyz
 */

const BRIDGE_API_URL = process.env.BRIDGE_API_URL || "https://api.bridge.xyz";
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || "";

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Api-Key": BRIDGE_API_KEY,
  };
}

// ─── Types ───────────────────────────────────────────────────

export interface BridgeCustomer {
  id: string;
  email: string;
  type: "individual" | "business";
  kyc_status: "not_started" | "pending" | "approved" | "rejected";
  created_at: string;
}

export interface BridgeExternalAccount {
  id: string;
  customer_id: string;
  account_type: "us_bank_account" | "iban";
  bank_name?: string;
  last_4?: string;
  currency: string;
  created_at: string;
}

export interface BridgeLiquidationAddress {
  id: string;
  chain: string;
  address: string;
  currency: string;
  destination_payment_rail: string;
  destination_currency: string;
  external_account_id: string;
  created_at: string;
}

export interface BridgeTransfer {
  id: string;
  state: "pending" | "payment_submitted" | "completed" | "failed" | "returned";
  amount: string;
  currency: string;
  created_at: string;
}

// ─── Customer Management ───────────────────────────────────────

/**
 * Create a Bridge customer for a user.
 * Required before they can link bank accounts or withdraw.
 */
export async function createCustomer(params: {
  email: string;
  firstName: string;
  lastName: string;
  type?: "individual" | "business";
}): Promise<BridgeCustomer> {
  const res = await fetch(`${BRIDGE_API_URL}/v0/customers`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: params.type || "individual",
      email: params.email,
      first_name: params.firstName,
      last_name: params.lastName,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to create Bridge customer");
  }

  return res.json();
}

/**
 * Get an existing customer by ID.
 */
export async function getCustomer(customerId: string): Promise<BridgeCustomer> {
  const res = await fetch(`${BRIDGE_API_URL}/v0/customers/${customerId}`, {
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error("Customer not found");
  }

  return res.json();
}

// ─── KYC ───────────────────────────────────────────────────────

/**
 * Get a KYC link for a customer to complete identity verification.
 */
export async function getKycLink(customerId: string): Promise<{ url: string }> {
  const res = await fetch(`${BRIDGE_API_URL}/v0/customers/${customerId}/kyc_link`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "full",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?kyc=complete`,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to get KYC link");
  }

  return res.json();
}

// ─── External Accounts (Bank Accounts) ───────────────────────────

/**
 * Create an external account (bank account) for a customer.
 * This is where withdrawals will be sent.
 */
export async function createExternalAccount(params: {
  customerId: string;
  accountType: "us_bank_account";
  accountNumber: string;
  routingNumber: string;
  accountOwnerName: string;
}): Promise<BridgeExternalAccount> {
  const res = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${params.customerId}/external_accounts`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        account_type: params.accountType,
        account_number: params.accountNumber,
        routing_number: params.routingNumber,
        account_owner_name: params.accountOwnerName,
        currency: "usd",
      }),
    }
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to create external account");
  }

  return res.json();
}

/**
 * Get a Plaid link token for securely linking a bank account.
 * This is the recommended approach for linking bank accounts.
 */
export async function getPlaidLinkToken(customerId: string): Promise<{ link_token: string }> {
  const res = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${customerId}/external_accounts/plaid_link_token`,
    {
      method: "POST",
      headers: headers(),
    }
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to get Plaid link token");
  }

  return res.json();
}

/**
 * Exchange a Plaid public token for a linked external account.
 */
export async function exchangePlaidToken(params: {
  customerId: string;
  publicToken: string;
  accountId: string;
}): Promise<BridgeExternalAccount> {
  const res = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${params.customerId}/external_accounts`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        plaid: {
          public_token: params.publicToken,
          account_id: params.accountId,
        },
        currency: "usd",
      }),
    }
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to link bank account");
  }

  return res.json();
}

/**
 * List external accounts for a customer.
 */
export async function listExternalAccounts(
  customerId: string
): Promise<BridgeExternalAccount[]> {
  const res = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${customerId}/external_accounts`,
    { headers: headers() }
  );

  if (!res.ok) {
    throw new Error("Failed to list external accounts");
  }

  const data = await res.json();
  return data.data || [];
}

// ─── Liquidation Addresses (USDC Off-ramp) ───────────────────────

/**
 * Create a liquidation address for USDC on Solana.
 * When USDC is sent to this address, it's automatically converted to USD
 * and sent to the linked bank account.
 */
export async function createLiquidationAddress(params: {
  customerId: string;
  externalAccountId: string;
  chain?: string;
  currency?: string;
  destinationCurrency?: string;
}): Promise<BridgeLiquidationAddress> {
  const res = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${params.customerId}/liquidation_addresses`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        chain: params.chain || "solana",
        currency: params.currency || "usdc",
        external_account_id: params.externalAccountId,
        destination_payment_rail: "ach",
        destination_currency: params.destinationCurrency || "usd",
      }),
    }
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to create liquidation address");
  }

  return res.json();
}

/**
 * List liquidation addresses for a customer.
 */
export async function listLiquidationAddresses(
  customerId: string
): Promise<BridgeLiquidationAddress[]> {
  const res = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${customerId}/liquidation_addresses`,
    { headers: headers() }
  );

  if (!res.ok) {
    throw new Error("Failed to list liquidation addresses");
  }

  const data = await res.json();
  return data.data || [];
}

// ─── Transfers ───────────────────────────────────────────────────

/**
 * Get transfer status/history for a customer.
 */
export async function listTransfers(customerId: string): Promise<BridgeTransfer[]> {
  const res = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${customerId}/transfers`,
    { headers: headers() }
  );

  if (!res.ok) {
    throw new Error("Failed to list transfers");
  }

  const data = await res.json();
  return data.data || [];
}

/**
 * Get a specific transfer by ID.
 */
export async function getTransfer(
  customerId: string,
  transferId: string
): Promise<BridgeTransfer> {
  const res = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${customerId}/transfers/${transferId}`,
    { headers: headers() }
  );

  if (!res.ok) {
    throw new Error("Transfer not found");
  }

  return res.json();
}
