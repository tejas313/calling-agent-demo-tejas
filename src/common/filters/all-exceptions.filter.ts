import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: any;
    if (isHttp) {
      message = exception.getResponse();
    } else {
      message =
        process.env.NODE_ENV === 'production'
          ? '500 Internal Server Error'
          : (exception as Error).message;
    }

    const stackTrace =
      process.env.NODE_ENV !== 'production'
        ? (exception as Error).stack
        : 'Sanitized in production';
    this.logger.error(`Error processing ${request.method} ${request.url}`, stackTrace);

    response.status(statusCode).json({
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'string' ? message : (message as any).message || message,
    });
  }
}
