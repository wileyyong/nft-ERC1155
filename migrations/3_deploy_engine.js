var Engine = artifacts.require("Engine");

module.exports = async function(deployer) {
await deployer.deploy(Engine);
};