import { Module, Global } from '@nestjs/common';
import { LangsmithService } from './langsmith.service';

@Global()
@Module({
  providers: [LangsmithService],
  exports: [LangsmithService],
})
export class LangsmithModule {}
