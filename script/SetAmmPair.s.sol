// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Pyrois} from "../src/Pyrois.sol";

contract SetAmmPair is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddress = vm.envAddress("PYROIS_ADDRESS");
        address pairAddress = vm.envAddress("AMM_PAIR_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        Pyrois(tokenAddress).setAmmPair(pairAddress, true);
        vm.stopBroadcast();

        console2.log("Pyrois:", tokenAddress);
        console2.log("Registered AMM pair:", pairAddress);
        console2.log("isAmmPair:", Pyrois(tokenAddress).isAmmPair(pairAddress));
    }
}
