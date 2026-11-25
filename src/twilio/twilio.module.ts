import { Module, forwardRef } from '@nestjs/common';
import { TwilioService } from './twilio.service';
import { ClinicsModule } from '../clinics/clinics.module';

@Module({
  imports: [forwardRef(() => ClinicsModule)],
  providers: [TwilioService],
  exports: [TwilioService],
})
export class TwilioModule {}
