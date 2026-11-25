import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { LangsmithModule } from './langsmith/langsmith.module';
import { PatientsModule } from './patients/patients.module';
import { LangchainModule } from './langchain/langchain.module';
import { TwilioModule } from './twilio/twilio.module';
import { AiCallModule } from './ai-call/ai-call.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 10,
      },
    ]),
    DatabaseModule,
    LangsmithModule,
    PatientsModule,
    LangchainModule,
    TwilioModule,
    AiCallModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
