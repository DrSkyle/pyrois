// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Pyrois} from "../src/Pyrois.sol";

contract RenouncePyrois is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddress = vm.envAddress("PYROIS_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        Pyrois(tokenAddress).renounceOwnership();
        vm.stopBroadcast();

        console2.log("Pyrois:", tokenAddress);
        console2.log("New owner (should be zero address):", Pyrois(tokenAddress).owner());
    }
}
