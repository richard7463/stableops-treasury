# StableOps Treasury

Agentic treasury execution for small teams, DAOs, and indie builders, powered by LI.FI Earn and Composer.

StableOps is not a personal wallet yield screen. It is a treasury operator that starts from rules, not APY:

- keep a reserve target
- cap each execution
- restrict chain scope
- require a minimum vault TVL
- use LI.FI Earn vault discovery
- use LI.FI Composer to prepare the deposit transaction
- report the receipt token after execution

## Why This Exists

Small teams hold stablecoin treasury balances, but execution is operationally messy. Someone has to compare vaults, check chains, review risk, prepare approvals, execute the deposit, and explain the resulting receipt token to the rest of the team.

StableOps compresses that process into one governed execution flow:

```text
Treasury policy -> LI.FI Earn discovery -> risk and policy checks -> Composer quote -> wallet execution -> treasury report
```

## LI.FI Usage

StableOps uses LI.FI in two places:

- `GET https://earn.li.fi/v1/earn/vaults` for USDC vault discovery across Base, Arbitrum, and Ethereum.
- `GET https://li.quest/v1/quote` for the Composer-compatible deposit route from USDC into the selected vault token.

If `LIFI_API_KEY` is missing, the app falls back to seeded Composer-compatible examples so reviewers can still inspect the treasury workflow locally. For the real demo, set `LIFI_API_KEY`.

## Live Demo

- App: https://stableops-treasury.vercel.app
- Successful Base execution: https://basescan.org/tx/0x5bf01b31f161bf4ab0ad3b4c60d448469a66dda150cc6f02329a7dd188091e4b

## Run

```bash
cd stableops-treasury
npm install
LIFI_API_KEY=... npm run dev
```

Open `http://localhost:3017`.

## Agent Skill

```bash
clawhub install stableops-lifi-treasury
```

Published package: `stableops-lifi-treasury@0.1.0`

## Demo Policy

```text
Treasury: Builder Treasury
Treasury size: 100 USDC
Deploy: 1 USDC
Reserve target: 60%
Max per execution: 5 USDC
Allowed chains: Base, Arbitrum
Risk mode: Conservative
Minimum TVL: $5,000,000
```

## Submission Positioning

**Track:** AI x Earn

**One-liner:** StableOps turns small-team treasury policy into governed LI.FI Earn execution.

**What it demonstrates:**

- Treasury-specific product framing
- Agentic workflow with clear roles
- Real vault discovery through LI.FI Earn
- Composer deposit quote and wallet execution path
- Policy checks before transaction creation
- Post-execution receipt-token reporting
