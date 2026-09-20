import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface PaypalCreateOrderResult {
  paypalOrderId: string;
  approvalUrl: string;
}

export interface PaypalCaptureOrderResult {
  id: string;
  status: string;
}

@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET');
    this.apiUrl =
      this.configService.get<string>('PAYPAL_API_URL') ??
      'https://api-m.sandbox.paypal.com';

    if (!this.clientId || !this.clientSecret) {
      this.logger.log('PayPal configurado en modo Sandbox Mock (sin credenciales externas)');
    } else {
      this.logger.log(`PayPal configurado en modo Sandbox Live conectando a: ${this.apiUrl}`);
    }
  }

  isMockMode(): boolean {
    return !this.clientId || !this.clientSecret;
  }

  async createOrder(
    amount: number,
    currency: string,
    customId: string,
  ): Promise<PaypalCreateOrderResult> {
    if (this.isMockMode()) {
      const mockOrderId = `MOCK-PAYPAL-ORDER-${randomUUID()}`;
      return {
        paypalOrderId: mockOrderId,
        approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${mockOrderId}`,
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(`${this.apiUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              custom_id: customId,
              amount: {
                currency_code: currency,
                value: amount.toFixed(2),
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Error de PayPal al crear orden: ${errorText}`);
        throw new InternalServerErrorException('Error al comunicarse con la pasarela de pago');
      }

      const data = (await response.json()) as {
        id: string;
        links?: Array<{ href: string; rel: string }>;
      };

      const approvalLink = data.links?.find((link) => link.rel === 'approve');

      return {
        paypalOrderId: data.id,
        approvalUrl: approvalLink?.href ?? `https://www.sandbox.paypal.com/checkoutnow?token=${data.id}`,
      };
    } catch (error: unknown) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Fallo de conexión con PayPal: ${(error as Error).message}`);
      throw new InternalServerErrorException('Fallo al inicializar la orden con la pasarela');
    }
  }

  async captureOrder(paypalOrderId: string): Promise<PaypalCaptureOrderResult> {
    if (this.isMockMode() || paypalOrderId.startsWith('MOCK-PAYPAL-ORDER-')) {
      return {
        id: paypalOrderId,
        status: 'COMPLETED',
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(
        `${this.apiUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Error de PayPal al capturar orden: ${errorText}`);
        throw new InternalServerErrorException('Error al capturar la orden en la pasarela de pago');
      }

      const data = (await response.json()) as { id: string; status: string };

      return {
        id: data.id,
        status: data.status,
      };
    } catch (error: unknown) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Fallo de captura en PayPal: ${(error as Error).message}`);
      throw new InternalServerErrorException('Fallo al procesar el pago con la pasarela');
    }
  }

  private async getAccessToken(): Promise<string> {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch(`${this.apiUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al autenticar con PayPal: ${err}`);
      throw new InternalServerErrorException('Fallo de autenticación con la pasarela de pago');
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }
}
