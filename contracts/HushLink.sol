// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, eaddress, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title HushLink
/// @notice Confidential messaging where the message key (an ephemeral address) is stored encrypted with Zama FHE.
/// @dev The message ciphertext is produced off-chain and stored as a string. Only the recipient can decrypt the key
///      (the ephemeral address) through the FHEVM ACL, then use it to decrypt the ciphertext locally.
contract HushLink is ZamaEthereumConfig {
    struct Message {
        address sender;
        uint256 timestamp;
        string ciphertext;
        eaddress encryptedKeyAddress;
    }

    mapping(address recipient => Message[] inbox) private _inbox;

    error InvalidRecipient();
    error InvalidIndex();

    event MessageSent(address indexed sender, address indexed recipient, uint256 indexed index);

    /// @notice Stores a confidential message for a recipient.
    /// @param recipient The recipient EOA address.
    /// @param ciphertext The message ciphertext produced off-chain.
    /// @param encryptedKeyAddress The FHE-encrypted ephemeral address used as the message key.
    /// @param inputProof Proof for the external encrypted input.
    /// @return index The index of the message in the recipient inbox.
    function sendMessage(
        address recipient,
        string calldata ciphertext,
        externalEaddress encryptedKeyAddress,
        bytes calldata inputProof
    ) external returns (uint256 index) {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }

        eaddress key = FHE.fromExternal(encryptedKeyAddress, inputProof);

        // Grant access to the recipient (and sender, for convenience) to enable user decryption.
        FHE.allowThis(key);
        FHE.allow(key, recipient);
        FHE.allow(key, msg.sender);

        _inbox[recipient].push(
            Message({sender: msg.sender, timestamp: block.timestamp, ciphertext: ciphertext, encryptedKeyAddress: key})
        );

        index = _inbox[recipient].length - 1;

        emit MessageSent(msg.sender, recipient, index);
    }

    /// @notice Returns the number of messages in a user's inbox.
    /// @param user The inbox owner.
    function getInboxCount(address user) external view returns (uint256) {
        return _inbox[user].length;
    }

    /// @notice Returns a specific message from a user's inbox.
    /// @param user The inbox owner.
    /// @param index The message index.
    /// @return sender The message sender address.
    /// @return timestamp The message timestamp.
    /// @return ciphertext The off-chain ciphertext.
    /// @return encryptedKeyAddress The FHE-encrypted ephemeral address (ciphertext handle).
    function getMessage(
        address user,
        uint256 index
    ) external view returns (address sender, uint256 timestamp, string memory ciphertext, eaddress encryptedKeyAddress) {
        if (index >= _inbox[user].length) {
            revert InvalidIndex();
        }

        Message storage m = _inbox[user][index];
        return (m.sender, m.timestamp, m.ciphertext, m.encryptedKeyAddress);
    }
}

