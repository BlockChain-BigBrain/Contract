// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {TrackRegistry} from "./TrackRegistry.sol";

/// @notice Legacy deployment name retained for creation registration only.
/// @dev registerAndMint is intentionally removed; use registerTrack and LicenseMarketplace.
contract AudioLicense is TrackRegistry {
    constructor(address verifier) TrackRegistry(verifier) {}
}
