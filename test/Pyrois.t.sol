// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pyrois} from "../src/Pyrois.sol";

contract PyroisTest is Test {
    Pyrois internal pyro;

    address internal deployer = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal ammPair = makeAddr("ammPair");

    uint256 internal constant INITIAL_SUPPLY = 1_000_000_000 * 10 ** 18;
    uint256 internal constant MIN_SUPPLY = 100_000_000 * 10 ** 18;
    uint256 internal constant LOW_HEAT = 1_000_000 * 10 ** 18;
    uint256 internal constant HIGH_HEAT = 10_000_000 * 10 ** 18;

    function setUp() public {
        vm.warp(1_700_000_400); // Clean timestamp aligned mid-hour
        pyro = new Pyrois();
        pyro.setAmmPair(ammPair, true);
    }

    function test_InitialMintAndConstants() public view {
        assertEq(pyro.name(), "Pyrois");
        assertEq(pyro.symbol(), "PYRO");
        assertEq(pyro.decimals(), 18);
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY);
        assertEq(pyro.balanceOf(deployer), INITIAL_SUPPLY);
        assertEq(pyro.owner(), deployer);
        assertEq(pyro.INITIAL_SUPPLY(), INITIAL_SUPPLY);
        assertEq(pyro.MIN_SUPPLY(), MIN_SUPPLY);
        assertEq(pyro.EPOCH_DURATION(), 1 hours);
        assertEq(pyro.MIN_BURN_BPS(), 50);
        assertEq(pyro.MAX_BURN_BPS(), 500);
        assertEq(pyro.BPS_DENOMINATOR(), 10_000);
        assertEq(pyro.LOW_HEAT_VOLUME(), LOW_HEAT);
        assertEq(pyro.HIGH_HEAT_VOLUME(), HIGH_HEAT);
        assertTrue(pyro.isAmmPair(ammPair));
    }

    function test_DeployerInitialLpSeedIsTaxFree() public {
        uint256 seedAmount = 500_000_000 * 10 ** 18;
        bool ok = pyro.transfer(ammPair, seedAmount);
        assertTrue(ok);
        assertEq(pyro.balanceOf(ammPair), seedAmount);
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY);
        assertEq(pyro.epochSellVolume(), 0);
    }

    function test_BuyAndWalletTransfersAreTaxFree() public {
        uint256 seedAmount = 100_000_000 * 10 ** 18;
        assertTrue(pyro.transfer(ammPair, seedAmount));

        // Buy from AMM -> 0% tax
        uint256 buyAmount = 5_000_000 * 10 ** 18;
        vm.prank(ammPair);
        assertTrue(pyro.transfer(alice, buyAmount));
        assertEq(pyro.balanceOf(alice), buyAmount);
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY);
        assertEq(pyro.epochSellVolume(), 0);

        // Wallet-to-wallet transfer -> 0% tax
        uint256 transferAmount = 2_000_000 * 10 ** 18;
        vm.prank(alice);
        assertTrue(pyro.transfer(bob, transferAmount));
        assertEq(pyro.balanceOf(bob), transferAmount);
        assertEq(pyro.balanceOf(alice), buyAmount - transferAmount);
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY);
    }

    function test_CalmSellBurnsMinRate() public {
        uint256 sellAmount = 500_000 * 10 ** 18; // Below 1M LOW_HEAT_VOLUME
        assertTrue(pyro.transfer(alice, sellAmount));

        uint256 expectedBurn = (sellAmount * 50) / 10_000;

        vm.expectEmit(true, false, false, true);
        emit Pyrois.HeatBurn(alice, expectedBurn, 50, sellAmount);

        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, sellAmount));

        assertEq(pyro.balanceOf(ammPair), sellAmount - expectedBurn);
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY - expectedBurn);
        assertEq(pyro.epochSellVolume(), sellAmount);
    }

    function test_LinearScalingFrom1MTo10MAndCapAt5Percent() public {
        assertTrue(pyro.transfer(alice, 20_000_000 * 10 ** 18));

        // 1. First sell: 1M PYRO -> exactly at LOW_HEAT_VOLUME -> 50 bps (0.50%)
        uint256 sell1 = 1_000_000 * 10 ** 18;
        uint256 burn1 = (sell1 * 50) / 10_000;
        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, sell1));
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY - burn1);
        assertEq(pyro.epochSellVolume(), 1_000_000 * 10 ** 18);

        // 2. Second sell: 4.5M PYRO -> cumulative 5.5M (exact midpoint between 1M and 10M) -> 275 bps (2.75%)
        uint256 sell2 = 4_500_000 * 10 ** 18;
        uint256 expectedBps2 = 275;
        uint256 burn2 = (sell2 * expectedBps2) / 10_000;
        vm.expectEmit(true, false, false, true);
        emit Pyrois.HeatBurn(alice, burn2, expectedBps2, 5_500_000 * 10 ** 18);
        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, sell2));
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY - burn1 - burn2);

        // 3. Third sell: 4.5M PYRO -> cumulative 10M (HIGH_HEAT_VOLUME) -> 500 bps (5.00%)
        uint256 sell3 = 4_500_000 * 10 ** 18;
        uint256 burn3 = (sell3 * 500) / 10_000;
        vm.expectEmit(true, false, false, true);
        emit Pyrois.HeatBurn(alice, burn3, 500, 10_000_000 * 10 ** 18);
        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, sell3));
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY - burn1 - burn2 - burn3);

        // 4. Fourth sell: 2M PYRO -> cumulative 12M (above HIGH_HEAT_VOLUME) -> capped at 500 bps (5.00%)
        uint256 sell4 = 2_000_000 * 10 ** 18;
        uint256 burn4 = (sell4 * 500) / 10_000;
        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, sell4));
        assertEq(pyro.totalSupply(), INITIAL_SUPPLY - burn1 - burn2 - burn3 - burn4);
    }

    function test_AutomaticCooldownAfterOneHour() public {
        assertTrue(pyro.transfer(alice, 15_000_000 * 10 ** 18));

        // Drive heat to max (500 bps)
        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, 10_000_000 * 10 ** 18));

        (uint256 bpsHot, uint256 volHot, , , ) = pyro.getHeatState();
        assertEq(bpsHot, 500);
        assertEq(volHot, 10_000_000 * 10 ** 18);

        // Warp 1 hour forward -> getHeatState() immediately reflects cooldown without any tx
        vm.warp(block.timestamp + 1 hours);

        (
            uint256 bpsCool,
            uint256 volCool,
            uint256 secsLeft,
            uint256 totalBurned,
            uint256 burnableLeft
        ) = pyro.getHeatState();
        assertEq(bpsCool, 50);
        assertEq(volCool, 0);
        assertGt(secsLeft, 0);
        assertLe(secsLeft, 1 hours);
        assertEq(totalBurned, 500_000 * 10 ** 18);
        assertEq(burnableLeft, INITIAL_SUPPLY - MIN_SUPPLY - totalBurned);

        // Next small sell in new epoch burns at 0.50%
        uint256 smallSell = 100_000 * 10 ** 18;
        uint256 expectedBurn = (smallSell * 50) / 10_000;
        uint256 supplyBefore = pyro.totalSupply();

        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, smallSell));
        assertEq(pyro.totalSupply(), supplyBefore - expectedBurn);
        assertEq(pyro.epochSellVolume(), smallSell);
    }

    function test_SupplyFloorClampingAt100M() public {
        // Give alice almost all tokens so we can repeatedly sell and burn down to the floor
        assertTrue(pyro.transfer(alice, INITIAL_SUPPLY));

        // Repeatedly sell to AMM and buy back to burn down near the 100M floor
        while (pyro.totalSupply() > MIN_SUPPLY + 5_000_000 * 10 ** 18) {
            uint256 bal = pyro.balanceOf(alice);
            vm.prank(alice);
            assertTrue(pyro.transfer(ammPair, bal));

            uint256 pairBal = pyro.balanceOf(ammPair);
            vm.prank(ammPair);
            assertTrue(pyro.transfer(alice, pairBal));
        }

        // Now totalSupply is within 5M of MIN_SUPPLY. Selling 100M at 5% wants to burn 5M,
        // which should clamp strictly to totalSupply() - MIN_SUPPLY.
        uint256 remainingBurnable = pyro.totalSupply() - MIN_SUPPLY;
        assertGt(remainingBurnable, 0);
        assertLe(remainingBurnable, 5_000_000 * 10 ** 18);

        uint256 sellBal = pyro.balanceOf(alice);
        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, sellBal));

        assertEq(pyro.totalSupply(), MIN_SUPPLY);
        assertEq(pyro.balanceOf(ammPair), sellBal - remainingBurnable);

        // Verify getHeatState() reports 0 bps and 0 burnableLeft at floor
        (uint256 activeBps, , , uint256 totalBurned, uint256 burnableLeft) = pyro.getHeatState();
        assertEq(activeBps, 0);
        assertEq(totalBurned, INITIAL_SUPPLY - MIN_SUPPLY);
        assertEq(burnableLeft, 0);

        // Further sells incur 0 burn and never breach MIN_SUPPLY
        vm.prank(ammPair);
        assertTrue(pyro.transfer(alice, 10_000_000 * 10 ** 18));
        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, 10_000_000 * 10 ** 18));
        assertEq(pyro.totalSupply(), MIN_SUPPLY);
    }

    function test_SetAmmPairZeroAddressRevertsAndRenounceLocksAdmin() public {
        vm.expectRevert(Pyrois.ZeroAddress.selector);
        pyro.setAmmPair(address(0), true);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pyro.setAmmPair(bob, true);

        pyro.renounceOwnership();
        assertEq(pyro.owner(), address(0));

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer));
        pyro.setAmmPair(bob, true);
    }

    function testFuzz_SellBurnBoundsAndSupplyInvariant(uint256 sellAmount, uint256 warpDelta) public {
        sellAmount = bound(sellAmount, 1, 50_000_000 * 10 ** 18);
        warpDelta = bound(warpDelta, 0, 3 hours);

        assertTrue(pyro.transfer(alice, sellAmount));
        vm.warp(block.timestamp + warpDelta);

        uint256 supplyBefore = pyro.totalSupply();
        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, sellAmount));

        uint256 burned = supplyBefore - pyro.totalSupply();
        uint256 minBurn = (sellAmount * 50) / 10_000;
        uint256 maxBurn = (sellAmount * 500) / 10_000;

        assertGe(burned, minBurn);
        assertLe(burned, maxBurn);
        assertGe(pyro.totalSupply(), MIN_SUPPLY);
        assertLe(pyro.totalSupply(), INITIAL_SUPPLY);
        assertEq(pyro.balanceOf(ammPair) + burned, sellAmount);
    }

    function testFuzz_MultiSellLinearBurnCurve(uint256 firstSell, uint256 secondSell) public {
        firstSell = bound(firstSell, 1e18, 12_000_000 * 10 ** 18);
        secondSell = bound(secondSell, 1e18, 12_000_000 * 10 ** 18);

        assertTrue(pyro.transfer(alice, firstSell + secondSell));

        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, firstSell));

        uint256 supplyBeforeSecond = pyro.totalSupply();
        uint256 cumulativeVol = firstSell + secondSell;
        uint256 expectedBps;
        if (cumulativeVol <= LOW_HEAT) {
            expectedBps = 50;
        } else if (cumulativeVol >= HIGH_HEAT) {
            expectedBps = 500;
        } else {
            expectedBps = 50 + ((450 * (cumulativeVol - LOW_HEAT)) / (HIGH_HEAT - LOW_HEAT));
        }

        vm.prank(alice);
        assertTrue(pyro.transfer(ammPair, secondSell));

        uint256 actualBurn = supplyBeforeSecond - pyro.totalSupply();
        assertEq(actualBurn, (secondSell * expectedBps) / 10_000);
        assertGe(pyro.totalSupply(), MIN_SUPPLY);
    }
}
