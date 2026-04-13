export type StableOpsRiskMode = 'conservative' | 'balanced' | 'open'
export type StableOpsVaultRisk = 'safe' | 'balanced' | 'open'
export type PolicyCheckStatus = 'pass' | 'warn' | 'block'
export type DataSource = 'live' | 'seeded'

export interface ChainConfig {
  id: number
  key: 'ethereum' | 'arbitrum' | 'base'
  label: string
  nativeToken: string
  usdc: {
    address: string
    decimals: number
  }
  explorer: string
}

export interface TreasuryPolicy {
  treasuryName: string
  treasurySizeUsd: number
  deployAmountUsd: number
  reservePct: number
  maxPerExecutionUsd: number
  minTvlUsd: number
  riskMode: StableOpsRiskMode
  allowedChainIds: number[]
}

export interface StableOpsVault {
  id: string
  address: string
  chainId: number
  chainName: string
  protocolName: string
  name: string
  symbol: string
  assetSymbol: 'USDC'
  assetAddress: string
  assetDecimals: number
  apy: number
  apy30d?: number | null
  tvlUsd: number
  isTransactional: boolean
  risk: StableOpsVaultRisk
  reasons: string[]
  source: DataSource
  logoURI?: string | null
}

export interface PolicyCheck {
  id: string
  label: string
  status: PolicyCheckStatus
  detail: string
}

export interface RejectedVault {
  vaultId: string
  name: string
  chainName: string
  reason: string
}

export interface AgentStep {
  id: 'mandate' | 'scout' | 'risk' | 'policy' | 'composer' | 'reporter'
  role: string
  verdict: string
  detail: string
  status: PolicyCheckStatus
}

export interface TreasuryPlan {
  policy: TreasuryPolicy
  recommendedVault: StableOpsVault | null
  approvedVaults: StableOpsVault[]
  rejectedVaults: RejectedVault[]
  checks: PolicyCheck[]
  agents: AgentStep[]
  reportPreview: string
  dataSource: DataSource
  fallbackReason?: string
}

export const CHAINS: ChainConfig[] = [
  {
    id: 8453,
    key: 'base',
    label: 'Base',
    nativeToken: 'ETH',
    usdc: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
    },
    explorer: 'https://basescan.org',
  },
  {
    id: 42161,
    key: 'arbitrum',
    label: 'Arbitrum',
    nativeToken: 'ETH',
    usdc: {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
    },
    explorer: 'https://arbiscan.io',
  },
  {
    id: 1,
    key: 'ethereum',
    label: 'Ethereum',
    nativeToken: 'ETH',
    usdc: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    explorer: 'https://etherscan.io',
  },
]

export const CHAIN_BY_ID = Object.fromEntries(CHAINS.map((chain) => [chain.id, chain])) as Record<
  number,
  ChainConfig
>

export const DEFAULT_POLICY: TreasuryPolicy = {
  treasuryName: 'Builder Treasury',
  treasurySizeUsd: 100,
  deployAmountUsd: 1,
  reservePct: 60,
  maxPerExecutionUsd: 5,
  minTvlUsd: 5000000,
  riskMode: 'conservative',
  allowedChainIds: [8453, 42161],
}

export const SEEDED_VAULTS: StableOpsVault[] = [
  {
    id: 'base-spark-usdc',
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
    chainId: 8453,
    chainName: 'Base',
    protocolName: 'Spark',
    name: 'Spark USDC Vault',
    symbol: 'sparkUSDC',
    assetSymbol: 'USDC',
    assetAddress: CHAIN_BY_ID[8453].usdc.address,
    assetDecimals: 6,
    apy: 0.078,
    apy30d: 0.061,
    tvlUsd: 12000000,
    isTransactional: true,
    risk: 'safe',
    reasons: ['Stablecoin strategy', 'Composer deposit supported', 'TVL above policy floor'],
    source: 'seeded',
  },
  {
    id: 'arbitrum-aave-usdc',
    address: '0x724dc807b04555b71ed48a6896b6F41593b8C637',
    chainId: 42161,
    chainName: 'Arbitrum',
    protocolName: 'Aave V3',
    name: 'Aave Arbitrum USDC',
    symbol: 'aArbUSDCn',
    assetSymbol: 'USDC',
    assetAddress: CHAIN_BY_ID[42161].usdc.address,
    assetDecimals: 6,
    apy: 0.053,
    apy30d: 0.049,
    tvlUsd: 9500000,
    isTransactional: true,
    risk: 'safe',
    reasons: ['Blue-chip lending market', 'Stablecoin collateral', 'Composer deposit supported'],
    source: 'seeded',
  },
  {
    id: 'ethereum-aave-usdc',
    address: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c',
    chainId: 1,
    chainName: 'Ethereum',
    protocolName: 'Aave V3',
    name: 'Aave Ethereum USDC',
    symbol: 'aEthUSDC',
    assetSymbol: 'USDC',
    assetAddress: CHAIN_BY_ID[1].usdc.address,
    assetDecimals: 6,
    apy: 0.045,
    apy30d: 0.041,
    tvlUsd: 23500000,
    isTransactional: true,
    risk: 'safe',
    reasons: ['Deep liquidity', 'Largest Aave market', 'Composer deposit supported'],
    source: 'seeded',
  },
]

export function normalizePolicy(input?: Partial<TreasuryPolicy> | null): TreasuryPolicy {
  const allowedChainIds = Array.isArray(input?.allowedChainIds)
    ? input.allowedChainIds.map(Number).filter((chainId) => CHAIN_BY_ID[chainId])
    : DEFAULT_POLICY.allowedChainIds

  return {
    treasuryName: String(input?.treasuryName || DEFAULT_POLICY.treasuryName).slice(0, 80),
    treasurySizeUsd: clampNumber(input?.treasurySizeUsd, 1, 100000000, DEFAULT_POLICY.treasurySizeUsd),
    deployAmountUsd: clampNumber(input?.deployAmountUsd, 0.01, 100000000, DEFAULT_POLICY.deployAmountUsd),
    reservePct: clampNumber(input?.reservePct, 0, 100, DEFAULT_POLICY.reservePct),
    maxPerExecutionUsd: clampNumber(
      input?.maxPerExecutionUsd,
      0.01,
      100000000,
      DEFAULT_POLICY.maxPerExecutionUsd,
    ),
    minTvlUsd: clampNumber(input?.minTvlUsd, 0, 10000000000, DEFAULT_POLICY.minTvlUsd),
    riskMode:
      input?.riskMode === 'conservative' || input?.riskMode === 'balanced' || input?.riskMode === 'open'
        ? input.riskMode
        : DEFAULT_POLICY.riskMode,
    allowedChainIds: allowedChainIds.length > 0 ? allowedChainIds : DEFAULT_POLICY.allowedChainIds,
  }
}

export function classifyVaultRisk(apy: number, tvlUsd: number): StableOpsVaultRisk {
  if (apy >= 0.12 || tvlUsd < 500000) return 'open'
  if (apy >= 0.075 || tvlUsd < 2500000) return 'balanced'
  return 'safe'
}

export function formatRate(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A'
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`
}

export function formatUsd(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000000 ? 0 : 2,
  }).format(value)
}

export function amountToBaseUnits(amount: number, decimals: number) {
  return String(Math.round(amount * 10 ** decimals))
}

export function buildTreasuryPlan(
  inputPolicy: Partial<TreasuryPolicy>,
  vaults: StableOpsVault[],
  dataSource: DataSource,
  fallbackReason?: string,
): TreasuryPlan {
  const policy = normalizePolicy(inputPolicy)
  const rejectedVaults: RejectedVault[] = []

  const allowedRisk: StableOpsVaultRisk[] =
    policy.riskMode === 'conservative'
      ? ['safe']
      : policy.riskMode === 'balanced'
        ? ['safe', 'balanced']
        : ['safe', 'balanced', 'open']

  const approvedVaults = vaults
    .filter((vault) => {
      const rejection = getVaultRejection(vault, policy, allowedRisk)
      if (rejection) {
        rejectedVaults.push({
          vaultId: vault.id,
          name: vault.name,
          chainName: vault.chainName,
          reason: rejection,
        })
        return false
      }
      return true
    })
    .sort((left, right) => scoreVault(right, policy) - scoreVault(left, policy))

  const recommendedVault = approvedVaults[0] || null
  const checks = buildPolicyChecks(policy, recommendedVault)
  const blocked = checks.some((check) => check.status === 'block')
  const agents = buildAgentSteps(policy, recommendedVault, approvedVaults.length, rejectedVaults.length, blocked)
  const reportPreview = recommendedVault
    ? `${policy.treasuryName}: deploy ${formatUsd(policy.deployAmountUsd)} USDC to ${recommendedVault.name} on ${recommendedVault.chainName}. Treasury reserve target stays at ${policy.reservePct}%. Receipt token after execution: ${recommendedVault.symbol}.`
    : `${policy.treasuryName}: no vault passed the treasury policy. Adjust chain scope, risk mode, or TVL floor before execution.`

  return {
    policy,
    recommendedVault,
    approvedVaults,
    rejectedVaults,
    checks,
    agents,
    reportPreview,
    dataSource,
    fallbackReason,
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(Math.max(numeric, min), max)
}

function getVaultRejection(
  vault: StableOpsVault,
  policy: TreasuryPolicy,
  allowedRisk: StableOpsVaultRisk[],
) {
  if (!policy.allowedChainIds.includes(vault.chainId)) return 'Chain is outside the treasury allowlist.'
  if (vault.assetSymbol !== 'USDC') return 'Treasury mandate only deploys USDC.'
  if (!vault.isTransactional) return 'Vault is not Composer-executable.'
  if (!allowedRisk.includes(vault.risk)) return `Vault risk is ${vault.risk}, outside ${policy.riskMode} mode.`
  if (vault.tvlUsd < policy.minTvlUsd) return `TVL ${formatUsd(vault.tvlUsd)} is below ${formatUsd(policy.minTvlUsd)} floor.`
  return null
}

function scoreVault(vault: StableOpsVault, policy: TreasuryPolicy) {
  const tvlScore = Math.log10(Math.max(vault.tvlUsd, 1)) * 8
  const yieldScore = vault.apy * 100
  const chainPreference = vault.chainId === policy.allowedChainIds[0] ? 4 : 0
  const safetyScore = vault.risk === 'safe' ? 12 : vault.risk === 'balanced' ? 5 : 0
  return tvlScore + yieldScore + chainPreference + safetyScore
}

function buildPolicyChecks(policy: TreasuryPolicy, vault: StableOpsVault | null): PolicyCheck[] {
  const deployCapacityUsd = Math.max(0, policy.treasurySizeUsd * (1 - policy.reservePct / 100))
  return [
    {
      id: 'reserve',
      label: 'Reserve guardrail',
      status: policy.deployAmountUsd <= deployCapacityUsd ? 'pass' : 'block',
      detail: `${formatUsd(policy.deployAmountUsd)} deployment vs ${formatUsd(deployCapacityUsd)} allowed after ${policy.reservePct}% reserve target.`,
    },
    {
      id: 'execution-cap',
      label: 'Execution cap',
      status: policy.deployAmountUsd <= policy.maxPerExecutionUsd ? 'pass' : 'block',
      detail: `${formatUsd(policy.deployAmountUsd)} requested, ${formatUsd(policy.maxPerExecutionUsd)} maximum per treasury action.`,
    },
    {
      id: 'chain-zone',
      label: 'Chain allowlist',
      status: vault && policy.allowedChainIds.includes(vault.chainId) ? 'pass' : 'block',
      detail: vault
        ? `${vault.chainName} is allowed by the treasury policy.`
        : 'No approved vault matched the allowed chains.',
    },
    {
      id: 'tvl-floor',
      label: 'TVL floor',
      status: vault && vault.tvlUsd >= policy.minTvlUsd ? 'pass' : 'block',
      detail: vault
        ? `${vault.name} TVL is ${formatUsd(vault.tvlUsd)} vs ${formatUsd(policy.minTvlUsd)} minimum.`
        : 'No approved vault cleared the TVL floor.',
    },
    {
      id: 'composer',
      label: 'Composer execution',
      status: vault?.isTransactional ? 'pass' : 'block',
      detail: vault?.isTransactional
        ? 'LI.FI Composer can prepare a deposit route for this vault.'
        : 'No Composer-executable vault is selected.',
    },
  ]
}

function buildAgentSteps(
  policy: TreasuryPolicy,
  vault: StableOpsVault | null,
  approvedCount: number,
  rejectedCount: number,
  blocked: boolean,
): AgentStep[] {
  return [
    {
      id: 'mandate',
      role: 'Treasury Mandate',
      verdict: `${formatUsd(policy.deployAmountUsd)} USDC deployment scoped`,
      detail: `${policy.treasuryName} keeps ${policy.reservePct}% reserve and caps each action at ${formatUsd(policy.maxPerExecutionUsd)}.`,
      status: 'pass',
    },
    {
      id: 'scout',
      role: 'LI.FI Earn Scout',
      verdict: `${approvedCount} executable vault${approvedCount === 1 ? '' : 's'} approved`,
      detail: `${rejectedCount} vault${rejectedCount === 1 ? '' : 's'} rejected by chain, risk, TVL, or Composer support.`,
      status: approvedCount > 0 ? 'pass' : 'block',
    },
    {
      id: 'risk',
      role: 'Risk Gate',
      verdict: vault ? `${vault.risk} vault selected` : 'No vault selected',
      detail: vault
        ? `${vault.name} clears the ${formatUsd(policy.minTvlUsd)} TVL floor and ${policy.riskMode} risk mode.`
        : 'Treasury policy blocked execution.',
      status: vault ? 'pass' : 'block',
    },
    {
      id: 'policy',
      role: 'Policy Controller',
      verdict: blocked ? 'Execution blocked' : 'Execution authorized',
      detail: blocked
        ? 'At least one treasury rule failed. No Composer transaction should be prepared.'
        : 'Reserve, max execution, chain, TVL, and Composer checks passed.',
      status: blocked ? 'block' : 'pass',
    },
    {
      id: 'composer',
      role: 'Composer Executor',
      verdict: vault ? 'Ready for quote' : 'Waiting for approved vault',
      detail: vault
        ? `Prepare LI.FI Composer deposit from USDC to ${vault.symbol} on ${vault.chainName}.`
        : 'No transaction request is created until policy approval exists.',
      status: vault && !blocked ? 'pass' : 'block',
    },
    {
      id: 'reporter',
      role: 'Treasury Reporter',
      verdict: vault ? 'Receipt report prepared' : 'No report generated',
      detail: vault
        ? `Post-execution report will include vault, chain, tx hash, and receipt token ${vault.symbol}.`
        : 'Report waits for an approved execution path.',
      status: vault ? 'pass' : 'warn',
    },
  ]
}
