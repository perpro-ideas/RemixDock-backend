import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CreditsService } from './credits.service';
import { CreditBalanceResponseDto } from './dto/credit-balance-response.dto';

@Controller('me/credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get()
  async getCredits(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreditBalanceResponseDto> {
    return this.creditsService.getCreditBalanceSummary(user.id);
  }
}
