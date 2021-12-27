var Base1155 = artifacts.require("Base1155");
//var Engine = artifacts.require("Engine");

module.exports = async function(deployer) {
//await deployer.deploy(Engine);
    await deployer.deploy(Base1155);
};