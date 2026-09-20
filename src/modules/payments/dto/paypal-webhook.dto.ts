export interface PaypalWebhookEvent {
  id: string;
  event_type: string;
  resource_type: string;
  resource: Record<string, unknown>;
  create_time: string;
  summary?: string;
}

export interface PaypalWebhookHeaders {
  'paypal-auth-algo'?: string;
  'paypal-cert-url'?: string;
  'paypal-transmission-id'?: string;
  'paypal-transmission-sig'?: string;
  'paypal-transmission-time'?: string;
  [key: string]: string | string[] | undefined;
}
