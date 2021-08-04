const NFTItem = artifacts.require("Base1155");
const Engine = artifacts.require("Engine");
const helper = require('../utils/utils.js');

contract("Base1155 token", accounts => {

  var artist = accounts[2];
  const winner = accounts[3];
  const secondBuyer = accounts[4];
  const buyer = accounts[4];
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

  it("Should create 10 copies of token id 1", async () => {
    var createItemResponse = await instance.createItem(10, 200, "", { from: artist });
    assert.equal(createItemResponse.receipt.logs[0].args.id, 1);
  });


  it("Should create 30 copies of nft with tokenId 2", async () => {
    var createItemResponse = await instance.createItem(30, 300, "secretCode", { from: artist });
    assert.equal(createItemResponse.receipt.logs[0].args.id, 2);
  });

  it("Should show URL", async () => {
    const url2 = await instance.uri(2);
    //    console.log("The tokenURI is = " + url2);
    assert.equal(url2, "www.xsigma.fi/tokens/{id}.json");
  });

  it("Should show how many tokens of type 1 has the creator", async () => {
    const ownerResult = await instance.balanceOf(artist, 1);
    //    console.log("The owner is = " + ownerResult);
    assert.equal(ownerResult.toNumber(), 10);
  });

  it("should create an auction", async function () {
    // allow engine to transfer the nft
    await instance.setApprovalForAll(engine.address, true, { from: artist });
    // create auction for 3 units of the token 1
    await engine.createOffer(instance.address, 1, 3, true, true, web3.utils.toWei("10"), 0, 0, 10, { from: artist });

    let balance = await web3.eth.getBalance(engine.address);

    console.log("Balance contract created auction = " + web3.utils.fromWei(balance, 'ether'));
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
    console.log("Total offers now = " + await engine.getOffersCount() + " -- balance of artist =" + artistResult1);
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
    console.log("available items on offer #3 = " + offer.availableCopies);

    // the second buyer buys the token that previous buyer put on sale
    await engine.buy(3, 1, { from: secondBuyer, value: 15000 });

    offer = await engine.offers(3);
    console.log("available items on offer #3 after selling = " + offer.availableCopies);

    const ownerResult2 = await instance.balanceOf(winner, 1);
    const artistResult2 = await instance.balanceOf(artist, 1);
    const moneyAfter = await await web3.eth.getBalance(artist);
    console.log("Balance buyer before " + ownerResult1 + " -- balance buyer after " + ownerResult2);
    console.log("Balance artist before " + artistResult1 + " -- balance buyer after " + artistResult2 + " *** money before " + moneyBefore + " money after " + moneyAfter);
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
    console.log("There are " + offer.availableCopies + " items available on offer #2");
    await engine.buy(2, 1, { from: secondBuyer, value: 15000 });
    offer = await engine.offers(2);
    console.log("There are " + offer.availableCopies + " items available on offer #2");
  });

  /*
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
      let count = await engine.getOffersCount();
      console.log("Num offers=" + count);
    });
  
  
  
   /* it("should allow bids", async function () {
      await engine.bid(4, { from: accounts[1], value: 100000000000000 });
      // with this bid from account 2, the previous bid from account 1 is retreived. The amount will not coincide because of the gas fees
      await engine.bid(4, { from: accounts[9], value: 1120000000000000 });
      // check the best bid is the last one.
      var currentBid = await engine.getCurrentBidAmount(4);
      assert.equal(currentBid, 1120000000000000);
    });
  
    it("should reject bids lower than the current best bid", async function () {
      // check the current best bid
      var currentBid = await engine.getCurrentBidAmount(4);
      assert.equal(currentBid, 1120000000000000);
      // place a bid lower than best bid 
      try {
        await engine.bid(4, { from: accounts[3], value: 10000000000000 });
      }
      catch (error) { assert.equal(error.reason, "Bid too low"); }
      // check the best bid has not changed.
      var currentBid = await engine.getCurrentBidAmount(4);
      assert.equal(currentBid, 1120000000000000);
    });
  
    it("should NOT let get a winner before finished", async function () {
      try {
        var winner = await engine.getWinner(4);
      }
      catch (error) {
        assert.match(error, /Auction not finished yet/);
      }
    });
  
    it("should not let winner claim assets before finished", async function () {
      try {
        await engine.claimAsset(4, { from: accounts[9] });
      }
      catch (error) { assert.equal(error.reason, "The auction is still active"); }
    });
  
    it("should get winner when finished", async function () {
      let ahora1 = await engine.ahora();
      console.log("Ahora1 " + ahora1);
      await helper.advanceTimeAndBlock(20); // wait 20 seconds in the blockchain
      let ahora2 = await engine.ahora();
      console.log("Ahora2 " + ahora2);
      let end = await engine.getEndDate(4);
      console.log("Fin    " + end);
      let offer = await engine.offers(4);
      console.log("start  " + offer.startTime + " - duration = " + offer.duration);
      var winner = await engine.getWinner(4);
      assert.equal(winner, accounts[9]);
    });
  
    it("only the winner can claim assets", async function () {
      try {
        await engine.claimAsset(4, { from: accounts[1] });
      }
      catch (error) { assert.equal(error.reason, "You are not the winner of the auction"); }
    });
  
    it("should let winner claim assets", async function () {
      let balance = await web3.eth.getBalance(engine.address);
      console.log("Balance contract before claiming = " + web3.utils.fromWei(balance, 'ether'));
  
      let offer = await engine.offers(4);
  
      await engine.claimAsset(4, { from: accounts[9] });
  
      balance = await web3.eth.getBalance(engine.address);
      console.log("Balance contract after claiming = " + web3.utils.fromWei(balance, 'ether'));
    });
  
    it("should not let winner claim assets a second time", async function () {
      try {
        await engine.claimAsset(4, { from: accounts[9] });
      }
      catch (error) { assert.equal(error.reason, "You are not the winner of the auction"); }
    });
    /*
      it("should allow bids on open offers", async function () {
        await engine.bid(4, { from: accounts[1], value: 100000000000000 });   
        var currentBid = await engine.getCurrentBidAmount(4);
        console.log("Current bid = " + currentBid);
        assert.equal(currentBid, 100000000000000);
      });
    
      it("should allow bids and claims on open offers", async function () {
        await helper.advanceTimeAndBlock(20); // wait 20 seconds in the blockchain
        await engine.claimAsset(4, { from: accounts[1] });    
        
        await engine.bid(4, { from: accounts[1], value: 100000000000000 }); 
        await helper.advanceTimeAndBlock(20); // wait 20 seconds in the blockchain
        await engine.claimAsset(4, { from: accounts[1] });    
          
        await engine.bid(4, { from: accounts[1], value: 100000000000000 }); 
        await helper.advanceTimeAndBlock(20); // wait 20 seconds in the blockchain
        await engine.claimAsset(4, { from: accounts[1] });    
      });
    */

  /*  
  it("should not allow bids and claims on closed offers", async function () {
    try {
      await engine.bid(4, { from: accounts[1], value: 100000000000000 });
      await helper.advanceTimeAndBlock(20); // wait 20 seconds in the blockchain
      await engine.claimAsset(4, { from: accounts[1] });
    }
    catch (error) { assert.equal(error.reason, "Auction is not active"); }
  });
*/
  it("Should transfer funds to contract owner", async () => {
    let userBalanceB = await web3.eth.getBalance(accounts[8]);
    let value = await engine.extractBalance({ from: accounts[8] });
    let userBalanceA = await web3.eth.getBalance(accounts[8]);
    console.log("Balance before " + userBalanceB + " after " + userBalanceA);
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

    assert.equal(result.receipt.logs[0].args._index, 5);
  });

  it("Should create an auction and a bid", async () => {
    const result = await engine.createAuctionAndBid(5, 10, { from: buyer, value: 10000 });
    //  console.log(JSON.stringify(result));
    assert.equal(result.receipt.logs[0].args._index, 0);
  });

  it("Should create another auction and a bid", async () => {
    const result = await engine.createAuctionAndBid(5, 15, { from: buyer, value: 10000 });
    assert.equal(result.receipt.logs[0].args._index, 1);
    offer = await engine.offers(5);
    assert.equal(offer.availableCopies, 75);
  });

  it("Should bid on auction 0", async () => {

    const result = await engine.bid(0, { from: secondBuyer, value: 11000 });
  });

  it("Should bid on auction 1", async () => {
    const result = await engine.bid(1, { from: buyer, value: 11000 });
    offer = await engine.offers(5);
    assert.equal(offer.availableCopies, 75);
  });

  it("should not allow bids lower that best bid", async function () {
    try {
      await engine.bid(0, { from: secondBuyer, value: 10000 });
    }
    catch (error) {
      assert.equal(error.reason, "Price is not enough");
    }
  });

  it("should not allow bids and claims on closed offers", async function () {
    try {
      await helper.advanceTimeAndBlock(20); // wait 20 seconds in the blockchain
      await engine.bid(0, { from: secondBuyer, value: 100000000000000 });
    }
    catch (error) { assert.equal(error.reason, "Auction has ended"); }
  });

  it("Should failing creating an auction and a bid in a closed auction", async () => {
    try {
      const result = await engine.createAuctionAndBid(5, 10, { from: buyer, value: 10000 });
    }
    catch (error) { assert.equal(error.reason, "Auction has ended"); }
  });

  it("Should close auction 0", async () => {
    let auctionWinner = await engine.getWinner(0);
    let balance = await web3.eth.getBalance(artist);
    let amount = await instance.balanceOf(auctionWinner, 5);

    console.log("auction winner = " + auctionWinner + " - balance "+ balance + " tokens: " + amount);

    const result = await engine.closeAuction(0);

     balance = await web3.eth.getBalance(artist);
     amount = await instance.balanceOf(auctionWinner, 5);

     console.log("auction winner = " + auctionWinner + " - balance "+ balance + " tokens: " + amount);
    
    
   // console.log(JSON.stringify(result));
  });
});


