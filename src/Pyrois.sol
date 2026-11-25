// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Pyrois (PYRO)
/// @notice Deflationary ERC-20 token on Base with an automatic 1-hour rolling heat-based sell burn.
/// @dev Zero buy tax, zero wallet-to-wallet transfer tax, no minting after genesis, and a permanent
///      10% supply floor (100,000,000 PYRO). Only `setAmmPair` is owner-gated and locks permanently
///      once `renounceOwnership()` is called.
contract Pyrois is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10 ** 18;
    uint256 public constant MIN_SUPPLY = 100_000_000 * 10 ** 18;
    uint256 public constant EPOCH_DURATION = 1 hours;
    uint256 public constant MIN_BURN_BPS = 50; // 0.50%
    uint256 public constant MAX_BURN_BPS = 500; // 5.00%
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant LOW_HEAT_VOLUME = 1_000_000 * 10 ** 18; // 0.1% of initial supply
    uint256 public constant HIGH_HEAT_VOLUME = 10_000_000 * 10 ** 18; // 1.0% of initial supply

    mapping(address => bool) public isAmmPair;
    uint256 public currentEpoch;
    uint256 public epochSellVolume;

    event AmmPairUpdated(address indexed pair, bool enabled);
    event HeatBurn(
        address indexed seller,
        uint256 burnAmount,
        uint256 burnBps,
        uint256 epochSellVolume
    );

    error ZeroAddress();

    constructor() ERC20("Pyrois", "PYRO") Ownable(msg.sender) {
        currentEpoch = block.timestamp / EPOCH_DURATION;
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /// @notice Registers or unregisters an AMM liquidity pool pair address.
    /// @param pair The AMM pair contract address.
    /// @param enabled True to mark the address as an AMM pair, false to unmark.
    function setAmmPair(address pair, bool enabled) external onlyOwner {
        if (pair == address(0)) revert ZeroAddress();
        isAmmPair[pair] = enabled;
        emit AmmPairUpdated(pair, enabled);
    }

    /// @notice Returns the live heat parameters, automatically accounting for epoch rollovers.
    function getHeatState()
        external
        view
        returns (
            uint256 activeBurnBps,
            uint256 activeEpochVolume,
            uint256 secondsToCooldown,
            uint256 totalBurned,
            uint256 burnableLeft
        )
    {
        uint256 epoch = block.timestamp / EPOCH_DURATION;
        activeEpochVolume = epoch > currentEpoch ? 0 : epochSellVolume;

        uint256 supply = totalSupply();
        activeBurnBps = _calculateBurnBps(supply, activeEpochVolume);
        secondsToCooldown = EPOCH_DURATION - (block.timestamp % EPOCH_DURATION);
        totalBurned = INITIAL_SUPPLY - supply;
        burnableLeft = supply > MIN_SUPPLY ? supply - MIN_SUPPLY : 0;
    }

    /// @dev Enforces 0% tax on buys, wallet transfers, mints, burns, and owner LP seeding,
    ///      and applies the dynamic 0.50%-5.00% rolling 1-hour burn on AMM sells.
    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || from == owner()) {
            super._update(from, to, value);
            return;
        }

        if (isAmmPair[to] && !isAmmPair[from]) {
            uint256 epoch = block.timestamp / EPOCH_DURATION;
            if (epoch > currentEpoch) {
                currentEpoch = epoch;
                epochSellVolume = 0;
            }

            uint256 newEpochVolume = epochSellVolume + value;
            epochSellVolume = newEpochVolume;

            uint256 supply = totalSupply();
            uint256 burnBps = _calculateBurnBps(supply, newEpochVolume);

            if (burnBps > 0 && value > 0) {
                uint256 burnable = supply - MIN_SUPPLY;
                uint256 burnAmount = (value * burnBps) / BPS_DENOMINATOR;
                if (burnAmount > burnable) {
                    burnAmount = burnable;
                }

                if (burnAmount > 0) {
                    super._update(from, address(0), burnAmount);
                    super._update(from, to, value - burnAmount);
                    emit HeatBurn(from, burnAmount, burnBps, newEpochVolume);
                    return;
                }
            }
        }

        super._update(from, to, value);
    }

    function _calculateBurnBps(
        uint256 supply,
        uint256 sellVolume
    ) internal pure returns (uint256) {
        if (supply <= MIN_SUPPLY) {
            return 0;
        }
        if (sellVolume <= LOW_HEAT_VOLUME) {
            return MIN_BURN_BPS;
        }
        if (sellVolume >= HIGH_HEAT_VOLUME) {
            return MAX_BURN_BPS;
        }
        return
            MIN_BURN_BPS +
            ((MAX_BURN_BPS - MIN_BURN_BPS) * (sellVolume - LOW_HEAT_VOLUME)) /
            (HIGH_HEAT_VOLUME - LOW_HEAT_VOLUME);
    }
}
