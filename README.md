# Pyrois (PYRO)

Deflationary ERC-20 token on Base with an automatic 1-hour rolling heat-based sell burn and a permanent 10% supply floor.

## Token Parameters

- **Name / Symbol**: Pyrois (`PYRO`)
- **Initial Supply**: `1,000,000,000 PYRO` (minted once to deployer; no mint function)
- **Supply Floor**: `100,000,000 PYRO` (10% permanent floor)
- **Buy & Wallet Transfer Tax**: `0%`
- **Sell Burn Range**: `0.50%` (≤ 1M PYRO sold in 1h) scaling linearly to `5.00%` (≥ 10M PYRO sold in 1h), resetting every 1-hour epoch
- **Admin**: Only `setAmmPair(address pair, bool enabled)` — permanently locked after `renounceOwnership()`

## Smart Contract (Foundry)

### Build & Test

```bash
forge test -vvv
forge test --gas-report
```

### Environment Setup

```bash
cp .env.example .env
# Populate PRIVATE_KEY, BASE_SEPOLIA_RPC_URL, BASE_RPC_URL, and BASESCAN_API_KEY
```

### Deploy & Verify — Base Sepolia (Chain ID `84532`)

```bash
source .env
forge script script/DeployPyrois.s.sol:DeployPyrois \
  --rpc-url base_sepolia \
  --broadcast \
  --verify
```

### Deploy & Verify — Base Mainnet (Chain ID `8453`)

```bash
source .env
forge script script/DeployPyrois.s.sol:DeployPyrois \
  --rpc-url base \
  --broadcast \
  --verify
```

## Uniswap V2 / Aerodrome Volatile Pool Checklist

1. **Deploy `Pyrois`** with the deployer wallet (receives 1,000,000,000 PYRO).
2. **Create the liquidity pool** (Uniswap V2 `PYRO/WETH` or Aerodrome Volatile `vAMM-PYRO/WETH`) and seed initial liquidity from the deployer wallet (`from == owner()` is tax-free).
3. **Register the pool pair address** so sells into the AMM trigger the dynamic heat burn:
   ```bash
   cast send <PYRO_ADDRESS> "setAmmPair(address,bool)" <PAIR_ADDRESS> true \
     --rpc-url base \
     --private-key $PRIVATE_KEY
   ```
   *(Note: Fee-on-transfer / burn-on-sell tokens require V2-style or Aerodrome Volatile pools and swaps using fee-on-transfer router methods; do not use Uniswap V3 concentrated liquidity pools.)*
4. **Verify pool registration**:
   ```bash
   cast call <PYRO_ADDRESS> "isAmmPair(address)(bool)" <PAIR_ADDRESS> --rpc-url base
   ```
5. **Lock or burn LP tokens** according to your launch plan.
6. **Renounce ownership** to permanently lock `setAmmPair` and remove owner transfer exemption:
   ```bash
   cast send <PYRO_ADDRESS> "renounceOwnership()" \
     --rpc-url base \
     --private-key $PRIVATE_KEY
   ```

## Frontend (`frontend/`)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Set `VITE_PYROIS_ADDRESS` and `VITE_CHAIN_ID` (`84532` for Base Sepolia or `8453` for Base Mainnet) in `frontend/.env`.
