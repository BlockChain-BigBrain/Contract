// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TrackRegistry} from "./TrackRegistry.sol";
import {LicenseNFT} from "./LicenseNFT.sol";
import {RevenueSplitter} from "./RevenueSplitter.sol";

contract LicenseMarketplace is Ownable, ReentrancyGuard {
    TrackRegistry public immutable registry;
    LicenseNFT public immutable licenseNFT;
    RevenueSplitter public immutable revenueSplitter;
    mapping(uint256 => uint256) private prices;
    mapping(address => bool) public priceManagers;
    error UnauthorizedPriceSetter();
    error InvalidPrice();
    error TrackNotLicensable();
    error IncorrectPayment(uint256 expected, uint256 received);
    error AlreadyLicensed();
    event PriceManagerUpdated(address indexed manager, bool approved);
    event LicensePriceUpdated(uint256 indexed trackId, address indexed creator, uint256 amount, uint256 timestamp);
    event LicensePurchased(uint256 indexed trackId, uint256 indexed tokenId, address indexed buyer, uint256 amount, TrackRegistry.VerificationStatus status, uint256 timestamp);
    constructor(TrackRegistry registry_, LicenseNFT nft_, RevenueSplitter splitter_, address owner) Ownable(owner) {
        registry = registry_; licenseNFT = nft_; revenueSplitter = splitter_;
    }
    function setPriceManager(address manager, bool approved) external onlyOwner {
        priceManagers[manager] = approved;
        emit PriceManagerUpdated(manager, approved);
    }
    function setLicensePrice(uint256 trackId, uint256 price) external {
        TrackRegistry.Track memory track = registry.getTrack(trackId);
        if (msg.sender != track.registrant && !priceManagers[msg.sender]) revert UnauthorizedPriceSetter();
        if (price == 0) revert InvalidPrice();
        prices[trackId] = price;
        emit LicensePriceUpdated(trackId, msg.sender, price, block.timestamp);
    }
    function getLicensePrice(uint256 trackId) external view returns (uint256) {
        registry.getTrack(trackId);
        return prices[trackId];
    }
    function purchaseLicense(uint256 trackId) external payable nonReentrant {
        registry.getTrack(trackId);
        if (!registry.isTrackLicensable(trackId)) revert TrackNotLicensable();
        uint256 price = prices[trackId];
        if (price == 0) revert InvalidPrice();
        if (msg.value != price) revert IncorrectPayment(price, msg.value);
        if (licenseNFT.hasLicense(msg.sender, trackId)) revert AlreadyLicensed();
        revenueSplitter.recordRevenue{value: msg.value}(trackId);
        licenseNFT.mintLicense(msg.sender, trackId);
        emit LicensePurchased(trackId, trackId, msg.sender, price, registry.getVerification(trackId).status, block.timestamp);
    }
}
