// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IEngine {
    function buy(
        uint256 offerIndex,
        address to,
        uint256 amount
    ) external payable;
}

contract Base1155 is ERC1155, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
 
    constructor()        
        ERC1155("www.xsigma.fi/tokens/{id}.json")
    {}

    function ImAlive() external pure returns (uint256) {
        return 1;
    }
    
    function createItem(
        uint256 _amount, // amount of tokens for this item
        uint256 _royalties // amount of royalties in bp
    ) public returns (uint256) {
        require(_royalties <= 1000, "Royalties too high"); // you cannot set all royalties + commision. So the limit is 2% for royalties
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();

        // mint the NFT tokens of the collection
        _mint(msg.sender, newItemId, _amount, "");
      
        return newItemId;
    }
   
}
