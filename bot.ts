// src/bot.ts - Complete Flash Loan Arbitrage Bot for 0.001 ETH Balance

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import logger, { logTrade, logOpportunity, logScan, logError, logSuccess, logInfo, logWarning } from './utils/logger';
import { TradeLogger, TradeRecord } from './utils/tradeLogger';

dotenv.config();

// ============ YOUR CONTRACT CONFIGURATION ============
const YOUR_CONTRACT_ADDRESS = '0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0';

// ============ ULTRA-LOW CAPITAL CONFIGURATION ============
const MIN_BALANCE_ETH = '0.001'; // Minimum 0.001 ETH
const MAX_GAS_PER_TX = '0.0003'; // Max gas per transaction
const MIN_PROFIT_PERCENT = 0.15; // 0.15% minimum profit
const GAS_SAFETY_BUFFER = 0.0002; // Safety buffer

// ============ INTERFACES ============
interface ChainConfig {
    name: string;
    rpcHttp: string;
    rpcWss: string;
    chainId: number;
    gasToken: string;
    dexes: DEXConfig[];
    tokens: TokenConfig[];
    maxGasPrice: bigint;
    minBalance: string;
}

interface DEXConfig {
    name: string;
    router: string;
    factory: string;
}

interface TokenConfig {
    symbol: string;
    address: string;
    decimals: number;
}

interface Opportunity {
    id: string;
    tokenA: TokenConfig;
    tokenB: TokenConfig;
    buyDex: string;
    sellDex: string;
    buyDexName: string;
    sellDexName: string;
    buyPrice: number;
    sellPrice: number;
    profitPercent: number;
    estimatedProfit: bigint;
    gasEstimate: bigint;
    netProfit: bigint;
    borrowAmount: bigint;
    timestamp: number;
    pairBorrow: string;
}

// ============ CHAIN CONFIGURATIONS ============

const POLYGON_CONFIG: ChainConfig = {
    name: 'Polygon',
    rpcHttp: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    rpcWss: process.env.POLYGON_WSS || 'wss://polygon-bor.publicnode.com',
    chainId: 137,
    gasToken: 'MATIC',
    maxGasPrice: ethers.parseUnits('50', 'gwei'),
    minBalance: '0.5',
    
    dexes: [
        {
            name: 'QuickSwap',
            router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
            factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32'
        },
        {
            name: 'SushiSwap',
            router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'
        },
        {
            name: 'ApeSwap',
            router: '0xC0788A3aD43d79aa53B09c2EaCc313A787d1d607',
            factory: '0xCf083Be4164828f00cAE704EC15a36D711491284'
        }
    ],
    
    tokens: [
        { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
        { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
        { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
        { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
        { symbol: 'DAI', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 }
    ]
};

const BSC_CONFIG: ChainConfig = {
    name: 'BSC',
    rpcHttp: process.env.BSC_RPC || 'https://bsc-dataseed1.binance.org',
    rpcWss: process.env.BSC_WSS || 'wss://bsc-ws-node.nariox.org',
    chainId: 56,
    gasToken: 'BNB',
    maxGasPrice: ethers.parseUnits('3', 'gwei'),
    minBalance: '0.002',
    
    dexes: [
        {
            name: 'PancakeSwap',
            router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
            factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'
        },
        {
            name: 'BiSwap',
            router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
            factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE'
        },
        {
            name: 'ApeSwap',
            router: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7',
            factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6'
        }
    ],
    
    tokens: [
        { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
        { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
        { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
        { symbol: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 }
    ]
};

const ARBITRUM_CONFIG: ChainConfig = {
    name: 'Arbitrum',
    rpcHttp: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    rpcWss: process.env.ARBITRUM_WSS || 'wss://arb1.arbitrum.io/ws',
    chainId: 42161,
    gasToken: 'ETH',
    maxGasPrice: ethers.parseUnits('0.1', 'gwei'),
    minBalance: '0.001',
    
    dexes: [
        {
            name: 'SushiSwap',
            router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'
        },
        {
            name: 'Camelot',
            router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
            factory: '0x6EcCab422D763aC031210895C81787E87B43A652'
        }
    ],
    
    tokens: [
        { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
        { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
        { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
        { symbol: 'DAI', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 }
    ]
};

// ============ BOT CLASS ============
class FlashLoanArbitrageBot {
    private provider: ethers.JsonRpcProvider;
    private wsProvider: ethers.WebSocketProvider;
    private wallet: ethers.Wallet;
    private config: ChainConfig;
    private contract: ethers.Contract;
    private tradeLogger: TradeLogger;
    
    private isRunning: boolean = false;
    private scanCount: number = 0;
    private lastBlockScanned: number = 0;
    private opportunitiesFound: number = 0;
    private lowBalanceWarningShown: boolean = false;
    
    private readonly CONTRACT_ABI = [
        'function executeArbitrage(address pairBorrow, uint256 amountToBorrow, address tokenBorrow, address routerBuy, address routerSell, address[] calldata pathBuy, address[] calldata pathSell) external',
        'function owner() external view returns (address)',
        'function paused() external view returns (bool)',
        'event ArbitrageExecuted(address indexed tokenBorrowed, uint256 amount, uint256 profit, address dexBuy, address dexSell)'
    ];
    
    private readonly ROUTER_ABI = [
        'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'
    ];
    
    private readonly FACTORY_ABI = [
        'function getPair(address tokenA, address tokenB) external view returns (address pair)'
    ];
    
    constructor(config: ChainConfig, privateKey: string) {
        this.config = config;
        this.provider = new ethers.JsonRpcProvider(config.rpcHttp);
        this.wsProvider = new ethers.WebSocketProvider(config.rpcWss);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.contract = new ethers.Contract(YOUR_CONTRACT_ADDRESS, this.CONTRACT_ABI, this.wallet);
        this.tradeLogger = new TradeLogger();
        
        logInfo('🤖 Bot initialized for ULTRA-LOW capital operations', {
            chain: config.name,
            contract: YOUR_CONTRACT_ADDRESS,
            wallet: this.wallet.address
        });
    }
    
    async start(): Promise<void> {
        console.log(chalk.cyan('═'.repeat(80)));
        console.log(chalk.cyan.bold('   🚀 FLASH LOAN ARBITRAGE BOT - 0.001 ETH MINIMUM BALANCE'));
        console.log(chalk.cyan('═'.repeat(80)));
        console.log(chalk.blue(`📍 Chain: ${this.config.name}`));
        console.log(chalk.blue(`📝 Contract: ${YOUR_CONTRACT_ADDRESS}`));
        console.log(chalk.blue(`👛 Wallet: ${this.wallet.address}`));
        console.log(chalk.green(`💰 Min Balance: ${this.config.minBalance} ${this.config.gasToken}`));
        console.log(chalk.green(`⛽ Max Gas/TX: ${MAX_GAS_PER_TX} ${this.config.gasToken}`));
        console.log(chalk.green(`📊 Min Profit: ${MIN_PROFIT_PERCENT}%`));
        console.log(chalk.blue(`🔄 DEXes: ${this.config.dexes.map(d => d.name).join(', ')}`));
        console.log(chalk.cyan('═'.repeat(80)));
        
        await this.verifySetup();
        
        this.isRunning = true;
        
        console.log(chalk.green('\n✅ Bot LIVE - Ultra-Low Capital Mode!\n'));
        console.log(chalk.yellow('📊 All trades logged to ./logs/\n'));
        console.log(chalk.gray('Press Ctrl+C to stop\n'));
        
        this.scanContinuously();
        
        this.wsProvider.on('block', async (blockNumber) => {
            if (!this.isRunning) return;
            await this.scanBlock(blockNumber);
        });
        
        this.contract.on('ArbitrageExecuted', (tokenBorrowed, amount, profit, dexBuy, dexSell, event) => {
            const profitFormatted = ethers.formatEther(profit);
            
            logSuccess('💰 PROFIT! Arbitrage executed!', {
                profit: profitFormatted,
                txHash: event.log.transactionHash,
                blockNumber: event.log.blockNumber
            });
            
            console.log(chalk.green.bold(`\n${'*'.repeat(80)}`));
            console.log(chalk.green.bold(`💰💰💰 PROFIT! +${profitFormatted} ${this.config.gasToken} 💰💰💰`));
            console.log(chalk.green.bold(`${'*'.repeat(80)}`));
            console.log(chalk.green(`TX: ${event.log.transactionHash}\n`));
        });
        
        setInterval(async () => await this.checkBalance(), 60000);
        setInterval(() => this.tradeLogger.printStatistics(), 5 * 60 * 1000);
        setInterval(() => {
            const stats = this.tradeLogger.getStatistics();
            console.log(chalk.gray(`\n📊 Scans: ${this.scanCount} | Opps: ${this.opportunitiesFound} | Trades: ${stats.totalTrades} | Success: ${stats.successRate}%`));
        }, 30000);
    }
    
    private async checkBalance(): Promise<boolean> {
        const balance = await this.provider.getBalance(this.wallet.address);
        const balanceFormatted = ethers.formatEther(balance);
        const minBalance = ethers.parseEther(this.config.minBalance);
        
        if (balance < minBalance) {
            if (!this.lowBalanceWarningShown) {
                console.log(chalk.red.bold(`\n⚠️  WARNING: Balance too low!`));
                console.log(chalk.red(`Current: ${balanceFormatted} ${this.config.gasToken}`));
                console.log(chalk.red(`Minimum: ${this.config.minBalance} ${this.config.gasToken}`));
                console.log(chalk.yellow(`\nDeposit to: ${this.wallet.address}\n`));
                
                logWarning('⚠️ Balance below minimum', {
                    currentBalance: balanceFormatted,
                    minimumBalance: this.config.minBalance
                });
                
                this.lowBalanceWarningShown = true;
            }
            return false;
        }
        
        if (this.lowBalanceWarningShown) {
            console.log(chalk.green(`\n✅ Balance restored! Trading resumed.\n`));
            logSuccess('Balance restored');
            this.lowBalanceWarningShown = false;
        }
        
        return true;
    }
    
    private async verifySetup(): Promise<void> {
        console.log(chalk.blue('\n🔍 Verifying setup...\n'));
        
        const balance = await this.provider.getBalance(this.wallet.address);
        const balanceFormatted = ethers.formatEther(balance);
        
        console.log(chalk.blue(`   ✓ Wallet: ${this.wallet.address}`));
        console.log(chalk.blue(`   ✓ Balance: ${balanceFormatted} ${this.config.gasToken}`));
        
        logInfo('💰 Balance checked', {
            address: this.wallet.address,
            balance: balanceFormatted
        });
        
        const minBalance = ethers.parseEther(this.config.minBalance);
        
        if (balance < minBalance) {
            console.log(chalk.red.bold(`\n   ❌ Balance too low!`));
            console.log(chalk.red(`      Current: ${balanceFormatted}`));
            console.log(chalk.red(`      Required: ${this.config.minBalance} ${this.config.gasToken}`));
            console.log(chalk.yellow(`\n   💡 Deposit ${this.config.gasToken} to: ${this.wallet.address}\n`));
            throw new Error(`Insufficient balance`);
        }
        
        console.log(chalk.green(`   ✓ Balance sufficient\n`));
        
        try {
            const blockNumber = await this.provider.getBlockNumber();
            console.log(chalk.green(`   ✓ RPC connected (Block: ${blockNumber})\n`));
            this.lastBlockScanned = blockNumber;
        } catch (error: any) {
            console.log(chalk.red(`   ❌ RPC failed\n`));
            throw error;
        }
        
        console.log(chalk.green('✅ Ready!\n'));
        logSuccess('✅ Setup complete');
    }
    
    private async scanContinuously(): Promise<void> {
        while (this.isRunning) {
            try {
                const hasBalance = await this.checkBalance();
                if (!hasBalance) {
                    await new Promise(resolve => setTimeout(resolve, 60000));
                    continue;
                }
                
                await this.scanAllPairs();
                this.scanCount++;
                
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error: any) {
                logError('Scan error', error);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
    
    private async scanBlock(blockNumber: number): Promise<void> {
        if (blockNumber <= this.lastBlockScanned) return;
        this.lastBlockScanned = blockNumber;
        
        if (blockNumber % 10 === 0) {
            logInfo(`📦 Block ${blockNumber}`, { blockNumber });
        }
    }
    
    private async scanAllPairs(): Promise<number> {
        const opportunities: Opportunity[] = [];
        
        for (let i = 0; i < this.config.tokens.length; i++) {
            for (let j = i + 1; j < this.config.tokens.length; j++) {
                try {
                    const opps = await this.findArbitrage(
                        this.config.tokens[i],
                        this.config.tokens[j]
                    );
                    opportunities.push(...opps);
                } catch (error) {
                    // Skip
                }
            }
        }
        
        if (opportunities.length > 0) {
            this.opportunitiesFound += opportunities.length;
            
            console.log(chalk.yellow(`\n🎯 Found ${opportunities.length} opportunities!`));
            
            opportunities.sort((a, b) => Number(b.netProfit - a.netProfit));
            
            opportunities.slice(0, 5).forEach((opp, i) => {
                const profit = ethers.formatUnits(opp.estimatedProfit, opp.tokenA.decimals);
                console.log(chalk.cyan(`   ${i+1}. ${opp.tokenA.symbol}/${opp.tokenB.symbol}: ${opp.buyDexName} -> ${opp.sellDexName}`));
                console.log(chalk.cyan(`      Profit: ${opp.profitPercent.toFixed(3)}% (${profit})`));
                
                logOpportunity({
                    opportunityId: opp.id,
                    tokenPair: `${opp.tokenA.symbol}/${opp.tokenB.symbol}`,
                    buyDex: opp.buyDexName,
                    sellDex: opp.sellDexName,
                    buyPrice: opp.buyPrice,
                    sellPrice: opp.sellPrice,
                    profitPercent: opp.profitPercent,
                    estimatedProfit: profit,
                    timestamp: opp.timestamp
                });
            });
            
            const topOpp = opportunities[0];
            if (topOpp.profitPercent >= MIN_PROFIT_PERCENT) {
                console.log(chalk.green(`\n⚡ Executing best opportunity...\n`));
                await this.executeOpportunity(topOpp);
            } else {
                console.log(chalk.yellow(`\n⏭️  Skipping - profit too low\n`));
            }
        }
        
        return opportunities.length;
    }
    
    private async findArbitrage(tokenA: TokenConfig, tokenB: TokenConfig): Promise<Opportunity[]> {
        const opportunities: Opportunity[] = [];
        
        try {
            const prices: Array<{
                dex: DEXConfig;
                router: ethers.Contract;
                pair: string;
                price: number;
            }> = [];
            
            for (const dex of this.config.dexes) {
                try {
                    const router = new ethers.Contract(dex.router, this.ROUTER_ABI, this.provider);
                    const factory = new ethers.Contract(dex.factory, this.FACTORY_ABI, this.provider);
                    
                    const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
                    if (pairAddress === ethers.ZeroAddress) continue;
                    
                    const amountIn = ethers.parseUnits('1', tokenA.decimals);
                    const path = [tokenA.address, tokenB.address];
                    const amounts = await router.getAmountsOut(amountIn, path);
                    const price = Number(ethers.formatUnits(amounts[1], tokenB.decimals));
                    
                    prices.push({ dex, router, pair: pairAddress, price });
                } catch {
                    continue;
                }
            }
            
            for (let i = 0; i < prices.length; i++) {
                for (let j = i + 1; j < prices.length; j++) {
                    const p1 = prices[i];
                    const p2 = prices[j];
                    
                    const diff = Math.abs(p1.price - p2.price);
                    const avg = (p1.price + p2.price) / 2;
                    const profitPercent = (diff / avg) * 100;
                    
                    if (profitPercent < MIN_PROFIT_PERCENT) continue;
                    
                    const buyDex = p1.price < p2.price ? p1 : p2;
                    const sellDex = p1.price < p2.price ? p2 : p1;
                    
                    // Use small borrow amounts for low capital
                    const borrowAmount = ethers.parseUnits('5', tokenA.decimals);
                    
                    const pathBuy = [tokenA.address, tokenB.address];
                    const pathSell = [tokenB.address, tokenA.address];
                    
                    const amountsBuy = await buyDex.router.getAmountsOut(borrowAmount, pathBuy);
                    const amountsSell = await sellDex.router.getAmountsOut(amountsBuy[1], pathSell);
                    
                    const repayAmount = (borrowAmount * 1003n) / 1000n;
                    
                    if (amountsSell[1] > repayAmount) {
                        const profit = amountsSell[1] - repayAmount;
                        const gasEstimate = ethers.parseUnits('0.002', 'ether');
                        
                        opportunities.push({
                            id: `${tokenA.symbol}-${tokenB.symbol}-${Date.now()}`,
                            tokenA,
                            tokenB,
                            buyDex: buyDex.dex.router,
                            sellDex: sellDex.dex.router,
                            buyDexName: buyDex.dex.name,
                            sellDexName: sellDex.dex.name,
                            buyPrice: buyDex.price,
                            sellPrice: sellDex.price,
                            profitPercent,
                            estimatedProfit: profit,
                            gasEstimate,
                            netProfit: profit,
                            borrowAmount,
                            timestamp: Date.now(),
                            pairBorrow: buyDex.pair
                        });
                    }
                }
            }
        } catch {
            // Skip
        }
        
        return opportunities;
    }
    
    private async executeOpportunity(opp: Opportunity): Promise<void> {
        const tradeId = `TRADE-${Date.now()}`;
        
        console.log(chalk.cyan(`\n${'═'.repeat(80)}`));
        console.log(chalk.cyan.bold(`⚡ EXECUTING: ${tradeId}`));
        console.log(chalk.cyan(`${'═'.repeat(80)}`));
        
        const tradeRecord: TradeRecord = {
            id: tradeId,
            timestamp: Date.now(),
            blockNumber: this.lastBlockScanned,
            status: 'pending',
            tokenA: {
                symbol: opp.tokenA.symbol,
                address: opp.tokenA.address,
                amount: ethers.formatUnits(opp.borrowAmount, opp.tokenA.decimals)
            },
            tokenB: {
                symbol: opp.tokenB.symbol,
                address: opp.tokenB.address,
                amount: '0'
            },
            buyDex: opp.buyDexName,
            sellDex: opp.sellDexName,
            borrowAmount: ethers.formatUnits(opp.borrowAmount, opp.tokenA.decimals),
            expectedProfit: ethers.formatUnits(opp.estimatedProfit, opp.tokenA.decimals)
        };
        
        this.tradeLogger.logTrade(tradeRecord);
        
        try {
            const pathBuy = [opp.tokenA.address, opp.tokenB.address];
            const pathSell = [opp.tokenB.address, opp.tokenA.address];
            
            console.log(chalk.yellow(`   Pair: ${opp.tokenA.symbol}/${opp.tokenB.symbol}`));
            console.log(chalk.yellow(`   Buy: ${opp.buyDexName} | Sell: ${opp.sellDexName}`));
            console.log(chalk.yellow(`   Profit: ${opp.profitPercent.toFixed(3)}%`));
            
            const feeData = await this.provider.getFeeData();
            const gasPrice = feeData.gasPrice || this.config.maxGasPrice;
            
            console.log(chalk.yellow(`\n   📤 Sending transaction...`));
            
            const startTime = Date.now();
            
            const tx = await this.contract.executeArbitrage(
                opp.pairBorrow,
                opp.borrowAmount,
                opp.tokenA.address,
                opp.buyDex,
                opp.sellDex,
                pathBuy,
                pathSell,
                {
                    gasLimit: 500000,
                    maxFeePerGas: gasPrice,
                    maxPriorityFeePerGas: ethers.parseUnits('30', 'gwei')
                }
            );
            
            console.log(chalk.blue(`\n   ✓ TX: ${tx.hash}`));
            console.log(chalk.yellow(`   ⏳ Waiting...\n`));
            
            logInfo(`📤 TX sent`, { tradeId, txHash: tx.hash });
            
            const receipt = await tx.wait();
            const executionTime = Date.now() - startTime;
            
            if (receipt && receipt.status === 1) {
                const gasUsed = receipt.gasUsed;
                const gasCost = gasUsed * (receipt.gasPrice || gasPrice);
                const gasCostFormatted = ethers.formatEther(gasCost);
                
                console.log(chalk.green.bold(`\n   ✅ SUCCESS!`));
                console.log(chalk.green(`   Block: ${receipt.blockNumber}`));
                console.log(chalk.

// ============ MAIN ============
async function main() {
    console.log(chalk.cyan.bold('\n🚀 Flash Loan Arbitrage Bot - Ultra Low Capital Edition\n'));
    
    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.log(chalk.red('❌ ERROR: PRIVATE_KEY not found in .env file\n'));
        console.log(chalk.yellow('Create a .env file with:'));
        console.log(chalk.yellow('PRIVATE_KEY=your_wallet_private_key_here\n'));
        process.exit(1);
    }
    
    // Select chain
    const chain = process.env.CHAIN || 'POLYGON';
    let config: ChainConfig;
    
    switch (chain.toUpperCase()) {
        case 'POLYGON':
            config = POLYGON_CONFIG;
            break;
        case 'BSC':
            config = BSC_CONFIG;
            break;
        case 'ARBITRUM':
            config = ARBITRUM_CONFIG;
            break;
        default:
            console.log(chalk.red(`❌ Unknown chain: ${chain}`));
            console.log(chalk.yellow('Available chains: POLYGON, BSC, ARBITRUM\n'));
            process.exit(1);
    }
    
    console.log(chalk.blue(`Selected chain: ${config.name}\n`));
    
    // Create and start bot
    const bot = new FlashLoanArbitrageBot(config, privateKey);
    
    // Handle shutdown gracefully
    process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n🛑 Shutting down...\n'));
        bot.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log(chalk.yellow('\n\n🛑 Shutting down...\n'));
        bot.stop();
        process.exit(0);
    });
    
    // Start the bot
    await bot.start();
}

// Run the bot
main().catch((error) => {
    console.error(chalk.red('\n❌ Fatal error:\n'), error);
    logError('Fatal error in main', error);
    process.exit(1);
});

export default FlashLoanArbitrageBot;

