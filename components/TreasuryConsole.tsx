'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPublicClient, encodeFunctionData, erc20Abi, formatUnits, http } from 'viem'
import { arbitrum, base, mainnet } from 'viem/chains'
import {
  CHAINS,
  CHAIN_BY_ID,
  DEFAULT_POLICY,
  formatRate,
  formatUsd,
  type AgentStep,
  type PolicyCheck,
  type StableOpsRiskMode,
  type StableOpsVault,
  type TreasuryPlan,
  type TreasuryPolicy,
} from '@/lib/stableops'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}

type ComposerQuote = {
  action: {
    fromToken: { address: string; symbol: string; decimals: number }
    toToken: { symbol: string; decimals: number }
    fromAmount: string
  }
  estimate: {
    toAmount?: string
    approvalAddress?: string
  }
  transactionRequest: {
    to: string
    data?: string
    value?: string
    gasLimit?: string
    gas?: string
    gasPrice?: string
    maxFeePerGas?: string
    maxPriorityFeePerGas?: string
  }
}

class TransactionRevertedError extends Error {
  hash: string

  constructor(hash: string) {
    super('Deposit transaction was confirmed but reverted on-chain. Open the explorer link to inspect the failure, then lower the amount or refresh the Composer quote.')
    this.name = 'TransactionRevertedError'
    this.hash = hash
  }
}

const publicClients = {
  1: createPublicClient({ chain: mainnet, transport: http() }),
  8453: createPublicClient({ chain: base, transport: http() }),
  42161: createPublicClient({ chain: arbitrum, transport: http() }),
} as const

const riskModes: Array<{ value: StableOpsRiskMode; label: string; detail: string }> = [
  { value: 'conservative', label: 'Conservative', detail: 'Blue-chip stablecoin venues only' },
  { value: 'balanced', label: 'Balanced', detail: 'Keep guardrails, allow measured yield' },
  { value: 'open', label: 'Open', detail: 'Show every Composer-compatible venue' },
]

const navItems = ['Cash', 'Policy', 'Earn routes', 'Composer', 'Audit']

function ensureHex(value?: string) {
  if (!value) return '0x'
  return value.startsWith('0x') ? value : `0x${value}`
}

function toRpcQuantity(value?: string | bigint | null) {
  if (typeof value === 'bigint') return `0x${value.toString(16)}`
  if (!value) return undefined
  if (value.startsWith('0x')) return value

  try {
    return `0x${BigInt(value).toString(16)}`
  } catch {
    return undefined
  }
}

function formatWalletError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message)
  }
  return 'Wallet action failed.'
}

export default function TreasuryConsole() {
  const [policy, setPolicy] = useState<TreasuryPolicy>(DEFAULT_POLICY)
  const [plan, setPlan] = useState<TreasuryPlan | null>(null)
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [quote, setQuote] = useState<ComposerQuote | null>(null)
  const [approvalHash, setApprovalHash] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [failedTxHash, setFailedTxHash] = useState<string | null>(null)
  const [isPlanning, setIsPlanning] = useState(false)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedVault = useMemo(() => {
    if (!plan) return null
    return (
      plan.approvedVaults.find((vault) => vault.id === selectedVaultId) ||
      plan.recommendedVault ||
      null
    )
  }, [plan, selectedVaultId])

  const selectedChain = selectedVault ? CHAIN_BY_ID[selectedVault.chainId] : null
  const explorerBaseUrl = selectedChain?.explorer || null
  const checksPassed = plan?.checks.filter((check) => check.status === 'pass').length || 0
  const hasBlockingCheck = Boolean(plan?.checks.some((check) => check.status === 'block'))
  const reserveUsd = policy.treasurySizeUsd * (policy.reservePct / 100)
  const deployableCapacity = Math.max(0, policy.treasurySizeUsd - reserveUsd)
  const deployShare = Math.min(100, (policy.deployAmountUsd / Math.max(1, deployableCapacity)) * 100)
  const reserveShare = Math.min(100, policy.reservePct)
  const approvedVaultCount = plan?.approvedVaults.length || 0
  const rejectedVaultCount = plan?.rejectedVaults.length || 0
  const dataSourceLabel = plan?.dataSource === 'live' ? 'Live LI.FI Earn' : 'Composer-ready routes'
  const visiblePlanNotice =
    plan?.fallbackReason && !plan.fallbackReason.toLowerCase().includes('lifi_api_key')
      ? plan.fallbackReason
      : null
  const readyLabel = hasBlockingCheck ? 'Blocked' : quote ? 'Ready to sign' : 'Policy cleared'

  useEffect(() => {
    void runPlan(DEFAULT_POLICY)
  }, [])

  useEffect(() => {
    if (plan?.recommendedVault) {
      setSelectedVaultId(plan.recommendedVault.id)
    }
  }, [plan?.recommendedVault?.id])

  const updatePolicy = (patch: Partial<TreasuryPolicy>) => {
    setPolicy((current) => ({ ...current, ...patch }))
    setQuote(null)
    setTxHash(null)
    setFailedTxHash(null)
    setApprovalHash(null)
  }

  const toggleChain = (chainId: number) => {
    const exists = policy.allowedChainIds.includes(chainId)
    const next = exists
      ? policy.allowedChainIds.filter((item) => item !== chainId)
      : [...policy.allowedChainIds, chainId]

    updatePolicy({ allowedChainIds: next.length > 0 ? next : [chainId] })
  }

  async function runPlan(inputPolicy = policy) {
    setIsPlanning(true)
    setError(null)
    setQuote(null)
    setTxHash(null)
    setFailedTxHash(null)
    setApprovalHash(null)

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: inputPolicy }),
      })
      const payload = await response.json()

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to build treasury plan.')
      }

      setPlan(payload.plan)
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : 'Failed to build treasury plan.')
    } finally {
      setIsPlanning(false)
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      throw new Error('No EVM wallet found. Open this app in a wallet-enabled browser.')
    }

    const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
    const account = accounts?.[0]
    if (!account) {
      throw new Error('Wallet connection did not return an account.')
    }

    setWalletAddress(account)
    return account
  }

  async function switchChain(chainId: number) {
    if (!window.ethereum) throw new Error('No EVM wallet found.')
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    })
  }

  async function sendTransaction(chainId: number, tx: ComposerQuote['transactionRequest']) {
    if (!window.ethereum || !walletAddress) throw new Error('Connect wallet first.')

    const hash = (await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: walletAddress,
          to: tx.to,
          data: ensureHex(tx.data),
          value: toRpcQuantity(tx.value) || '0x0',
          ...(toRpcQuantity(tx.gasLimit || tx.gas) ? { gas: toRpcQuantity(tx.gasLimit || tx.gas) } : {}),
          ...(toRpcQuantity(tx.gasPrice) ? { gasPrice: toRpcQuantity(tx.gasPrice) } : {}),
          ...(toRpcQuantity(tx.maxFeePerGas) ? { maxFeePerGas: toRpcQuantity(tx.maxFeePerGas) } : {}),
          ...(toRpcQuantity(tx.maxPriorityFeePerGas)
            ? { maxPriorityFeePerGas: toRpcQuantity(tx.maxPriorityFeePerGas) }
            : {}),
        },
      ],
    })) as `0x${string}`

    const receipt = await publicClients[chainId as keyof typeof publicClients].waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      throw new TransactionRevertedError(hash)
    }

    return hash
  }

  async function prepareQuote() {
    if (!selectedVault) {
      setError('No policy-approved vault selected.')
      return
    }

    setIsQuoting(true)
    setError(null)
    setQuote(null)
    setFailedTxHash(null)

    try {
      const account = walletAddress || (await connectWallet())
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: selectedVault.chainId,
          vaultAddress: selectedVault.address,
          walletAddress: account,
          fromAmountUsd: plan?.policy.deployAmountUsd || policy.deployAmountUsd,
          fromTokenAddress: selectedVault.assetAddress,
          assetDecimals: selectedVault.assetDecimals,
        }),
      })
      const payload = await response.json()

      if (!response.ok || !payload?.success || !payload?.quote?.transactionRequest) {
        throw new Error(payload?.error || 'Failed to prepare LI.FI Composer quote.')
      }

      setQuote(payload.quote)
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : 'Failed to prepare LI.FI Composer quote.')
    } finally {
      setIsQuoting(false)
    }
  }

  async function executeQuote() {
    if (!quote || !selectedVault || !walletAddress) {
      setError('Prepare a Composer quote first.')
      return
    }

    setIsExecuting(true)
    setError(null)
    setTxHash(null)
    setFailedTxHash(null)

    try {
      await switchChain(selectedVault.chainId)

      const approvalAddress = quote.estimate.approvalAddress
      const fromTokenAddress = quote.action.fromToken.address
      const fromAmountRaw = quote.action.fromAmount
      const fromAmount = BigInt(fromAmountRaw)
      const client = publicClients[selectedVault.chainId as keyof typeof publicClients]

      if (fromTokenAddress) {
        const balance = (await client.readContract({
          address: fromTokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        })) as bigint

        if (balance < fromAmount) {
          throw new Error(
            `Insufficient ${quote.action.fromToken.symbol} on ${selectedVault.chainName}. Need ${Number(formatUnits(fromAmount, quote.action.fromToken.decimals)).toFixed(4)} ${quote.action.fromToken.symbol}, wallet has ${Number(formatUnits(balance, quote.action.fromToken.decimals)).toFixed(4)} ${quote.action.fromToken.symbol}. Add funds or lower Deploy USDC.`,
          )
        }
      }

      if (approvalAddress && fromTokenAddress) {
        const allowance = (await client.readContract({
          address: fromTokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [walletAddress as `0x${string}`, approvalAddress as `0x${string}`],
        })) as bigint

        if (allowance < fromAmount) {
          const data = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [approvalAddress as `0x${string}`, fromAmount],
          })

          const hash = await sendTransaction(selectedVault.chainId, {
            to: fromTokenAddress,
            data,
            value: '0x0',
          })
          setApprovalHash(hash)
        }
      }

      const hash = await sendTransaction(selectedVault.chainId, quote.transactionRequest)
      setTxHash(hash)
    } catch (executeError) {
      if (executeError instanceof TransactionRevertedError) {
        setFailedTxHash(executeError.hash)
      }
      setError(formatWalletError(executeError))
    } finally {
      setIsExecuting(false)
    }
  }

  const estimatedReceipt =
    quote?.estimate?.toAmount && quote.action?.toToken?.decimals != null
      ? Number(formatUnits(BigInt(quote.estimate.toAmount), quote.action.toToken.decimals))
      : null

  return (
    <main className="treasury-os">
      <aside className="rail" aria-label="StableOps navigation">
        <a className="rail-brand" href="#top" aria-label="StableOps Treasury home">
          <span className="brand-mark">S</span>
          <span>
            StableOps
            <small>Treasury OS</small>
          </span>
        </a>

        <nav className="rail-nav">
          {navItems.map((item, index) => (
            <a key={item} href={`#${item.toLowerCase().replaceAll(' ', '-')}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item}
            </a>
          ))}
        </nav>

        <div className="rail-card">
          <span>Wallet</span>
          <strong>{walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Not connected'}</strong>
          <button type="button" onClick={connectWallet}>
            {walletAddress ? 'Change wallet' : 'Connect wallet'}
          </button>
        </div>
      </aside>

      <div className="desk">
        <header className="desk-hero" id="top">
          <div>
            <p className="kicker">Agentic Treasury Lite / powered by LI.FI Earn</p>
            <h1>Move idle team USDC like a finance product, not a DeFi scavenger hunt.</h1>
            <p className="hero-lede">
              StableOps converts a treasury mandate into a governed Earn route: set operating
              reserves, discover approved vaults, prepare LI.FI Composer, sign, and leave with an
              audit-ready receipt.
            </p>
          </div>
          <div className="hero-actions-panel">
            <div className="hero-ticket-preview" aria-label="Execution preview">
              <span>Today&apos;s sweep</span>
              <strong>{formatUsd(policy.deployAmountUsd)} USDC</strong>
              <div>
                <small>Source</small>
                <b>{policy.treasuryName}</b>
              </div>
              <div>
                <small>Destination</small>
                <b>{selectedVault ? `${selectedVault.protocolName} / ${selectedVault.chainName}` : 'Policy-approved vault'}</b>
              </div>
              <div>
                <small>Rail</small>
                <b>LI.FI Composer</b>
              </div>
            </div>
            <span className={`status-dot ${hasBlockingCheck ? 'blocked' : 'ready'}`}>{readyLabel}</span>
            <button className="primary-action" type="button" onClick={() => runPlan()} disabled={isPlanning}>
              {isPlanning ? 'Scanning policy...' : 'Run treasury scan'}
            </button>
            <button className="secondary-action" type="button" onClick={prepareQuote} disabled={!selectedVault || isQuoting}>
              {isQuoting ? 'Preparing Composer...' : 'Prepare Composer'}
            </button>
          </div>
        </header>

        <section className="cash-strip" id="cash" aria-label="Treasury cash overview">
          <MetricCard label="Treasury balance" value={formatUsd(policy.treasurySizeUsd)} detail={`${policy.treasuryName} operating wallet`} />
          <MetricCard label="Protected reserve" value={formatUsd(reserveUsd)} detail={`${policy.reservePct}% kept liquid before yield`} />
          <MetricCard label="Deployment ticket" value={formatUsd(policy.deployAmountUsd)} detail={`Max action ${formatUsd(policy.maxPerExecutionUsd)}`} />
          <MetricCard label="Earn coverage" value={`${approvedVaultCount}/${approvedVaultCount + rejectedVaultCount || 0}`} detail={dataSourceLabel} />
        </section>

        <section className="workspace-grid">
          <section className="cash-map card-shell">
            <SectionHeader
              id="policy"
              eyebrow="Cash policy"
              title="Sweep only what survives the operating buffer."
              text="This borrows the cash-manager pattern from modern finance tools: keep a target reserve first, then route surplus into yield."
            />
            <div className="balance-visual">
              <div>
                <span>Reserve locked</span>
                <strong>{formatUsd(reserveUsd)}</strong>
              </div>
              <div>
                <span>Deploy request</span>
                <strong>{formatUsd(policy.deployAmountUsd)}</strong>
              </div>
            </div>
            <div className="allocation-bar" aria-label="Treasury allocation">
              <span className="reserve-allocation" style={{ width: `${reserveShare}%` }} />
              <span className="deploy-allocation" style={{ width: `${deployShare}%` }} />
            </div>
            <div className="policy-form">
              <Field label="Treasury name">
                <input value={policy.treasuryName} onChange={(event) => updatePolicy({ treasuryName: event.target.value })} />
              </Field>
              <Field label="Treasury size">
                <input type="number" min="1" value={policy.treasurySizeUsd} onChange={(event) => updatePolicy({ treasurySizeUsd: Number(event.target.value) })} />
              </Field>
              <Field label="Deploy USDC">
                <input type="number" min="0.01" step="0.01" value={policy.deployAmountUsd} onChange={(event) => updatePolicy({ deployAmountUsd: Number(event.target.value) })} />
              </Field>
              <Field label="Max action">
                <input type="number" min="0.01" step="0.01" value={policy.maxPerExecutionUsd} onChange={(event) => updatePolicy({ maxPerExecutionUsd: Number(event.target.value) })} />
              </Field>
              <Field label="Reserve target">
                <input type="number" min="0" max="100" value={policy.reservePct} onChange={(event) => updatePolicy({ reservePct: Number(event.target.value) })} />
              </Field>
              <Field label="Minimum TVL">
                <input type="number" min="0" value={policy.minTvlUsd} onChange={(event) => updatePolicy({ minTvlUsd: Number(event.target.value) })} />
              </Field>
            </div>
          </section>

          <section className="market-card card-shell" id="earn-routes">
            <SectionHeader
              eyebrow="Earn marketplace"
              title="Approved vaults become executable tickets."
              text="The route list stays focused on USDC vaults that pass chain, TVL, risk, and Composer support checks."
            />

            <div className="filter-row" aria-label="Risk and chain filters">
              {riskModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={policy.riskMode === mode.value ? 'filter-chip active' : 'filter-chip'}
                  onClick={() => updatePolicy({ riskMode: mode.value })}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.detail}</span>
                </button>
              ))}
            </div>

            <div className="chain-row">
              {CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  type="button"
                  className={policy.allowedChainIds.includes(chain.id) ? 'chain-chip active' : 'chain-chip'}
                  onClick={() => toggleChain(chain.id)}
                >
                  {chain.label}
                </button>
              ))}
            </div>

            <div className="vault-market">
              {plan?.approvedVaults.length ? (
                plan.approvedVaults.map((vault) => (
                  <VaultCard
                    key={vault.id}
                    vault={vault}
                    active={selectedVault?.id === vault.id}
                    onSelect={() => {
                      setSelectedVaultId(vault.id)
                      setQuote(null)
                      setTxHash(null)
                      setFailedTxHash(null)
                      setApprovalHash(null)
                    }}
                  />
                ))
              ) : (
                <div className="empty-state">Run a treasury scan to load policy-approved Earn routes.</div>
              )}
            </div>

            {visiblePlanNotice && <div className="notice warning">{visiblePlanNotice}</div>}
            {error && <div className="notice error">{error}</div>}
          </section>

          <aside className="ticket card-shell" id="composer">
            <SectionHeader
              eyebrow="Composer ticket"
              title="One route. One wallet action path."
              text="The signer sees the selected vault, policy checks, expected receipt token, and transaction links."
            />

            {selectedVault ? (
              <div className="selected-route">
                <span>{selectedVault.protocolName} / {selectedVault.chainName}</span>
                <strong>{selectedVault.name}</strong>
                <p>
                  Deposit {selectedVault.assetSymbol}. Receive {quote?.action.toToken.symbol || selectedVault.symbol}
                  {' '}as the treasury position token.
                </p>
                <div className="route-stats">
                  <MetricCard label="APY" value={formatRate(selectedVault.apy)} detail="Current route" compact />
                  <MetricCard label="TVL" value={formatUsd(selectedVault.tvlUsd)} detail="Liquidity depth" compact />
                </div>
              </div>
            ) : (
              <div className="empty-state">Select an approved vault to create the Composer ticket.</div>
            )}

            <div className="check-stack">
              {(plan?.checks || []).map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>

            {quote && (
              <div className="quote-panel">
                <div>
                  <span>Route</span>
                  <strong>
                    {quote.action.fromToken.symbol} {'->'} {quote.action.toToken.symbol}
                  </strong>
                </div>
                <div>
                  <span>Estimated output</span>
                  <strong>
                    {estimatedReceipt != null
                      ? `${estimatedReceipt.toFixed(4)} ${quote.action.toToken.symbol}`
                      : quote.action.toToken.symbol}
                  </strong>
                </div>
                <div>
                  <span>Approval target</span>
                  <strong>{quote.estimate.approvalAddress ? `${quote.estimate.approvalAddress.slice(0, 10)}...` : 'None'}</strong>
                </div>
              </div>
            )}

            <div className="ticket-actions">
              <button className="secondary-action" type="button" onClick={prepareQuote} disabled={!selectedVault || isQuoting}>
                {isQuoting ? 'Quoting...' : 'Prepare quote'}
              </button>
              <button className="primary-action" type="button" onClick={executeQuote} disabled={!quote || isExecuting || hasBlockingCheck}>
                {isExecuting ? 'Executing...' : 'Execute deposit'}
              </button>
            </div>

            {failedTxHash && explorerBaseUrl && (
              <div className="tx-alert failed">
                <strong>Deposit failed on-chain</strong>
                <p>The transaction was mined but reverted. Your funds were not deposited.</p>
                <a href={`${explorerBaseUrl}/tx/${failedTxHash}`} target="_blank" rel="noreferrer">
                  View failed tx {failedTxHash.slice(0, 10)}...
                </a>
              </div>
            )}
          </aside>
        </section>

        <section className="ops-grid" id="audit">
          <section className="audit-card card-shell">
            <SectionHeader
              eyebrow="Agent audit"
              title="Every AI decision is visible before signing."
              text="The agent layer recommends, filters, and reports. It does not bypass treasury policy."
            />
            <div className="audit-list">
              {(plan?.agents || []).map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </div>
          </section>

          <section className="reject-card card-shell">
            <SectionHeader
              eyebrow="Rejected venues"
              title="Blocked routes stay visible."
              text="Showing what did not pass is what makes the treasury flow credible for a team wallet."
            />
            <div className="reject-list">
              {plan?.rejectedVaults.length ? (
                plan.rejectedVaults.slice(0, 5).map((vault) => (
                  <article key={`${vault.vaultId}-${vault.reason}`}>
                    <strong>{vault.name}</strong>
                    <span>{vault.chainName}</span>
                    <p>{vault.reason}</p>
                  </article>
                ))
              ) : (
                <div className="empty-state">No blocked vaults under the current mandate.</div>
              )}
            </div>
          </section>
        </section>

        {txHash && selectedVault && (
          <section className="receipt card-shell">
            <SectionHeader
              eyebrow="Execution receipt"
              title="Funds deployed. Position explained."
              text="A team can hand this receipt to finance, ops, or another agent without decoding the transaction manually."
            />
            <p>
              Deployed {formatUsd(plan?.policy.deployAmountUsd || policy.deployAmountUsd)} USDC into{' '}
              {selectedVault.name} on {selectedVault.chainName}. The treasury wallet now holds{' '}
              {quote?.action.toToken.symbol || selectedVault.symbol}.
            </p>
            <div className="receipt-links">
              {approvalHash && (
                <a href={`${explorerBaseUrl}/tx/${approvalHash}`} target="_blank" rel="noreferrer">
                  Approval {approvalHash.slice(0, 10)}...
                </a>
              )}
              <a href={`${explorerBaseUrl}/tx/${txHash}`} target="_blank" rel="noreferrer">
                Deposit {txHash.slice(0, 10)}...
              </a>
              <span>Receipt token: {quote?.action.toToken.symbol || selectedVault.symbol}</span>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function SectionHeader({ id, eyebrow, title, text }: { id?: string; eyebrow: string; title: string; text: string }) {
  return (
    <div className="section-head" id={id}>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function MetricCard({
  label,
  value,
  detail,
  compact = false,
}: {
  label: string
  value: string
  detail: string
  compact?: boolean
}) {
  return (
    <article className={compact ? 'metric compact' : 'metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function VaultCard({
  vault,
  active,
  onSelect,
}: {
  vault: StableOpsVault
  active: boolean
  onSelect: () => void
}) {
  return (
    <button type="button" className={active ? 'vault-card active' : 'vault-card'} onClick={onSelect}>
      <span>{vault.protocolName}</span>
      <strong>{vault.name}</strong>
      <p>{vault.chainName} / {vault.symbol}</p>
      <div>
        <em>{formatRate(vault.apy)} APY</em>
        <em>{formatUsd(vault.tvlUsd)} TVL</em>
        <em>{vault.risk}</em>
      </div>
    </button>
  )
}

function CheckRow({ check }: { check: PolicyCheck }) {
  return (
    <article className={`check-row ${check.status}`}>
      <div>
        <span>{check.label}</span>
        <strong>{check.status}</strong>
      </div>
      <p>{check.detail}</p>
    </article>
  )
}

function AgentRow({ agent }: { agent: AgentStep }) {
  return (
    <article className={`agent-row ${agent.status}`}>
      <span>{agent.role}</span>
      <div>
        <strong>{agent.verdict}</strong>
        <p>{agent.detail}</p>
      </div>
    </article>
  )
}
