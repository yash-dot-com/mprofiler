import { expect } from "chai";
import type { ContractTransactionResponse, Interface, Log, Signer } from "ethers";
import { ethers, network } from "hardhat";
import { buildProfileGraph } from "../scripts/profileGraph";
import { createProfileReport, validateProfileReport } from "../scripts/profileReport";
import { compareProfileReports } from "../scripts/profileCompare";
import { generateWorkloads, SCENARIO_IDS } from "../scripts/profileWorkloads";
import { parseTraceAccess, TraceAccessReport } from "../scripts/traceAccess";

const address = "0x0000000000000000000000000000000000000001";
const slot = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;

type DynamicContractMethod = (...args: bigint[]) => Promise<ContractTransactionResponse>;
type DynamicContractTarget = { getFunction(name: string): DynamicContractMethod };

function dynamicTarget(contract: unknown, signer: Signer): DynamicContractTarget {
  return (contract as { connect(signer: Signer): unknown }).connect(signer) as DynamicContractTarget;
}

function call(
  index: number,
  accesses: TraceAccessReport["accesses"],
  complete = true,
): Parameters<typeof buildProfileGraph>[0][number] {
  return {
    workloadCaseId: `fixture:${index}`,
    input: `case-${index}`,
    transactionHash: `0x${index}`,
    status: "success",
    gasUsed: "1",
    trace: {
      reverted: false,
      complete,
      accesses,
      committedWriteSlots: [
        ...new Set(accesses.filter(access => access.operation === "write").map(access => access.slot)),
      ],
      warnings: [],
    },
  };
}

function access(mode: "read" | "write", value: number) {
  return {
    contractAddress: address,
    operation: mode,
    opcode: mode === "read" ? ("SLOAD" as const) : ("SSTORE" as const),
    slot: slot(value),
    programCounter: value,
    depth: 1,
  };
}

describe("MProfiler trace evidence and dependency graph", function () {
  it("observes storage opcodes from a real local Hardhat transaction trace", async function () {
    const contract = await (await ethers.getContractFactory("ProfileProbe")).deploy();
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
    const writeTx = await contract.getFunction("writeValue")(5);
    const writeReceipt = await writeTx.wait();
    const readTx = await contract.getFunction("readThenWriteObserved")();
    const readReceipt = await readTx.wait();
    expect(writeReceipt).not.to.equal(null);
    expect(readReceipt).not.to.equal(null);

    const firstRawTrace: unknown = await network.provider.send("debug_traceTransaction", [writeReceipt!.hash]);
    const secondRawTrace: unknown = await network.provider.send("debug_traceTransaction", [readReceipt!.hash]);
    const firstTrace = parseTraceAccess(firstRawTrace, contractAddress);
    const secondTrace = parseTraceAccess(secondRawTrace, contractAddress);
    expect(firstTrace.complete).to.equal(true);
    expect(secondTrace.complete).to.equal(true);
    expect(firstTrace.accesses.some(access => access.opcode === "SSTORE")).to.equal(true);
    expect(secondTrace.accesses.some(access => access.opcode === "SLOAD")).to.equal(true);
    expect(secondTrace.accesses.some(access => access.opcode === "SSTORE")).to.equal(true);
    expect(
      [...firstTrace.accesses, ...secondTrace.accesses].every(
        access => access.contractAddress === contractAddress.toLowerCase(),
      ),
    ).to.equal(true);
    const graph = buildProfileGraph([
      {
        workloadCaseId: "known-storage:0",
        input: "writeValue(5)",
        transactionHash: writeReceipt!.hash,
        status: "success",
        gasUsed: writeReceipt!.gasUsed.toString(),
        trace: firstTrace,
      },
      {
        workloadCaseId: "known-storage:1",
        input: "readThenWriteObserved()",
        transactionHash: readReceipt!.hash,
        status: "success",
        gasUsed: readReceipt!.gasUsed.toString(),
        trace: secondTrace,
      },
    ]);
    expect(graph.edges).to.have.length(1);
    expect(graph.edges[0].kind).to.equal("write-read");
    expect(graph.edges[0].evidenceIds).to.have.length.greaterThan(1);
  });

  it("checks the five scenario contracts against known read/write storage patterns", async function () {
    const signers = await ethers.getSigners();
    const contract = await (await ethers.getContractFactory("ProfileWorkloads")).deploy();
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    const invokeAndTrace = async (method: string, args: bigint[], account = 0) => {
      const tx = await contract.connect(signers[account]).getFunction(method)(...args);
      const receipt = await tx.wait();
      expect(receipt).not.to.equal(null);
      const rawTrace: unknown = await network.provider.send("debug_traceTransaction", [receipt!.hash]);
      return parseTraceAccess(rawTrace, contractAddress);
    };

    const independentA = await invokeAndTrace("writeIndependent", [0n, 1n], 0);
    const independentB = await invokeAndTrace("writeIndependent", [1n, 2n], 1);
    const independentSlotsA = independentA.accesses
      .filter(access => access.operation === "write")
      .map(access => access.slot);
    const independentSlotsB = independentB.accesses
      .filter(access => access.operation === "write")
      .map(access => access.slot);
    expect(independentSlotsA.some(value => independentSlotsB.includes(value))).to.equal(false);

    const sharedA = await invokeAndTrace("writeSharedCounter", [1n], 0);
    const sharedB = await invokeAndTrace("writeSharedCounter", [1n], 1);
    const sharedWritesA = sharedA.accesses.filter(access => access.operation === "write").map(access => access.slot);
    const sharedWritesB = sharedB.accesses.filter(access => access.operation === "write").map(access => access.slot);
    expect(sharedWritesA.some(value => sharedWritesB.includes(value))).to.equal(true);

    const sameKeyA = await invokeAndTrace("writeSameKey", [1n], 0);
    const sameKeyB = await invokeAndTrace("writeSameKey", [2n], 1);
    const sameWritesA = sameKeyA.accesses.filter(access => access.operation === "write").map(access => access.slot);
    const sameWritesB = sameKeyB.accesses.filter(access => access.operation === "write").map(access => access.slot);
    expect(sameWritesA.some(value => sameWritesB.includes(value))).to.equal(true);

    const mixed = await invokeAndTrace("mixedReadWrite", [0n, 1n]);
    expect(mixed.accesses.some(access => access.operation === "read")).to.equal(true);
    expect(mixed.accesses.some(access => access.operation === "write")).to.equal(true);

    const readHeavy = await invokeAndTrace("readHeavy", [0n]);
    expect(readHeavy.accesses.some(access => access.operation === "read")).to.equal(true);
    expect(readHeavy.accesses.some(access => access.operation === "write")).to.equal(false);
  });

  it("proves generated-input equivalence before comparing a distinct revision", async function () {
    const signers = await ethers.getSigners();
    const generated = generateWorkloads(3, 2);
    const baselineCalls: ReturnType<typeof createProfileReport>["calls"] = [];
    const revisionCalls: ReturnType<typeof createProfileReport>["calls"] = [];
    let firstBaselineAddress = "";
    let firstRevisionAddress = "";

    for (const scenario of generated) {
      const baseline = await ethers.deployContract("ProfileWorkloads");
      const revision = await ethers.deployContract("ProfileWorkloadsRevision");
      await baseline.waitForDeployment();
      await revision.waitForDeployment();
      const baselineAddress = await baseline.getAddress();
      const revisionAddress = await revision.getAddress();
      firstBaselineAddress ||= baselineAddress;
      firstRevisionAddress ||= revisionAddress;

      for (const step of scenario.steps) {
        const baselineTx = await dynamicTarget(baseline, signers[step.accountIndex]).getFunction(step.method)(
          ...step.args,
        );
        const baselineReceipt = await baselineTx.wait();
        const revisionTx = await dynamicTarget(revision, signers[step.accountIndex]).getFunction(step.method)(
          ...step.args,
        );
        const revisionReceipt = await revisionTx.wait();
        expect(baselineReceipt?.status).to.equal(1);
        expect(revisionReceipt?.status).to.equal(1);

        const baselineRaw: unknown = await network.provider.send("debug_traceTransaction", [baselineReceipt!.hash]);
        const revisionRaw: unknown = await network.provider.send("debug_traceTransaction", [revisionReceipt!.hash]);
        const baselineTrace = parseTraceAccess(baselineRaw, baselineAddress);
        const revisionTrace = parseTraceAccess(revisionRaw, revisionAddress);
        expect(baselineTrace.complete).to.equal(true);
        expect(revisionTrace.complete).to.equal(true);
        expect(
          revisionTrace.accesses.map(({ operation, opcode, slot }) => ({ operation, opcode, slot })),
        ).to.deep.equal(baselineTrace.accesses.map(({ operation, opcode, slot }) => ({ operation, opcode, slot })));

        const baselineLogs = baselineReceipt!.logs.map((log: Log) => ({ topics: log.topics, data: log.data }));
        const revisionLogs = revisionReceipt!.logs.map((log: Log) => ({ topics: log.topics, data: log.data }));
        expect(revisionLogs).to.deep.equal(baselineLogs);

        const observedSlots = [...new Set(baselineTrace.accesses.map(access => access.slot))];
        for (const observedSlot of observedSlots) {
          const baselineValue = await ethers.provider.getStorage(baselineAddress, BigInt(observedSlot));
          const revisionValue = await ethers.provider.getStorage(revisionAddress, BigInt(observedSlot));
          expect(revisionValue, `${scenario.id} storage slot ${observedSlot}`).to.equal(baselineValue);
        }

        const contractInterface = baseline.interface as unknown as Interface;
        const input = contractInterface.encodeFunctionData(step.method, step.args);
        baselineCalls.push({
          workloadCaseId: step.workloadCaseId,
          input,
          transactionHash: baselineReceipt!.hash,
          status: "success",
          gasUsed: baselineReceipt!.gasUsed.toString(),
          trace: baselineTrace,
        });
        revisionCalls.push({
          workloadCaseId: step.workloadCaseId,
          input,
          transactionHash: revisionReceipt!.hash,
          status: "success",
          gasUsed: revisionReceipt!.gasUsed.toString(),
          trace: revisionTrace,
        });
      }
    }

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const workload = {
      id: "mprofiler-bounded-equivalence-v1",
      scenarios: [...SCENARIO_IDS],
      batchSize: 3,
      controlledAccountCount: 2,
    };
    const baselineReport = createProfileReport({
      chainId,
      compilerVersion: "0.8.20",
      contractAddress: firstBaselineAddress,
      contractName: "ProfileWorkloads",
      calls: baselineCalls,
      network: "hardhat",
      workload,
    });
    const revisionReport = createProfileReport({
      chainId,
      compilerVersion: "0.8.20",
      contractAddress: firstRevisionAddress,
      contractName: "ProfileWorkloadsRevision",
      calls: revisionCalls,
      network: "hardhat",
      workload,
    });
    const comparison = compareProfileReports(baselineReport, revisionReport, {
      baseline: "ProfileWorkloads",
      revision: "ProfileWorkloadsRevision",
    });

    expect(comparison.workloadIdentical).to.equal(true);
    expect(comparison.scenarios.map(scenario => scenario.scenarioId)).to.deep.equal(SCENARIO_IDS);
    expect(
      comparison.scenarios.every(scenario => scenario.baselineCallCount === 3 && scenario.revisionCallCount === 3),
    ).to.equal(true);
    for (const scenario of comparison.scenarios) {
      expect(scenario.revisionReadAccesses, `${scenario.scenarioId} read-access count`).to.equal(
        scenario.baselineReadAccesses,
      );
      expect(scenario.revisionWriteAccesses, `${scenario.scenarioId} write-access count`).to.equal(
        scenario.baselineWriteAccesses,
      );
      expect(scenario.revisionDependencyEdges, `${scenario.scenarioId} dependency-edge count`).to.equal(
        scenario.baselineDependencyEdges,
      );
    }
  });

  it("creates evidence-linked write/read edges, waves, and independent hot counts", function () {
    const firstWrite = access("write", 1);
    const laterRead = access("read", 1);
    const laterWrite = access("write", 1);
    const unrelated = access("write", 2);
    const graph = buildProfileGraph([call(0, [firstWrite]), call(1, [laterRead, laterWrite]), call(2, [unrelated])]);

    expect(graph.edges).to.have.length(1);
    expect(graph.edges[0].kind).to.equal("mixed");
    expect(graph.edges[0].sharedSlots).to.deep.equal([{ contractAddress: address, slot: slot(1) }]);
    expect(graph.edges[0].evidenceIds).to.deep.equal(["access-0-0", "access-1-0", "access-1-1"]);
    expect(graph.nodes.map(node => node.wave)).to.deep.equal([0, 1, 0]);
    expect(graph.executionDepth).to.equal(2);
    expect(graph.hotSlots).to.deep.equal([
      {
        scenarioId: "fixture",
        contractAddress: address,
        slot: slot(1),
        touches: 3,
        callCount: 2,
        dependencyEdgeCount: 1,
      },
    ]);
  });

  it("does not create an edge for distinct storage slots", function () {
    const graph = buildProfileGraph([call(0, [access("write", 10)]), call(1, [access("read", 11)])]);
    expect(graph.edges).to.deep.equal([]);
    expect(graph.executionDepth).to.equal(1);
  });

  it("marks nested-call traces partial instead of assuming a storage context", function () {
    const parsed = parseTraceAccess(
      {
        structLogs: [
          { op: "SLOAD", pc: 1, depth: 1, stack: [slot(1)] },
          { op: "DELEGATECALL", pc: 2, depth: 1, stack: [] },
        ],
      },
      address,
    );
    expect(parsed.complete).to.equal(false);
    expect(parsed.warnings.some(warning => warning.includes("storage context is not resolved"))).to.equal(true);
  });

  it("rejects malformed reports and graph edges with unknown evidence IDs", function () {
    expect(() =>
      validateProfileReport({
        schemaVersion: "1.0.0",
        traceCoverage: "complete",
        metricProvenance: { localMeasurements: [], derivedGraphProperties: [], monadSpecificEstimates: "None" },
        dependencyGraph: { nodes: [], edges: [], evidence: [], hotSlots: [] },
        calls: [{}],
      }),
    ).to.throw("malformed call trace");
    expect(() =>
      validateProfileReport({
        schemaVersion: "1.0.0",
        traceCoverage: "complete",
        metricProvenance: { localMeasurements: [], derivedGraphProperties: [], monadSpecificEstimates: "None" },
        dependencyGraph: {
          nodes: [],
          edges: [{ evidenceIds: ["missing-evidence"], sharedSlots: [] }],
          evidence: [],
          hotSlots: [],
        },
        calls: [],
      }),
    ).to.throw("invalid evidence");
  });

  it("generates five deterministic scenarios with bounded batches and controlled callers", function () {
    const first = generateWorkloads(7, 3);
    const second = generateWorkloads(7, 3);
    expect(first.map(scenario => scenario.id)).to.deep.equal(SCENARIO_IDS);
    expect(first).to.deep.equal(second);
    expect(first.every(scenario => scenario.steps.length === 7)).to.equal(true);
    expect(first.every(scenario => scenario.steps.every(step => step.accountIndex < 3))).to.equal(true);
    expect(new Set(first[0].steps.map(step => step.args[0].toString())).size).to.equal(7);
    expect(new Set(first[2].steps.map(step => step.method)).size).to.equal(1);
    expect(() => generateWorkloads(101, 3)).to.throw("batchSize");
  });

  it("compares baseline and revision only when generated call inputs match", function () {
    const trace: TraceAccessReport = {
      reverted: false,
      complete: true,
      accesses: [access("write", 1)],
      committedWriteSlots: [slot(1)],
      warnings: [],
    };
    const baseCalls = [0, 1].map(index => ({
      workloadCaseId: `shared-global-counter-writes:${index}`,
      input: JSON.stringify({ method: "writeSharedCounter", args: ["1"], accountIndex: index }),
      transactionHash: `0x${index}`,
      status: "success" as const,
      gasUsed: "100",
      trace,
    }));
    const workload = {
      id: "mprofiler-scenarios-v1",
      scenarios: ["shared-global-counter-writes"] as ["shared-global-counter-writes"],
      batchSize: 2,
      controlledAccountCount: 2,
    };
    const base = createProfileReport({
      chainId: 31337n,
      compilerVersion: "0.8.20",
      contractAddress: address,
      calls: baseCalls,
      network: "anvil",
      workload,
    });
    const revision = createProfileReport({
      chainId: 31337n,
      compilerVersion: "0.8.20",
      contractAddress: address,
      calls: baseCalls.map(call => ({ ...call, gasUsed: "90" })),
      network: "anvil",
      workload,
    });
    const comparison = compareProfileReports(base, revision, { baseline: "base-1", revision: "rev-1" });
    expect(comparison.workloadIdentical).to.equal(true);
    expect(comparison.totalGasUsed.deltaRevisionMinusBaseline).to.equal("-20");
    expect(comparison.scenarios[0].baselineCallCount).to.equal(2);
    const changedInput = createProfileReport({
      chainId: 31337n,
      compilerVersion: "0.8.20",
      contractAddress: address,
      calls: baseCalls.map((call, index) => (index === 0 ? { ...call, input: "different input" } : call)),
      network: "anvil",
      workload,
    });
    expect(() => compareProfileReports(base, changedInput)).to.throw("workload scenarios");
  });
});
