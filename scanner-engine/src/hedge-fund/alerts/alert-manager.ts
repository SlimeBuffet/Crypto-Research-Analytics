import axios from 'axios';
import { logger } from '../../utils/logger';
import { Alert, AlertType, AlertConfig, WebSocketFeed } from '../types';

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
  priceAlertThresholdPct: 5,
  volumeSpikeMultiplier: 3,
  enableWebSocket: false,
};

/**
 * Module 5: Real-time Alert & Monitoring System
 *
 * - Telegram Notifications
 * - Discord Webhook Notifications
 * - WebSocket Price Feed Monitoring
 * - PnL Dashboard Data
 */
export class AlertManager {
  private config: AlertConfig;
  private alerts: Alert[] = [];
  private priceBaseline = new Map<string, number>();
  private volumeBaseline = new Map<string, number>();
  private wsConnection: { close: () => void } | null = null;

  constructor(config?: Partial<AlertConfig>) {
    this.config = { ...DEFAULT_ALERT_CONFIG, ...config };
  }

  /**
   * Create and dispatch an alert.
   */
  async sendAlert(
    type: AlertType,
    symbol: string,
    message: string,
    severity: 'INFO' | 'WARNING' | 'CRITICAL',
    data: Record<string, unknown> = {},
  ): Promise<Alert> {
    const alert: Alert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      symbol,
      message,
      severity,
      timestamp: Date.now(),
      data,
    };

    this.alerts.push(alert);

    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-500);
    }

    logger.info(
      { type, symbol, severity, message },
      `ALERT: ${type}`,
    );

    await this.dispatch(alert);
    return alert;
  }

  /**
   * Check price updates against baselines and trigger alerts.
   */
  async checkPriceAlerts(
    priceMap: Map<string, number>,
    volumeMap: Map<string, number>,
  ): Promise<Alert[]> {
    const triggered: Alert[] = [];

    for (const [symbol, price] of priceMap) {
      const baseline = this.priceBaseline.get(symbol);

      if (baseline) {
        const changePct = ((price - baseline) / baseline) * 100;

        if (Math.abs(changePct) >= this.config.priceAlertThresholdPct) {
          const direction = changePct > 0 ? 'UP' : 'DOWN';
          const alert = await this.sendAlert(
            'PRICE_SPIKE',
            symbol,
            `${symbol} moved ${direction} ${Math.abs(changePct).toFixed(1)}% (${baseline.toFixed(4)} → ${price.toFixed(4)})`,
            Math.abs(changePct) > 10 ? 'CRITICAL' : 'WARNING',
            { changePct, oldPrice: baseline, newPrice: price },
          );
          triggered.push(alert);
        }
      }

      this.priceBaseline.set(symbol, price);
    }

    for (const [symbol, volume] of volumeMap) {
      const baseline = this.volumeBaseline.get(symbol);

      if (baseline && baseline > 0) {
        const multiplier = volume / baseline;

        if (multiplier >= this.config.volumeSpikeMultiplier) {
          const alert = await this.sendAlert(
            'VOLUME_SPIKE',
            symbol,
            `${symbol} volume spike: ${multiplier.toFixed(1)}x baseline ($${formatCompact(volume)})`,
            multiplier > 5 ? 'CRITICAL' : 'WARNING',
            { multiplier, volume, baseline },
          );
          triggered.push(alert);
        }
      }

      this.volumeBaseline.set(symbol, volume);
    }

    return triggered;
  }

  /**
   * Send trigger activation alert.
   */
  async alertTriggerActivated(
    symbol: string,
    price: number,
    highLine: number,
  ): Promise<void> {
    await this.sendAlert(
      'TRIGGER_ACTIVATED',
      symbol,
      `${symbol} entered Institutional Inflow State: Price $${price.toFixed(4)} > High Line $${highLine.toFixed(4)}`,
      'INFO',
      { price, highLine },
    );
  }

  /**
   * Send macro signal change alert.
   */
  async alertMacroSignalChange(
    signal: 'GREEN' | 'YELLOW' | 'RED',
    recommendation: string,
  ): Promise<void> {
    await this.sendAlert(
      'MACRO_SIGNAL_CHANGE',
      'MACRO',
      `Macro signal changed to ${signal}: ${recommendation}`,
      signal === 'RED' ? 'CRITICAL' : signal === 'YELLOW' ? 'WARNING' : 'INFO',
      { signal, recommendation },
    );
  }

  /**
   * Start WebSocket price feed monitoring from Binance.
   */
  startWebSocketFeed(
    symbols: string[],
    onUpdate: (feed: WebSocketFeed) => void,
  ): void {
    if (!this.config.enableWebSocket) {
      logger.info('WebSocket feed disabled by config');
      return;
    }

    const streams = symbols
      .map((s) => `${s.toLowerCase()}usdt@ticker`)
      .join('/');

    const wsBase = process.env.BINANCE_WS_URL || 'wss://data-stream.binance.vision';
    const wsUrl = `${wsBase}/stream?streams=${streams}`;

    logger.info(
      { symbols: symbols.length, url: wsUrl.slice(0, 80) },
      'Starting WebSocket feed',
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WebSocket = require('ws') as typeof import('ws');
      const ws = new WebSocket(wsUrl);

      ws.on('message', (data: Buffer) => {
        try {
          const parsed = JSON.parse(data.toString());
          const ticker = parsed.data;
          if (ticker) {
            const feed: WebSocketFeed = {
              symbol: (ticker.s as string).replace('USDT', ''),
              price: parseFloat(ticker.c),
              volume: parseFloat(ticker.v),
              timestamp: ticker.E,
              bidPrice: parseFloat(ticker.b),
              askPrice: parseFloat(ticker.a),
            };
            onUpdate(feed);
          }
        } catch {
          // skip malformed messages
        }
      });

      ws.on('error', (err: Error) => {
        logger.warn({ error: err.message }, 'WebSocket error');
      });

      ws.on('close', () => {
        logger.info('WebSocket connection closed');
      });

      this.wsConnection = { close: () => ws.close() };
    } catch {
      logger.warn('WebSocket (ws) module not available — feed disabled');
    }
  }

  /**
   * Stop the WebSocket feed.
   */
  stopWebSocketFeed(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
      logger.info('WebSocket feed stopped');
    }
  }

  /**
   * Get recent alerts, optionally filtered.
   */
  getAlerts(
    filter?: { type?: AlertType; symbol?: string; severity?: string },
    limit = 50,
  ): Alert[] {
    let filtered = [...this.alerts];

    if (filter?.type) {
      filtered = filtered.filter((a) => a.type === filter.type);
    }
    if (filter?.symbol) {
      filtered = filtered.filter((a) => a.symbol === filter.symbol);
    }
    if (filter?.severity) {
      filtered = filtered.filter((a) => a.severity === filter.severity);
    }

    return filtered.slice(-limit);
  }

  /**
   * Dispatch alert to configured channels (Telegram / Discord).
   */
  private async dispatch(alert: Alert): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.telegramBotToken && this.config.telegramChatId) {
      promises.push(this.sendTelegram(alert));
    }

    if (this.config.discordWebhookUrl) {
      promises.push(this.sendDiscord(alert));
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  private async sendTelegram(alert: Alert): Promise<void> {
    const emoji =
      alert.severity === 'CRITICAL'
        ? '🚨'
        : alert.severity === 'WARNING'
          ? '⚠️'
          : 'ℹ️';

    const text = `${emoji} *${alert.type}*\n${alert.message}\n_${new Date(alert.timestamp).toISOString()}_`;

    try {
      await axios.post(
        `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`,
        {
          chat_id: this.config.telegramChatId,
          text,
          parse_mode: 'Markdown',
        },
      );
    } catch (err) {
      const error = err as Error;
      logger.debug({ error: error.message }, 'Telegram send failed');
    }
  }

  private async sendDiscord(alert: Alert): Promise<void> {
    if (!this.config.discordWebhookUrl) return;

    const color =
      alert.severity === 'CRITICAL'
        ? 0xff0000
        : alert.severity === 'WARNING'
          ? 0xffaa00
          : 0x00ff00;

    try {
      await axios.post(this.config.discordWebhookUrl, {
        embeds: [
          {
            title: `${alert.type}: ${alert.symbol}`,
            description: alert.message,
            color,
            timestamp: new Date(alert.timestamp).toISOString(),
          },
        ],
      });
    } catch (err) {
      const error = err as Error;
      logger.debug({ error: error.message }, 'Discord send failed');
    }
  }
}

function formatCompact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}
