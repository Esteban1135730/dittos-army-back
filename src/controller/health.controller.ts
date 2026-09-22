import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  ok(): { ok: true } {
    return { ok: true };
  }
}
