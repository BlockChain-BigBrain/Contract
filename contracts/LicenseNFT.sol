// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {TrackRegistry} from "./TrackRegistry.sol";
import {MarketplaceBound} from "./MarketplaceBound.sol";

contract LicenseNFT is ERC1155, MarketplaceBound {
    enum LicenseType { COMMERCIAL }
    TrackRegistry public immutable registry;
    mapping(address => uint256[]) private purchasedTrackIds;
    error NonTransferable();
    error AlreadyLicensed();
    error TrackNotLicensable();
    event LicenseMinted(uint256 indexed trackId, uint256 indexed tokenId, address indexed buyer, LicenseType licenseType, uint256 amount, uint256 timestamp);

    constructor(TrackRegistry registry_, address owner) ERC1155("") MarketplaceBound(owner) {
        registry = registry_;
    }
    /// @dev COMMERCIAL is the sole type: tokenId == trackId. One license per buyer/track.
    function getTokenId(uint256 trackId, LicenseType) public pure returns (uint256) { return trackId; }
    function mintLicense(address buyer, uint256 trackId) external onlyMarketplace {
        if (!registry.isTrackLicensable(trackId)) revert TrackNotLicensable();
        if (balanceOf(buyer, trackId) != 0) revert AlreadyLicensed();
        purchasedTrackIds[buyer].push(trackId);
        _mint(buyer, trackId, 1, "");
        emit LicenseMinted(trackId, trackId, buyer, LicenseType.COMMERCIAL, 1, block.timestamp);
    }
    function hasLicense(address buyer, uint256 trackId) external view returns (bool) {
        return balanceOf(buyer, trackId) > 0;
    }
    function getPurchasedTrackIds(address buyer) external view returns (uint256[] memory) {
        return purchasedTrackIds[buyer];
    }
    function uri(uint256 tokenId) public view override returns (string memory) {
        return string.concat("ipfs://", registry.getTrack(tokenId).metadataCID);
    }
    function setApprovalForAll(address, bool) public pure override { revert NonTransferable(); }
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0)) revert NonTransferable();
        super._update(from, to, ids, values);
    }
}
