// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MockERC1271Wallet is IERC1271 {
    bytes4 internal constant MAGICVALUE = 0x1626ba7e;

    address public owner;

    constructor(address initialOwner) {
        owner = initialOwner;
    }

    function setOwner(address newOwner) external {
        owner = newOwner;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == owner) {
            return MAGICVALUE;
        }
        return 0xffffffff;
    }
}
