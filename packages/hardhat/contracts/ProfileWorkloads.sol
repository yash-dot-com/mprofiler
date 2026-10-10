// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @dev Fixed scenario target used only by MProfiler's deterministic local workloads.
contract ProfileWorkloads {
    mapping(uint256 => uint256) private independentValues;
    uint256 private globalCounter;
    mapping(bytes32 => uint256) private keyedValues;
    bytes32 private constant SHARED_KEY = keccak256("mprofiler-shared-key-v1");

    event ReadObserved(uint256 indexed key, uint256 value);

    function writeIndependent(uint256 key, uint256 value) external {
        independentValues[key] = value;
    }

    function writeSharedCounter(uint256 amount) external {
        globalCounter += amount;
    }

    function writeSameKey(uint256 value) external {
        keyedValues[SHARED_KEY] = value;
    }

    function mixedReadWrite(uint256 key, uint256 amount) external {
        bytes32 slot = bytes32(key);
        uint256 current = keyedValues[slot];
        keyedValues[slot] = current + amount;
        globalCounter += current;
    }

    function readHeavy(uint256 key) external returns (uint256 value) {
        value = keyedValues[bytes32(key)];
        emit ReadObserved(key, value);
    }
}
