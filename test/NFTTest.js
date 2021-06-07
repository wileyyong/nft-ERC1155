const NFTItem = artifacts.require("Base1155");
const Engine = artifacts.require("Engine");
const helper = require('../utils/utils.js');

contract("Base1155 token", accounts => {

  var artist = accounts[2];
  const winner = accounts[3];
  const secondBuyer = accounts[4];
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

  it("Should create nft", async () => {
    var tokenId = await instance.createItem(10, 200, { from: artist });
    engine.addTokenToMarketplace(instance.address, 1, 200);
    //  console.log("The tokenId is = " + JSON.stringify(tokenId));
    assert.notEqual(tokenId, null);
  });

  it("Should create 2nd nft", async () => {
    var tokenId = await instance.createItem(30, 5, { from: artist });
    engine.addTokenToMarketplace(instance.address, 2, 300);
    //   console.log("The tokenId is = " + JSON.stringify(tokenId));
    assert.notEqual(tokenId, null);
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
    await engine.createOffer(instance.address, 1, 3, true, true, web3.utils.toWei("1000000"), 0, 0, 10, { from: artist });

    let balance = await web3.eth.getBalance(engine.address);
    console.log("Balance contract created auction = " + web3.utils.fromWei(balance, 'ether'));

  });

  it("Should create an offer direct sale", async () => {
    //created a direct sale for 2 units of token 1, with a minimum price of 13000 weis
    const result = await engine.createOffer(instance.address, 1, 2, true, false, 13000, 0, 0, 20, { from: artist });
  });

  it("Should not buy with less than minimum price", async () => {
    try {
      await engine.buy(1, { from: winner, value: 12000 });
    }
    catch (error) { assert.equal(error.reason, "Price is not enough"); }
  });


  it("Should sell tokens several times", async () => {
    const moneyBefore = await await web3.eth.getBalance(artist);
    const ownerResult1 = await instance.balanceOf(winner, 1);
    const artistResult1 = await instance.balanceOf(artist, 1);
    // sell token from artist
    const result = await engine.createOffer(instance.address, 1, 2, true, false, 13000, 0, 0, 20, { from: artist });
    // winner buy the token
    await engine.buy(1, { from: winner, value: 14000 });
    // now the winner wants to put to sale the token he just bought
    await instance.setApprovalForAll(engine.address, true, { from: winner });
    const idOffer = await engine.createOffer(instance.address, 1, 2, true, false, 15000, 0, 0, 20, { from: winner });

    const offer = await engine.offers(2);
    await engine.buy(2, { from: secondBuyer, value: 15000 });

    const ownerResult2 = await instance.balanceOf(winner, 1);
    const artistResult2 = await instance.balanceOf(artist, 1);
    const moneyAfter = await await web3.eth.getBalance(artist);
    console.log("Balance buyer before " + ownerResult1 + " -- balance buyer after " + ownerResult2);
    console.log("Balance artist before " + artistResult1 + " -- balance buyer after " + artistResult2 + " *** money before " + moneyBefore + " money after " + moneyAfter);

  });

  it("Should show tokens", async () => {
    const item = await engine.tokens(1);
    // var obj = JSON.parse(item);
        console.log("The tokens price are = " + JSON.stringify(item));
    const item2 = await engine.tokens(2);
    //    console.log("The token 2 are = " + item2.price);
    assert.equal(item.royalties, 200);
  });

  it("should fail if an auction is created by a not-owner", async function () {
    // make sure account[1] is owner of the book
    let amount = await instance.balanceOf(artist, 1);
    assert.equal(amount.toNumber(), 6);
    // allow engine to transfer the nft
    await instance.setApprovalForAll(engine.address, true, { from: artist });
    try {
      // create auction
      await engine.createOffer(instance.address, 1, 7, true, true, 100000000000, 0, 0, 10, { from: accounts[1] });
    }
    catch (error) { assert.equal(error.reason, "You are trying to sale more nfts that the ones you have"); }

  });

  it("should create an auction", async function () {
    let amount = await instance.balanceOf(artist, 1);
    assert.equal(amount.toNumber(), 6);
    // allow engine to transfer the nft
    // create auction
    let ahora = await engine.ahora();
    await engine.createOffer(instance.address, 1, 4, true, true, 100000000000, 0, ahora, 10, { from: artist });
    let count = await engine.getOffersCount();
    console.log("Num offers=" + count);
  });

  it("should allow bids", async function () {
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
    console.log(JSON.stringify(offer));

    await engine.claimAsset(4, { from: accounts[9] });

    balance = await web3.eth.getBalance(engine.address);
    console.log("Balance contract after claiming = " + web3.utils.fromWei(balance, 'ether'));
  });

  it("should not let winner claim assets a second time", async function () {
    try {
      await engine.claimAsset(4, { from: accounts[9] });
    }
    catch (error) { assert.equal(error.reason, "NFT not in auction"); }
  });

  it("Should transfer funds to contract owner", async () => {
    let userBalanceB = await web3.eth.getBalance(accounts[8]);
    let auctionId = await engine.extractBalance({ from: accounts[8] });
    let userBalanceA = await web3.eth.getBalance(accounts[8]);
    console.log("Balance before " + userBalanceB + " after " + userBalanceA);
  });

});

