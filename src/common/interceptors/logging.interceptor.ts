import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const method = req.method;
    const url = req.originalUrl;
    const requestId = req.headers['x-request-id'] || uuidv4();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTimeMs = Date.now() - startTime;
        const statusCode = res.statusCode;
        this.logger.log(
          `[ReqID: ${requestId}] ${method} ${url} ${statusCode} - ${responseTimeMs}ms`,
        );
      }),
    );
  }
}
