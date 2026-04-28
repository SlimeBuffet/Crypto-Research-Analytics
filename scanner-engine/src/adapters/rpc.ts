import { ethers } from 'ethers';
import { ApiKeyManager } from '../core/api-key-manager';
import { logger } from '../utils/logger';

/**
 * RPC adapter for on-chain verification via Alchemy & QuickNode.
 * Supports BSC, Solana (via HTTP), and World Chain.
 */
export class RpcAdapter {
  private providers = new Map<string, ethers.JsonRpcProvider>();

  constructor(private keyManager: ApiKeyManager) {}

  /** Get or create an EVM JSON-RPC provider */
  private getEvmProvider(chain: 'bsc' | 'ethereum' | 'worldchain'): ethers.JsonRpcProvider | null {
    const existing = this.providers.get(chain);
    if (existing) return existing;

    const alchemyKey = this.keyManager.getKey('alchemy');
    const quicknodeUrl = this.keyManager.getKey('quicknode_http');

    const chainUrls: Record<string, string[]> = {
      bsc: ['https://bsc-dataseed.binance.org'],
      ethereum: [],
      worldchain: [],
    };

    if (alchemyKey) {
      chainUrls.ethereum.push(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`);
    }
    if (quicknodeUrl) {
      chainUrls[chain]?.push(quicknodeUrl);
    }

    const urls = chainUrls[chain];
    if (!urls || urls.length === 0) {
      logger.debug({ chain }, 'No RPC endpoint available');
      return null;
    }

    const provider = new ethers.JsonRpcProvider(urls[0]);
    this.providers.set(chain, provider);
    return provider;
  }

  /** Verify a token's on-chain supply using ERC-20 totalSupply() */
  async verifyTokenSupply(
    chain: 'bsc' | 'ethereum' | 'worldchain',
    tokenAddress: string,
  ): Promise<bigint | null> {
    const provider = this.getEvmProvider(chain);
    if (!provider) return null;

    try {
      const abi = ['function totalSupply() view returns (uint256)'];
      const contract = new ethers.Contract(tokenAddress, abi, provider);
      const supply: bigint = await contract.totalSupply();
      logger.debug(
        { chain, token: tokenAddress, supply: supply.toString() },
        'On-chain supply verified',
      );
      return supply;
    } catch (err) {
      const error = err as Error;
      logger.warn(
        { chain, token: tokenAddress, error: error.message },
        'On-chain supply verification failed',
      );
      return null;
    }
  }

  /** Get the latest block number for health check */
  async getLatestBlock(chain: 'bsc' | 'ethereum' | 'worldchain'): Promise<number | null> {
    const provider = this.getEvmProvider(chain);
    if (!provider) return null;

    try {
      return await provider.getBlockNumber();
    } catch (err) {
      const error = err as Error;
      logger.warn({ chain, error: error.message }, 'Failed to get latest block');
      return null;
    }
  }
}
