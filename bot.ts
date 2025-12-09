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
     
