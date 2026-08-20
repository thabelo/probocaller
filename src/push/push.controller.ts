import { Body, Controller, Delete, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PushService } from './push.service';
import { RegisterDeviceDto, UnregisterDeviceDto } from './dto/register-device.dto';

@ApiTags('push')
@Controller('push')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class PushController {
  constructor(private readonly pushService: PushService) {}

  // The device is always registered against the AUTHENTICATED user — never a
  // userId from the body, which a client could forge to receive (or silence)
  // another account's notifications.
  @Post('register')
  @ApiOperation({ summary: 'Register this device for push notifications' })
  register(@Request() req, @Body() body: RegisterDeviceDto) {
    return this.pushService.registerDevice(req.user.userId, body.token, body.platform ?? 'android');
  }

  @Delete('register')
  @ApiOperation({ summary: 'Stop pushing to this device (sign-out)' })
  unregister(@Request() req, @Body() body: UnregisterDeviceDto) {
    return this.pushService.unregisterDevice(req.user.userId, body.token);
  }
}
