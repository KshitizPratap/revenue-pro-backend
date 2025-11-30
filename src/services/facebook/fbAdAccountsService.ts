// fbAdAccountsService.ts
import { fbGet } from './fbClient.js';

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  amount_spent: string;
  owner: string;
}

interface AdAccountsResponse {
  owned: AdAccount[];
  client: AdAccount[];
  total: number;
}

/**
 * Get all ad accounts (owned + client) from Business Manager
 * @param businessId - Facebook Business Manager ID
 * @returns Combined list of owned and client ad accounts
 */
export async function getAllAdAccounts(businessId: string): Promise<AdAccountsResponse> {
  console.log(`[Ad Accounts] Fetching ad accounts for Business ID: ${businessId}`);

  if (!businessId) {
    throw new Error('businessId is required');
  }

  const fields = [
    'id',
    'account_id',
    'name',
    'account_status',
    'currency',
    'amount_spent',
    'owner',
  ].join(',');

  // Fetch owned ad accounts
  console.log('[Ad Accounts] Step 1: Fetching owned ad accounts...');
  const ownedParams = {
    fields,
    limit: 100,
  };
  const ownedRes = await fbGet(`/${businessId}/owned_ad_accounts`, ownedParams);
  const ownedAccounts: AdAccount[] = ownedRes.data || [];
  console.log(`[Ad Accounts] Retrieved ${ownedAccounts.length} owned ad accounts`);

  // Fetch client ad accounts
  console.log('[Ad Accounts] Step 2: Fetching client ad accounts...');
  const clientParams = {
    fields,
    limit: 100,
  };
  const clientRes = await fbGet(`/${businessId}/client_ad_accounts`, clientParams);
  const clientAccounts: AdAccount[] = clientRes.data || [];
  console.log(`[Ad Accounts] Retrieved ${clientAccounts.length} client ad accounts`);

  const total = ownedAccounts.length + clientAccounts.length;
  console.log(`[Ad Accounts] Total: ${total} ad accounts (${ownedAccounts.length} owned, ${clientAccounts.length} client)`);

  return {
    owned: ownedAccounts,
    client: clientAccounts,
    total,
  };
}

/**
 * Get only owned ad accounts from Business Manager
 * @param businessId - Facebook Business Manager ID
 * @returns List of owned ad accounts
 */
export async function getOwnedAdAccounts(businessId: string): Promise<AdAccount[]> {
  console.log(`[Ad Accounts] Fetching owned ad accounts for Business ID: ${businessId}`);

  if (!businessId) {
    throw new Error('businessId is required');
  }

  const fields = [
    'id',
    'account_id',
    'name',
    'account_status',
    'currency',
    'amount_spent',
    'owner',
  ].join(',');

  const params = {
    fields,
    limit: 100,
  };

  const res = await fbGet(`/${businessId}/owned_ad_accounts`, params);
  const accounts: AdAccount[] = res.data || [];
  console.log(`[Ad Accounts] Retrieved ${accounts.length} owned ad accounts`);
  
  return accounts;
}

/**
 * Get only client ad accounts from Business Manager
 * @param businessId - Facebook Business Manager ID
 * @returns List of client ad accounts
 */
export async function getClientAdAccounts(businessId: string): Promise<AdAccount[]> {
  console.log(`[Ad Accounts] Fetching client ad accounts for Business ID: ${businessId}`);

  if (!businessId) {
    throw new Error('businessId is required');
  }

  const fields = [
    'id',
    'account_id',
    'name',
    'account_status',
    'currency',
    'amount_spent',
    'owner',
  ].join(',');

  const params = {
    fields,
    limit: 100,
  };

  const res = await fbGet(`/${businessId}/client_ad_accounts`, params);
  const accounts: AdAccount[] = res.data || [];
  console.log(`[Ad Accounts] Retrieved ${accounts.length} client ad accounts`);
  
  return accounts;
}
