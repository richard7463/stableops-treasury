import {
  CHAIN_BY_ID,
  SEEDED_VAULTS,
  amountToBaseUnits,
  buildTreasuryPlan,
  classifyVaultRisk,
  type StableOpsVault,
  type TreasuryPlan,
  type TreasuryPolicy,
} from './stableops'

const EARN_API_BASE = 'https://earn.li.fi/v1/earn'
const LI_QUEST_BASE = 'https://li.quest/v1'
const FETCH_TIMEOUT_MS = 10000
const DEFAULT_LIMIT_PER_CHAIN = 8

type LifiVault = {
  address: string
  chainId: number
  name?: string
  symbol?: string
  network?: string
  isTransactional?: boolean
  protocol?: {
    name?: string
    logoURI?: string
  }
  underlyingTokens?: Array<{
    symbol?: string
    address?: string
    decimals?: number
  }>
  analytics?: {
    apy?: {
      total?: number
    }
    apy30d?: number
    tvl?: {
      usd?: string | number
    }
  }
}

export async function discoverTreasuryPlan(policy: TreasuryPolicy): Promise<TreasuryPlan> {
  const apiKey = process.env.LIFI_API_KEY || process.env.NEXT_PUBLIC_LIFI_API_KEY

  if (!apiKey) {
    const vaults = SEEDED_VAULTS.filter((vault) => policy.allowedChainIds.includes(vault.chainId))
    return buildTreasuryPlan(
      policy,
      vaults,
      'seeded',
      'Missing LIFI_API_KEY. Showing seeded Composer-compatible examples for local review.',
    )
  }

  try {
    const liveVaults = await Promise.all(
      policy.allowedChainIds.map((chainId) => fetchEarnVaultsForChain(chainId, apiKey)),
    )
    const normalized = liveVaults
      .flat()
      .map(normalizeVault)
      .filter((vault): vault is StableOpsVault => Boolean(vault))

    if (normalized.length === 0) {
      const vaults = SEEDED_VAULTS.filter((vault) => policy.allowedChainIds.includes(vault.chainId))
      return buildTreasuryPlan(
        policy,
        vaults,
        'seeded',
        'LI.FI Earn returned no USDC vaults for this policy. Showing seeded examples.',
      )
    }

    return buildTreasuryPlan(policy, normalized, 'live')
  } catch (error) {
    const vaults = SEEDED_VAULTS.filter((vault) => policy.allowedChainIds.includes(vault.chainId))
    return buildTreasuryPlan(
      policy,
      vaults,
      'seeded',
      error instanceof Error ? error.message : 'LI.FI Earn discovery failed.',
    )
  }
}

export async function fetchComposerQuote(input: {
  chainId: number
  vaultAddress: string
  walletAddress: string
  fromAmountUsd: number
  fromTokenAddress?: string
  assetDecimals?: number
  slippage?: number
}) {
  const chain = CHAIN_BY_ID[input.chainId]
  if (!chain) {
    throw new Error(`Unsupported chain ${input.chainId}`)
  }

  const fromAmount = amountToBaseUnits(input.fromAmountUsd, input.assetDecimals || chain.usdc.decimals)
  const params = new URLSearchParams({
    fromChain: String(input.chainId),
    toChain: String(input.chainId),
    fromToken: input.fromTokenAddress || chain.usdc.address,
    toToken: input.vaultAddress,
    fromAddress: input.walletAddress,
    toAddress: input.walletAddress,
    fromAmount,
    integrator: 'stableops-treasury',
    ...(input.slippage ? { slippage: String(input.slippage) } : {}),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const headers: Record<string, string> = {}
    const apiKey = process.env.LIFI_API_KEY || process.env.NEXT_PUBLIC_LIFI_API_KEY
    if (apiKey) {
      headers['x-lifi-api-key'] = apiKey
    }

    const response = await fetch(`${LI_QUEST_BASE}/quote?${params}`, {
      cache: 'no-store',
      headers,
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || `LI.FI Composer quote failed with ${response.status}`)
    }

    return payload
  } finally {
    clearTimeout(timer)
  }
}

async function fetchEarnVaultsForChain(chainId: number, apiKey: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const params = new URLSearchParams({
      chainId: String(chainId),
      asset: 'USDC',
      sortBy: 'apy',
      minTvlUsd: '100000',
      limit: String(DEFAULT_LIMIT_PER_CHAIN),
    })

    const response = await fetch(`${EARN_API_BASE}/vaults?${params}`, {
      cache: 'no-store',
      headers: {
        'x-lifi-api-key': apiKey,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`LI.FI Earn ${response.status}`)
    }

    const payload = await response.json()
    return (payload?.data || []) as LifiVault[]
  } finally {
    clearTimeout(timer)
  }
}

function normalizeVault(vault: LifiVault): StableOpsVault | null {
  if (!vault.address || !vault.chainId || !CHAIN_BY_ID[vault.chainId]) {
    return null
  }

  const chain = CHAIN_BY_ID[vault.chainId]
  const asset = vault.underlyingTokens?.find((token) => token.symbol?.toUpperCase() === 'USDC')
  const apy = Number(vault.analytics?.apy?.total ?? 0)
  const tvlUsd = Number(vault.analytics?.tvl?.usd ?? 0)

  return {
    id: `${vault.chainId}:${vault.address}`.toLowerCase(),
    address: vault.address,
    chainId: vault.chainId,
    chainName: vault.network || chain.label,
    protocolName: vault.protocol?.name || 'LI.FI Earn',
    name: vault.name || vault.symbol || 'USDC Vault',
    symbol: vault.symbol || vault.name || 'Vault',
    assetSymbol: 'USDC',
    assetAddress: asset?.address || chain.usdc.address,
    assetDecimals: asset?.decimals || chain.usdc.decimals,
    apy,
    apy30d: typeof vault.analytics?.apy30d === 'number' ? vault.analytics.apy30d : null,
    tvlUsd,
    isTransactional: Boolean(vault.isTransactional),
    risk: classifyVaultRisk(apy, tvlUsd),
    reasons: [
      apy > 0 ? `APY ${(apy * 100).toFixed(2)}%` : 'Yield metadata available',
      tvlUsd > 0 ? `TVL $${Math.round(tvlUsd).toLocaleString()}` : 'TVL not reported',
      vault.isTransactional ? 'Composer deposit supported' : 'Discovery only',
    ],
    source: 'live',
    logoURI: vault.protocol?.logoURI || null,
  }
}
