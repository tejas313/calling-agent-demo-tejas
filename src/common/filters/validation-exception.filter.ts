import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';

@Catch(HttpException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (response.headersSent) {
      return;
    }

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    let message =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as any).message || 'Validation failed'
        : exceptionResponse || 'Validation failed';

    if (typeof message !== 'string') {
      message = message[0];
    }

    response.status(status).json({
      code: 0,
      status: 'FAIL',
      message: message,
    });
  }
}
