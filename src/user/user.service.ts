import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { phoneNumber } = loginDto;
    
    let user = await this.userRepository.findOne({ where: { phoneNumber } });
    
    if (!user) {
      user = this.userRepository.create({
        phoneNumber,
        email: `test+${phoneNumber}@example.com`,
        name: `Test User ${phoneNumber.slice(-4)}`,
      });
      await this.userRepository.save(user);
    }

    const payload = { sub: user._id, phoneNumber: user.phoneNumber };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = `fake-refresh-token-${Date.now()}`;

    return {
      accessToken,
      refreshToken,
      user: {
        phoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name,
      },
    };
  }

  async signup(signupDto: SignupDto) {
    const { phoneNumber, email, name } = signupDto;
    
    let user = await this.userRepository.findOne({ where: { phoneNumber } });
    
    if (user) {
      user.email = email;
      user.name = name;
      await this.userRepository.save(user);
    } else {
      user = this.userRepository.create({ phoneNumber, email, name });
      await this.userRepository.save(user);
    }

    const payload = { sub: user._id, phoneNumber: user.phoneNumber };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = `fake-refresh-token-${Date.now()}`;

    return {
      accessToken,
      refreshToken,
      user: {
        phoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name,
      },
    };
  }

  async findUserByPhone(phoneNumber: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { phoneNumber } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async addMultipleContacts(users: Partial<User>[]): Promise<User[]> {
    const savedUsers: User[] = [];
    
    for (const userData of users) {
      let user = await this.userRepository.findOne({ 
        where: { phoneNumber: userData.phoneNumber } 
      });
      
      if (user) {
        user.name = userData.name || user.name;
        user.isSpam = userData.isSpam || user.isSpam;
        await this.userRepository.save(user);
      } else {
        user = this.userRepository.create(userData);
        await this.userRepository.save(user);
      }
      savedUsers.push(user);
    }
    
    return savedUsers;
  }

  async reportSpam(phoneNumber: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { phoneNumber } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isSpam = true;
    await this.userRepository.save(user);
    return user;
  }

  async findAllUsers(): Promise<User[]> {
    return this.userRepository.find();
  }
}