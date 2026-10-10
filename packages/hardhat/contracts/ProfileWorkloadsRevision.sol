// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @dev Local comparison fixture. The unchecked arithmetic is equivalent for
/// MProfiler's generated inputs, whose counters and values stay far below uint256 overflow.
contract ProfileWorkloadsRevision {
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
        unchecked {
            keyedValues[slot] = current + amount;
            globalCounter += current;
        }
    }

    function readHeavy(uint256 key) external returns (uint256 value) {
        value = keyedValues[bytes32(key)];
        emit ReadObserved(key, value);
    }
}
