import { Module } from '@nestjs/common';
import { AiCallController } from './ai-call.controller';
import { AiCallService } from './ai-call.service';
import { TwilioModule } from '../twilio/twilio.module';
import { LangchainModule } from '../langchain/langchain.module';
import { ResponseService } from '../common/response.service';

@Module({
  imports: [
    TwilioModule,
    LangchainModule,
  ],
  controllers: [AiCallController],
  providers: [AiCallService, ResponseService],
  exports: [AiCallService],
})
export class AiCallModule {}
