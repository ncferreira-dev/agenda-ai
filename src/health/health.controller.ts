import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { ok: true; ts: number } {
    return { ok: true, ts: Date.now() };
  }
}
