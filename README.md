# 🏗 Scaffold-ETH 2 with Hardhat + Monad Testnet Configuration 

<h4 align="center">
  <a href="https://docs.scaffoldeth.io">Documentation</a> |
  <a href="https://scaffoldeth.io">Website</a>
</h4>

🧪 An open-source, up-to-date toolkit for building decentralized applications (dapps) on the Ethereum blockchain. It's designed to make it easier for developers to create and deploy smart contracts and build user interfaces that interact with those contracts.

⚙️ Built using NextJS, RainbowKit, Hardhat, Wagmi, Viem, and Typescript.

- ✅ **Contract Hot Reload**: Your frontend auto-adapts to your smart contract as you edit it.
- 🪝 **[Custom hooks](https://docs.scaffoldeth.io/hooks/)**: Collection of React hooks wrapper around [wagmi](https://wagmi.sh/) to simplify interactions with smart contracts with typescript autocompletion.
- 🧱 [**Components**](https://docs.scaffoldeth.io/components/): Collection of common web3 components to quickly build your frontend.
- 🔥 **Burner Wallet & Local Faucet**: Quickly test your application with a burner wallet and local faucet.
- 🔐 **Integration with Wallet Providers**: Connect to different wallet providers and interact with the Ethereum network.

![Debug Contracts tab](https://github.com/scaffold-eth/scaffold-eth-2/assets/55535804/b237af0c-5027-4849-a5c1-2e31495cccb1)

## Requirements

Before you begin, you need to install the following tools:

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Quickstart

To get started with Scaffold-ETH 2, follow the steps below:

1. Install dependencies if it was skipped in CLI:

```
cd my-dapp-example
yarn install
```

2. Run a local network in the first terminal:

```
yarn chain
```

This command starts a local Ethereum network using Hardhat. The network runs on your local machine and can be used for testing and development. You can customize the network configuration in `packages/hardhat/hardhat.config.ts`.

3. On a second terminal, deploy the test contract:

```
yarn deploy
```

This command deploys a test smart contract to the local network. The contract is located in `packages/hardhat/contracts` and can be modified to suit your needs. The `yarn deploy` command uses the deploy script located in `packages/hardhat/deploy` to deploy the contract to the network. You can also customize the deploy script.

4. On a third terminal, start your NextJS app:

```
yarn start
```

Visit your app on: `http://localhost:3000`. You can interact with your smart contract using the `Debug Contracts` page. You can tweak the app config in `packages/nextjs/scaffold.config.ts`.

## MProfiler local scenario checkpoint

The homepage provides a browser UI for submitting jobs and viewing their reports through the API. The profiler generates five deterministic local workloads: independent mapping writes, a shared global counter, repeated writes to one key, mixed reads and writes, and read-heavy calls. Each scenario deploys a fresh `ProfileWorkloads` contract to a disposable in-process Hardhat EVM and runs transactions sequentially through a fixed set of Hardhat accounts. Batch size and account count are bounded. Reports include real receipt gas and opcode traces; graph edges and waves are derived data, not measurements of Monad parallel execution.

Run the local scenario command:

```bash
MPROFILER_BATCH_SIZE=5 MPROFILER_ACCOUNT_COUNT=5 yarn workspace @se-2/hardhat profile:scenarios
```

It writes `/tmp/mprofiler-scenario-report.json` and `/tmp/mprofiler-scenario-traces.json` by default. `MPROFILER_REPORT_PATH` and `MPROFILER_RAW_TRACE_PATH` can override the output locations. The scenario generator accepts batches from 1 to 100 transactions per scenario and 2 to 20 controlled accounts. Larger batches remain sequential local runs and do not estimate wall-clock throughput.

Monad Testnet is kept out of this profiling loop. Any later Testnet check is a separate, small integration check for the configured chain/provider: verify chain ID, submit one explicitly authorized deployment or transaction, verify its receipt/event, and probe only the trace RPC methods needed by that check. Do not use Testnet to run scenario batches or upload profiling workloads.

Start the worker in one terminal with a random token of at least 24 characters:

```bash
MPROFILER_WORKER_TOKEN=<random-token> yarn workspace @se-2/hardhat worker
```

Start Next.js in another terminal with the same token:

```bash
MPROFILER_WORKER_URL=http://127.0.0.1:4012 MPROFILER_WORKER_TOKEN=<random-token> yarn start
```

Create a scenario job with `POST /api/profile/jobs` and JSON body `{"mode":"scenarios","batchSize":5,"controlledAccountCount":5}`. Poll `GET /api/profile/jobs/<job-id>` and fetch `GET /api/profile/jobs/<job-id>/report` after the status is `completed`. To compare with another compiled contract that implements the same five scenario methods, include its artifact name as `revisionArtifact`; the Hardhat runner resets to the same initial chain snapshot and reuses identical generated call inputs. The report returns baseline, revision, and comparison data. The worker accepts one active job and up to three queued jobs, retains at most 20 jobs, and expires completed job data after 15 minutes. Job state is in memory and is lost if the worker restarts. The worker binds to loopback by default; a hosted setup needs a private worker URL and a shared server-side token. This deterministic fixture flow profiles MProfiler's workload interface; it is not arbitrary source-upload profiling.

### Dashboard workflow

1. Open the dashboard and connect a funded Monad Testnet wallet to deploy the public `ProfileWorkloads` fixture. This is a bounded Testnet deployment check, separate from local workload measurements.
2. Run a local profile, then open **Compare** to inspect baseline and revision gas, success/revert counts, observed accesses, hot slots, and graph-derived dependency deltas. A comparison is valid only when the report marks the generated workload inputs as identical.
3. Open **Insights** to upload or edit Solidity source. The current diagnostics are deterministic source checks that attach available profile evidence. They clearly separate observed accesses from source-based inferences and recommendations, and provide a copyable coding-agent handoff. They do not compile untrusted source or claim external AI output.
4. From a completed report, deploy `MProfilerAttestation` from the connected Testnet wallet, then publish the report's Keccak-256 hash and an optional public evidence URI. The dashboard verifies the `ProfileAttested` receipt event for the exact hash and links the public transaction.

`MProfilerAttestation` keeps only the hash, publisher, timestamp, and optional URI on-chain. Store the full report at the supplied public URI before presenting the attestation as independently reproducible evidence.

## Hosted demo: Vercel + Render

The deployed demo has two services:

| Service | Host | Responsibility |
| --- | --- | --- |
| Next.js app and API routes | Vercel | Serves the dashboard and forwards authenticated job requests. |
| MProfiler worker | Render Web Service | Runs the bounded local Hardhat scenario jobs and holds their reports temporarily. |

The browser only talks to the Vercel URL. Vercel forwards to Render using a server-only bearer token, so neither the worker URL nor token is exposed to browser code.

### 1. Deploy the worker on Render

1. Push this repository to GitHub, then choose **New +** → **Blueprint** in Render and select the repository.
2. Render detects [`render.yaml`](./render.yaml). Rename `mprofiler-worker` in that file first if the service name is already taken.
3. When Render asks for `MPROFILER_WORKER_TOKEN`, generate and save one random value of at least 24 characters. Do not commit it or put it in a `NEXT_PUBLIC_` variable.
4. Create the Blueprint and wait for the deploy to become live. Copy the public service URL, for example `https://mprofiler-worker-xxxx.onrender.com`.

The worker reads Render's assigned `PORT` automatically and binds to `0.0.0.0`. It accepts only requests that include the token above.

### 2. Deploy the app on Vercel

1. Import the same GitHub repository in Vercel.
2. Set **Root Directory** to `packages/nextjs`; leave the framework preset as **Next.js**.
3. In **Environment Variables**, add these for Production and Preview:

   | Name | Value |
   | --- | --- |
   | `MPROFILER_WORKER_URL` | The Render service URL, with no trailing path. |
   | `MPROFILER_WORKER_TOKEN` | The exact same token used by the Render worker. |

4. Deploy. Open the resulting Vercel URL, run a batch of 2 with 2 controlled accounts, and wait for the completed report.

Do not set `QUICKNODE_MONAD_TESTNET_RPC_URL` or any deployer key on either hosted service. The worker runs local disposable Hardhat scenarios only. Monad Testnet remains a separate, small local integration checkpoint.


The worker currently keeps jobs in memory, so a Render restart loses active and retained job data; keep the worker process running during a demo. The same server-only environment variable names are listed in `packages/nextjs/.env.example`.

Run smart contract test with `yarn hardhat:test`

- Edit your smart contracts in `packages/hardhat/contracts`
- Edit your frontend homepage at `packages/nextjs/app/page.tsx`. For guidance on [routing](https://nextjs.org/docs/app/building-your-application/routing/defining-routes) and configuring [pages/layouts](https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts) checkout the Next.js documentation.
- Edit your deployment scripts in `packages/hardhat/deploy`


## Contract Verification

After deploying your smart contract to a testnet or mainnet, you can verify it on block explorers like Etherscan or Sourcify. This makes your contract source code publicly available and allows users to interact with it through the block explorer.

### Sourcify Verification (Recommended)

Scaffold-ETH 2 is configured to use Sourcify for contract verification by default. Sourcify is a decentralized verification platform that supports multiple block explorers.

#### For Monad Testnet

1. Deploy your contract to Monad testnet:
```bash
yarn deploy --network monadTestnet
```

2. Verify your contract using the hardhat-deploy plugin:
```bash
yarn hardhat-verify --network monadTestnet <CONTRACT_ADDRESS>
```

Replace `<CONTRACT_ADDRESS>` with the address of your deployed contract.

#### Configuration

The Sourcify configuration is already set up in `packages/hardhat/hardhat.config.ts`:

```typescript
sourcify: {
  enabled: true,
  apiUrl: "https://sourcify-api-monad.blockvision.org",
  browserUrl: "https://testnet.monadexplorer.com",
},
```

## Documentation

Visit our [docs](https://docs.scaffoldeth.io) to learn how to start building with Scaffold-ETH 2.

To know more about its features, check out our [website](https://scaffoldeth.io).

## Contributing to Scaffold-ETH 2

We welcome contributions to Scaffold-ETH 2!

Please see [CONTRIBUTING.MD](https://github.com/scaffold-eth/scaffold-eth-2/blob/main/CONTRIBUTING.md) for more information and guidelines for contributing to Scaffold-ETH 2.
