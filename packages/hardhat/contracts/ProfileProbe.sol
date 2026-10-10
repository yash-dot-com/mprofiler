// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @dev Minimal controlled fixture for validating local storage opcode traces.
contract ProfileProbe {
    uint256 public value;
    uint256 public observed;

    function writeValue(uint256 nextValue) external {
        value = nextValue;
    }

    function readThenWriteObserved() external {
        observed = value;
    }
}
