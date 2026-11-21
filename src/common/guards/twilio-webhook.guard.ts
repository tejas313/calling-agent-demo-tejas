import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';

@Injectable()
export class TwilioWebhookGuard implements CanActivate {
  private readonly logger = new Logger(TwilioWebhookGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.get<boolean>('skipTwilioValidation', context.getHandler());
    if (skip) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN', '');
    const signature = req.headers['x-twilio-signature'] as string;
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = req.body;

    if (!signature) {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('No Twilio signature provided, bypassing in dev mode');
        return true;
      }
      throw new ForbiddenException('Missing Twilio signature');
    }

    const isValid = twilio.validateRequest(authToken, signature, url, params);

    if (!isValid) {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('Twilio webhook validation failed, but bypassing for dev mode');
        return true;
      }
      throw new ForbiddenException('Invalid Twilio signature');
    }

    return true;
  }
}
