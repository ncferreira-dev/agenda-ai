import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    MailModule,
    // Rate limit por IP. Não registra guard global — é aplicado só onde
    // declarado (@UseGuards no forgot-password). ttl em ms.
    ThrottlerModule.forRoot([{ ttl: 15 * 60_000, limit: 5 }]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-troque-isto',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as JwtSignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
