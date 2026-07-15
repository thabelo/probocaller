import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FxService } from './fx.service';

// Public: exchange rates are non-sensitive and the app needs them before auth
// to render money in the viewer's currency.
@ApiTags('fx')
@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rates')
  @ApiOperation({ summary: 'Live FX rates (base ZAR) for real-money display conversion' })
  getRates() {
    return this.fx.getRates();
  }
}
