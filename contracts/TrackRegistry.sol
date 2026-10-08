// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Immutable creation evidence; registration never mints a license.
contract TrackRegistry is EIP712 {
    enum VerificationStatus { PASS, WARN, HOLD }
    struct Registration {
        bytes32 audioHash;
        string metadataCID;
        address[] contributors;
        uint256[] shares;
        uint256 similarityScore;
        string modelVersion;
        uint256 nonce;
        uint256 deadline;
    }
    struct Track {
        bytes32 audioHash;
        string metadataCID;
        address registrant;
        uint256 timestamp;
    }
    struct Verification {
        uint256 similarityScore;
        string modelVersion;
        VerificationStatus status;
    }
    bytes32 public constant REGISTER_TRACK_TYPEHASH = keccak256(
        "RegisterTrack(bytes32 audioHash,bytes32 metadataCIDHash,address registrant,bytes32 contributorsHash,uint256 similarityScore,string modelVersion,uint256 nonce,uint256 deadline)"
    );
    address public immutable verificationSigner;
    uint256 public nextTrackId = 1;
    mapping(bytes32 => bool) public isAudioHashRegistered;
    mapping(bytes32 => uint256) public trackIdByAudioHash;
    mapping(address => mapping(uint256 => bool)) public usedNonces;
    mapping(uint256 => Track) private tracks;
    mapping(uint256 => Verification) private verifications;
    mapping(uint256 => address[]) private contributorsByTrack;
    mapping(uint256 => uint256[]) private sharesByTrack;

    error InvalidInput();
    error InvalidContributors();
    error InvalidShares();
    error DuplicateContributor();
    error DuplicateAudioHash();
    error InvalidScore();
    error SignatureExpired();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error TrackNotFound();
    event TrackRegistered(uint256 indexed trackId, address indexed creator, bytes32 indexed audioHash, string metadataCID, VerificationStatus status, uint256 timestamp);
    event VerificationRecorded(uint256 indexed trackId, uint256 similarityScore, string modelVersion, VerificationStatus status, uint256 timestamp);

    constructor(address signer) EIP712("TrackAI_Registry", "1") {
        if (signer == address(0)) revert InvalidInput();
        verificationSigner = signer;
    }

    function registerTrack(Registration calldata r, bytes calldata signature) external returns (uint256 trackId) {
        if (r.audioHash == bytes32(0) || bytes(r.metadataCID).length == 0 || bytes(r.modelVersion).length == 0) revert InvalidInput();
        if (isAudioHashRegistered[r.audioHash]) revert DuplicateAudioHash();
        if (r.similarityScore > 10000) revert InvalidScore();
        if (block.timestamp > r.deadline) revert SignatureExpired();
        if (usedNonces[msg.sender][r.nonce]) revert NonceAlreadyUsed();
        uint256 length = r.contributors.length;
        if (length == 0 || length != r.shares.length) revert InvalidContributors();
        uint256 total;
        for (uint256 i; i < length; ++i) {
            if (r.contributors[i] == address(0)) revert InvalidContributors();
            if (r.shares[i] == 0 || r.shares[i] > 100) revert InvalidShares();
            for (uint256 j; j < i; ++j) {
                if (r.contributors[i] == r.contributors[j]) revert DuplicateContributor();
            }
            total += r.shares[i];
        }
        if (total != 100) revert InvalidShares();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            REGISTER_TRACK_TYPEHASH, r.audioHash, keccak256(bytes(r.metadataCID)), msg.sender,
            keccak256(abi.encode(r.contributors, r.shares)), r.similarityScore,
            keccak256(bytes(r.modelVersion)), r.nonce, r.deadline
        )));
        if (ECDSA.recover(digest, signature) != verificationSigner) revert InvalidSignature();
        usedNonces[msg.sender][r.nonce] = true;
        isAudioHashRegistered[r.audioHash] = true;
        trackId = nextTrackId++;
        trackIdByAudioHash[r.audioHash] = trackId;
        VerificationStatus status = r.similarityScore < 8000 ? VerificationStatus.PASS :
            r.similarityScore < 9000 ? VerificationStatus.WARN : VerificationStatus.HOLD;
        tracks[trackId] = Track(r.audioHash, r.metadataCID, msg.sender, block.timestamp);
        verifications[trackId] = Verification(r.similarityScore, r.modelVersion, status);
        contributorsByTrack[trackId] = r.contributors;
        sharesByTrack[trackId] = r.shares;
        emit TrackRegistered(trackId, msg.sender, r.audioHash, r.metadataCID, status, block.timestamp);
        emit VerificationRecorded(trackId, r.similarityScore, r.modelVersion, status, block.timestamp);
    }

    function getTrack(uint256 trackId) public view returns (Track memory) {
        if (tracks[trackId].registrant == address(0)) revert TrackNotFound();
        return tracks[trackId];
    }
    function getContributors(uint256 trackId) external view returns (address[] memory, uint256[] memory) {
        getTrack(trackId);
        return (contributorsByTrack[trackId], sharesByTrack[trackId]);
    }
    function getVerification(uint256 trackId) public view returns (Verification memory) {
        getTrack(trackId);
        return verifications[trackId];
    }
    function isTrackLicensable(uint256 trackId) external view returns (bool) {
        return tracks[trackId].registrant != address(0) && verifications[trackId].status != VerificationStatus.HOLD;
    }
}
