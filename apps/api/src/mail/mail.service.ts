import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('RESEND_API_KEY');
    this.resend = key ? new Resend(key) : null;
    // hosting dashboards keep quotes pasted from a .env file as part of the value
    const from = String(config.get('MAIL_FROM') ?? '').trim().replace(/^(["'])(.*)\1$/, '$2');
    this.from = from || 'Rizzoto <onboarding@resend.dev>';
  }

  async sendLoginCode(to: string, code: string) {
    if (!this.resend) {
      // No key configured (local dev) — print it so we can still sign in.
      this.logger.warn(`RESEND_API_KEY not set. Login code for ${to}: ${code}`);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: `${code} is your login code`,
      text: `Your Rizzoto login code is ${code}. It expires in 10 minutes.\n\nIf you didn't try to sign in, you can ignore this email.`,
      html: loginCodeHtml(code),
    });

    if (error) {
      this.logger.error(`Could not send login code to ${to}: ${error.message}`);
      // the reason (unverified domain, bad sender, wrong key) is what the owner needs to fix it
      throw new ServiceUnavailableException(`Login email could not be sent: ${error.message}`);
    }
  }
}

function loginCodeHtml(code: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#1c1917">
    <p style="margin:0 0 20px;font-size:15px;font-weight:600">Rizzoto</p>
    <p style="margin:0 0 24px;font-size:15px">Use this code to sign in:</p>
    <p style="margin:0 0 24px;font-size:32px;letter-spacing:8px;font-weight:600">${code}</p>
    <p style="margin:0;font-size:13px;color:#78716c">It expires in 10 minutes. If you didn't try to sign in, ignore this email.</p>
  </div>`;
}
