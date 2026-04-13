import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_POLICY,
  SEEDED_VAULTS,
  buildTreasuryPlan,
  classifyVaultRisk,
} from '../dist-test/stableops.js'

test('approves Composer-executable USDC vaults that satisfy the default treasury mandate', () => {
  const plan = buildTreasuryPlan(DEFAULT_POLICY, SEEDED_VAULTS, 'seeded')

  assert.equal(plan.recommendedVault?.id, 'base-spark-usdc')
  assert.equal(plan.approvedVaults.length, 2)
  assert.equal(plan.checks.every((check) => check.status === 'pass'), true)
})

test('blocks deployment when the reserve guardrail would be breached', () => {
  const plan = buildTreasuryPlan(
    {
      ...DEFAULT_POLICY,
      treasurySizeUsd: 100,
      reservePct: 95,
      deployAmountUsd: 10,
    },
    SEEDED_VAULTS,
    'seeded',
  )

  assert.equal(plan.checks.find((check) => check.id === 'reserve')?.status, 'block')
  assert.equal(plan.agents.find((agent) => agent.id === 'policy')?.verdict, 'Execution blocked')
})

test('blocks execution when the requested deploy amount exceeds the per-action cap', () => {
  const plan = buildTreasuryPlan(
    {
      ...DEFAULT_POLICY,
      deployAmountUsd: 20,
      maxPerExecutionUsd: 5,
    },
    SEEDED_VAULTS,
    'seeded',
  )

  assert.equal(plan.checks.find((check) => check.id === 'execution-cap')?.status, 'block')
})

test('rejects vaults outside the allowed chain list', () => {
  const plan = buildTreasuryPlan(
    {
      ...DEFAULT_POLICY,
      allowedChainIds: [42161],
    },
    SEEDED_VAULTS,
    'seeded',
  )

  assert.equal(plan.recommendedVault?.chainId, 42161)
  assert.equal(plan.rejectedVaults.some((vault) => vault.name === 'Spark USDC Vault'), true)
})

test('rejects vaults below the minimum TVL floor', () => {
  const plan = buildTreasuryPlan(
    {
      ...DEFAULT_POLICY,
      minTvlUsd: 20_000_000,
      allowedChainIds: [8453, 42161, 1],
    },
    SEEDED_VAULTS,
    'seeded',
  )

  assert.equal(plan.recommendedVault?.id, 'ethereum-aave-usdc')
  assert.equal(plan.rejectedVaults.some((vault) => vault.reason.includes('below')), true)
})

test('classifies high APY or low TVL vaults as higher risk', () => {
  assert.equal(classifyVaultRisk(0.045, 20_000_000), 'safe')
  assert.equal(classifyVaultRisk(0.08, 2_000_000), 'balanced')
  assert.equal(classifyVaultRisk(0.13, 10_000_000), 'open')
  assert.equal(classifyVaultRisk(0.03, 400_000), 'open')
})
