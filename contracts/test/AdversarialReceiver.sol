// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {LicenseMarketplace} from "../LicenseMarketplace.sol";
import {RevenueSplitter} from "../RevenueSplitter.sol";

/// @dev Real recipient contract used to exercise external callbacks, never deployed by deploy.ts.
contract AdversarialReceiver is ERC1155Holder {
    LicenseMarketplace public market;
    RevenueSplitter public splitter;
    uint256 public trackId;
    bool public rejectNFT;
    bool public rejectEther;
    bool public attackPurchase;
    bool public attackWithdraw;
    bool public reentrySucceeded;
    bytes4 public reentryError;
    function configure(LicenseMarketplace m, RevenueSplitter s, uint256 id, bool rejectN, bool rejectE, bool buyAttack, bool withdrawAttack) external {
        market = m; splitter = s; trackId = id; rejectNFT = rejectN; rejectEther = rejectE;
        attackPurchase = buyAttack; attackWithdraw = withdrawAttack;
    }
    function buy() external payable { market.purchaseLicense{value: msg.value}(trackId); }
    function withdraw() external { splitter.withdrawRevenue(); }
    function attempt(address target, bytes memory payload, uint256 value) private {
        (bool ok, bytes memory result) = target.call{value: value}(payload);
        reentrySucceeded = ok;
        if (result.length >= 4) reentryError = bytes4(result);
    }
    function onERC1155Received(address, address, uint256, uint256, bytes memory) public override returns (bytes4) {
        require(!rejectNFT, "NFT rejected");
        if (attackPurchase) attempt(address(market), abi.encodeCall(market.purchaseLicense, (trackId)), market.getLicensePrice(trackId));
        return this.onERC1155Received.selector;
    }
    receive() external payable {
        require(!rejectEther, "Ether rejected");
        if (attackWithdraw) attempt(address(splitter), abi.encodeCall(splitter.withdrawRevenue, ()), 0);
    }
}
