// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @notice Immutable, public anchors for MProfiler evidence reports.
/// @dev The report remains off-chain; this contract only stores its Keccak-256 hash,
/// publisher, timestamp, and an optional retrieval URI.
contract MProfilerAttestation {
    struct Attestation {
        address publisher;
        uint64 publishedAt;
        string reportUri;
    }

    mapping(bytes32 reportHash => Attestation) private attestations;

    event ProfileAttested(bytes32 indexed reportHash, address indexed publisher, string reportUri);

    function attest(bytes32 reportHash, string calldata reportUri) external {
        require(reportHash != bytes32(0), "MProfilerAttestation: empty hash");
        require(attestations[reportHash].publisher == address(0), "MProfilerAttestation: already attested");
        require(bytes(reportUri).length <= 512, "MProfilerAttestation: URI too long");

        attestations[reportHash] = Attestation({publisher: msg.sender, publishedAt: uint64(block.timestamp), reportUri: reportUri});
        emit ProfileAttested(reportHash, msg.sender, reportUri);
    }

    function getAttestation(bytes32 reportHash) external view returns (Attestation memory) {
        return attestations[reportHash];
    }
}
