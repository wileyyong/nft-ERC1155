// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
//import "./Base1155.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Engine is Ownable {
    using SafeMath for uint256;

    event AuctionCreated(uint256 _index, address _creator, address _asset);
    event AuctionBid(uint256 _index, address _bidder, uint256 amount);
    event Claim(uint256 auctionIndex, address claimer);
    event ReturnBidFunds(uint256 _index, address _bidder, uint256 amount);

    event Royalties(address receiver, uint256 amount);
    event PaymentToOwner(
        address receiver,
        uint256 amount,
        uint256 paidByCustomer,
        uint256 commission,
        uint256 royalties,
        uint256 safetyCheckValue
    );

    uint256 public commission = 0; // this is the commission that will charge the marketplace by default.
    uint256 public accumulatedCommission = 0;

    enum Status {pending, active, finished}
    struct Offer {
        address assetAddress; // address of the token
        uint256 tokenId; // the tokenId returned when calling "createItem"
        uint256 amount;
        address payable creator; // who creates the offer
        uint256 price; // price of each token
        bool isOnSale; // is on sale or not
        bool isAuction; // is this offer is for an auction
        uint256 startTime;
        uint256 duration;
        uint256 currentBidAmount;
        address payable currentBidOwner;
        uint256 bidCount;
    }
    Offer[] public offers;

    // Data of each token
    struct TokenData {
        address tokenAddr;
        address creator;
        uint256 royalties;
        string lockedContent;
    }
    mapping(uint256 => TokenData) public tokens;

    // returns the creator of the token
    function getCreator(uint256 _id) public view returns (address) {
        return tokens[_id].creator;
    }

    function getRoyalties(uint256 _id) public view returns (uint256) {
        return tokens[_id].royalties;
    }

    function addTokenToMarketplace(
        address _tokenAddr,
        uint256 _tokenId,
        uint256 _royalties,
        string memory _lockedContent
    ) public {
        require(_royalties <= 1000, "Royalties too high"); // you cannot set all royalties + commision. So the limit is 2% for royalties

        if (tokens[_tokenId].creator == address(0)) {
            // save the token data
            tokens[_tokenId] = TokenData({
                tokenAddr: _tokenAddr,
                creator: msg.sender,
                royalties: _royalties,
                lockedContent: _lockedContent
            });
        }
    }

    function createOffer(
        address _assetAddress, // address of the token
        uint256 _tokenId, // tokenId
        uint256 _amount,
        bool _isDirectSale, // true if can be bought on a direct sale
        bool _isAuction, // true if can be bought in an auction
        uint256 _price, // price that if paid in a direct sale, transfers the NFT
        uint256 _startPrice, // minimum price on the auction
        uint256 _startTime, // time when the auction will start. Check the format with frontend
        uint256 _duration // duration in seconds of the auction
    ) public returns (uint256) {
        ERC1155 asset = ERC1155(_assetAddress);
        require(
            asset.balanceOf(msg.sender, _tokenId) >= _amount,
            "You are trying to sale more nfts that the ones you have"
        );

        Offer memory offer =
            Offer({
                assetAddress: _assetAddress,
                tokenId: _tokenId,
                amount: _amount,
                creator: payable(msg.sender),
                price: _price,
                isOnSale: _isDirectSale,
                isAuction: _isAuction,
                startTime: _startTime,
                duration: _duration,
                currentBidAmount: _startPrice,
                currentBidOwner: payable(address(0)),
                bidCount: 0
            });
        offers.push(offer);
        uint256 index = offers.length - 1;
        return index;
    }

    function getOffersCount() public view returns (uint256) {
        return offers.length;
    }

    function ahora() public view returns (uint256) {
        return block.timestamp;
    }

    function getEndDate(uint256 _offerId) public view returns (uint256) {
        Offer memory offer = offers[_offerId];
        return offer.startTime + offer.duration;
    }

    function removeFromAuction(uint256 _offerId) public {
        Offer memory offer = offers[_offerId];
        require(msg.sender == offer.creator, "You are not the owner");
        require(offer.bidCount == 0, "Bids existing");
        offer.isAuction = false;
        offers[_offerId] = offer;
    }

    function removeFromSale(uint256 _offerId) public {
        Offer memory offer = offers[_offerId];
        require(msg.sender == offer.creator, "You are not the owner");
        offer.isOnSale = false;
        offers[_offerId] = offer;
    }

    // Changes the default commission. Only the owner of the marketplace can do that. In basic points
    function setCommission(uint256 _commission) public onlyOwner {
        commission = _commission;
    }

    function buy(uint256 _offerId) external payable {
        address buyer = msg.sender;
        uint256 paidPrice = msg.value;

        Offer memory offer = offers[_offerId];
        require(offer.isOnSale == true, "NFT not in direct sale");
        uint256 price = offer.price;
        require(paidPrice >= price, "Price is not enough");

        emit Claim(_offerId, buyer);
        ERC1155 asset = ERC1155(offer.assetAddress);
        asset.safeTransferFrom(
            offer.creator,
            msg.sender,
            offer.tokenId,
            offer.amount,
            ""
        );

        // now, pay the amount - commission - royalties to the auction creator
        address payable creatorNFT = payable(getCreator(_offerId));

        uint256 commissionToPay = (paidPrice * commission) / 10000;
        uint256 royaltiesToPay = 0;
        if (creatorNFT != offer.creator) {
            // It is a resale. Transfer royalties
            royaltiesToPay = (paidPrice * getRoyalties(_offerId)) / 10000;
            creatorNFT.transfer(royaltiesToPay);
            emit Royalties(creatorNFT, royaltiesToPay);
        }
        uint256 amountToPay = paidPrice - commissionToPay - royaltiesToPay;

        offer.creator.transfer(amountToPay);
        emit PaymentToOwner(
            offer.creator,
            amountToPay,
            paidPrice,
            commissionToPay,
            royaltiesToPay,
            amountToPay + ((paidPrice * commission) / 10000)
        );

        // is there is an auction open, we have to give back the last bid amount to the last bidder
        if (offer.isAuction == true) {
            if (offer.currentBidAmount != 0) {
                // return funds to the previuos bidder
                offer.currentBidOwner.transfer(offer.currentBidAmount);
                emit ReturnBidFunds(
                    _offerId,
                    offer.currentBidOwner,
                    offer.currentBidAmount
                );
            }
        }

        accumulatedCommission += commissionToPay;

        offer.isAuction = false;
        offer.isOnSale = false;
        offers[_offerId] = offer;
    }

    // At the end of the call, the amount is saved on the marketplace wallet and the previous bid amount is returned to old bidder
    // except in the case of the first bid, as could exists a minimum price set by the creator as first bid.
    function bid(uint256 _offerId) public payable {
        Offer storage offer = offers[_offerId];
        require(offer.creator != address(0));
        //  require(isActive(_offerId));
        require(msg.value > offer.currentBidAmount, "Bid too low");
        // we got a better bid. Return funds to the previous best bidder
        // and register the sender as `currentBidOwner`

        // this check is for not transferring back funds on the first bid, as the fist bid is the minimum price set by the auction creator
        if (
            offer.currentBidAmount != 0 &&
            offer.currentBidOwner != offer.creator
        ) {
            // return funds to the previuos bidder
            offer.currentBidOwner.transfer(offer.currentBidAmount);
            emit ReturnBidFunds(
                _offerId,
                offer.currentBidOwner,
                offer.currentBidAmount
            );
        }
        // register new bidder
        offer.currentBidAmount = msg.value;
        offer.currentBidOwner = payable(msg.sender);
        offer.bidCount = offer.bidCount.add(1);

        emit AuctionBid(_offerId, msg.sender, msg.value);
    }

    function isActive(uint256 _offerId) public view returns (bool) {
        return getStatus(_offerId) == Status.active;
    }

    function isFinished(uint256 _offerId) public view returns (bool) {
        return getStatus(_offerId) == Status.finished;
    }

    function getStatus(uint256 _offerId) public view returns (Status) {
        Offer storage offer = offers[_offerId];
        if (block.timestamp < offer.startTime) {
            return Status.pending;
        } else if (block.timestamp < offer.startTime.add(offer.duration)) {
            return Status.active;
        } else {
            return Status.finished;
        }
    }

    function endDate(uint256 _offerId) public view returns (uint256) {
        Offer storage offer = offers[_offerId];
        return offer.startTime.add(offer.duration);
    }

    function getCurrentBidOwner(uint256 _offerId)
        public
        view
        returns (address)
    {
        return offers[_offerId].currentBidOwner;
    }

    function getCurrentBidAmount(uint256 _offerId)
        public
        view
        returns (uint256)
    {
        return offers[_offerId].currentBidAmount;
    }

    function getBidCount(uint256 _offerId) public view returns (uint256) {
        return offers[_offerId].bidCount;
    }

    function getWinner(uint256 _offerId) public view returns (address) {
        require(isFinished(_offerId), "Auction not finished yet");
        return offers[_offerId].currentBidOwner;
    }

    function claimAsset(uint256 _offerId) public {
        require(isFinished(_offerId), "The auction is still active");
        Offer storage offer = offers[_offerId];

        address winner = getWinner(_offerId);
        require(winner == msg.sender, "You are not the winner of the auction");

        // the token could be sold in direct sale or the owner cancelled the auction
        require(offer.isAuction == true, "NFT not in auction");

        ERC1155 asset = ERC1155(offer.assetAddress);
        asset.safeTransferFrom(
            offer.creator,
            msg.sender,
            offer.tokenId,
            offer.amount,
            ""
        );

        emit Claim(_offerId, winner);

        // now, pay the amount - commission - royalties to the auction creator
        address payable creatorNFT = payable(getCreator(offer.tokenId));
        uint256 commissionToPay = (offer.currentBidAmount * commission) / 10000;
        uint256 royaltiesToPay = 0;
        if (creatorNFT != offer.creator) {
            // It is a resale. Transfer royalties
            royaltiesToPay =
                (offer.currentBidAmount * getRoyalties(offer.tokenId)) /
                10000;
            creatorNFT.transfer(royaltiesToPay);
            emit Royalties(creatorNFT, royaltiesToPay);
        }
        uint256 amountToPay =
            offer.currentBidAmount - commissionToPay - royaltiesToPay;

        offer.creator.transfer(amountToPay);
        emit PaymentToOwner(
            offer.creator,
            amountToPay,
            offer.currentBidAmount,
            commissionToPay,
            royaltiesToPay,
            amountToPay + commissionToPay + royaltiesToPay
        );

        accumulatedCommission += commissionToPay;

        offer.isAuction = false;
        offer.isOnSale = false;
        offers[_offerId] = offer;
    }

    function extractBalance() public onlyOwner {
        address payable me = payable(msg.sender);
        me.transfer(accumulatedCommission);
        accumulatedCommission = 0;
    }
}
