// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Base1155 is ERC1155, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
 
 struct TokenData {
        address creator; // creator/artist. Needed for knowing who will receive the royalties
    }
    mapping(uint256 => TokenData) public tokens;

    constructor()        
        ERC1155("www.xsigma.fi/tokens/{id}.json")
    {}
    
    function createItem(
        uint256 _amount // amount of tokens for this item
    ) public returns (uint256) {
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();

        // mint the NFT tokens of the collection
        _mint(msg.sender, newItemId, _amount, "");

        tokens[newItemId] = TokenData({creator: msg.sender});
      
        return newItemId;
    }

    function getCreator(uint256 _tokenId) public view returns (address)
    {
        return tokens[_tokenId].creator;
    }

   
}
