import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket, createConnection } from 'node:net';
import { connect as createTlsConnection } from 'node:tls';

interface AssignmentEmailPayload {
  fullName: string | null;
  email: string;
  workplaceCode: string;
  workplaceName: string | null;
  startsAt: Date;
  endsAt: Date | null;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly host: string | null;
  private readonly port: number | null;
  private readonly user: string | null;
  private readonly pass: string | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.host = this.configService.get<string>('SMTP_HOST') ?? null;
    this.port = this.configService.get<number>('SMTP_PORT') ?? null;
    this.user = this.configService.get<string>('SMTP_USER') ?? null;
    this.pass = this.configService.get<string>('SMTP_PASS') ?? null;
    this.from =
      this.configService.get<string>('MAIL_FROM') ?? 'no-reply@armico.local';
    this.appUrl = this.configService.get<string>('APP_URL') ?? '';

    if (!this.host || !this.port || !this.user || !this.pass) {
      this.logger.warn(
        'SMTP настройки заданы не полностью. Отправка email будет недоступна.',
      );
    }
  }

  private get isConfigured() {
    return Boolean(this.host && this.port && this.user && this.pass);
  }

  private async createSocket(): Promise<Socket> {
    if (!this.host || !this.port) {
      throw new ServiceUnavailableException('Отправка email не настроена');
    }

    const useTls = this.port === 465;

    return new Promise((resolve, reject) => {
      let resolved = false;
      let socket: Socket;

      const cleanup = () => {
        socket.removeListener('error', handleError);
      };

      const handleError = (error: Error) => {
        if (!resolved) {
          reject(error);
        }
      };

      const handleConnect = () => {
        resolved = true;
        cleanup();
        resolve(socket);
      };

      if (useTls) {
        socket = createTlsConnection(
          {
            host: this.host,
            port: this.port,
            rejectUnauthorized: false,
          },
          handleConnect,
        );
      } else {
        socket = createConnection(this.port, this.host, handleConnect);
      }

      socket.once('error', handleError);
    });
  }

  private readResponse(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';

      const handleData = (chunk: Buffer) => {
        data += chunk.toString('utf-8');
        const lines = data.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) {
          return;
        }

        const lastLine = lines[lines.length - 1];
        if (/^\d{3} /.test(lastLine)) {
          cleanup();
          resolve(data);
        }
      };

      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const handleClose = () => {
        cleanup();
        reject(new Error('SMTP connection closed unexpectedly'));
      };

      const cleanup = () => {
        socket.off('data', handleData);
        socket.off('error', handleError);
        socket.off('close', handleClose);
      };

      socket.on('data', handleData);
      socket.once('error', handleError);
      socket.once('close', handleClose);
    });
  }

  private async sendCommand(socket: Socket, command: string) {
    socket.write(`${command}\r\n`);
    return this.readResponse(socket);
  }

  private ensureResponse(response: string, allowed: number[], stage: string) {
    const lines = response.trim().split(/\r?\n/);
    const lastLine = lines[lines.length - 1] ?? '';
    const code = Number(lastLine.slice(0, 3));

    if (!allowed.includes(code)) {
      throw new Error(`SMTP ${stage} failed: ${lastLine}`);
    }
  }

  private buildMessage(payload: AssignmentEmailPayload) {
    const formatter = new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const startsAt = formatter.format(payload.startsAt);
    const endsAt = payload.endsAt ? formatter.format(payload.endsAt) : 'бессрочно';
    const loginUrl = this.appUrl ? `${this.appUrl.replace(/\/$/, '')}/login` : '';
    const greetingName = payload.fullName?.trim() || payload.email;
    const workplaceName = payload.workplaceName?.trim()
      ? ` — ${payload.workplaceName.trim()}`
      : '';

    const lines = [
      `Здравствуйте, ${greetingName}!`,
      '',
      `Вас назначили на рабочее место ${payload.workplaceCode}${workplaceName}.`,
      `Период: ${startsAt} — ${endsAt}.`,
    ];

    if (loginUrl) {
      lines.push('', 'Вы можете посмотреть подробности и свой график по ссылке:', loginUrl);
    }

    lines.push('', 'Это письмо отправлено автоматически, отвечать на него не нужно.');

    const textBody = lines.join('\n');
    const encodedSubject = `=?UTF-8?B?${Buffer.from(
      'Новое назначение в Armico',
      'utf-8',
    ).toString('base64')}?=`;

    const headers = [
      `From: ${this.from}`,
      `To: ${payload.email}`,
      `Date: ${new Date().toUTCString()}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
    ];

    return `${headers.join('\r\n')}\r\n\r\n${textBody.replace(/\r?\n/g, '\r\n')}`;
  }

  async sendAssignmentNotification(payload: AssignmentEmailPayload) {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Отправка email не настроена');
    }

    const socket = await this.createSocket();

    try {
      this.ensureResponse(await this.readResponse(socket), [220], 'GREETING');
      this.ensureResponse(
        await this.sendCommand(socket, `EHLO ${this.host}`),
        [250],
        'EHLO',
      );
      this.ensureResponse(
        await this.sendCommand(socket, 'AUTH LOGIN'),
        [334],
        'AUTH LOGIN (challenge)',
      );
      this.ensureResponse(
        await this.sendCommand(
          socket,
          Buffer.from(this.user!, 'utf-8').toString('base64'),
        ),
        [334],
        'AUTH LOGIN (username)',
      );
      this.ensureResponse(
        await this.sendCommand(
          socket,
          Buffer.from(this.pass!, 'utf-8').toString('base64'),
        ),
        [235],
        'AUTH LOGIN (password)',
      );
      this.ensureResponse(
        await this.sendCommand(socket, `MAIL FROM:<${this.from}>`),
        [250],
        'MAIL FROM',
      );
      this.ensureResponse(
        await this.sendCommand(socket, `RCPT TO:<${payload.email}>`),
        [250, 251],
        'RCPT TO',
      );
      this.ensureResponse(
        await this.sendCommand(socket, 'DATA'),
        [354],
        'DATA command',
      );

      const message = this.buildMessage(payload);
      socket.write(`${message}\r\n.\r\n`);
      this.ensureResponse(await this.readResponse(socket), [250], 'DATA send');
      this.ensureResponse(await this.sendCommand(socket, 'QUIT'), [221], 'QUIT');
    } catch (error) {
      this.logger.error('Не удалось отправить email', error as Error);
      throw new ServiceUnavailableException('Не удалось отправить email');
    } finally {
      socket.end();
    }
  }
}

