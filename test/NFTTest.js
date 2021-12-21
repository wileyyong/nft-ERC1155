const NFTItem = artifacts.require("Base1155");
const Engine = artifacts.require("Engine");
const helper = require('../utils/utils.js');

contract("Base1155 token", accounts => {

  var artist = accounts[2];
  const winner = accounts[3];
  const secondBuyer = accounts[4];
  const buyer = accounts[5];
  const thirdBuyer = accounts[6];
  var engine;
  var instance;

  before(async function () {
    // set contract instance into a variable
    engine = await Engine.new({ from: accounts[8] });
    instance = await NFTItem.new();
  })

  it("Should be deployed", async () => {
    assert.notEqual(instance, null);
  });

  it("Should show Imalive", async () => {
    var tokenId = await instance.owner();
    assert.notEqual(tokenId, null);
  });

  it("should allow changing the commission", async function () {
    await engine.setCommission(400, { from: accounts[8] });
  });

  it("Should create 10 copies of token id 1", async () => {
    var createItemResponse = await instance.createItem(10, 200, "", { from: artist });
    assert.equal(createItemResponse.receipt.logs[0].args.id, 1);
    let gasUsed = createItemResponse.receipt.gasUsed;
    console.log(`Total GasUsed on mint: ${gasUsed}`);
  });


  it("Should create 30 copies of nft with tokenId 2", async () => {
    var createItemResponse = await instance.createItem(30, 300, "secretCode", { from: artist });
    assert.equal(createItemResponse.receipt.logs[0].args.id, 2);
  });

  it("Should show URL", async () => {
    const url2 = await instance.uri(2);
    //    console.log("The tokenURI is = " + url2);
    assert.equal(url2, "https://beta.xsigma.ga/api/tokens/ERC1155MATIC/{id}.json");
  });

  it("Should show how many tokens of type 1 has the creator", async () => {
    const ownerResult = await instance.balanceOf(artist, 1);
    //    console.log("The owner is = " + ownerResult);
    assert.equal(ownerResult.toNumber(), 10);
  });

  it("should create an auction", async function () {
    // allow engine to transfer the nft
    await instance.setApprovalForAll(engine.address, true, { from: artist });
    // create offer allowing auctions for 3 units of the token 1
    await engine.createOffer(instance.address, 1, 3, true, true, web3.utils.toWei("10"), 0, 0, 10, { from: artist });

    let balance = await web3.eth.getBalance(engine.address);

  //  console.log("Balance contract created auction = " + web3.utils.fromWei(balance, 'ether'));
  });

  it("Should create an offer direct sale", async () => {
    //created a direct sale for 10 units of token 1, with a minimum price of 13000 weis
    const result = await engine.createOffer(instance.address, 1, 10, true, false, web3.utils.toWei("13"), 0, 0, 20, { from: artist });
  });

  it("Should not buy with less than minimum price", async () => {
    try {
      await engine.buy(1, 3, { from: winner, value: web3.utils.toWei("12") });
    }
    catch (error) { assert.equal(error.reason, "Price is not enough"); }
  });


  it("Should sell tokens several times", async () => {
    const moneyBefore = await await web3.eth.getBalance(artist);
    const ownerResult1 = await instance.balanceOf(winner, 1);
    const artistResult1 = await instance.balanceOf(artist, 1);
    // sell token from artist. Put 2 units for sale
    const result = await engine.createOffer(instance.address, 1, 2, true, false, 13000, 0, 0, 20, { from: artist });
    assert.equal(result.receipt.logs[0].args._index, 2);
 //   console.log("Total offers now = " + await engine.getOffersCount() + " -- balance of artist =" + artistResult1);
    // winner buy the token
    await engine.buy(2, 1, { from: winner, value: 14000 });
    // now the winner wants to put to sale the token he just bought
    await instance.setApprovalForAll(engine.address, true, { from: winner });
    // try to sell more tokens than he bought. This triggers an error
    try {
      const idOffer = await engine.createOffer(instance.address, 1, 2, true, false, 15000, 0, 0, 20, { from: winner });
    }
    catch (error) { assert.equal(error.reason, "You are trying to sale more nfts that the ones you have"); }

    // now put on sale the token bought
    const resultOffer = await engine.createOffer(instance.address, 1, 1, true, false, 15000, 0, 0, 20, { from: winner });
    assert.equal(resultOffer.receipt.logs[0].args._index, 3);
    let offer = await engine.offers(3);
 //   console.log("available items on offer #3 = " + offer.availableCopies);

    // the second buyer buys the token that previous buyer put on sale
    await engine.buy(3, 1, { from: secondBuyer, value: 15000 });

    offer = await engine.offers(3);
 //   console.log("available items on offer #3 after selling = " + offer.availableCopies);

    const ownerResult2 = await instance.balanceOf(winner, 1);
    const artistResult2 = await instance.balanceOf(artist, 1);
    const moneyAfter = await await web3.eth.getBalance(artist);
 //   console.log("Balance buyer before " + ownerResult1 + " -- balance buyer after " + ownerResult2);
 //   console.log("Balance artist before " + artistResult1 + " -- balance buyer after " + artistResult2 + " *** money before " + moneyBefore + " money after " + moneyAfter);
  });

  it("should fail if try to buy an item when all the copies has been sold", async function () {
    try {
      var offer = await engine.offers(3);
      //    console.log("Offer #3 " + JSON.stringify(offer));
      await engine.buy(3, 2, { from: secondBuyer, value: web3.utils.toWei("15000") });
    }
    catch (error) { assert.equal(error.reason, "NFT not in direct sale"); }
  });

  it("should let buy from offer even after some tokens has already been bought", async function () {
    let offer = await engine.offers(2);
    //  console.log(JSON.stringify(offer));

    let amount = await instance.balanceOf(secondBuyer, 1);
    assert.equal(amount.toNumber(), 1);

//    console.log("There are " + offer.availableCopies + " items available on offer #2");
receipt = await engine.buy(2, 1, { from: secondBuyer, value: 15000 });
let gasUsed = receipt.receipt.gasUsed;
console.log(`Total GasUsed on buy: ${gasUsed}`);
    offer = await engine.offers(2);
//    console.log("There are " + offer.availableCopies + " items available on offer #2");

    amount = await instance.balanceOf(secondBuyer, 1);
    assert.equal(amount.toNumber(), 2);
  });


  it("should fail if an auction is created by a not-owner", async function () {
    // make sure account[1] is owner of the book
    let amount = await instance.balanceOf(artist, 1);
    assert.equal(amount.toNumber(), 8);
    // allow engine to transfer the nft
    await instance.setApprovalForAll(engine.address, true, { from: artist });
    try {
      // create auction
      await engine.createOffer(instance.address, 1, 7, true, true, web3.utils.toWei("100000000000"), 0, 0, 10, { from: accounts[1] });
    }
    catch (error) { assert.equal(error.reason, "You are trying to sale more nfts that the ones you have"); }
  });

  it("should create an auction", async function () {
    let amount = await instance.balanceOf(artist, 1);
    assert.equal(amount.toNumber(), 8);
    // allow engine to transfer the nft
    // create auction
    let ahora = await engine.ahora();
    let resultOffer = await engine.createOffer(instance.address, 1, 4, true, true, web3.utils.toWei("100000000000"), 0, ahora, 10, { from: artist });
    assert.equal(resultOffer.receipt.logs[0].args._index, 4);
   // let count = await engine.getOffersCount();
   // console.log("Num offers=" + count);
  });


  it("Should transfer funds to contract owner", async () => {
    let userBalanceB = await web3.eth.getBalance(accounts[8]);
    let value = await engine.extractBalance({ from: accounts[8] });
    let userBalanceA = await web3.eth.getBalance(accounts[8]);
 //   console.log("Balance before " + userBalanceB + " after " + userBalanceA);
  });

  it("calc of gas for minting", async function () {
    let ahora = await engine.ahora();
    var receipt = await instance.createItem(10, 200, "", { from: artist });
    let gasUsed = receipt.receipt.gasUsed;
    //   console.log(`GasUsed: ${receipt.receipt.gasUsed}`);
    receipt = await instance.setApprovalForAll(engine.address, true, { from: artist });
    //   console.log(`GasUsed: ${receipt.receipt.gasUsed}`);
    gasUsed += receipt.receipt.gasUsed;

    //receipt = await engine.addTokenToMarketplace(instance.address, 3, 200, "", { from: artist });
    //   console.log(`GasUsed: ${receipt.receipt.gasUsed}`);
    //gasUsed += receipt.receipt.gasUsed;

    receipt = await engine.createOffer(instance.address, 3, 2, true, true, web3.utils.toWei("100000000000"), 0, ahora, 10, { from: artist });
    //   console.log(`GasUsed: ${receipt.receipt.gasUsed}`);
    gasUsed += receipt.receipt.gasUsed;
    console.log(`Total GasUsed on create: ${gasUsed}`);
  });

  it("should fail if a person who is not the owner tries to add to the marketplace the token", async function () {
    var receipt = await instance.createItem(10, 200, "", { from: artist });
    receipt = await instance.setApprovalForAll(engine.address, true, { from: artist });
    try {
      // receipt = await engine.addTokenToMarketplace(instance.address, 4, 200, "", { from: winner });
    } catch (error) { assert.equal(error.reason, "Not nft creator"); }
  });


  it("Should create 100 copies of token id 5", async () => {
    var createItemResponse = await instance.createItem(100, 1000, "", { from: artist });
    assert.equal(createItemResponse.receipt.logs[0].args.id, 5);
  });

  it("Should create an offer with auctions", async () => {
    let ahora = await engine.ahora();
    const result = await engine.createOffer(instance.address, 5, 100, true, true, 1000, 0, ahora, 20, { from: artist });

    assert.equal(result.receipt.logs[0].args._index, 6);
  });

  it("Should create an auction and a bid", async () => {
    const result = await engine.createAuctionAndBid(6, 10, { from: buyer, value: 10000 });
    //  console.log(JSON.stringify(result));
    assert.equal(result.receipt.logs[0].args._index, 0);
  });

  it("Should fail when create another auction and a bid", async () => {
    try {
      const result = await engine.createAuctionAndBid(6, 15, { from: buyer, value: 10000 });
      assert.equal(result.receipt.logs[0].args._index, 1);
    }
    catch (error) {
      assert.equal(error.reason, "not active auction");
    }
  });

  it("Should bid on auction 0", async () => {
    auction = await engine.auctions(0);
  //  console.log(JSON.stringify(auction))
    const result = await engine.bid(0, 15, { from: secondBuyer, value: 11000 });

    const amount = await instance.balanceOf(secondBuyer, 1);
    assert.equal(amount.toNumber(), 2); // tokes not transferred until the auction closes
  });

  it("Should bid other person again on auction 0", async () => {
    
    auction = await engine.auctions(0);
    offer = await engine.offers(auction.offerId);
    console.log("********** available=" + offer.availableCopies + " -- auction.numCopies="+ auction.numCopies + " result="+ (offer.availableCopies-(auction.numCopies)) + " offerId="+ auction.offerId);
  
    const result = await engine.bid(0, 15,{ from: thirdBuyer, value: 12000 });

    auction = await engine.auctions(0);
    offer = await engine.offers(auction.offerId);
    console.log("********** available=" + offer.availableCopies + " -- auction.numCopies="+ auction.numCopies + " result="+ (offer.availableCopies-(auction.numCopies)) + " offerId="+ auction.offerId);
  
    assert.equal(offer.availableCopies.toNumber(), 85);
  });

  it("Should update avaliable count if the bid is for more units", async () => {
    offer = await engine.offers(6);
    console.log(JSON.stringify(offer))
    const result = await engine.bid(0, 16,{ from: secondBuyer, value: 22000 });
    offer2 = await engine.offers(6);
    console.log(JSON.stringify(offer2))
    assert.equal(offer2.availableCopies, offer.availableCopies - 1);
  });

  it("should not allow bids lower than the minimum bid", async function () {
    try {
      const result = await engine.bid(0, 16,{ from: thirdBuyer, value: 22001 });
    }
    catch (error) {
      assert.equal(error.reason, "Price is not enough");
    }
  });

  it("should not allow bids lower that best bid", async function () {
    try {
      await engine.bid(0, 15, { from: secondBuyer, value: 10000 });
    }
    catch (error) {
      assert.equal(error.reason, "Price not enough");
    }
  });

  it("should not allow bids and claims on closed offers", async function () {
    try {
      await helper.advanceTimeAndBlock(20); // wait 20 seconds in the blockchain
      await engine.bid(0, 15,{ from: secondBuyer, value: 100000000000000 });
    }
    catch (error) { assert.equal(error.reason, "Auction has ended"); }
  });

  it("Should failing creating an auction and a bid in a finished auction before the closing", async () => {
    try {
      offer = await engine.offers(6);
      //  console.log(JSON.stringify(offer))
      const result = await engine.createAuctionAndBid(6, 10, { from: buyer, value: 10000 });
    }
    catch (error) { assert.equal(error.reason, "not active auction"); }
  });

  it("Should close auction 0. Anyone can close the auction", async () => {
    auction = await engine.auctions(0);
   // console.log(JSON.stringify(auction))

    let auctionWinner = await engine.getWinner(0);
    let balance = await web3.eth.getBalance(artist);
    let amountIni = await instance.balanceOf(auctionWinner, 5);

  //  console.log("auction winner = " + auctionWinner + " - balance " + balance + " tokens: " + amountIni);

    const result = await engine.closeAuction(0,{ from: accounts[9]});

    balance = await web3.eth.getBalance(artist);
    amountEnd = await instance.balanceOf(auctionWinner, 5);

    console.log("auction winner = " + auctionWinner + " - balance " + balance + " tokens: " + amountEnd);

    assert.equal(amountEnd.toNumber(), amountIni.toNumber() + auction.numCopies.toNumber(), "tokens not transferred")
  });

  it("Should create a new auction and a bid once the previous auction on the offer was closed", async () => {
    offer = await engine.offers(6);
 //   console.log(JSON.stringify(offer))
    const result = await engine.createAuctionAndBid(6, 10, { from: buyer, value: 10000 });
    assert.equal(result.receipt.logs[0].args._index, 1);
  });

  it("Should bid on auction 1", async () => {
    auction = await engine.auctions(1);
    //   console.log(JSON.stringify(auction))
    const result = await engine.bid(1, auction.numCopies, { from: secondBuyer, value: 11000 });
  });

  it("Should bid again on auction 1", async () => {
    offer = await engine.offers(6);
    //   console.log(JSON.stringify(offer))
    const result = await engine.bid(1, auction.numCopies,{ from: thirdBuyer, value: 12000 });
    offer2 = await engine.offers(6);
    assert.equal(offer2.availableCopies.toNumber(), offer.availableCopies.toNumber());
  });


  it("Should create an offer (#7) with auctions for a resale", async () => {
    let ahora = await engine.ahora();
    const amount = await instance.balanceOf(secondBuyer, 1);
    assert.equal(amount.toNumber(), 2);

    await instance.setApprovalForAll(engine.address, true, { from: secondBuyer });
    const result = await engine.createOffer(instance.address, 1, 2, true, true, 1000, 1000, ahora, 20, { from: secondBuyer });
    assert.equal(result.receipt.logs[0].args._index, 7);
    offer = await engine.offers(7);
    assert.equal(offer.availableCopies, 2);
  });

  it("Should fail creating an auction and a bid for a resale with more copies than the one available", async () => {
    try {
      const result = await engine.createAuctionAndBid(7, 8, { from: buyer, value: 8000 });
    }
    catch (error) { assert.equal(error.reason, "Not enough copies available"); }   
  });

  it("Should show if an offer hasBids ==false when there is not an auction", async () => {
    const result = await engine.hasBids(7);
  //  console.log("hasBids" + result)
    assert.notEqual(result, "false");
  });


  it("Should create an auction and a bid for a resale", async () => {
    const result = await engine.createAuctionAndBid(7, 1, { from: buyer, value: 1000 });
    assert.equal(result.receipt.logs[0].args._index, 2);
    offer = await engine.offers(7);
    assert.equal(offer.availableCopies, 1);
  });

  it("Should show if an offer has bids when there is an auction", async () => {
    const result = await engine.hasBids(7);
 //   console.log("hasBids" + result)
    assert.notEqual(result, "true");
  });


  it("Should bid on auction 2 (resale)", async () => {
    let auction = await engine.auctions(2);
    let offer = await engine.offers(auction.offerId);
    console.log("Valor=" + auction.numCopies-auction.numCopies+offer.availableCopies);
    console.log("********** available=" + offer.availableCopies + " -- auction.numCopies="+ auction.numCopies + " result="+ (offer.availableCopies+auction.numCopies-auction.numCopies ));

    console.log(JSON.stringify(auction));
    console.log(JSON.stringify(offer));
    const result = await engine.bid(2, 1  , { from: secondBuyer, value: 1001 });
  });

  it("Should bid on auction 2 a higher amount (resale)", async () => {
    let auction = await engine.auctions(2);
    let offer = await engine.offers(auction.offerId);
    console.log("Valor=" + auction.numCopies-auction.numCopies+offer.availableCopies);
    console.log("********** available=" + offer.availableCopies + " -- auction.numCopies="+ auction.numCopies + " result="+ (offer.availableCopies+auction.numCopies-auction.numCopies ));

 //   console.log(JSON.stringify(auction));
 //   console.log(JSON.stringify(offer));
    const result = await engine.bid(2, 2  , { from: winner, value: 11000 });
  });

  it("Should close auction 2", async () => {
    await helper.advanceTimeAndBlock(20); // wait 20 seconds in the blockchain

    let winnerAuction = await engine.getWinner(2);
    assert(winnerAuction, winner);

    balanceArtistBefore = await web3.eth.getBalance(artist);
    amountTokensOwnerBefore = await instance.balanceOf(secondBuyer, 5);
    amountTokensWinnerBefore = await instance.balanceOf(winner, 5);

    //   await instance.setApprovalForAll(engine.address, true, { from: secondBuyer });
    balanceOwnerBefore = await web3.eth.getBalance(secondBuyer);

    await engine.closeAuction(2,{ from: accounts[8]});
    
    let auction = await engine.auctions(2);
    let offer = await engine.offers(auction.offerId);
    assert.equal(offer.hasBids, false);    

    let hasBids = await engine.hasBids(auction.offerId);
    assert.equal(offer.hasBids, false);   

    balance = await web3.eth.getBalance(artist);
    amountTokensWinnerAfter = await instance.balanceOf(winner, 5);
    amountTokensOwner = await instance.balanceOf(secondBuyer, 5);
    balanceOwner = await web3.eth.getBalance(secondBuyer);

    assert(amountTokensWinnerAfter, auction.amount); // should be 8 tokens the transferred
    assert(web3.utils.toBN(balance).sub(web3.utils.toBN(balanceArtistBefore)), 1100); // the royalties must be 10% of 11000 so 1100
    assert(web3.utils.toBN(balanceOwner).sub(web3.utils.toBN(balanceOwnerBefore)), 9900); // as marketplace fee is 0%, what owner gets is 11000 - royalties, so 9900

 //   console.log("royalties paid " + (web3.utils.toBN(balance).sub(web3.utils.toBN(balanceArtistBefore))));
 //   console.log("Balance Owner diff " + web3.utils.toBN(balanceOwner).sub(web3.utils.toBN(balanceOwnerBefore)));
    //   console.log(JSON.stringify(result));
  });

  it("Should fail buying when available count = 0", async () => {
    try {
      await engine.buy(7, 1, { from: buyer, value: 8000 });
    }
    catch (error) { assert.equal(error.reason, "Not enough copies available"); }   
    
  });

  it("Should allow buying in an offer as long the available count >= 0", async () => {
    offer = await engine.offers(6);
   // console.log(JSON.stringify(offer));
    assert.equal(offer.availableCopies.toNumber(), 74);
    amountTokensOwner = await instance.balanceOf(offer.creator, 5);
//    console.log("amountTokensOwner " + amountTokensOwner.toNumber())
    let balanceIni = await web3.eth.getBalance(offer.creator);
    let accumulatedCommisionsBefore  = await engine.accumulatedCommission.call();
    console.log("offer Comm before=" + web3.utils.fromWei(accumulatedCommisionsBefore));

    const result = await engine.buy(6, 1, { from: buyer, value: web3.utils.toWei('1', 'ether') });

    let balanceEnd = await web3.eth.getBalance(offer.creator);
 //   console.log(" Balance bidder after " + balanceIni + " -- balance bidder with returning funds " + balanceEnd);
  
    let accumulatedCommisions = await engine.accumulatedCommission.call();
    console.log("offer Comm=" + web3.utils.fromWei(accumulatedCommisions));

    offer = await engine.offers(6);
    assert.equal(offer.availableCopies.toNumber(), 73);
  });

  it("Should update total sales", async () => {
    const result = await engine.totalSales.call();
  //  console.log("Total sales " + result)
    assert.notEqual(result, 0);
  });

  it("Should fail closing two times an auction", async () => {
    try {
      const result = await engine.closeAuction(2, { from: accounts[8] });
    }
    catch (error) {
      assert.equal(error.reason, "Auction not active");
    }
  });

  it("Should create 2 copies of nft with tokenId 6", async () => {
    var createItemResponse = await instance.createItem(2, 0, "", { from: artist });
    assert.equal(createItemResponse.receipt.logs[0].args.id, 6);
  });
  
  it("should create an auction and run the flow buying the last copy while there is an active auction", async function () {
    let result = await engine.createOffer(instance.address, 6, 2, true, true, 10000, 0, 0, 10, { from: artist });
    assert.equal(result.receipt.logs[0].args._index, 8);
    
    result = await engine.createAuctionAndBid(8, 1, { from: buyer, value: 10000 });
    assert.equal(result.receipt.logs[0].args._index, 3);
   
    let offer = await engine.offers(8);

    await engine.buy(8, 1, { from: buyer, value: 10000 });

    await helper.advanceTimeAndBlock(20); 

    // check close auction works
    await engine.closeAuction(3,{ from: artist});   
  }); 
  

  it("Should transfer funds to contract owner again", async () => {
    let userBalanceB = await web3.eth.getBalance(accounts[8]);
    let value = await engine.extractBalance({ from: accounts[8] });
    let userBalanceA = await web3.eth.getBalance(accounts[8]);
    console.log("Balance before " + userBalanceB + " after " + userBalanceA);
  });

});


