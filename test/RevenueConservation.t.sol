// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {TrackRegistry} from "../contracts/TrackRegistry.sol";
import {LicenseNFT} from "../contracts/LicenseNFT.sol";
import {RevenueSplitter} from "../contracts/RevenueSplitter.sol";
import {LicenseMarketplace} from "../contracts/LicenseMarketplace.sol";

/// @notice Fuzz real signed registration and purchase: every wei becomes withdrawable credit.
contract RevenueConservationTest is Test {
    function testFuzz_RevenueConservation(uint96 rawPrice, uint8 rawShare) public {
        uint256 verifierKey = 12345;
        address creatorA = address(0xAA01);
        address creatorB = address(0xBB02);
        address buyer = address(0xCC03);
        uint256 price = uint256(rawPrice) + 1;
        uint256 share = uint256(rawShare) % 99 + 1;
        TrackRegistry registry = new TrackRegistry(vm.addr(verifierKey));
        LicenseNFT nft = new LicenseNFT(registry, address(this));
        RevenueSplitter splitter = new RevenueSplitter(registry, address(this));
        LicenseMarketplace market = new LicenseMarketplace(registry, nft, splitter, address(this));
        nft.setMarketplace(address(market));
        splitter.setMarketplace(address(market));
        address[] memory creators = new address[](2);
        creators[0] = creatorA; creators[1] = creatorB;
        uint256[] memory shares = new uint256[](2);
        shares[0] = share; shares[1] = 100 - share;
        TrackRegistry.Registration memory r = TrackRegistry.Registration({
            audioHash: keccak256("audio"), metadataCID: "bafy", contributors: creators,
            shares: shares, similarityScore: 7999, modelVersion: "v1", nonce: 0, deadline: block.timestamp + 100
        });
        bytes32 domain = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("TrackAI_Registry"), keccak256("1"), block.chainid, address(registry)
        ));
        bytes32 structHash = keccak256(abi.encode(
            registry.REGISTER_TRACK_TYPEHASH(), r.audioHash, keccak256(bytes(r.metadataCID)), creatorA,
            keccak256(abi.encode(creators, shares)), r.similarityScore, keccak256(bytes(r.modelVersion)), r.nonce, r.deadline
        ));
        (uint8 v, bytes32 sigR, bytes32 sigS) = vm.sign(verifierKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        vm.prank(creatorA);
        uint256 id = registry.registerTrack(r, abi.encodePacked(sigR, sigS, v));
        vm.prank(creatorA);
        market.setLicensePrice(id, price);
        vm.deal(buyer, price);
        vm.prank(buyer);
        market.purchaseLicense{value: price}(id);
        uint256 amountA = price * share / 100;
        assertEq(splitter.getPendingRevenue(creatorA), amountA);
        assertEq(splitter.getPendingRevenue(creatorB), price - amountA);
        assertEq(splitter.totalPendingRevenue(), price);
        assertEq(address(splitter).balance, price);
        assertEq(nft.balanceOf(buyer, id), 1);
        if (amountA > 0) {
            vm.prank(creatorA);
            splitter.withdrawRevenue();
        }
        vm.prank(creatorB);
        splitter.withdrawRevenue();
        assertEq(address(splitter).balance, 0);
        assertEq(splitter.totalPendingRevenue(), 0);
        assertEq(creatorA.balance + creatorB.balance, price);
    }
}
