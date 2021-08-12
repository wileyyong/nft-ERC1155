// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Base1155.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Engine is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    event OfferCreated(uint256 _index, address _creator, uint256 _tokenId);
    event AuctionBid(uint256 _index, address _bidder, uint256 amount);
    event Claim(uint256 auctionIndex, address claimer);
    event ReturnBidFunds(uint256 _index, address _bidder, uint256 amount);

    event Royalties(address receiver, uint256 amount);
    event PaymentToOwner(
        address receiver,
        uint256 amount,
        uint256 commission,
        uint256 royalties,
        uint256 safetyCheckValue
    );

    uint256 public commission = 0; // this is the commission that will charge the marketplace by default.
    uint256 public accumulatedCommission = 0;

    uint256 public totalSales = 0;

    enum Status {
        pending,
        active,
        finished
    }
    struct Offer {
        address tokenAddress; // address of the token
        uint256 tokenId; // the tokenId returned when calling "createItem"
        uint256 amount; // amount of tokens on sale on this offer
        address payable creator; // who creates the offer
        uint256 price; // price of each token
        bool isOnSale; // is on sale or not
        bool isAuction; // is this offer is for an auction
        uint256 startTime; // when the auction starts
        uint256 duration; // duration in seconds of the auction
        uint256 minimumBidAmount;
        uint256 availableCopies;
        bool hasBids;
    }
    Offer[] public offers;

    struct Auction {
        address tokenAddress; // address of the token
        uint256 tokenId; // the tokenId returned when calling "createItem"
        uint256 currentBidAmount; // current amount paid by the best bidder
        address payable currentBidOwner; // address of the best bidder
        uint256 bidCount; // counter of the bids of the auction
        uint256 offerId;
        uint256 numCopies;
        bool active;
    }
    Auction[] public auctions;

    function createAuctionAndBid(uint256 _offerId, uint256 _numCopies)
        public
        payable
        returns (uint256)
    {
        Offer memory offer = offers[_offerId];
        require(offer.isAuction == true, "NFT not in auction");
        require(isActive(_offerId), "Auction has ended");
        require(offer.creator != address(0));
        require(
            offer.availableCopies >= _numCopies,
            "Not enough copies available"
        );
        require(
            msg.value >= offer.minimumBidAmount.mul(_numCopies),
            "Price is not enough"
        );

        Auction memory auction = Auction({
            tokenAddress: offer.tokenAddress,
            tokenId: offer.tokenId,
            numCopies: _numCopies,
            currentBidOwner: payable(msg.sender),
            currentBidAmount: msg.value,
            bidCount: 1,
            offerId: _offerId,
            active: true
        });

        auctions.push(auction);
        uint256 auctionId = auctions.length - 1;

        // Update offer with new available amount
        if (offer.hasBids == false) offer.hasBids = true;
        offer.availableCopies = offer.availableCopies.sub(_numCopies);
        offers[_offerId] = offer;

        emit AuctionBid(auctionId, msg.sender, msg.value);
        return auctionId;
    }

    function bid(uint256 _auctionId) public payable {
        Auction memory auction = auctions[_auctionId];
        Offer memory offer = offers[auction.offerId];
        require(offer.isAuction, "Auction is not enabled");
        require(auction.active, "Auction is not active");
        require(isActive(auction.offerId), "Auction has ended");
        require(offer.creator != address(0));
        require(msg.value >= auction.currentBidAmount, "Price is not enough");

        // return funds to the previuos bidder

        (bool success, ) = auction.currentBidOwner.call{
            value: auction.currentBidAmount
        }("");
        require(success, "Transfer failed on bid.");
        emit ReturnBidFunds(
            _auctionId,
            auction.currentBidOwner,
            auction.currentBidAmount
        );

        auction.currentBidAmount = msg.value;
        auction.currentBidOwner = payable(msg.sender);
        auction.bidCount = auction.bidCount.add(1);
        auctions[_auctionId] = auction;
    }

    function closeAuction(uint256 _auctionId) public {
        Auction memory auction = auctions[_auctionId];
        Offer memory offer = offers[auction.offerId];

        require(auction.active == true, "Auction not active");
        require(isFinished(auction.offerId), "The auction is still active");
        require(offer.isAuction == true, "Auction is not active");

        Base1155 asset = Base1155(offer.tokenAddress);

        require(
            asset.balanceOf(offer.creator, offer.tokenId) >= offer.amount,
            "Owner did not have enough tokens"
        );
        require(
            asset.isApprovedForAll(offer.creator, address(this)),
            "NFT not approved"
        );

        emit Claim(auction.offerId, auction.currentBidOwner);

        asset.safeTransferFrom(
            offer.creator,
            auction.currentBidOwner,
            offer.tokenId,
            auction.numCopies,
            ""
        );

        // now, pay the amount - commission - royalties to the auction creator
        address payable creatorNFT = payable(
            // getCreator(offer.assetAddress, _offerId)
            asset.getCreator(offer.tokenId)
        );

        uint256 commissionToPay = (auction.currentBidAmount * commission) /
            10000;
        uint256 royaltiesToPay = 0;
        if (creatorNFT != offer.creator) {
            // It is a resale. Transfer royalties
            royaltiesToPay =
                (auction.currentBidAmount * asset.getRoyalties(offer.tokenId)) / /*getRoyalties(offer.assetAddress, _offerId)*/
                10000;
            (bool success, ) = creatorNFT.call{value: royaltiesToPay}("");
            require(success, "Transfer failed.");

            emit Royalties(creatorNFT, royaltiesToPay);
        }
        uint256 amountToPay = auction.currentBidAmount -
            commissionToPay -
            royaltiesToPay;

        (bool success2, ) = offer.creator.call{value: amountToPay}("");
        require(success2, "Transfer failed.");
        emit PaymentToOwner(
            offer.creator,
            amountToPay,
            commissionToPay,
            royaltiesToPay,
            calcSafetyCheckValue(
                amountToPay,
                auction.currentBidAmount,
                commission
            )
        );

        accumulatedCommission = accumulatedCommission.add(commissionToPay);
        totalSales = totalSales.add(auction.currentBidAmount);

        auction.active = false;
        auctions[_auctionId] = auction;
    }

    // Creates an offer that could be direct sale and/or auction for a certain amount of a token
    function createOffer(
        address _tokenAddress,
        uint256 _tokenId, // tokenId
        uint256 _amount, // amount of tokens on sale
        bool _isDirectSale, // true if can be bought on a direct sale
        bool _isAuction, // true if can be bought in an auction
        uint256 _price, // price that if paid in a direct sale, transfers the NFT
        uint256 _startPrice, // minimum price on the auction
        uint256 _startTime, // time when the auction will start. Check the format with frontend
        uint256 _duration // duration in seconds of the auction
    ) public returns (uint256) {
        Base1155 asset = Base1155(_tokenAddress);
        require(
            asset.balanceOf(msg.sender, _tokenId) >= _amount,
            "You are trying to sale more nfts that the ones you have"
        );

        Offer memory offer = Offer({
            tokenAddress: _tokenAddress,
            tokenId: _tokenId,
            amount: _amount,
            creator: payable(msg.sender),
            price: _price,
            isOnSale: _isDirectSale,
            isAuction: _isAuction,
            startTime: _startTime,
            duration: _duration,
            minimumBidAmount: _startPrice,
            hasBids: false,
            availableCopies: _amount // at the beginning all the copies are available, as nothing has been sold
        });
        offers.push(offer);
        uint256 index = offers.length - 1;

        emit OfferCreated(index, msg.sender, _tokenId);
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
        require(offer.hasBids == false, "Bids existing");
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
        require(_commission <= 5000, "Commission too high");
        commission = _commission;
    }

    function calcSafetyCheckValue(
        uint256 _amountToPay,
        uint256 _paidPrice,
        uint256 _commission
    ) internal pure returns (uint256) {
        uint256 result = _amountToPay + ((_paidPrice * _commission) / 10000);
        return result;
    }

    function buy(uint256 _offerId, uint256 _amount)
        external
        payable
        nonReentrant
    {
        address buyer = msg.sender;
        uint256 paidPrice = msg.value;

        Offer memory offer = offers[_offerId];
        require(offer.isOnSale == true, "NFT not in direct sale");
        require(
            offer.availableCopies >= _amount,
            "Not enough copies available"
        );
        uint256 price = offer.price;
        require(paidPrice >= price.mul(_amount), "Price is not enough");        

        Base1155 asset = Base1155(offer.tokenAddress);
        require(
            asset.balanceOf(offer.creator, offer.tokenId) >= offer.amount,
            "Owner did not have enough tokens"
        );
        require(
            asset.isApprovedForAll(offer.creator, address(this)),
            "NFT not approved"
        );

        emit Claim(_offerId, buyer);
        
        asset.safeTransferFrom(
            offer.creator,
            msg.sender,
            offer.tokenId,
            _amount,
            ""
        );

        // now, pay the amount - commission - royalties to the auction creator
        address payable creatorNFT = payable(
            // getCreator(offer.assetAddress, _offerId)
            asset.getCreator(offer.tokenId)
        );

        uint256 commissionToPay = (paidPrice * commission) / 10000;
        uint256 royaltiesToPay = 0;
        if (creatorNFT != offer.creator) {
            // It is a resale. Transfer royalties
            royaltiesToPay =
                (paidPrice * asset.getRoyalties(offer.tokenId)) / /*getRoyalties(offer.assetAddress, _offerId)*/
                10000;
            (bool success, ) = creatorNFT.call{value: royaltiesToPay}("");
            require(success, "Transfer failed.");

            emit Royalties(creatorNFT, royaltiesToPay);
        }
        uint256 amountToPay = paidPrice - commissionToPay - royaltiesToPay;

        (bool success2, ) = offer.creator.call{value: amountToPay}("");
        require(success2, "Transfer failed.");
        emit PaymentToOwner(
            offer.creator,
            amountToPay,
            commissionToPay,
            royaltiesToPay,
            calcSafetyCheckValue(amountToPay, paidPrice, commission)
        );

        accumulatedCommission += commissionToPay;
        totalSales = totalSales.add(paidPrice);        

        offer.availableCopies = offer.availableCopies.sub(_amount);

        if (offer.availableCopies == 0) {
            offer.isAuction = false;
            offer.isOnSale = false;
        }

        offers[_offerId] = offer;
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

    function getCurrentBidOwner(uint256 _auctionId)
        public
        view
        returns (address)
    {
        return auctions[_auctionId].currentBidOwner;
    }

    function getCurrentBidAmount(uint256 _auctionId)
        public
        view
        returns (uint256)
    {
        return auctions[_auctionId].currentBidAmount;
    }

    function getBidCount(uint256 _auctionId) public view returns (uint256) {
        return auctions[_auctionId].bidCount;
    }

    function getWinner(uint256 _auctionId) public view returns (address) {
        require(
            isFinished(auctions[_auctionId].offerId),
            "Auction not finished yet"
        );
        return auctions[_auctionId].currentBidOwner;
    }

  

    /* The contract owner should call this method to cancel an auction on an offer
    This will cancel the auction. If the auction has bids, it
    will return the bidded amount to the bidder before closing the auction
 */
       function forceAuctionEnding(uint256 _auctionId) public onlyOwner nonReentrant {
           Auction memory auction = auctions[_auctionId];
        Offer storage offer = offers[auction.offerId];
            if (
                auction.currentBidAmount != 0 &&
                auction.currentBidOwner != address(0)
            ) {
                // return funds to the previuos bidder, if there is a previous bid
                (bool success, ) = auction.currentBidOwner.call{
                    value: auction.currentBidAmount
                }("");
                require(success, "Transfer failed.");
                emit ReturnBidFunds(
                    auction.offerId,
                    auction.currentBidOwner,
                    auction.currentBidAmount
                );
            }
        
        auction.active=false;
        auctions[_auctionId] = auction;

        offer.isAuction = false;

        offer.amount = offer.amount.add(auction.numCopies);
        offers[auction.offerId] = offer;
    }

    function extractBalance() public onlyOwner nonReentrant {
        address payable me = payable(msg.sender);
        (bool success, ) = me.call{value: accumulatedCommission}("");
        require(success, "Transfer failed.");
        accumulatedCommission = 0;
    }
}
