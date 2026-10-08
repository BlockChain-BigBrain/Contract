// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TrackRegistry} from "./TrackRegistry.sol";
import {MarketplaceBound} from "./MarketplaceBound.sol";

contract RevenueSplitter is MarketplaceBound, ReentrancyGuard {
    TrackRegistry public immutable registry;
    mapping(address => uint256) private pendingRevenue;
    uint256 public totalPendingRevenue;
    error NoRevenue();
    error TransferFailed();
    error ZeroRevenue();
    event RevenueAllocated(uint256 indexed trackId, address indexed creator, uint256 amount, uint256 timestamp);
    event RevenueWithdrawn(address indexed creator, uint256 amount, uint256 timestamp);
    constructor(TrackRegistry registry_, address owner) MarketplaceBound(owner) { registry = registry_; }
    /// @dev Floor all allocations except the last; last signed contributor receives remainder.
    function recordRevenue(uint256 trackId) external payable onlyMarketplace {
        if (msg.value == 0) revert ZeroRevenue();
        (address[] memory creators, uint256[] memory shares) = registry.getContributors(trackId);
        uint256 allocated;
        for (uint256 i; i < creators.length; ++i) {
            uint256 amount = i == creators.length - 1 ? msg.value - allocated : Math.mulDiv(msg.value, shares[i], 100);
            allocated += amount;
            pendingRevenue[creators[i]] += amount;
            emit RevenueAllocated(trackId, creators[i], amount, block.timestamp);
        }
        totalPendingRevenue += msg.value;
    }
    function getPendingRevenue(address creator) external view returns (uint256) { return pendingRevenue[creator]; }
    function withdrawRevenue() external nonReentrant {
        uint256 amount = pendingRevenue[msg.sender];
        if (amount == 0) revert NoRevenue();
        pendingRevenue[msg.sender] = 0;
        totalPendingRevenue -= amount;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
        emit RevenueWithdrawn(msg.sender, amount, block.timestamp);
    }
}
