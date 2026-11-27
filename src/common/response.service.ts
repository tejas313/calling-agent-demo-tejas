import { Injectable, Logger } from '@nestjs/common';
import * as messages from './messages.json';

@Injectable()
export class ResponseService {
  private readonly logger = new Logger(ResponseService.name);

  async error(req: any, res: any, msg: any, statusCode: any = 500, language = 'en') {
    let resolvedStatusCode = typeof statusCode === 'number' ? statusCode : 500;

    if (typeof msg === 'object' && msg !== null && !(msg instanceof Error)) {
      if (msg.status && typeof msg.status === 'number') {
        resolvedStatusCode = msg.status;
      }
      if (msg.statusCode && typeof msg.statusCode === 'number') {
        resolvedStatusCode = msg.statusCode;
      }
      if (msg.message) {
        msg = msg.message;
      }
    }

    if (msg instanceof Error) {
      msg = msg.message;
    }

    if (Array.isArray(msg)) {
      msg = msg.join(', ');
    }

    if (typeof msg === 'string') {
      msg = await this.getMessage(msg, language);
    }

    const response = {
      code: 0,
      status: 'FAIL',
      message: msg || 'SOMETHING_WENT_WRONG',
    };

    const d = new Date();
    const formatted_date = `${d.getFullYear()}-${
      d.getMonth() + 1
    }-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
    const logMsg = typeof msg === 'object' ? JSON.stringify(msg) : msg;
    const reqMethod = req?.method || 'UNKNOWN';
    const reqUrl = req?.originalUrl || req?.url || '';
    this.logger.error(
      `[${formatted_date}] ${reqMethod}:${reqUrl} ${logMsg}`,
    );

    if (res && !res.headersSent) {
      res.status(resolvedStatusCode).json(response);
    }
  }

  async success(
    res: any,
    msg: any,
    data: any,
    statusCode = 200,
    language = 'en',
  ) {
    try {
      if (typeof msg === 'string') {
        msg = await this.getMessage(msg, language);
      }
      const response = {
        code: 1,
        status: 'SUCCESS',
        message: msg,
        data: data !== undefined ? data : {},
      };

      if (res && !res.headersSent) {
        res.status(statusCode).json(response);
      }
    } catch (error) {
      this.logger.error('success error ->>', error);
      return;
    }
  }

  getMessage(msg: string, language: string) {
    const lang = language ? language : 'en';
    const langObj = (messages as any)[lang] || (messages as any)['en'];
    return langObj?.[msg] || msg;
  }

  async errorInventoy(req: any, res: any, msg: any, statusCode = 500) {
    const response = {
      code: 0,
      status: 'FAIL',
      message: msg,
    };
    if (res && !res.headersSent) {
      res.status(statusCode).json(response);
    }
  }
}
