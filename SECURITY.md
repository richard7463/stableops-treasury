# Security Notes

StableOps Treasury is a non-custodial demo application for governed LI.FI Earn execution.

## Trust Model

- StableOps never takes custody of user funds.
- StableOps never asks for or stores private keys.
- Every on-chain action requires the connected wallet to sign.
- The policy engine only decides whether an execution route should be shown; it does not bypass wallet approval.
- LI.FI Composer prepares the transaction route; the user wallet broadcasts it.

## Execution Safety

The app performs these checks before or during execution:

- Treasury reserve guardrail
- Per-action execution cap
- Chain allowlist
- Vault TVL floor
- Risk mode filter
- Composer route availability
- ERC-20 balance check before execution
- Transaction receipt status check after mining

If a deposit transaction is mined but reverted, StableOps does not show a success receipt. It displays the failed transaction hash so the signer can inspect it on the block explorer.

## User Requirements

Users must have:

- The input token on the selected chain, for example Base USDC.
- Native gas token on the selected chain, for example Base ETH.
- A wallet connected to the expected network.

## Known Limitations

- This is hackathon software and has not been audited.
- Vault APY and TVL are external data and may change.
- A successful quote can become stale before signing if market or vault conditions change.
- The app does not guarantee yield, principal safety, or vault solvency.
- Users should verify the final transaction in their wallet and on the block explorer.

## Reporting Issues

Open a GitHub issue with:

- Steps to reproduce
- Chain and wallet used
- Transaction hash if available
- Expected vs actual behavior
