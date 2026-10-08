// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice One-time binding: deployment owner cannot later redirect issuance/revenue.
abstract contract MarketplaceBound is Ownable {
    address public marketplace;
    error InvalidMarketplace();
    error MarketplaceAlreadySet();
    error OnlyMarketplace();
    event MarketplaceConfigured(address indexed marketplace);
    constructor(address owner) Ownable(owner) {}
    function setMarketplace(address account) external onlyOwner {
        if (marketplace != address(0)) revert MarketplaceAlreadySet();
        if (account.code.length == 0) revert InvalidMarketplace();
        marketplace = account;
        emit MarketplaceConfigured(account);
    }
    modifier onlyMarketplace() {
        if (msg.sender != marketplace) revert OnlyMarketplace();
        _;
    }
}
