// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title AudioLicense
 * @dev AI 음원 검증 결과, 저작권 지분, 유사도 기반 에스크로 홀딩을 관리하는 스마트 컨트랙트
 */
contract AudioLicense is ERC1155, EIP712 {
    using ECDSA for bytes32;

    // 온체인에 영구 기록될 데이터 구조
    struct AudioRecord {
        string ipfsCID;         // IPFS 분산 저장 CID 주소 (음원 + 프롬프트 로그)
        bytes32 audioHash;      // 오디오 고유 핑거프린트/임베딩 해시
        uint256 similarityScore; // AI가 산출한 유사도 점수 (0~100)
        bool isHold;            // 표절/분쟁 우려로 인한 정산 홀딩 상태 여부
        uint256 timestamp;      // 온체인 등록 시간
        address[] creators;     // 창작 기여자 주소 목록
        uint256[] shares;       // 기여 지분 비율 (합계 100 기준)
    }

    // tokenId => AudioRecord 매핑
    mapping(uint256 => AudioRecord) public audioRecords;

    // audioHash 중복 등록 여부 검증 (동일 핑거프린트 중복 등록 방지)
    mapping(bytes32 => bool) public isAudioHashRegistered;
    
    // AI 검증 서버의 지갑 주소
    address public aiVerifierAddress;

    // 이벤트 정의
    event AudioRegistered(
        uint256 indexed tokenId, 
        string ipfsCID, 
        bytes32 audioHash, 
        uint256 similarityScore, 
        bool isHold
    );
    event EscrowStatusUpdated(uint256 indexed tokenId, bool isHold);

    // EIP-712 타입 해시 선언 (배율 및 주소 배열의 해시까지 포함하여 조작 완전 차단)
    bytes32 private constant REGISTER_AUDIO_TYPEHASH = keccak256(
        "RegisterAudio(uint256 tokenId,string ipfsCID,bytes32 audioHash,uint256 similarityScore,bytes32 creatorsHash,bytes32 sharesHash)"
    );

    constructor(address _aiVerifier) 
        ERC1155("https://api.example.com/metadata/{id}.json") 
        EIP712("AudioAI_Registry", "1.0.0") 
    {
        require(_aiVerifier != address(0), "Invalid verifier address");
        aiVerifierAddress = _aiVerifier;
    }

    /**
     * @dev AI 검증 서명(EIP-712)을 확인한 뒤 유사도에 따른 에스크로 홀딩 판단 및 NFT 민팅
     */
    function registerAndMint(
        uint256 tokenId,
        string memory ipfsCID,
        bytes32 audioHash,
        uint256 similarityScore,
        address[] memory creators,
        uint256[] memory shares,
        bytes memory signature
    ) external {
        // 1. 유효성 입력 검증
        require(audioRecords[tokenId].timestamp == 0, "Token ID already exists");
        require(!isAudioHashRegistered[audioHash], "Audio hash already registered");
        require(creators.length > 0, "At least one creator required");
        require(creators.length == shares.length, "Creators and shares length mismatch");

        // 지분 비율 합계가 100%인지 검증
        uint256 totalShare = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            totalShare += shares[i];
        }
        require(totalShare == 100, "Total share must equal 100");

        // 2. EIP-712 서명 검증 (데이터 위변조 방지)
        bytes32 creatorsHash = keccak256(abi.encode(creators));
        bytes32 sharesHash = keccak256(abi.encode(shares));

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            REGISTER_AUDIO_TYPEHASH,
            tokenId,
            keccak256(bytes(ipfsCID)),
            audioHash,
            similarityScore,
            creatorsHash,
            sharesHash
        )));
        
        address signer = ECDSA.recover(digest, signature);
        require(signer == aiVerifierAddress, "Invalid AI Verification Signature");

        // 3. 에스크로 홀딩 조건 로직 (유사도 85점 이상일 경우 홀딩)
        bool holdStatus = similarityScore >= 85;

        // 4. 온체인 영구 기록 및 중복 마킹
        audioRecords[tokenId] = AudioRecord({
            ipfsCID: ipfsCID,
            audioHash: audioHash,
            similarityScore: similarityScore,
            isHold: holdStatus,
            timestamp: block.timestamp,
            creators: creators,
            shares: shares
        });

        isAudioHashRegistered[audioHash] = true;

        // 5. 라이선스 ERC-1155 토큰 1개 민팅
        _mint(msg.sender, tokenId, 1, "");

        emit AudioRegistered(tokenId, ipfsCID, audioHash, similarityScore, holdStatus);
    }

    /**
     * @dev 등록된 음원의 창작 기여자 주소 및 지분 목록 조회
     */
    function getCreatorsAndShares(uint256 tokenId) 
        external 
        view 
        returns (address[] memory, uint256[] memory) 
    {
        require(audioRecords[tokenId].timestamp > 0, "Token ID does not exist");
        AudioRecord memory record = audioRecords[tokenId];
        return (record.creators, record.shares);
    }
}