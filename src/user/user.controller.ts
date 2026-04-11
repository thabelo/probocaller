import { Controller, Post, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserService } from './user.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('users')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Returns all users' })
  async getAllUsers() {
    return this.userService.findAllUsers();
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 201, description: 'User logged in successfully' })
  async login(@Body() loginDto: LoginDto) {
    return this.userService.login(loginDto);
  }

  @Post('signup')
  @ApiOperation({ summary: 'Sign up user' })
  @ApiResponse({ status: 201, description: 'User signed up successfully' })
  async signup(@Body() signupDto: SignupDto) {
    return this.userService.signup(signupDto);
  }

  @Post('add-multiple')
  @ApiOperation({ summary: 'Add multiple contacts' })
  @ApiResponse({ status: 201, description: 'Contacts added successfully' })
  async addMultipleContacts(@Body() body: { users: any[] }) {
    return this.userService.addMultipleContacts(body.users);
  }

  @Put('report/:phoneNumber')
  @ApiOperation({ summary: 'Report spam' })
  @ApiResponse({ status: 200, description: 'User reported as spam' })
  async reportSpam(@Param('phoneNumber') phoneNumber: string) {
    return this.userService.reportSpam(phoneNumber);
  }

  @Get(':phoneNumber')
  @ApiOperation({ summary: 'Find user by phone number' })
  @ApiResponse({ status: 200, description: 'User found' })
  async findUser(@Param('phoneNumber') phoneNumber: string) {
    const user = await this.userService.findUserByPhone(phoneNumber);
    return {
      _id: user._id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      name: user.name,
      isSpam: user.isSpam,
    };
  }
}