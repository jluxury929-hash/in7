// arbitrage-bot.ts - Flash Loan Arbitrage Bot (Compatible with Existing Setup)

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// ============ CONFIGURATION ============
const YOUR_CONTRACT_ADDRESS = '0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0';
const MIN_PROFIT_PERCENT = 0.15;
const MAX_GAS_PER_TX = '0.0003';

// ============ SIMPLE LOGGER ============
class SimpleLogger {
    private logsDir: string;
    
    constructor() {
        this.logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }
    
    log(level: string, message: string, data?: any) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${level}] ${message} ${data ? JSON.stringify(data) : ''}\n`;
        
        console.log(logLine.trim());
        
        const logFile = path.join(this.logsDir, 'bot.log');
        fs.appendFileSync(logFile, logLine);
        
        if (level === 'ERROR') {
            const errorFile = path.join(this.logsDir, 'errors.log');
            fs.appendFileSync(errorFile, logLine);
        }
    }
    
    info(message: string, data?: any) { this.log('INFO', message, data); }
    error(message: string, data?: any) { this.log('ERROR', message, data); }
    success(message: string, data?: any) { this.log('SUCCESS', message, data); }
    warning(message: string, data?: any) { this.log('WARNING', message, data); }
}

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
    profitPercent: number;
    estimatedProfit: bigint;
    borrowAmount: bigint;
    pairBorrow: string;
}

// ============ CHAIN CONFIGS ============
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

// ============ BOT CLASS ============
class FlashLoanArbitrageBot {
    private provider: ethers.JsonRpcProvider;
    private wsProvider: ethers.WebSocketProvider;
    private wallet: ethers.Wallet;
    private config: ChainConfig;
    private contract: ethers.Contract;
    private logger: SimpleLogger;
    
    private isRunning: boolean = false;
    private scanCount: number = 0;
    private lastBlockScanned: number = 0;
    private opportunitiesFound: number = 0;
    
    private readonly CONTRACT_ABI = [
        'function executeArbitrage(address pairBorrow, uint256 amountToBorrow, address tokenBorrow, address routerBuy, address routerSell, address[] calldata pathBuy, address[] calldata pathSell) external',
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
        this.logger = new SimpleLogger();
        
        this.logger.info('Bot initialized', {
            chain: config.name,
            wallet: this.wallet.address
        });
    }
    
    async start(): Promise<void> {
        console.log('═'.repeat(80));
        console.log('🚀 FLASH LOAN ARBITRAGE BOT - 0.001 ETH MINIMUM');
        console.log('═'.repeat(80));
        console.log(`📍 Chain: ${this.config.name}`);
        console.log(`📝 Contract: ${YOUR_CONTRACT_ADDRESS}`);
        console.log(`👛 Wallet: ${this.wallet.address}`);
        console.log(`💰 Min Balance: ${this.config.minBalance} ${this.config.gasToken}`);
        console.log('═'.repeat(80));
        
        await this.verifySetup();
        
        this.isRunning = true;
        this.logger.success('Bot started successfully');
        
        console.log('\n✅ Bot LIVE!\n');
        
        this.scanContinuously();
        
        this.wsProvider.on('block', async (blockNumber) => {
            if (!this.isRunning) return;
            this.lastBlockScanned = blockNumber;
            if (blockNumber % 10 === 0) {
                this.logger.info(`Block ${blockNumber}`);
            }
        });
        
        this.contract.on('ArbitrageExecuted', (tokenBorrowed, amount, profit, dexBuy, dexSell, event) => {
            const profitFormatted = ethers.formatEther(profit);
            this.logger.success('PROFIT MADE!', {
                profit: profitFormatted,
                txHash: event.log.transactionHash
            });
            console.log(`\n💰💰💰 PROFIT! +${profitFormatted} ${this.config.gasToken} 💰💰💰`);
            console.log(`TX: ${event.log.transactionHash}\n`);
        });
    }
    
    private async verifySetup(): Promise<void> {
        console.log('\n🔍 Verifying setup...\n');
        
        const balance = await this.provider.getBalance(this.wallet.address);
        const balanceFormatted = ethers.formatEther(balance);
        const minBalance = ethers.parseEther(this.config.minBalance);
        
        console.log(`   ✓ Balance: ${balanceFormatted} ${this.config.gasToken}`);
        
        if (balance < minBalance) {
            console.log(`   ❌ Balance too low! Need ${this.config.minBalance} ${this.config.gasToken}`);
            console.log(`   💡 Deposit to: ${this.wallet.address}\n`);
            throw new Error('Insufficient balance');
        }
        
        const blockNumber = await this.provider.getBlockNumber();
        console.log(`   ✓ RPC connected (Block: ${blockNumber})`);
        this.lastBlockScanned = blockNumber;
        
        console.log('\n✅ Ready!\n');
    }
    
    private async scanContinuously(): Promise<void> {
        while (this.isRunning) {
            try {
                const balance = await this.provider.getBalance(this.wallet.address);
                if (balance < ethers.parseEther(this.config.minBalance)) {
                    this.logger.warning('Balance too low, pausing...');
                    await new Promise(resolve => setTimeout(resolve, 60000));
                    continue;
                }
                
                await this.scanAllPairs();
                this.scanCount++;
                
                if (this.scanCount % 10 === 0) {
                    console.log(`📊 Scans: ${this.scanCount} | Opportunities: ${this.opportunitiesFound}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error: any) {
                this.logger.error('Scan error', { message: error.message });
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
    
    private async scanAllPairs(): Promise<void> {
        const opportunities: Opportunity[] = [];
        
        for (let i = 0; i < this.config.tokens.length; i++) {
            for (let j = i + 1; j < this.config.tokens.length; j++) {
                try {
                    const opps = await this.findArbitrage(
                        this.config.tokens[i],
                        this.config.tokens[j]
                    );
                    opportunities.push(...opps);
                } catch {
                    // Skip
                }
            }
        }
        
        if (opportunities.length > 0) {
            this.opportunitiesFound += opportunities.length;
            console.log(`\n🎯 Found ${opportunities.length} opportunities!`);
            
            opportunities.sort((a, b) => Number(b.estimatedProfit - a.estimatedProfit));
            
            const topOpp = opportunities[0];
            if (topOpp.profitPercent >= MIN_PROFIT_PERCENT) {
                console.log(`⚡ Executing best opportunity (${topOpp.profitPercent.toFixed(3)}%)...`);
                await this.executeOpportunity(topOpp);
            }
        }
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
                    const amounts = await router.getAmountsOut(amountIn, [tokenA.address, tokenB.address]);
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
                    const profitPercent = (diff / ((p1.price + p2.price) / 2)) * 100;
                    
                    if (profitPercent < MIN_PROFIT_PERCENT) continue;
                    
                    const buyDex = p1.price < p2.price ? p1 : p2;
                    const sellDex = p1.price < p2.price ? p2 : p1;
                    const borrowAmount = ethers.parseUnits('5', tokenA.decimals);
                    
                    const amountsBuy = await buyDex.router.getAmountsOut(borrowAmount, [tokenA.address, tokenB.address]);
                    const amountsSell = await sellDex.router.getAmountsOut(amountsBuy[1], [tokenB.address, tokenA.address]);
                    const repayAmount = (borrowAmount * 1003n) / 1000n;
                    
                    if (amountsSell[1] > repayAmount) {
                        opportunities.push({
                            id: `${tokenA.symbol}-${tokenB.symbol}-${Date.now()}`,
                            tokenA,
                            tokenB,
                            buyDex: buyDex.dex.router,
                            sellDex: sellDex.dex.router,
                            buyDexName: buyDex.dex.name,
                            sellDexName: sellDex.dex.name,
                            profitPercent,
                            estimatedProfit: amountsSell[1] - repayAmount,
                            borrowAmount,
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
        console.log(`\n⚡ EXECUTING: ${tradeId}`);
        
        try {
            const pathBuy = [opp.tokenA.address, opp.tokenB.address];
            const pathSell = [opp.tokenB.address, opp.tokenA.address];
            
            const feeData = await this.provider.getFeeData();
            const gasPrice = feeData.gasPrice || this.config.maxGasPrice;
            
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
            
            console.log(`   📤 TX: ${tx.hash}`);
            this.logger.info('Transaction sent', { tradeId, txHash: tx.hash });
            
            const receipt = await tx.wait();
            
            if (receipt && receipt.status === 1) {
                console.log(`   ✅ SUCCESS!\n`);
                this.logger.success('Trade successful', { tradeId, block: receipt.blockNumber });
            } else {
                console.log(`   ❌ FAILED\n`);
                this.logger.error('Trade failed', { tradeId });
            }
        } catch (error: any) {
            console.log(`   ❌ ERROR: ${error.message}\n`);
            this.logger.error('Execution error', { tradeId, error: error.message });
        }
    }
    
    stop(): void {
        this.isRunning = false;
        this.wsProvider.removeAllListeners();
        console.log('\n🛑 Bot stopped\n');
        this.logger.info('Bot stopped');
    }
}

// ============ MAIN ============
async function main() {
    console.log('\n🚀 Flash Loan Arbitrage Bot Starting...\n');
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.error('❌ PRIVATE_KEY not found in .env\n');
        process.exit(1);
    }
    
    const chain = process.env.CHAIN || 'POLYGON';
    const config = chain.toUpperCase() === 'BSC' ? BSC_CONFIG : POLYGON_CONFIG;
    
    const bot = new FlashLoanArbitrageBot(config, privateKey);
    
    process.on('SIGINT', () => {
        console.log('\n\n🛑 Shutting down...\n');
        bot.stop();
        process.exit(0);
    });
    
    await bot.start();
}

main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

