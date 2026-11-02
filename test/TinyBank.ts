import hre from "hardhat";
import { expect } from "chai";
import { DECIMALS, MINTING_AMOUNT } from "./constant";
import { MyToken, TinyBank } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TinyBank", () => {
  let signers: HardhatEthersSigner[];
  let myTokenC: MyToken;
  let tinyBankC: TinyBank;

  beforeEach(async () => {
    signers = await hre.ethers.getSigners();
    myTokenC = await hre.ethers.deployContract("MyToken", [
      "MyToken",
      "MT",
      DECIMALS,
      MINTING_AMOUNT,
    ]);

    tinyBankC = await hre.ethers.deployContract("TinyBank", [
      await myTokenC.getAddress(),
      [signers[0].address, signers[1].address, signers[2].address],
    ]);
    await myTokenC.setManager(tinyBankC.getAddress());
  });

  describe("Initialized state check", () => {
    it("should return totalStaked 0", async () => {
      expect(await tinyBankC.totalStaked()).equal(0);
    });

    it("should return staked 0 amount of signer0", async () => {
      const signer0 = signers[0];
      expect(await tinyBankC.staked(signer0.address)).equal(0);
    });
  });

  describe("Staking", async () => {
    it("should return staked amount", async () => {
      const signer0 = signers[0];
      const stakingAmount = hre.ethers.parseUnits("50", DECIMALS);

      await myTokenC.approve(await tinyBankC.getAddress(), stakingAmount);
      await tinyBankC.stake(stakingAmount);

      expect(await tinyBankC.staked(signer0.address)).equal(stakingAmount);
      expect(await tinyBankC.totalStaked()).equal(stakingAmount);
      expect(await myTokenC.balanceOf(tinyBankC)).equal(
        await tinyBankC.totalStaked(),
      );
    });
  });
  describe("Withdraw", () => {
    it("should return 0 staked after withdrawing total token", async () => {
      const signer0 = signers[0];
      const stakingAmount = hre.ethers.parseUnits("50", DECIMALS);
      await myTokenC.approve(await tinyBankC.getAddress(), stakingAmount);
      await tinyBankC.stake(stakingAmount);
      await tinyBankC.withdraw(stakingAmount);
      expect(await tinyBankC.staked(signer0.address)).equal(0);
    });
  });

  describe("reward", () => {
    it("should reward 1MT every blocks", async () => {
      const signer0 = signers[0];
      const stakingAmount = hre.ethers.parseUnits("50", DECIMALS);
      await myTokenC.approve(await tinyBankC.getAddress(), stakingAmount);
      await tinyBankC.stake(stakingAmount);

      const BLOCKS = 5n;
      const transferAmount = hre.ethers.parseUnits("1", DECIMALS);
      for (var i = 0; i < BLOCKS; i++) {
        await myTokenC.transfer(transferAmount, signer0.address);
      }

      await tinyBankC.withdraw(stakingAmount);
      expect(await myTokenC.balanceOf(signer0.address)).equal(
        hre.ethers.parseUnits((BLOCKS + MINTING_AMOUNT + 1n).toString()),
      );
    });

    describe("Multi Manager", () => {
      it("should reject a non-manager", async () => {
        const hacker = signers[3];
        const amount = hre.ethers.parseUnits("2", DECIMALS);

        await expect(tinyBankC.connect(hacker).confirm()).to.be.revertedWith(
          "You are not a manager",
        );

        await expect(
          tinyBankC.connect(hacker).setRewardPerBlock(amount),
        ).to.be.revertedWith("You are not a manager");
      });

      it("should reject when not all managers confirmed", async () => {
        const amount = hre.ethers.parseUnits("2", DECIMALS);

        await tinyBankC.connect(signers[0]).confirm();
        await tinyBankC.connect(signers[1]).confirm();

        await tinyBankC.connect(signers[1]).confirm();

        await expect(
          tinyBankC.connect(signers[0]).setRewardPerBlock(amount),
        ).to.be.revertedWith("Not all confirmed yet");
      });

      it("should change reward after all managers confirmed and reset confirmations", async () => {
        const amount = hre.ethers.parseUnits("2", DECIMALS);

        for (const manager of signers.slice(0, 3)) {
          await tinyBankC.connect(manager).confirm();
        }

        await tinyBankC.connect(signers[0]).setRewardPerBlock(amount);

        expect(await tinyBankC.rewardPerBlock()).equal(amount);

        for (const manager of signers.slice(0, 3)) {
          expect(await tinyBankC.confirmed(manager.address)).equal(false);
        }

        await expect(
          tinyBankC.connect(signers[0]).setRewardPerBlock(amount),
        ).to.be.revertedWith("Not all confirmed yet");
      });
    });
  });
});
