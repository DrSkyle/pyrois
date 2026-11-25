// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Pyrois} from "../src/Pyrois.sol";

contract DeployPyrois is Script {
    function run() external returns (Pyrois token) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        token = new Pyrois();
        vm.stopBroadcast();

        console2.log("Pyrois deployed at:", address(token));
        console2.log("Owner / Deployer:", token.owner());
        console2.log("Initial Supply:", token.totalSupply());
    }
}
