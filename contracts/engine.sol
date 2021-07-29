// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Base1155.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Engine is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    event OfferCreated(
        uint256 _index,
        address _creator,
        uint256 _tokenId
    );
    event AuctionBid(uint256 _index, address _bidder, uint256 amount);
    event Claim(uint256 auctionIndex, address claimer);
    event ReturnBidFunds(uint256 _index, address _bidder, uint256 amount);

    event Royalties(address receiver, uint256 amount);
    event PaymentToOwner(
        address receiver,
        uint256 amount,
     //   uint256 paidByCustomer,
        uint256 commission,
        uint256 royalties,
        uint256 safetyCheckValue
    );

    uint256 public commission = 0; // this is the commission that will charge the marketplace by default.
    uint256 public accumulatedCommission = 0;

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
        uint256 currentBidAmount; // current amount paid by the best bidder
        address payable currentBidOwner; // address of the best bidder
        uint256 bidCount; // counter of the bids of the auction
    }
    Offer[] public offers;

    // returns the creator of the token
 /*   function getCreator(address _tokenAddress, uint256 _id)
        public
        view
        returns (address)
    {
        return tokens[keccak256(abi.encodePacked(_tokenAddress, _id))].creator;
    }

    function getRoyalties(address _tokenAddress, uint256 _id)
        public
        view
        returns (uint256)
    {
        return
            tokens[keccak256(abi.encodePacked(_tokenAddress, _id))].royalties;
    }

    function getLockedContent(address _tokenAddress, uint256 _id)
        public
        view
        returns (string memory)
    {
        return
            tokens[keccak256(abi.encodePacked(_tokenAddress, _id))]
                .lockedContent;
    }
*/
    // Adds the token to the "tokens" table on the marketplace. This is needed is we want to import NFTs created outside of the marketplace
 /*   function addTokenToMarketplace(
        address _tokenAddr,
        uint256 _tokenId,
        uint256 _royalties,
        string memory _lockedContent
    ) public {
        require(_royalties <= 5000, "Royalties too high"); // you cannot set all royalties + commision. So the limit is 50% for royalties
        //  Check only the creator (artist) can call this method.        
        Base1155 asset = Base1155(_tokenAddr);
        require(asset.getCreator(_tokenId) == msg.sender, "Not nft creator");

        if (
            tokens[keccak256(abi.encodePacked(_tokenAddr, _tokenId))].creator ==
            address(0)
        ) {
            // save the token data
            tokens[
                keccak256(abi.encodePacked(_tokenAddr, _tokenId))
            ] = TokenData({
                tokenAddr: _tokenAddr,
                creator: msg.sender,
                royalties: _royalties,
                lockedContent: _lockedContent
            });
        }
    }
*/
    // Creates an offer that could be direct sale and/or auction for a certain amount of a token
    function createOffer(
        address _tokenAddress,
        uint256 _tokenId, // tokenId
        uint256 _amount,
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
            currentBidAmount: _startPrice,
            currentBidOwner: payable(address(0)),
            bidCount: 0
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
        require(_commission <= 5000, "Commission too high");
        commission = _commission;
    }

    function calcSafetyCheckValue(uint256 _amountToPay, uint256 _paidPrice, uint256 _commission) internal pure returns (uint256)
    {
         uint256 result = _amountToPay + ((_paidPrice * _commission) / 10000);
         return result;
    }
    function buy(uint256 _offerId) external payable nonReentrant {
        address buyer = msg.sender;
        uint256 paidPrice = msg.value;

        Offer memory offer = offers[_offerId];
        require(offer.isOnSale == true, "NFT not in direct sale");
        uint256 price = offer.price;
        require(paidPrice >= price, "Price is not enough");
        //  if there is a bid and the auction is closed but not claimed, give priority to claim
        require(
            !(offer.amount == 1 &&
                offer.isAuction == true &&
                isFinished(_offerId) &&
                offer.currentBidAmount != 0 &&
                offer.currentBidOwner != address(0)),
            "Claim asset from auction has priority"
        );

        emit Claim(_offerId, buyer);
        Base1155 asset = Base1155(offer.tokenAddress);
        asset.safeTransferFrom(
            offer.creator,
            msg.sender,
            offer.tokenId,
            1, // only send one item instead of offer.amount,
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
                (paidPrice *  asset.getRoyalties(offer.tokenId) /*getRoyalties(offer.assetAddress, _offerId)*/) /
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
          //  paidPrice,
            commissionToPay,
            royaltiesToPay,
            calcSafetyCheckValue(amountToPay, paidPrice, commission)
            //amountToPay + ((paidPrice * commission) / 10000)
        );

        accumulatedCommission += commissionToPay;

        // if there are no items left in the offer close the offer. Otherwise subtract 1 to the offer amount of tokens for sale
        if (offer.amount == 1) {
            // is there is an auction open, we have to give back the last bid amount to the last bidder
            if (offer.isAuction == true) {
                // this check is for not transferring back funds on the first bid, as the fist bid is the minimum price set by the auction creator
                // and the bid owner is address(0)
                if (
                    offer.currentBidAmount != 0 &&
                    offer.currentBidOwner != address(0)
                ) {
                    // return funds to the previuos bidder
                    (bool success3, ) = offer.currentBidOwner.call{
                        value: offer.currentBidAmount
                    }("");
                    require(success3, "Transfer failed.");
                    emit ReturnBidFunds(
                        _offerId,
                        offer.currentBidOwner,
                        offer.currentBidAmount
                    );
                }
            }

            offer.isAuction = false;
            offer.isOnSale = false;
        }

        offer.amount = offer.amount.sub(1);
        offers[_offerId] = offer;
    }

    // At the end of the call, the amount is saved on the marketplace wallet and the previous bid amount is returned to old bidder
    // except in the case of the first bid, as could exists a minimum price set by the creator as first bid.
    function bid(uint256 _offerId) public payable nonReentrant {
        Offer storage offer = offers[_offerId];
        // Fix #5. check auction date.
        require(isActive(_offerId), "Auction is not active");
        require(offer.creator != address(0));
        require(offer.isAuction == true, "Auction is not active");
        require(offer.amount > 0, "Auction did not have copies on sale");
        require(msg.value > offer.currentBidAmount, "Bid too low");
        // require(msg.value > offer.minPrice, "Bid lower than minimum price"); // Extra check. Theoretically when creating an offer it sets minprice to
        // we got a better bid. Return funds to the previous best bidder
        // and register the sender as `currentBidOwner`

        // this check is for not transferring back funds on the first bid, as the fist bid is the minimum price set by the auction creator
        if (
            offer.currentBidAmount != 0 &&
            offer.currentBidOwner != address(0)
        ) {
            // return funds to the previuos bidder
                    (bool success, ) = offer.currentBidOwner.call{
                        value: offer.currentBidAmount
                    }("");
                    require(success, "Transfer failed.");
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

    function claimAsset(uint256 _offerId) public nonReentrant {
        require(isFinished(_offerId), "The auction is still active");
        Offer storage offer = offers[_offerId];

        address winner = getWinner(_offerId);
        require(winner == msg.sender, "You are not the winner of the auction");

        // the token could be sold in direct sale or the owner cancelled the auction
        require(offer.isAuction == true, "NFT not in auction");

        Base1155 asset = Base1155(offer.tokenAddress);

        // #3, check if the asset owner had removed their approval or the offer creator is not the token owner anymore.
        require(
            asset.balanceOf(offer.creator, offer.tokenId) >= offer.amount,
            "Owner did not have enough tokens"
        );
        require(
            asset.isApprovedForAll(offer.creator, address(this)),
            "NFT not approved"
        );

        asset.safeTransferFrom(
            offer.creator,
            msg.sender,
            offer.tokenId,
            1, //offer.amount,
            ""
        );

        emit Claim(_offerId, winner);

        // now, pay the amount - commission - royalties to the auction creator
        address payable creatorNFT = payable(
            //getCreator(offer.assetAddress, offer.tokenId)
            asset.getCreator(offer.tokenId)
        );
        uint256 commissionToPay = (offer.currentBidAmount * commission) / 10000;
        uint256 royaltiesToPay = 0;
        if (creatorNFT != offer.creator) {
            // It is a resale. Transfer royalties
            royaltiesToPay =
                (offer.currentBidAmount *
                    asset.getRoyalties(offer.tokenId) /*getRoyalties(offer.assetAddress, offer.tokenId)*/) /
                10000;
                (bool success1, ) = creatorNFT.call{
                    value: royaltiesToPay
                }("");
                require(success1, "Transfer failed.");
            emit Royalties(creatorNFT, royaltiesToPay);
        }
        uint256 amountToPay = offer.currentBidAmount -
            commissionToPay -
            royaltiesToPay;

                (bool success, ) = offer.creator.call{
                    value: amountToPay
                }("");
                require(success, "Transfer failed.");
        emit PaymentToOwner(
            offer.creator,
            amountToPay,
       //     offer.currentBidAmount,
            commissionToPay,
            royaltiesToPay,
            amountToPay + commissionToPay + royaltiesToPay
        );

        accumulatedCommission += commissionToPay;

        // if there are no items left in the offer close the offer. Otherwise subtract 1 to the offer amount of tokens for sale
        if (offer.amount == 1) {
            offer.isAuction = false;
            offer.isOnSale = false;
        } else {
            offer.currentBidOwner = payable(0);
            offer.currentBidAmount = 0;
        }

        offer.amount = offer.amount.sub(1);
        offers[_offerId] = offer;
    }

    /* The owner should call this method to cancel an auction on an offer
    This will cancel the auction and let the copy be sold using direct sale. If the auction has bids, it
    will return the bidded amount to the bidder before closing the auction
 */
    function forceAuctionEnding(uint256 _offerId) public onlyOwner nonReentrant {
        Offer storage offer = offers[_offerId];
        if (offer.amount == 1) {
            if (
                offer.currentBidAmount != 0 &&
                offer.currentBidOwner != address(0)
            ) {
                // return funds to the previuos bidder, if there is a previous bid
                (bool success, ) = offer.currentBidOwner.call{
                    value: offer.currentBidAmount
                }("");
                require(success, "Transfer failed.");
                emit ReturnBidFunds(
                    _offerId,
                    offer.currentBidOwner,
                    offer.currentBidAmount
                );
            }
        } else {
            offer.currentBidOwner = payable(0);
            offer.currentBidAmount = 0;
        }

        offer.isAuction = false;

        offer.amount = offer.amount.add(1);
        offers[_offerId] = offer;
    }

    function extractBalance() public onlyOwner nonReentrant {
        address payable me = payable(msg.sender);
        (bool success, ) = me.call{value: accumulatedCommission}("");
        require(success, "Transfer failed.");
        accumulatedCommission = 0;
    }
}
