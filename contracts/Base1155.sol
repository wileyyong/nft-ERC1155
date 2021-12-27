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
        uint256 royalties; // royalties in basic points (so a 2% is 200, a 1.5% is 150, etc.)
        string lockedContent; // content only available to the owner that could contain stuff like coupons, discounts, etc.
    }
    mapping(uint256 => TokenData) public tokens;

    constructor()        
       // ERC1155("beta.xsigma.ga/api/tokens/{id}.json")
       ERC1155("https://beta.xsigma.ga/api/tokens/ERC1155MATIC/{id}.json")
    {}
    
    function createItem(
        uint256 _amount, // amount of tokens for this item
        uint256 _royalties,
        string memory _lockedContent
    ) public returns (uint256) { 
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();

        // mint the NFT tokens of the collection
        _mint(msg.sender, newItemId, _amount, "");

        tokens[newItemId] = TokenData({creator: msg.sender, royalties: _royalties, lockedContent: _lockedContent});
      
        return newItemId;
    }

    function getCreator(uint256 _tokenId) public view returns (address)
    {
        return tokens[_tokenId].creator;
    }

    function getRoyalties(uint256 _tokenId) public view returns (uint256)
    {
        return tokens[_tokenId].royalties;
    }
   
   function getLockedContent(uint256 _tokenId) public view returns (string memory)
    {
        return tokens[_tokenId].lockedContent;
    }
}
