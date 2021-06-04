require('dotenv').config();
const express= require('express')
const app =express()
const Web3 = require('web3');

const contract = require('truffle-contract');
const artifacts = require('./build/NTFDemo.json');
app.use(express.json())
if (typeof web3 !== 'undefined') {
    var web3 = new Web3(web3.currentProvider)
  } else {
    var web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
}
const LMS = contract(artifacts)
LMS.setProvider(web3.currentProvider);
    
async function getCuentas() {
    const accounts = await web3.eth.getAccounts();
    console.log("Cuenta "+ accounts[0]);
   // const lms = await LMS.deployed();
    const instance = await LMS.at("0x413fb28283095a0d4481eae458922aaa697b02ae");// for remote nodes deployed on ropsten or rinkeby
//console.log(instance);
    var owner = accounts[0];
    var receipt = await instance.createItem(owner, "www.luispando.com", 1000, {from: owner});
 //   console.log(JSON.stringify(receipt));
    let url = await instance.tokenURI(receipt.logs[0].args.tokenId);
       console.log("The tokenURI " + receipt.logs[0].args.tokenId +" is = " + url);
}

getCuentas();